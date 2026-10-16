import { createClient } from "@supabase/supabase-js";
import { encryptValue, decryptValue, looksEncrypted, deriveKey } from "./crypto.js";

const SUPABASE_URL = "https://ezbhodcepwpoxehlaejp.supabase.co";
const SUPABASE_KEY = "sb_publishable_gMmKrvfOwtTGhZRRcmI5CA_bUl2qM52";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const ENC_META_KEY = "__enc_meta__";
const lastWriteAt = new Map();
const writeSeq = new Map();
const pendingFailures = new Set();
// key -> { store, value }: the last value of every key whose save gave up,
// so it can be re-sent later ("Reintentar" or when the connection returns).
const failedWrites = new Map();
export function retryFailedWrites() {
  const list = [...failedWrites.entries()];
  failedWrites.clear();
  list.forEach(([key, { store, value }]) => store.set(key, value));
  return list.length;
}
function emitStatus(state) {
  try { window.dispatchEvent(new CustomEvent("gx-save-status", { detail: { state } })); } catch (e) { /* no window */ }
}

// getKey: () => CryptoKey | null — called fresh on every get/set so the
// caller can flip encryption on/off without recreating the storage object.
export function makeStorage(getUser, getKey) {
  const self = {
    async get(key) {
      try {
        const { data, error } = await sb
          .from("kv_store")
          .select("value")
          .eq("key", key)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const activeKey = getKey ? getKey() : null;
        if (activeKey && looksEncrypted(data.value)) {
          return { value: await decryptValue(activeKey, JSON.parse(data.value)) };
        }
        return { value: data.value };
      } catch (e) {
        console.error("sbStorage.get", key, e);
        return null;
      }
    },
    // Loads several keys in ONE request instead of one round-trip per key
    // (the app boots with ~15 keys; doing them one by one was the slowest
    // part of opening the app). Returns { key: { value } } for keys that exist.
    async getMany(keys) {
      const out = {};
      try {
        const { data, error } = await sb.from("kv_store").select("key,value").in("key", keys);
        if (error) throw error;
        const activeKey = getKey ? getKey() : null;
        await Promise.all((data || []).map(async (row) => {
          try {
            if (activeKey && looksEncrypted(row.value)) out[row.key] = { value: await decryptValue(activeKey, JSON.parse(row.value)) };
            else out[row.key] = { value: row.value };
          } catch (e) { console.error("sbStorage.getMany decrypt", row.key, e); }
        }));
      } catch (e) {
        console.error("sbStorage.getMany", e);
        // fall back to one-by-one so a transient error doesn't blank the app
        for (const k of keys) { const r = await this.get(k); if (r) out[k] = r; }
      }
      return out;
    },
    // Saves one key. If the network/Supabase fails it retries a few times
    // (1s, 3s, 8s) — but only while this is still the newest write for that
    // key, so a slow retry can never overwrite something saved after it.
    // Status is broadcast as a "gx-save-status" window event for the UI.
    async set(key, value) {
      const user = getUser();
      if (!user) return null;
      const seq = (writeSeq.get(key) || 0) + 1;
      writeSeq.set(key, seq);
      const waits = [1000, 3000, 8000];
      for (let attempt = 0; attempt <= waits.length; attempt++) {
        if (writeSeq.get(key) !== seq) return null; // superseded by a newer save
        try {
          const now = new Date().toISOString();
          lastWriteAt.set(key, new Date(now).getTime());
          const activeKey = getKey ? getKey() : null;
          const stored = activeKey ? JSON.stringify({ __enc: true, ...(await encryptValue(activeKey, value)) }) : value;
          const { error } = await sb.from("kv_store").upsert({ user_id: user.id, key, value: stored, updated_at: now });
          if (error) throw error;
          pendingFailures.delete(key);
          failedWrites.delete(key);
          if (attempt > 0 || pendingFailures.size === 0) emitStatus(pendingFailures.size ? "retrying" : (attempt > 0 ? "recovered" : "ok"));
          return { key, value };
        } catch (e) {
          console.error("sbStorage.set", key, e);
          pendingFailures.add(key);
          if (attempt < waits.length) { emitStatus("retrying"); await new Promise((r) => setTimeout(r, waits[attempt])); }
        }
      }
      if (writeSeq.get(key) === seq) failedWrites.set(key, { store: self, value });
      emitStatus("failed");
      return null;
    },
  };
  return self;
}

// Whether this account currently has encryption turned on, and its salt.
// metaKey lets a second, independent encryption domain (e.g. the "Resumen"
// net-worth section, which has its own password) share this same mechanism
// without being affected by the main app's encryption toggle, or vice versa.
export async function getEncMeta(metaKey = ENC_META_KEY) {
  const { data, error } = await sb.from("kv_store").select("value").eq("key", metaKey).maybeSingle();
  if (error || !data) return { encrypted: false };
  try {
    return JSON.parse(data.value);
  } catch {
    return { encrypted: false };
  }
}

export async function saveEncMeta(userId, meta, metaKey = ENC_META_KEY) {
  await sb.from("kv_store").upsert({
    user_id: userId,
    key: metaKey,
    value: JSON.stringify(meta),
    updated_at: new Date().toISOString(),
  });
}

// Derives a key from the password+salt and, if any encrypted rows already
// exist IN THAT SAME DOMAIN, tries decrypting one with it — throws if the
// password is wrong. `domainKeys` restricts which kv_store keys count as
// belonging to this domain (e.g. only "resumen*" keys for the Resumen
// section's own password) so verifying one domain's password never
// accidentally reads — or gets confused by — the other domain's ciphertext.
// Omit it (or pass null) to check every non-meta key, as the main app does.
export async function deriveAndVerifyKey(password, salt, domainKeys = null) {
  const key = await deriveKey(password, salt);
  const { data, error } = await sb.from("kv_store").select("key,value")
    .neq("key", ENC_META_KEY).neq("key", RESUMEN_ENC_META_KEY).limit(50);
  if (error) throw error;
  for (const row of data || []) {
    if (domainKeys && !domainKeys.includes(row.key)) continue;
    if (!domainKeys && row.key.startsWith("resumen")) continue; // don't cross into the other domain by default
    if (looksEncrypted(row.value)) {
      await decryptValue(key, JSON.parse(row.value)); // throws (OperationError) on wrong password
      return key;
    }
  }
  return key; // nothing encrypted yet to verify against (first-time setup)
}

export const RESUMEN_ENC_META_KEY = "__resumen_enc_meta__";

// Raw rows, exactly as stored (still encrypted if they are). Used to put the
// Bóveda in a backup as ciphertext and to write it back the same way.
export async function rawRows(keys) {
  const { data, error } = await sb.from("kv_store").select("key,value").in("key", keys);
  if (error) throw error;
  const out = {};
  (data || []).forEach((row) => { out[row.key] = row.value; });
  return out;
}
export async function rawWrite(userId, rows) {
  const now = new Date().toISOString();
  const list = Object.entries(rows).map(([key, value]) => ({ user_id: userId, key, value, updated_at: now }));
  if (!list.length) return;
  const { error } = await sb.from("kv_store").upsert(list);
  if (error) throw error;
  list.forEach((r) => lastWriteAt.set(r.key, new Date(now).getTime()));
}

// Live cross-device sync: whenever another session updates a row for this
// user, decrypt it (if needed) and hand it to onChange(key, rawValue).
export function subscribeToChanges(userId, getKey, onChange, channelSuffix = "main") {
  const channel = sb
    .channel(`kv_store_changes_${userId}_${channelSuffix}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "kv_store", filter: `user_id=eq.${userId}` },
      async (payload) => {
        const row = payload.new;
        if (!row || !row.updated_at || row.key === ENC_META_KEY || row.key === RESUMEN_ENC_META_KEY) return;
        const ts = new Date(row.updated_at).getTime();
        const prev = lastWriteAt.get(row.key) || 0;
        if (ts <= prev) return; // ignore echoes of our own writes
        lastWriteAt.set(row.key, ts);
        let value = row.value;
        if (looksEncrypted(row.value)) {
          const key = getKey();
          if (!key) return;
          try {
            value = await decryptValue(key, JSON.parse(row.value));
          } catch {
            return;
          }
        }
        onChange(row.key, value);
      }
    )
    .subscribe();
  return () => sb.removeChannel(channel);
}
