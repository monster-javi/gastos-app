// Client-side encryption for optionally end-to-end encrypting data stored in
// Supabase's kv_store. AES-256-GCM with a PBKDF2-derived key from the user's
// password. Nothing here ever leaves the browser — the server only ever sees
// ciphertext once encryption is turned on.

const PBKDF2_ITERATIONS = 310000;

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function generateSalt() {
  return toB64(randomBytes(16));
}

export async function deriveKey(password, saltB64) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptValue(key, plaintext) {
  const iv = randomBytes(12);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { iv: toB64(iv), ciphertext: toB64(new Uint8Array(ciphertext)) };
}

export async function decryptValue(key, payload) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(payload.iv) }, key, fromB64(payload.ciphertext));
  return new TextDecoder().decode(plain);
}

export function looksEncrypted(value) {
  if (typeof value !== "string" || !value.startsWith("{")) return false;
  try {
    const obj = JSON.parse(value);
    return !!(obj && obj.__enc && obj.iv && obj.ciphertext);
  } catch {
    return false;
  }
}

export function isSecureContextAvailable() {
  return !!(window.isSecureContext && window.crypto && window.crypto.subtle);
}
