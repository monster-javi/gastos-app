import React, { useState, useEffect } from "react";
import { uid, fmtInt, parseCellInput, convertViaRates, evalFormula } from "../utils.js";
import { tx, txn, getTxLang } from "../tx.js";

// parseCellInput assumes at most 2 decimals (cents) — fine for fiat, but
// crypto amounts need many more (satoshis etc). This treats whichever comes
// LAST — "," or "." — as THE decimal separator (they're interchangeable, per
// how the person types), keeping every digit after it, however many there
// are, and strips any earlier separators (rare, but could be a stray
// thousands grouping).
function parseCryptoInput(s) {
  let str = String(s).trim();
  if (!str) return 0;
  let neg = false;
  if (str.startsWith("-")) { neg = true; str = str.slice(1); }
  const sepIdx = Math.max(str.lastIndexOf(","), str.lastIndexOf("."));
  let result;
  if (sepIdx === -1) {
    result = str.replace(/[^0-9]/g, "");
  } else {
    const head = str.slice(0, sepIdx).replace(/[.,]/g, "").replace(/[^0-9]/g, "");
    const tail = str.slice(sepIdx + 1).replace(/[^0-9]/g, "");
    result = (head || "0") + "." + tail;
  }
  const n = parseFloat(result);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}
// Same "=" formula support as the planilla's own cells (=120+45, etc), just
// routed to the right decimal parser depending on whether this entry is
// crypto (many decimals) or not (cents-level, current punctuation as-is).
function parseAmountInput(raw, isCrypto) {
  const str = String(raw).trim();
  if (str.startsWith("=")) {
    const val = evalFormula(str);
    return isNaN(val) ? 0 : val;
  }
  return isCrypto ? parseCryptoInput(str) : parseCellInput(str);
}

const CRYPTO_CODES = ["BTC", "ETH", "SOL", "USDT", "USDC", "BNB", "XRP", "DOGE", "ADA", "TRX"];
const STABLECOINS = ["USDT", "USDC"];
const VIEW_CUR_ORDER = ["USD", "EUR", "ARS"];
const PRESET_FIAT = [
  { code: "JPY", label: "Yen japonés" },
  { code: "GBP", label: "Libra esterlina" },
  { code: "CNY", label: "Yuan chino" },
  { code: "AUD", label: "Dólar australiano" },
  { code: "CAD", label: "Dólar canadiense" },
  { code: "CHF", label: "Franco suizo" },
  { code: "BRL", label: "Real brasileño" },
  { code: "MXN", label: "Peso mexicano" },
  { code: "CLP", label: "Peso chileno" },
  { code: "UYU", label: "Peso uruguayo" },
];
const PRESET_CRYPTO = [
  { code: "BTC", label: "Bitcoin" },
  { code: "ETH", label: "Ethereum" },
  { code: "USDT", label: "Tether" },
  { code: "BNB", label: "BNB" },
  { code: "SOL", label: "Solana" },
  { code: "USDC", label: "USD Coin" },
  { code: "XRP", label: "XRP" },
  { code: "DOGE", label: "Dogecoin" },
  { code: "ADA", label: "Cardano" },
  { code: "TRX", label: "TRON" },
];
const COINGECKO_IDS = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", USDT: "tether", USDC: "usd-coin",
  BNB: "binancecoin", XRP: "ripple", DOGE: "dogecoin", ADA: "cardano", TRX: "tron",
};
// "Instrumentos": acciones/ETFs — se cargan en unidades + precio promedio de
// compra, como la cripto. Ahora se cotizan con precio REAL de la acción (no
// una versión tokenizada) vía Finnhub, con una clave gratuita del usuario —
// se actualizan solas al abrir la Bóveda, igual que el resto.
const FINNHUB_KEY = "daq96ihr01qpiloolangdaq96ihr01qpiloolao0";
const PRESET_INSTRUMENTS = [
  { symbol: "SPY", label: "S&P 500 (ETF)" },
  { symbol: "AAPL", label: "Apple" },
  { symbol: "TSLA", label: "Tesla" },
  { symbol: "NVDA", label: "Nvidia" },
  { symbol: "GOOGL", label: "Alphabet (Google)" },
  { symbol: "MSFT", label: "Microsoft" },
  { symbol: "AMZN", label: "Amazon" },
  { symbol: "META", label: "Meta" },
  { symbol: "SPCX", label: "SpaceX" },
  { symbol: "COIN", label: "Coinbase" },
  { symbol: "AVGO", label: "Broadcom" },
  { symbol: "ORCL", label: "Oracle" },
  { symbol: "AMD", label: "AMD" },
  { symbol: "INTC", label: "Intel" },
  { symbol: "HOOD", label: "Robinhood" },
  { symbol: "GLD", label: "Oro (ETF)" },
  { symbol: "SLV", label: "Plata (ETF)" },
  { symbol: "JPM", label: "JPMorgan" },
  { symbol: "V", label: "Visa" },
  { symbol: "KO", label: "Coca-Cola" },
  { symbol: "DIS", label: "Disney" },
  { symbol: "NFLX", label: "Netflix" },
];

function curSymbol(c) {
  return c === "USD" ? "US$" : c === "EUR" ? "€" : c === "ARS" ? "$" : c + " ";
}

function CalendarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function NoteIconFlat() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h13l3 3v13H4z" />
      <path d="M17 4v3h3" />
      <path d="M8 12h8M8 16h5" />
    </svg>
  );
}
function ClockIconFlat() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}
function fmtEditDate(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(getTxLang() === "en" ? "en-US" : "es-AR", { day: "2-digit", month: "short" });
}
// BTC/ETH holdings are often tiny fractions (0.0004994) — fmtInt's normal
// 2-decimal rounding would show "0" and hide them completely. This shows
// enough decimals to always include at least the first non-zero digit
// (with a bit of extra context beyond it), trimming trailing zeros.
function fmtCryptoAmount(n) {
  if (!n) return "0";
  const neg = n < 0;
  const abs = Math.abs(n);
  let s;
  if (abs >= 1) {
    s = abs.toFixed(5);
  } else {
    const m = abs.toFixed(10).match(/^0\.(0*)([1-9])/);
    const zeros = m ? m[1].length : 0;
    s = abs.toFixed(Math.min(10, zeros + 4));
  }
  s = s.replace(/0+$/, "").replace(/\.$/, "");
  return (neg ? "-" : "") + s;
}

function ResumenUnlockCard({ ctx }) {
  const { unlockResumen } = ctx;
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleUnlock() {
    setError("");
    if (!password) { setError(tx("Ingresá la contraseña de esta sección.")); return; }
    setBusy(true);
    try {
      await unlockResumen(password);
    } catch (e) {
      setError(e?.name === "OperationError" ? tx("Contraseña incorrecta.") : tx("No se pudo desbloquear: {msg}", { msg: String(e?.message || e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="resumenGate">
      <div className="gx-enc-box">
        <strong className="gx-enc-title">{tx("Bóveda")}</strong>
        <p className="gx-enc-desc">{tx("Esta sección está cifrada. Ingresá su contraseña para verla.")}</p>
        <div className="gx-enc-fields">
          <input
            type="password"
            className="gx-enc-input"
            placeholder={tx("Contraseña de la Bóveda")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            autoFocus
          />
          {error && <div className="gx-auth-error">{error}</div>}
        </div>
        <div className="gx-enc-actions">
          <button className="gx-enc-primary" disabled={busy} onClick={handleUnlock}>
            {busy ? tx("Desbloqueando...") : tx("Desbloquear")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TxModal({ txModal, entry, label, onClose, onSubmit, onDeleteMovement }) {
  const isEdit = !!txModal.movementId;
  const [mode, setMode] = useState(txModal.mode);
  const [qty, setQty] = useState(isEdit ? String(Math.abs(txModal.initial.delta)) : "");
  const [price, setPrice] = useState(() => {
    if (isEdit) return String(txModal.initial.price ?? "");
    return txModal.currentPrice ? String(Math.round(txModal.currentPrice * 100) / 100) : "";
  });
  const [at, setAt] = useState(() => {
    const d = isEdit ? new Date(txModal.initial.at) : new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const needsPrice = txModal.needsPrice;
  const currentQty = txModal.currentQty;
  const currentPrice = txModal.currentPrice;

  function sellAll() {
    setMode("sell");
    setQty(String(currentQty));
    setPrice(String(fmtInt(currentPrice)).replace(/\./g, "").replace(",", "."));
  }
  const qtyNum = parseCryptoInput(qty);
  const priceNum = needsPrice ? parseCellInput(price) : 1;
  const total = qtyNum * priceNum;

  function handleSubmit() {
    if (!qtyNum) return;
    const atMs = new Date(at).getTime();
    onSubmit(qtyNum, needsPrice ? priceNum : null, isNaN(atMs) ? Date.now() : atMs);
  }

  return (
    <div className="gx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gx-modal-box resumenTxModal">
        <div className="resumenTxHead">
          <strong className="gx-enc-title" style={{ margin: 0 }}>{isEdit ? tx("Editar transacción") : tx("Nueva transacción")}</strong>
          <button className="gx-enc-close resumenEditCloseBtn" onClick={onClose} title={tx("Cerrar")}>✕</button>
        </div>
        <div className="resumenTxTabs">
          <button className={mode === "buy" ? "on" : ""} onClick={() => setMode("buy")}>{tx("Comprar")}</button>
          <button className={mode === "sell" ? "on" : ""} onClick={() => setMode("sell")}>{tx("Vender")}</button>
        </div>
        <div className="resumenTxAsset">{label}</div>
        <div className="resumenTxFieldsRow">
          <div className="resumenTxField">
            <label>{tx("Cantidad")}</label>
            <input className="mono" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" autoFocus />
          </div>
          {needsPrice && (
            <div className="resumenTxField">
              <label>{tx("Precio por unidad (USD)")}</label>
              <input className="mono" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
            </div>
          )}
        </div>
        <div className="resumenTxFieldsRow">
          <div className="resumenTxField">
            <label>{tx("Fecha")}</label>
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </div>
          {mode === "sell" && !isEdit && currentQty > 0 && (
            <button className="pillBtn resumenSellAllBtn" onClick={sellAll}>{tx("Vender todo")}</button>
          )}
        </div>
        {needsPrice && qtyNum > 0 && (
          <div className="resumenTxTotal">{tx("Total:")} {curSymbol("USD")} {fmtInt(Math.round(total * 100) / 100)}</div>
        )}
        <button className="gx-auth-btn" onClick={handleSubmit}>{isEdit ? tx("Guardar cambios") : mode === "buy" ? tx("Agregar compra") : tx("Agregar venta")}</button>
        {isEdit && (
          <button className="resumenTxDeleteBtn" onClick={() => onDeleteMovement(txModal.movementId)}>{tx("Borrar esta transacción")}</button>
        )}
      </div>
    </div>
  );
}

function MovesModal({ movesModal, entry, isCrypto, onClose, onEdit, onDelete }) {
  const moves = [...(entry.movements || [])].sort((a, b) => b.at - a.at);
  return (
    <div className="gx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gx-modal-box resumenMovesModal">
        <strong className="gx-enc-title">{tx("Historial de movimientos")}</strong>
        {moves.length === 0 && <div className="hint" style={{ margin: "10px 0" }}>{tx("Todavía no hay movimientos registrados.")}</div>}
        <div className="resumenMovesList">
          {moves.map((m) => (
            <div className="resumenMoveRow" key={m.id}>
              <span className={`resumenMoveDelta ${m.delta >= 0 ? "up" : "down"}`}>{m.delta >= 0 ? "+" : ""}{isCrypto ? fmtCryptoAmount(m.delta) : fmtInt(m.delta)}</span>
              <span className="resumenMovePrice">{m.price != null ? `@ US$ ${fmtInt(m.price)}` : ""}</span>
              <span className="resumenMoveDate">{new Date(m.at).toLocaleString(getTxLang() === "en" ? "en-US" : "es-AR")}</span>
              <button className="resumenGhostDelete" onClick={() => onEdit(m)} title={tx("Editar")}>✎</button>
              <button className="resumenGhostDelete" onClick={() => onDelete(m.id)} title={tx("Borrar")}>✕</button>
            </div>
          ))}
        </div>
        <div className="gx-modal-actions">
          <button className="gx-enc-cancel" onClick={onClose}>{tx("Cerrar")}</button>
        </div>
      </div>
    </div>
  );
}

function ResumenSetupCard({ ctx }) {
  const { enableResumenEncryption } = ctx;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleEnable() {
    setError("");
    setBusy(true);
    try {
      await enableResumenEncryption(password, confirm);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // With the app's encryption on, the Bóveda uses that same password.
  const appEncrypted = !!(ctx.encMeta && ctx.encMeta.encrypted);
  return (
    <div className="resumenGate">
      <div className="gx-enc-box">
        <strong className="gx-enc-title">{tx("Bóveda")}</strong>
        <p className="gx-enc-desc">{tx(appEncrypted ? "Usá tu contraseña de cifrado de la app." : "Creá una contraseña. Si la olvidás, no se puede recuperar.")}</p>
        <div className="gx-enc-fields">
          <input
            type="password"
            className="gx-enc-input"
            placeholder={appEncrypted ? tx("Contraseña de cifrado") : tx("Contraseña para la Bóveda")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            className="gx-enc-input"
            placeholder={tx("Repetí la contraseña")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEnable()}
          />
          {error && <div className="gx-auth-error">{error}</div>}
        </div>
        <div className="gx-enc-actions">
          <button className="gx-enc-primary" disabled={busy} onClick={handleEnable}>
            {busy ? tx("Un momento...") : tx("Activar y continuar")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResumenView({ ctx }) {
  const {
    resumenNeedsUnlock, resumenEncMeta, resumenMetaLoaded, resumenDataLoaded,
    resumenBoxes, setResumenBoxes, saveResumenBoxes,
    resumenCurrencies, setResumenCurrencies, saveResumenCurrencies,
    resumenRates, setResumenRates, saveResumenRates,
    resumenDisplayCurrency, setResumenDisplayCurrency,
    setShowResumenEncryption, showPromptModal, showConfirmModal, showAlertModal,
  } = ctx;

  const [editingBoxId, setEditingBoxId] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");
  const [showAddCurrency, setShowAddCurrency] = useState(false);
  const [addCurrencyTarget, setAddCurrencyTarget] = useState(null); // {boxId,itemId,entryId} or null
  const [showAddInstrument, setShowAddInstrument] = useState(false);
  const [addInstrumentTarget, setAddInstrumentTarget] = useState(null); // {boxId,itemId} or null
  const [txModal, setTxModal] = useState(null); // {boxId,itemId,entryId,qtyField,mode,movementId,initial}
  const [movesModal, setMovesModal] = useState(null); // {boxId,itemId,entryId,qtyField}
  // Typing an amount directly over a crypto/instrument entry (instead of
  // using +/-) still needs to land in the movement log, as one operation —
  // but retyping the SAME field again before closing this box should edit
  // that one operation in place, not pile up a new one on every keystroke.
  // Closing and reopening the box starts a fresh session, so the next edit
  // there begins a new operation again.
  const [pendingMovementByEntry, setPendingMovementByEntry] = useState({});
  useEffect(() => { setPendingMovementByEntry({}); }, [editingBoxId]);

  // Cotizaciones frescas apenas se abre (y desbloquea) la Bóveda, sin esperar
  // a que toques el botón de actualizar a mano.
  // (Only once the saved data is loaded — otherwise it would save fresh rates
  // on top of defaults and the real saved ones would get overwritten.)
  useEffect(() => {
    if (resumenNeedsUnlock || !resumenEncMeta?.encrypted || !resumenDataLoaded) return;
    fetchLiveRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumenNeedsUnlock, resumenEncMeta?.encrypted, resumenDataLoaded]);

  if (!resumenMetaLoaded) return <div className="resumenGate"><div className="factMuted">{tx("Cargando la Bóveda…")}</div></div>;
  if (resumenNeedsUnlock) return <ResumenUnlockCard ctx={ctx} />;
  if (!resumenEncMeta?.encrypted) return <ResumenSetupCard ctx={ctx} />;
  // Never show (or let you edit) an empty Bóveda while the real one is still
  // loading — an edit there would be saved over your actual boxes.
  if (!resumenDataLoaded || !Array.isArray(resumenBoxes)) return <div className="resumenGate"><div className="factMuted">{tx("Cargando la Bóveda…")}</div></div>;

  function persistBoxes(next) { setResumenBoxes(next); saveResumenBoxes(next); }
  function persistCurrencies(next) { setResumenCurrencies(next); saveResumenCurrencies(next); }
  function persistRates(next) { setResumenRates(next); saveResumenRates(next); }
  // Stamps "last edited" on a box whenever its AMOUNTS change (not its name,
  // item names, note, or display-currency choice — those don't count).
  function touchBox(boxes, boxId) {
    return boxes.map((b) => (b.id === boxId ? { ...b, lastAmountEditAt: Date.now() } : b));
  }

  function addBox() {
    showPromptModal(tx("Nombre de la caja (ej. Casa, Bancos, Apps, Cripto):"), (name) => {
      const clean = (name || "").trim();
      if (!clean) return;
      const box = { id: uid(), name: clean, items: [{ id: uid(), name: "", entries: [] }], note: "", displayCurrency: null };
      const next = [...resumenBoxes, box];
      persistBoxes(next);
      setEditingBoxId(box.id);
    }, "", tx("Crear caja"));
  }
  function renameBox(boxId, name) {
    persistBoxes(resumenBoxes.map((b) => (b.id === boxId ? { ...b, name } : b)));
  }
  function updateBoxNote(boxId, note) {
    persistBoxes(resumenBoxes.map((b) => (b.id === boxId ? { ...b, note } : b)));
  }
  function updateBoxDisplayCurrency(boxId, cur) {
    persistBoxes(resumenBoxes.map((b) => (b.id === boxId ? { ...b, displayCurrency: cur } : b)));
  }
  function removeBox(boxId) {
    showConfirmModal(tx("¿Borrar esta caja y todo lo que tiene adentro?"), () => {
      persistBoxes(resumenBoxes.filter((b) => b.id !== boxId));
      setEditingBoxId((id) => (id === boxId ? null : id));
    });
  }
  function reorderBoxes(from, to) {
    if (from === to || from == null || to == null) return;
    const next = [...resumenBoxes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistBoxes(next);
  }
  function addItem(boxId) {
    persistBoxes(resumenBoxes.map((b) => (b.id === boxId ? { ...b, items: [...b.items, { id: uid(), name: "", entries: [] }] } : b)));
  }
  function renameItem(boxId, itemId, name) {
    persistBoxes(resumenBoxes.map((b) => (b.id !== boxId ? b : { ...b, items: b.items.map((it) => (it.id === itemId ? { ...it, name } : it)) })));
  }
  function removeItem(boxId, itemId) {
    showConfirmModal(tx("¿Borrar esta cuenta y todo lo que tiene cargado adentro? No se puede deshacer."), () => {
      persistBoxes(resumenBoxes.map((b) => (b.id !== boxId ? b : { ...b, items: b.items.filter((it) => it.id !== itemId) })));
    });
  }
  function addEntry(boxId, itemId, currency) {
    const box = resumenBoxes.find((b) => b.id === boxId);
    const item = box?.items.find((it) => it.id === itemId);
    let nextCur = currency;
    if (!nextCur) {
      const used = new Set((item?.entries || []).map((e) => e.currency));
      nextCur = resumenCurrencies.find((c) => !used.has(c) && !CRYPTO_CODES.includes(c)) || resumenCurrencies[0] || "ARS";
    }
    const entry = { id: uid(), currency: nextCur, value: 0 };
    if (CRYPTO_CODES.includes(nextCur)) entry.viewCurrency = "USD";
    const next = resumenBoxes.map((b) => (b.id !== boxId ? b : {
      ...b,
      items: b.items.map((it) => (it.id !== itemId ? it : { ...it, entries: [...it.entries, entry] })),
    }));
    persistBoxes(touchBox(next, boxId));
    return entry.id;
  }
  function updateEntry(boxId, itemId, entryId, patch) {
    const next = resumenBoxes.map((b) => (b.id !== boxId ? b : {
      ...b,
      items: b.items.map((it) => (it.id !== itemId ? it : {
        ...it,
        entries: it.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
      })),
    }));
    persistBoxes(touchBox(next, boxId));
  }
  function removeEntry(boxId, itemId, entryId) {
    showConfirmModal(tx("¿Borrar esta moneda/inversión? No se puede deshacer."), () => {
      const next = resumenBoxes.map((b) => (b.id !== boxId ? b : {
        ...b,
        items: b.items.map((it) => (it.id !== itemId ? it : { ...it, entries: it.entries.filter((e) => e.id !== entryId) })),
      }));
      persistBoxes(touchBox(next, boxId));
    });
  }
  function cycleEntryViewCurrency(boxId, itemId, entryId, current) {
    const idx = VIEW_CUR_ORDER.indexOf(current);
    const next = VIEW_CUR_ORDER[(idx + 1) % VIEW_CUR_ORDER.length];
    updateEntry(boxId, itemId, entryId, { viewCurrency: next });
  }
  // "+"/"-" add a movement on TOP of the current amount (instead of replacing
  // it, which is what typing directly over the number still does) and keep a
  // small log of each one with when it happened. For non-stablecoin crypto,
  // also asks the price of that specific batch — PPC (compra) when adding,
  // PPV (venta) when subtracting — and rolls PPC into a running weighted
  // average of what's left after a purchase (selling doesn't change the cost
  // basis of the units you still hold).
  // Movements are the source of truth: an entry's quantity and PPC are always
  // recomputed from its movement log (not tracked separately), so editing or
  // deleting a past transaction correctly updates both. PPC is the weighted
  // average of BUY movements only (selling doesn't change the cost basis of
  // what's left).
  function recomputeEntry(entry) {
    const moves = entry.movements || [];
    const qty = moves.reduce((a, m) => a + m.delta, 0);
    const buys = moves.filter((m) => m.delta > 0 && m.price != null);
    const buyQty = buys.reduce((a, m) => a + m.delta, 0);
    const buyCost = buys.reduce((a, m) => a + m.delta * m.price, 0);
    const ppc = buyQty > 0 ? buyCost / buyQty : entry.ppc || 0;
    return { qty, ppc };
  }
  function currentPriceFor(entry) {
    if (entry.kind === "instrument") return resumenRates[`INSTR:${entry.symbol}`] || 0;
    return resumenRates.USD ? (resumenRates[entry.currency] || 0) / resumenRates.USD : 0;
  }
  function openTxModal(boxId, itemId, entryId, qtyField, mode) {
    setTxModal({ boxId, itemId, entryId, qtyField, mode, movementId: null, initial: null });
  }
  function openTxEditModal(boxId, itemId, entryId, qtyField, movement) {
    const box = resumenBoxes.find((b) => b.id === boxId);
    const item = box?.items.find((it) => it.id === itemId);
    const entry = item?.entries.find((e) => e.id === entryId);
    const needsPrice = entry ? (entry.kind === "instrument" || (CRYPTO_CODES.includes(entry.currency) && !STABLECOINS.includes(entry.currency))) : true;
    setTxModal({ boxId, itemId, entryId, qtyField, mode: movement.delta >= 0 ? "buy" : "sell", movementId: movement.id, initial: movement, needsPrice, currentQty: 0, currentPrice: 0 });
    setMovesModal(null);
  }
  function submitTxModal(qty, price, atMs) {
    const { boxId, itemId, entryId, qtyField, mode, movementId } = txModal;
    const box = resumenBoxes.find((b) => b.id === boxId);
    const item = box?.items.find((it) => it.id === itemId);
    const entry = item?.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const delta = mode === "buy" ? Math.abs(qty) : -Math.abs(qty);
    let movements = entry.movements || [];
    if (movementId) {
      movements = movements.map((m) => (m.id === movementId ? { ...m, delta, price, at: atMs } : m));
    } else {
      movements = [...movements, { id: uid(), delta, price, at: atMs }];
    }
    const { qty: newQty, ppc } = recomputeEntry({ ...entry, movements });
    updateEntry(boxId, itemId, entryId, { [qtyField]: newQty, ppc, movements });
    setTxModal(null);
  }
  function deleteMovement(boxId, itemId, entryId, qtyField, movementId, onDone) {
    showConfirmModal(tx("¿Borrar este movimiento del historial? No se puede deshacer."), () => {
      const box = resumenBoxes.find((b) => b.id === boxId);
      const item = box?.items.find((it) => it.id === itemId);
      const entry = item?.entries.find((e) => e.id === entryId);
      if (!entry) return;
      const movements = (entry.movements || []).filter((m) => m.id !== movementId);
      const { qty, ppc } = recomputeEntry({ ...entry, movements });
      updateEntry(boxId, itemId, entryId, { [qtyField]: qty, ppc, movements });
      if (onDone) onDone();
    });
  }
  function updateEntryPpc(boxId, itemId, entryId, raw) {
    const priceVal = parseCellInput(raw) || 0;
    const box = resumenBoxes.find((b) => b.id === boxId);
    const item = box?.items.find((it) => it.id === itemId);
    const entry = item?.entries.find((e) => e.id === entryId);
    const pendingId = pendingMovementByEntry[entryId];
    // If there's an operation pending from a direct amount edit in THIS
    // session, typing the PPC edits that operation's price (so it feeds the
    // weighted average like any other buy) instead of just overwriting PPC
    // as a disconnected number.
    if (pendingId && entry?.movements?.some((m) => m.id === pendingId)) {
      const movements = entry.movements.map((m) => (m.id === pendingId ? { ...m, price: priceVal } : m));
      const { ppc } = recomputeEntry({ ...entry, movements });
      updateEntry(boxId, itemId, entryId, { ppc, movements });
    } else {
      updateEntry(boxId, itemId, entryId, { ppc: priceVal });
    }
  }
  // Typing a new number directly over the amount (replacing it, same as
  // ever) also has to land in the movement log now that quantity is derived
  // from it — otherwise editing/deleting an older movement later would blow
  // the manually-typed number away. Reuses the SAME pending movement while
  // this box stays open (see pendingMovementByEntry above) so retyping the
  // field doesn't add one operation per keystroke.
  function directEditAmount(boxId, itemId, entryId, qtyField, rawValue, isCrypto) {
    const typedValue = parseAmountInput(rawValue, isCrypto || qtyField === "shares");
    const box = resumenBoxes.find((b) => b.id === boxId);
    const item = box?.items.find((it) => it.id === itemId);
    const entry = item?.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const pendingId = pendingMovementByEntry[entryId];
    const movementsNow = entry.movements || [];
    const hasPending = pendingId && movementsNow.some((m) => m.id === pendingId);
    const otherTotal = movementsNow.filter((m) => m.id !== pendingId).reduce((a, m) => a + m.delta, 0);
    const neededDelta = typedValue - otherTotal;
    if (!hasPending && Math.abs(neededDelta) < 1e-9) return; // no real change, nothing to log
    let movements;
    if (hasPending) {
      movements = movementsNow.map((m) => (m.id === pendingId ? { ...m, delta: neededDelta } : m));
    } else {
      const newMovement = { id: uid(), delta: neededDelta, at: Date.now() };
      movements = [...movementsNow, newMovement];
      setPendingMovementByEntry((prev) => ({ ...prev, [entryId]: newMovement.id }));
    }
    const { qty, ppc } = recomputeEntry({ ...entry, movements });
    updateEntry(boxId, itemId, entryId, { [qtyField]: qty, ppc, movements });
  }
  // Fiat entries keep the simple prompt flow — no price/PPC involved, so the
  // rich Buy/Sell modal (which is specifically for crypto/instruments) would
  // be overkill here.
  function adjustFiatEntry(boxId, itemId, entryId, sign) {
    showPromptModal(sign > 0 ? tx("¿Cuánto sumás?") : tx("¿Cuánto restás?"), (raw) => {
      const delta = parseCellInput(raw);
      if (!delta) return;
      const box = resumenBoxes.find((b) => b.id === boxId);
      const item = box?.items.find((it) => it.id === itemId);
      const entry = item?.entries.find((e) => e.id === entryId);
      if (!entry) return;
      const movements = [...(entry.movements || []), { id: uid(), delta: sign * delta, at: Date.now() }];
      const { qty } = recomputeEntry({ ...entry, movements });
      updateEntry(boxId, itemId, entryId, { value: qty, movements });
    }, "", sign > 0 ? tx("Sumar") : tx("Restar"));
  }
  function addInstrument(boxId, itemId, symbol, name) {
    const entry = { id: uid(), kind: "instrument", symbol, name, shares: 0, ppc: 0 };
    const next = resumenBoxes.map((b) => (b.id !== boxId ? b : {
      ...b,
      items: b.items.map((it) => (it.id !== itemId ? it : { ...it, entries: [...it.entries, entry] })),
    }));
    persistBoxes(touchBox(next, boxId));
    setShowAddInstrument(false);
    setAddInstrumentTarget(null);
  }
  function updateInstrumentPrice(symbol, raw) {
    const price = parseCellInput(raw) || 0;
    persistRates({ ...resumenRates, [`INSTR:${symbol}`]: price });
  }
  function addPresetCurrency(code) {
    if (!resumenCurrencies.includes(code)) {
      persistCurrencies([...resumenCurrencies, code]);
      if (resumenRates[code] == null) persistRates({ ...resumenRates, [code]: 1 });
    }
    if (addCurrencyTarget) {
      const patch = { currency: code };
      if (CRYPTO_CODES.includes(code)) patch.viewCurrency = "USD";
      updateEntry(addCurrencyTarget.boxId, addCurrencyTarget.itemId, addCurrencyTarget.entryId, patch);
      setAddCurrencyTarget(null);
    }
    setShowAddCurrency(false);
    fetchLiveRates([code]);
  }
  function removeCurrency(code) {
    if (["ARS", "USD", "EUR"].includes(code)) return;
    const inUse = resumenBoxes.some((b) => b.items.some((it) => it.entries.some((e) => e.currency === code)));
    const doRemove = () => persistCurrencies(resumenCurrencies.filter((c) => c !== code));
    if (inUse) {
      showConfirmModal(tx("Hay montos cargados en {code}. Van a seguir existiendo, pero {code} ya no va a aparecer para agregar nuevos. ¿Sacarla igual?", { code }), doRemove);
    } else {
      doRemove();
    }
  }
  function addCustomCurrency() {
    showPromptModal(tx("Código de la moneda (ej. JPY):"), (code) => {
      const clean = (code || "").trim().toUpperCase();
      if (!clean) return;
      if (resumenCurrencies.includes(clean)) { showAlertModal(tx("Esa moneda ya está agregada.")); return; }
      persistCurrencies([...resumenCurrencies, clean]);
      if (resumenRates[clean] == null) persistRates({ ...resumenRates, [clean]: 1 });
      if (addCurrencyTarget) {
        updateEntry(addCurrencyTarget.boxId, addCurrencyTarget.itemId, addCurrencyTarget.entryId, { currency: clean });
        setAddCurrencyTarget(null);
      }
      setShowAddCurrency(false);
      fetchLiveRates([clean]);
    }, "", tx("Agregar"));
  }

  async function fetchLiveRates(extra = []) {
    setFetching(true);
    setFetchMsg("");
    try {
      // Fetch a price for every instrument symbol actually in use across the
      // whole Bóveda too — not just the 21 presets — so a manually-typed
      // ticker ("Otra (manual)") gets updated the same way.
      const usedSymbols = new Set();
      resumenBoxes.forEach((b) => b.items.forEach((it) => it.entries.forEach((e) => {
        if (e.kind === "instrument" && e.symbol) usedSymbols.add(e.symbol);
      })));
      PRESET_INSTRUMENTS.forEach((ins) => usedSymbols.add(ins.symbol));
      const instrumentSymbols = [...usedSymbols];
      const [usdRes, eurRes, cryptoRes, erRes, ...finnhubResList] = await Promise.all([
        fetch("https://dolarapi.com/v1/dolares/oficial"),
        fetch("https://dolarapi.com/v1/cotizaciones/eur"),
        fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(COINGECKO_IDS).join(",")}&vs_currencies=usd`),
        fetch("https://open.er-api.com/v6/latest/USD"),
        ...instrumentSymbols.map((sym) => fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`).catch(() => null)),
      ]);
      const usdData = await usdRes.json();
      const eurData = await eurRes.json();
      const cryptoData = await cryptoRes.json();
      const erData = await erRes.json();
      const finnhubData = await Promise.all(finnhubResList.map((r) => (r && r.ok ? r.json().catch(() => null) : null)));
      const usdVal = usdData?.venta;
      const eurVal = eurData?.venta;
      if (!usdVal) throw new Error("Respuesta inesperada");
      const next = { ...resumenRates, ARS: 1, USD: usdVal };
      if (eurVal) next.EUR = eurVal;
      Object.entries(COINGECKO_IDS).forEach(([code, gid]) => {
        if (cryptoData?.[gid]?.usd) next[code] = cryptoData[gid].usd * usdVal;
      });
      // Real stock price straight from Finnhub (field "c" = current price) —
      // the actual listed security, not a tokenized stand-in.
      instrumentSymbols.forEach((sym, i) => {
        const price = finnhubData[i]?.c;
        if (price) next[`INSTR:${sym}`] = price;
      });
      // Other fiat currencies (CAD, UYU, CLP, BRL, etc.): open.er-api gives
      // "units of X per 1 USD", so 1 X = usdVal/rate ARS.
      if (erData?.rates) {
        [...new Set([...resumenCurrencies, ...extra])].forEach((c) => {
          if (["ARS", "USD", "EUR", ...CRYPTO_CODES].includes(c)) return;
          const r = erData.rates[c];
          if (r) next[c] = usdVal / r;
        });
      }
      persistRates(next);
      setFetchMsg(tx("✓ Actualizado"));
    } catch (e) {
      setFetchMsg(tx("Error al conectar"));
    } finally {
      setFetching(false);
      setTimeout(() => setFetchMsg(""), 4000);
    }
  }

  function entryValueInCur(e, cur) {
    if (e.kind === "instrument") {
      const price = resumenRates[`INSTR:${e.symbol}`] || 0;
      return convertViaRates((Number(e.shares) || 0) * price, "USD", cur, resumenRates);
    }
    return convertViaRates(Number(e.value) || 0, e.currency, cur, resumenRates);
  }
  function itemTotal(item, cur) {
    return (item.entries || []).reduce((a, e) => a + entryValueInCur(e, cur), 0);
  }
  function boxTotal(box, cur) {
    return box.items.reduce((a, it) => a + itemTotal(it, cur), 0);
  }
  function boxEntryCount(box) {
    return box.items.reduce((a, it) => a + it.entries.length, 0);
  }
  // % y monto de ganancia/pérdida de una caja, comparando el valor actual
  // contra el costo (PPC) de lo que SÍ tiene un PPC cargado — cripto no
  // estable, o instrumentos. Lo que no tiene PPC (fiat, stablecoins, cripto
  // sin PPC) no entra en esta cuenta, pero sigue sumando al total normal.
  function boxGainLoss(box, cur) {
    let cost = 0, current = 0, any = false;
    box.items.forEach((it) => it.entries.forEach((e) => {
      if (e.kind === "instrument") {
        if (!e.ppc) return;
        any = true;
        const shares = Number(e.shares) || 0;
        cost += convertViaRates(shares * e.ppc, "USD", cur, resumenRates);
        current += entryValueInCur(e, cur);
      } else if (CRYPTO_CODES.includes(e.currency) && !STABLECOINS.includes(e.currency) && e.ppc) {
        any = true;
        const qty = Number(e.value) || 0;
        cost += convertViaRates(qty * e.ppc, "USD", cur, resumenRates);
        current += entryValueInCur(e, cur);
      }
    }));
    if (!any || !cost) return null;
    const gain = current - cost;
    return { gain, pct: (gain / cost) * 100 };
  }
  const grandTotal = resumenBoxes.reduce((a, b) => a + boxTotal(b, resumenDisplayCurrency), 0);

  function money(n, cur) {
    return `${curSymbol(cur)} ${fmtInt(Math.round((n || 0) * 100) / 100)}`;
  }
  // Same click-to-cycle pattern as the currency toggle used elsewhere in the
  // app, instead of a native <select> — one tap steps to the next fiat
  // currency in the list.
  function cycleFiatList(current) {
    const list = resumenCurrencies.filter((c) => !CRYPTO_CODES.includes(c));
    if (!list.length) return current;
    const idx = list.indexOf(current);
    return list[(idx + 1) % list.length] || list[0];
  }

  const editingBox = resumenBoxes.find((b) => b.id === editingBoxId) || null;
  const addableFiat = PRESET_FIAT.filter((f) => !resumenCurrencies.includes(f.code));
  const addableCrypto = PRESET_CRYPTO.filter((f) => !resumenCurrencies.includes(f.code));

  return (
    <div className="resumenWrap">
      <div className="resumenTotalBar">
        <div className="resumenTotalLabel">{tx("TOTAL BÓVEDA")}</div>
        <div className="resumenTotalValue mono">{money(grandTotal, resumenDisplayCurrency)}</div>
        <button className="curToggle resumenTotalCurToggle" onClick={() => setResumenDisplayCurrency(cycleFiatList(resumenDisplayCurrency))} title={tx("Cambiar moneda de visualización")}>{resumenDisplayCurrency}</button>
        <span className="spacer"></span>
        <div className="resumenTickerRow">
          {["BTC", "ETH", "SOL"].filter((c) => resumenCurrencies.includes(c)).map((c) => (
            <span key={c} className="resumenTickerItem">{c} <span className="mono">{money((resumenRates[c] || 0) / (resumenRates.USD || 1), "USD")}</span></span>
          ))}
        </div>
        <button className="pillBtn iconText" onClick={() => fetchLiveRates()} disabled={fetching}>
          {fetching ? tx("Actualizando...") : tx("↻ Actualizar cotización")}
        </button>
        {fetchMsg && <span className="fetchRatesMsg">{fetchMsg}</span>}
        <button className="pillBtn" onClick={() => setShowResumenEncryption(true)}>{tx("Cambiar contraseña")}</button>
      </div>

      {resumenBoxes.length === 0 && (
        <div className="emptyGroup">{tx("Todavía no creaste ninguna caja. Empezá con \"+ Nueva caja\" abajo.")}</div>
      )}

      <div className="resumenGrid">
        {resumenBoxes.map((box, idx) => {
          const hasFiat = box.items.some((it) => it.entries.some((e) => e.kind !== "instrument" && !CRYPTO_CODES.includes(e.currency)));
          const hasCrypto = box.items.some((it) => it.entries.some((e) => e.kind !== "instrument" && CRYPTO_CODES.includes(e.currency)));
          const cur = box.displayCurrency || (hasCrypto && !hasFiat ? "USD" : resumenDisplayCurrency);
          const total = boxTotal(box, cur);
          const nEntries = boxEntryCount(box);
          const gainLoss = boxGainLoss(box, cur);
          function curBreakdown(entries) {
            const by = {};
            entries.forEach((e) => {
              if (e.kind === "instrument") { by["sym:" + e.symbol] = (by["sym:" + e.symbol] || 0) + (Number(e.shares) || 0); return; }
              by[e.currency] = (by[e.currency] || 0) + (Number(e.value) || 0);
            });
            return Object.entries(by).map(([c, v]) => {
              if (c.startsWith("sym:")) return { text: `${fmtInt(v)} ${c.slice(4)}`, crypto: false };
              if (CRYPTO_CODES.includes(c) && !STABLECOINS.includes(c)) return { text: `${fmtCryptoAmount(v)} ${c}`, crypto: true };
              if (STABLECOINS.includes(c)) return { text: `${fmtInt(v)} ${c}`, crypto: true };
              return { text: money(v, c), crypto: false };
            });
          }
          // Named multi-item boxes (ej. "Billeteras": Payoneer/Wise/Dolarapp)
          // show one line per item on desktop, so you see what's in each at a
          // glance. Mobile keeps it to the simple whole-box total by currency.
          const namedItems = box.items.filter((it) => it.name && it.entries.length);
          const perItemView = !ctx.isMobile && namedItems.length > 1;
          const breakdownParts = perItemView ? null : curBreakdown(box.items.flatMap((it) => it.entries)).slice(0, 4);
          const editedLabel = fmtEditDate(box.lastAmountEditAt);
          return (
            <div
              key={box.id}
              className={`resumenCard ${dragIdx === idx ? "dragging" : ""}`}
              style={{ borderLeft: `3px solid ${ctx.sectionColor(idx)}` }}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); reorderBoxes(dragIdx, idx); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
              onClick={() => setEditingBoxId(box.id)}
            >
              <div className="resumenCardHead">
                <span className="dragHandle" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>⠿</span>
                <span className="resumenCardName">{box.name}</span>
                {box.note && <span className="resumenNoteDot" title={tx("Tiene una nota")}><NoteIconFlat /></span>}
                <button className="miniBtn" onClick={(e) => { e.stopPropagation(); removeBox(box.id); }} title={tx("Borrar caja")}>✕</button>
              </div>
              <div className="resumenCardTotalRow">
                <span className="resumenCardTotal mono">{money(total, cur)}</span>
                <button
                  className="curToggle resumenCardCurToggle"
                  onClick={(e) => { e.stopPropagation(); updateBoxDisplayCurrency(box.id, cycleFiatList(cur)); }}
                  title={tx("Cambiar moneda de esta caja")}
                >{cur}</button>
              </div>
              {gainLoss && (
                <div className={`resumenGainLoss ${gainLoss.gain >= 0 ? "up" : "down"}`}>
                  {gainLoss.gain >= 0 ? "▲" : "▼"} {gainLoss.pct >= 0 ? "+" : ""}{fmtInt(Math.round(gainLoss.pct * 10) / 10)}% ({gainLoss.gain >= 0 ? "+" : ""}{money(gainLoss.gain, cur)})
                </div>
              )}
              {perItemView ? (
                <div className="resumenCardPerItem">
                  {namedItems.map((it) => {
                    const val = itemTotal(it, cur);
                    const assets = [...new Set(it.entries.map((e) => (e.kind === "instrument" ? e.symbol : e.currency)))];
                    return (
                      <div className="resumenCardPerItemRow" key={it.id}>
                        <span className="resumenCardPerItemName">{it.name}:</span>
                        <span className="resumenCardPerItemVals">
                          {money(val, cur)}{assets.length > 0 && <span className="resumenCardPerItemAssets"> ({assets.join(", ")})</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="resumenCardBreakdown">
                  {!breakdownParts || breakdownParts.length === 0 ? tx("Sin cargar") : breakdownParts.map((p, i) => (
                    <span key={i} className={p.crypto ? "resumenBreakdownCrypto" : ""}>
                      {i > 0 && " · "}{p.text}
                    </span>
                  ))}
                </div>
              )}
              <div className="resumenCardMeta">
                <span>{txn(box.items.length, "{n} ítem", "{n} ítems")} · {txn(nEntries, "{n} moneda", "{n} monedas")}</span>
                {editedLabel && <span className="resumenCardDate"><CalendarIcon /> {editedLabel}</span>}
              </div>
            </div>
          );
        })}
        <div className="resumenCard resumenAddCard" onClick={addBox}>
          <span className="resumenAddPlus">+</span>
          <span>{tx("Nueva caja")}</span>
        </div>
      </div>

      {editingBox && (
        <div className="gx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingBoxId(null); }}>
          <div className="gx-modal-box resumenEditModal">
            <div className="resumenEditHead">
              <div className="resumenEditHeadTop">
                <input
                  className="resumenBoxNameEdit"
                  defaultValue={editingBox.name}
                  key={editingBox.id + "-" + editingBox.name}
                  onBlur={(e) => renameBox(editingBox.id, e.target.value)}
                />
                <button className="resumenGhostDelete resumenEditCloseBtn" onClick={() => setEditingBoxId(null)} title={tx("Cerrar")}>✕</button>
              </div>
              <span className="resumenEditTotal mono">{(() => {
                const hasFiat = editingBox.items.some((it) => it.entries.some((e) => !CRYPTO_CODES.includes(e.currency)));
                const hasCrypto = editingBox.items.some((it) => it.entries.some((e) => CRYPTO_CODES.includes(e.currency)));
                const cur = editingBox.displayCurrency || (hasCrypto && !hasFiat ? "USD" : resumenDisplayCurrency);
                return money(boxTotal(editingBox, cur), cur);
              })()}</span>
            </div>

            {(() => {
              const byCur = {};
              const byInstr = {};
              editingBox.items.forEach((it) => it.entries.forEach((e) => {
                if (e.kind === "instrument") {
                  byInstr[e.symbol] = (byInstr[e.symbol] || 0) + entryValueInCur(e, "USD");
                } else {
                  byCur[e.currency] = (byCur[e.currency] || 0) + (Number(e.value) || 0);
                }
              }));
              const curEntries = Object.entries(byCur);
              const instrEntries = Object.entries(byInstr);
              if (!curEntries.length && !instrEntries.length) return null;
              return (
                <div className="resumenEditSummary">
                  {curEntries.map(([c, v]) => (
                    <span key={c} className="resumenEditSummaryChip">{CRYPTO_CODES.includes(c) && !STABLECOINS.includes(c) ? `${fmtCryptoAmount(v)} ${c}` : CRYPTO_CODES.includes(c) ? `${fmtInt(v)} ${c}` : money(v, c)}</span>
                  ))}
                  {instrEntries.map(([sym, v]) => (
                    <span key={sym} className="resumenEditSummaryChip">{sym}: {money(v, "USD")}</span>
                  ))}
                </div>
              );
            })()}

            <div className="resumenEditBody">
              {editingBox.items.map((item) => (
                <div className="resumenItemCard" key={item.id}>
                  <div className="resumenItemNameRow">
                    <input
                      className="resumenItemName"
                      placeholder={tx("Nombre de la cuenta (opcional, ej. Banco Galicia)")}
                      defaultValue={item.name}
                      onBlur={(e) => renameItem(editingBox.id, item.id, e.target.value)}
                    />
                    {editingBox.items.length > 1 && (
                      <button className="resumenGhostDelete" onClick={() => removeItem(editingBox.id, item.id)} title={tx("Borrar esta cuenta")}>✕</button>
                    )}
                  </div>
                  <div className="resumenEntries">
                    {item.entries.length === 0 && (
                      <div className="resumenEntriesEmpty" style={{ gridColumn: "1 / -1" }}>{tx("Sin montos todavía")}</div>
                    )}
                    {item.entries.map((entry, entryIdx) => {
                      const isLastEntry = entryIdx === item.entries.length - 1;
                      // Each entry needs its OWN set of grid rows — otherwise
                      // every entry's cells would all land on the literal
                      // same grid lines and paint on top of each other once
                      // an account has more than one currency. Desktop uses
                      // 3 of the 4 reserved lines (mid collapses onto row1);
                      // mobile is too narrow to fit +/-, PPC, % and clock+X
                      // alongside the amount, so it gets a row of its own.
                      const row1 = entryIdx * 4 + 1;
                      const rowMid = ctx.isMobile ? entryIdx * 4 + 2 : row1;
                      const row2 = ctx.isMobile ? entryIdx * 4 + 3 : entryIdx * 4 + 2;
                      const rowDivider = ctx.isMobile ? entryIdx * 4 + 4 : entryIdx * 4 + 3;
                      if (entry.kind === "instrument") {
                        const price = resumenRates[`INSTR:${entry.symbol}`] || 0;
                        const val = entryValueInCur(entry, "USD");
                        const entryPct = entry.ppc ? ((price - entry.ppc) / entry.ppc) * 100 : null;
                        const adjustEl = (
                          <span className="resumenEntryAdjust">
                            <button className="resumenAdjustBtn" onClick={() => setTxModal({ boxId: editingBox.id, itemId: item.id, entryId: entry.id, qtyField: "shares", mode: "buy", movementId: null, initial: null, needsPrice: true, currentQty: Number(entry.shares) || 0, currentPrice: price })} title={tx("Comprar")}>+</button>
                            <button className="resumenAdjustBtn" onClick={() => setTxModal({ boxId: editingBox.id, itemId: item.id, entryId: entry.id, qtyField: "shares", mode: "sell", movementId: null, initial: null, needsPrice: true, currentQty: Number(entry.shares) || 0, currentPrice: price })} title={tx("Vender")}>−</button>
                          </span>
                        );
                        const ppcEl = (
                          <div className="resumenPpcRow">
                            <span className="resumenPpcLabel">{tx("PPC")}</span>
                            <input
                              className="mono resumenPpcInput"
                              defaultValue={entry.ppc ? fmtInt(entry.ppc) : ""}
                              placeholder="—"
                              key={entry.id + "-ppc-" + entry.ppc}
                              onFocus={(e) => e.target.select()}
                              onBlur={(e) => updateEntryPpc(editingBox.id, item.id, entry.id, e.target.value)}
                              title={tx("Precio promedio de compra, en USD")}
                            />
                          </div>
                        );
                        const entryGainAmt = entry.ppc ? (Number(entry.shares) || 0) * (price - entry.ppc) : null;
                        const pctEl = (
                          <span className={`resumenEntryPct ${entryPct == null ? "empty" : entryPct >= 0 ? "up" : "down"}`}>
                            {entryPct != null && (
                              <>
                                <span className="resumenEntryPctLine">{entryPct >= 0 ? "▲" : "▼"} {entryPct >= 0 ? "+" : ""}{fmtInt(Math.round(entryPct * 10) / 10)}%</span>
                                <span className="resumenEntryPctAmt">({entryGainAmt >= 0 ? "+" : ""}{money(entryGainAmt, "USD")})</span>
                              </>
                            )}
                          </span>
                        );
                        const clockBtn = <span className="resumenMoveLog" onClick={() => setMovesModal({ boxId: editingBox.id, itemId: item.id, entryId: entry.id, qtyField: "shares" })} title={tx("Ver / editar movimientos")}><ClockIconFlat /></span>;
                        const deleteBtn = <button className="resumenGhostDelete" onClick={() => removeEntry(editingBox.id, item.id, entry.id)} title={tx("Quitar")}>✕</button>;
                        const clockDelEl = (
                          <span className="resumenClockDeleteGroup">
                            {clockBtn}
                            {deleteBtn}
                          </span>
                        );
                        return (
                          <div className="resumenEntryBlock" key={entry.id}>
                            <div className="resumenInstrumentLabel gc-select" style={{ gridRow: row1 }}>
                              <span className="resumenInstrumentSymbol">{entry.symbol}</span>
                              <span className="resumenInstrumentName">{tx(entry.name)}</span>
                            </div>
                            <input
                              className="resumenEntryAmount mono gc-amount"
                              style={{ gridRow: row1 }}
                              defaultValue={entry.shares}
                              key={entry.id + "-sh-" + entry.shares}
                              onFocus={(e) => e.target.select()}
                              onBlur={(e) => directEditAmount(editingBox.id, item.id, entry.id, "shares", e.target.value, true)}
                              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                              title={tx("Cantidad de unidades / acciones")}
                            />
                            {ctx.isMobile ? (
                              <div className="resumenEntryMidRow" style={{ gridRow: rowMid }}>
                                <div className="resumenMidLeft">{adjustEl}{ppcEl}{pctEl}</div>
                                <div className="resumenMidRight">{deleteBtn}{clockBtn}</div>
                              </div>
                            ) : (
                              <>
                                <span className="gc-adjust" style={{ gridRow: rowMid }}>{adjustEl}</span>
                                <span className="gc-ppc" style={{ gridRow: rowMid }}>{ppcEl}</span>
                                <span className="gc-pct" style={{ gridRow: rowMid }}>{pctEl}</span>
                                <span className="gc-clockdel" style={{ gridRow: rowMid }}>{clockDelEl}</span>
                              </>
                            )}
                            <span
                              className="resumenEntrySub resumenPriceEditLink gc-sub"
                              style={{ gridRow: row2 }}
                              onClick={() => showPromptModal(tx("Precio actual, en USD:"), (raw) => updateInstrumentPrice(entry.symbol, raw), price ? String(price) : "", tx("Guardar"))}
                              title={tx("Se actualiza solo con 'Actualizar cotización' (precio real de la acción, vía Finnhub) — tocá para corregirlo a mano")}
                            >≈ {money(val, "USD")}</span>
                            {!isLastEntry && <div className="resumenEntryDivider" style={{ gridRow: rowDivider }} />}
                          </div>
                        );
                      }
                      const isCrypto = CRYPTO_CODES.includes(entry.currency);
                      const vc = entry.viewCurrency || "USD";
                      const converted = isCrypto ? convertViaRates(Number(entry.value) || 0, entry.currency, vc, resumenRates) : null;
                      const needsPrice = isCrypto && !STABLECOINS.includes(entry.currency);
                      const entryPct = needsPrice && entry.ppc ? ((currentPriceFor(entry) - entry.ppc) / entry.ppc) * 100 : null;
                      const entryGainAmt = needsPrice && entry.ppc ? (Number(entry.value) || 0) * (currentPriceFor(entry) - entry.ppc) : null;
                      const adjustEl = (
                        <span className="resumenEntryAdjust">
                          {isCrypto ? (
                            <>
                              <button className="resumenAdjustBtn" onClick={() => setTxModal({ boxId: editingBox.id, itemId: item.id, entryId: entry.id, qtyField: "value", mode: "buy", movementId: null, initial: null, needsPrice, currentQty: Number(entry.value) || 0, currentPrice: currentPriceFor(entry) })} title={tx("Comprar")}>+</button>
                              <button className="resumenAdjustBtn" onClick={() => setTxModal({ boxId: editingBox.id, itemId: item.id, entryId: entry.id, qtyField: "value", mode: "sell", movementId: null, initial: null, needsPrice, currentQty: Number(entry.value) || 0, currentPrice: currentPriceFor(entry) })} title={tx("Vender")}>−</button>
                            </>
                          ) : (
                            <>
                              <button className="resumenAdjustBtn" onClick={() => adjustFiatEntry(editingBox.id, item.id, entry.id, 1)} title={tx("Sumar")}>+</button>
                              <button className="resumenAdjustBtn" onClick={() => adjustFiatEntry(editingBox.id, item.id, entry.id, -1)} title={tx("Restar")}>−</button>
                            </>
                          )}
                        </span>
                      );
                      const ppcEl = needsPrice ? (
                        <div className="resumenPpcRow">
                          <span className="resumenPpcLabel">{tx("PPC")}</span>
                          <input
                            className="mono resumenPpcInput"
                            defaultValue={entry.ppc ? fmtInt(entry.ppc) : ""}
                            placeholder="—"
                            key={entry.id + "-ppc-" + entry.ppc}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => updateEntryPpc(editingBox.id, item.id, entry.id, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                            title={tx("Precio promedio de compra, en USD")}
                          />
                        </div>
                      ) : null;
                      const pctEl = entryPct != null ? (
                        <span className={`resumenEntryPct ${entryPct >= 0 ? "up" : "down"}`}>
                          <span className="resumenEntryPctLine">{entryPct >= 0 ? "▲" : "▼"} {entryPct >= 0 ? "+" : ""}{fmtInt(Math.round(entryPct * 10) / 10)}%</span>
                          <span className="resumenEntryPctAmt">({entryGainAmt >= 0 ? "+" : ""}{money(entryGainAmt, "USD")})</span>
                        </span>
                      ) : null;
                      const clockBtn = <span className="resumenMoveLog" onClick={() => setMovesModal({ boxId: editingBox.id, itemId: item.id, entryId: entry.id, qtyField: "value" })} title={tx("Ver / editar movimientos")}><ClockIconFlat /></span>;
                      const deleteBtn = <button className="resumenGhostDelete" onClick={() => removeEntry(editingBox.id, item.id, entry.id)} title={tx("Quitar")}>✕</button>;
                      const clockDelEl = (
                        <span className="resumenClockDeleteGroup">
                          {clockBtn}
                          {deleteBtn}
                        </span>
                      );
                      const subEl = isCrypto ? (
                        <span className="resumenEntrySub gc-sub" style={{ gridRow: row2 }}>
                          ≈ {money(converted, vc)}
                          <button
                            className="curToggle"
                            onClick={() => cycleEntryViewCurrency(editingBox.id, item.id, entry.id, vc)}
                            title={tx("Cambiar la moneda de cotización")}
                          >{vc}</button>
                        </span>
                      ) : null;
                      return (
                        <div className="resumenEntryBlock" key={entry.id}>
                          <select
                            className="resumenEntrySelect gc-select"
                            style={{ gridRow: row1 }}
                            value={entry.currency}
                            onChange={(e) => {
                              if (e.target.value === "__add__") {
                                setAddCurrencyTarget({ boxId: editingBox.id, itemId: item.id, entryId: entry.id });
                                setShowAddCurrency(true);
                                return;
                              }
                              const patch = { currency: e.target.value };
                              if (CRYPTO_CODES.includes(e.target.value) && !entry.viewCurrency) patch.viewCurrency = "USD";
                              updateEntry(editingBox.id, item.id, entry.id, patch);
                            }}
                          >
                            {resumenCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                            <option value="__add__">+</option>
                          </select>
                          <input
                            className="resumenEntryAmount mono gc-amount"
                            style={{ gridRow: row1 }}
                            defaultValue={needsPrice ? entry.value : fmtInt(entry.value)}
                            key={entry.id + "-" + entry.value}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => directEditAmount(editingBox.id, item.id, entry.id, "value", e.target.value, needsPrice)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                            title={tx("También acepta fórmulas, ej. =120+45")}
                          />
                          {ctx.isMobile ? (
                            <div className="resumenEntryMidRow" style={{ gridRow: rowMid }}>
                              <div className="resumenMidLeft">{adjustEl}{ppcEl}{pctEl}</div>
                              <div className="resumenMidRight">{deleteBtn}{clockBtn}</div>
                            </div>
                          ) : (
                            <>
                              <span className="gc-adjust" style={{ gridRow: rowMid }}>{adjustEl}</span>
                              {ppcEl && <span className="gc-ppc" style={{ gridRow: rowMid }}>{ppcEl}</span>}
                              {pctEl && <span className="gc-pct" style={{ gridRow: rowMid }}>{pctEl}</span>}
                              <span className="gc-clockdel" style={{ gridRow: rowMid }}>{clockDelEl}</span>
                            </>
                          )}
                          {subEl}
                          {!isLastEntry && <div className="resumenEntryDivider" style={{ gridRow: rowDivider }} />}
                        </div>
                      );
                    })}
                    <div className="resumenAddEntryRow" style={{ gridColumn: "1 / -1", gridRow: item.entries.length * 4 + 1 }}>
                      <button className="resumenAddEntryBtn" onClick={() => addEntry(editingBox.id, item.id)}>{tx("+ Agregar moneda")}</button>
                      <button className="resumenAddEntryBtn resumenAddInvestBtn" onClick={() => { setAddInstrumentTarget({ boxId: editingBox.id, itemId: item.id }); setShowAddInstrument(true); }}>{tx("+ Agregar inversión")}</button>
                    </div>
                  </div>
                </div>
              ))}
              <button className="pillBtn" style={{ marginTop: 4 }} onClick={() => addItem(editingBox.id)}>{tx("+ Agregar cuenta / ítem")}</button>

              <div className="resumenNoteWrap">
                <label className="resumenNoteLabel">{tx("Nota")}</label>
                <textarea
                  className="resumenNoteArea"
                  placeholder={tx("Notas para esta caja (opcional)")}
                  defaultValue={editingBox.note || ""}
                  onBlur={(e) => updateBoxNote(editingBox.id, e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddCurrency && (
        <div className="gx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowAddCurrency(false); setAddCurrencyTarget(null); } }}>
          <div className="gx-modal-box resumenAddCurrencyBox">
            <strong className="gx-enc-title">{tx("Agregar moneda")}</strong>
            {resumenCurrencies.filter((c) => !["ARS", "USD", "EUR"].includes(c)).length > 0 && (
              <div className="resumenActiveCurList">
                <span className="resumenRatesLabel">{tx("Activas ahora:")}</span>
                {resumenCurrencies.filter((c) => !["ARS", "USD", "EUR"].includes(c)).map((c) => (
                  <span key={c} className="resumenActiveCurChip">
                    {c}
                    <button className="resumenRateRemove" onClick={() => removeCurrency(c)} title={tx("Sacar {c}", { c })}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="resumenPresetCols">
              <div className="resumenPresetCol">
                <span className="resumenRatesLabel">{tx("Monedas del mundo")}</span>
                {addableFiat.length === 0 && <div className="hint">{tx("Ya están todas.")}</div>}
                {addableFiat.map((f) => (
                  <button key={f.code} className="pillBtn resumenPresetBtn" onClick={() => addPresetCurrency(f.code)}>
                    {tx(f.label)} <span className="resumenPresetCode">({f.code})</span>
                  </button>
                ))}
              </div>
              <div className="resumenPresetCol">
                <span className="resumenRatesLabel">{tx("Cripto (por market cap)")}</span>
                {addableCrypto.length === 0 && <div className="hint">{tx("Ya están todas.")}</div>}
                {addableCrypto.map((f) => (
                  <button key={f.code} className="pillBtn resumenPresetBtn resumenPresetBtnCrypto" onClick={() => addPresetCurrency(f.code)}>
                    {tx(f.label)} <span className="resumenPresetCode">({f.code})</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="gx-modal-actions">
              <button className="pillBtn" onClick={addCustomCurrency}>{tx("Otra (manual)")}</button>
              <button className="gx-enc-cancel" onClick={() => { setShowAddCurrency(false); setAddCurrencyTarget(null); }}>{tx("Cerrar")}</button>
            </div>
          </div>
        </div>
      )}

      {showAddInstrument && addInstrumentTarget && (
        <div className="gx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowAddInstrument(false); setAddInstrumentTarget(null); } }}>
          <div className="gx-modal-box resumenAddCurrencyBox">
            <strong className="gx-enc-title">{tx("Agregar inversión")}</strong>
            <p className="gx-enc-desc" style={{ marginTop: 6 }}>
              {tx("Se carga en unidades + precio promedio de compra, como la cripto. El precio actual es el de la acción real (vía Finnhub) y se actualiza solo con \"Actualizar cotización\" — también lo podés corregir a mano.")}
            </p>
            <div className="resumenPresetCols">
              <div className="resumenPresetCol">
                {PRESET_INSTRUMENTS.slice(0, Math.ceil(PRESET_INSTRUMENTS.length / 2)).map((f) => (
                  <button key={f.symbol} className="pillBtn resumenPresetBtn" onClick={() => addInstrument(addInstrumentTarget.boxId, addInstrumentTarget.itemId, f.symbol, f.label)}>
                    {tx(f.label)} <span className="resumenPresetCode">({f.symbol})</span>
                  </button>
                ))}
              </div>
              <div className="resumenPresetCol">
                {PRESET_INSTRUMENTS.slice(Math.ceil(PRESET_INSTRUMENTS.length / 2)).map((f) => (
                  <button key={f.symbol} className="pillBtn resumenPresetBtn" onClick={() => addInstrument(addInstrumentTarget.boxId, addInstrumentTarget.itemId, f.symbol, f.label)}>
                    {tx(f.label)} <span className="resumenPresetCode">({f.symbol})</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="gx-modal-actions">
              <button
                className="pillBtn"
                onClick={() => showPromptModal(tx("Símbolo (ej. NFLX):"), async (sym) => {
                  const clean = (sym || "").trim().toUpperCase();
                  if (!clean) return;
                  let name = clean;
                  try {
                    const res = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${clean}&token=${FINNHUB_KEY}`);
                    if (res.ok) {
                      const data = await res.json();
                      if (data?.name) name = data.name;
                    }
                  } catch (e) { /* fall back to the symbol itself as the name */ }
                  addInstrument(addInstrumentTarget.boxId, addInstrumentTarget.itemId, clean, name);
                }, "", tx("Agregar"))}
              >{tx("Otra (manual)")}</button>
              <button className="gx-enc-cancel" onClick={() => { setShowAddInstrument(false); setAddInstrumentTarget(null); }}>{tx("Cerrar")}</button>
            </div>
          </div>
        </div>
      )}

      {txModal && (() => {
        const box = resumenBoxes.find((b) => b.id === txModal.boxId);
        const item = box?.items.find((it) => it.id === txModal.itemId);
        const entry = item?.entries.find((e) => e.id === txModal.entryId);
        if (!entry) return null;
        const label = entry.kind === "instrument" ? `${entry.symbol} — ${tx(entry.name)}` : entry.currency;
        return (
          <TxModal
            txModal={txModal}
            entry={entry}
            label={label}
            onClose={() => setTxModal(null)}
            onSubmit={submitTxModal}
            onDeleteMovement={(movementId) => {
              deleteMovement(txModal.boxId, txModal.itemId, txModal.entryId, txModal.qtyField, movementId, () => setTxModal(null));
            }}
          />
        );
      })()}

      {movesModal && (() => {
        const box = resumenBoxes.find((b) => b.id === movesModal.boxId);
        const item = box?.items.find((it) => it.id === movesModal.itemId);
        const entry = item?.entries.find((e) => e.id === movesModal.entryId);
        if (!entry) return null;
        const isCrypto = entry.kind === "instrument" || (CRYPTO_CODES.includes(entry.currency) && !STABLECOINS.includes(entry.currency));
        return (
          <MovesModal
            movesModal={movesModal}
            entry={entry}
            isCrypto={isCrypto}
            onClose={() => setMovesModal(null)}
            onEdit={(m) => openTxEditModal(movesModal.boxId, movesModal.itemId, movesModal.entryId, movesModal.qtyField, m)}
            onDelete={(movementId) => deleteMovement(movesModal.boxId, movesModal.itemId, movesModal.entryId, movesModal.qtyField, movementId)}
          />
        );
      })()}
    </div>
  );
}
