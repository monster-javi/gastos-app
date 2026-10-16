import { computeAlerts, notificationBody } from "./alerts.js";
import { setTxLang, tx, txn } from "./tx.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { sb, makeStorage, getEncMeta, saveEncMeta, deriveAndVerifyKey, subscribeToChanges, RESUMEN_ENC_META_KEY, rawRows, rawWrite } from "./supabase.js";
import { isSecureContextAvailable, generateSalt, deriveKey, encryptValue, decryptValue, looksEncrypted } from "./crypto.js";
import { askPassword, wipeDialog } from "./dialogs.js";
import StatementsView from "./components/StatementsView.jsx";
import { makeI18n } from "./i18n.js";
import {
  DEFAULT_MACROS, PALETTE, uid, normalize, parseCellInput, parseAmount,
  monthLabel, monthFullLabel, shiftMonth, evalFormula, maskEmail,
} from "./utils.js";
import LoginScreen from "./components/LoginScreen.jsx";
import UnlockScreen from "./components/UnlockScreen.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import PlanillaView from "./components/PlanillaView.jsx";
import ListaView from "./components/ListaView.jsx";
import DeudasView from "./components/DeudasView.jsx";
import SyncView from "./components/SyncView.jsx";
import Modal from "./components/Modal.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import EncryptionModal from "./components/EncryptionModal.jsx";
import ResumenView from "./components/ResumenView.jsx";
import FacturacionView, { defaultFacturacion } from "./components/FacturacionView.jsx";
import { usePersistentState } from "./uiState.js";
import { retryFailedWrites } from "./supabase.js";
import ResumenEncryptionModal from "./components/ResumenEncryptionModal.jsx";

const SEC_KEY = "sectionsV4", TXN_KEY = "transactionsV4", CELL_KEY = "cellDataV4",
  DOLAR_KEY = "dolarByMonthV4", EUR_KEY = "eurByMonthV4", MACRO_KEY = "macroTagsV4",
  SYNC_KEY = "syncConfigV4", LANG_KEY = "langV1", CURRENCY_KEY = "primaryCurrencyV1",
  NOTIF_KEY = "notifEnabledV1", HIDE_ZEROS_KEY = "hideZerosV1", RECALC_CUR_KEY = "recalcOnCurrencyChangeV1", DEBTS_KEY = "debtsV1",
  LEARN_CAP_KEY = "learnedKeywordCapV1", FACT_KEY = "facturacionV1", STATEMENTS_KEY = "statementsV1",
  RESUMEN_BOXES_KEY = "resumenBoxesV1", RESUMEN_CURR_KEY = "resumenCurrenciesV1",
  RESUMEN_RATES_KEY = "resumenRatesV1", RESUMEN_DISPLAY_KEY = "resumenDisplayCurrencyV1";
const RESUMEN_DOMAIN_KEYS = [RESUMEN_BOXES_KEY, RESUMEN_CURR_KEY, RESUMEN_RATES_KEY, RESUMEN_DISPLAY_KEY];
// (Note: "statementsV1" must not start with "resumen": keys with that prefix
// belong to the Bóveda's own encryption domain.)

// Set when the person locks the Bóveda by hand, so it doesn't reopen by
// itself with the app's key (when both share the same password) until they
// unlock it again.
let vaultManualLock = false;

function nowMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const userRef = useRef(null);
  userRef.current = user;

  const encKeyRef = useRef(null);
  const [encMeta, setEncMeta] = useState({ encrypted: false });
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [unlockVersion, setUnlockVersion] = useState(0);

  const storage = useMemo(() => makeStorage(() => userRef.current, () => encKeyRef.current), []);

  // ---- Resumen (net worth) section: its own storage, its own encryption
  // domain, own password — completely independent of the main app's
  // encryption. Its data is never loaded until the user actually opens the
  // Resumen view AND (if encrypted) unlocks it there.
  const resumenEncKeyRef = useRef(null);
  const [resumenEncMeta, setResumenEncMeta] = useState({ encrypted: false });
  // Until we actually KNOW whether the Bóveda is encrypted we must not load
  // it: opening the app straight on the Bóveda used to read the ciphertext
  // as if it were plain data (meta still "not encrypted" by default) and the
  // screen went blank.
  const [resumenMetaLoaded, setResumenMetaLoaded] = useState(false);
  const [resumenNeedsUnlock, setResumenNeedsUnlock] = useState(false);
  const [resumenUnlockVersion, setResumenUnlockVersion] = useState(0);
  const [resumenDataLoaded, setResumenDataLoaded] = useState(false);
  const [showResumenEncryption, setShowResumenEncryption] = useState(false);
  const resumenStorage = useMemo(() => makeStorage(() => userRef.current, () => resumenEncKeyRef.current), []);
  const [resumenBoxes, setResumenBoxes] = useState([]);
  const [resumenCurrencies, setResumenCurrencies] = useState(["ARS", "USD", "EUR", "BTC", "ETH", "SOL"]);
  const [resumenRates, setResumenRates] = useState({ ARS: 1, USD: 1535, EUR: 1735, BTC: 0, ETH: 0, SOL: 0 });
  const [resumenDisplayCurrency, setResumenDisplayCurrencyState] = useState("ARS");

  // ---- data state ----
  const [sections, setSections] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts] = useState([]);
  const [facturacion, setFacturacion] = useState(() => defaultFacturacion());
  // "Resúmenes": record of each card statement loaded (totals, dates, every line).
  const [statements, setStatements] = useState([]);
  const [cellData, setCellData] = useState({});
  const [dolarByMonth, setDolarByMonth] = useState({});
  const [eurByMonth, setEurByMonth] = useState({});
  const [macroTags, setMacroTags] = useState(DEFAULT_MACROS);
  const [syncConfig, setSyncConfig] = useState({ monthCells: {} });
  const [lang, setLangState] = useState("es");
  const [primaryCurrency, setPrimaryCurrencyState] = useState("ARS");
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [alertIdx, setAlertIdx] = useState(0);
  const [alertsPaused, setAlertsPaused] = useState(false);
  const [alertsDay, setAlertsDay] = useState(() => new Date().toDateString());
  const [hideZeros, setHideZerosState] = useState(true);
  const [recalcOnCurrencyChange, setRecalcOnCurrencyChangeState] = useState(false);
  const [learnedKeywordCap, setLearnedKeywordCapState] = useState(40);
  const [dataLoaded, setDataLoaded] = useState(false);

  // ---- ui state ----
  const [view, setView] = usePersistentState("app.view", "planilla");
  const [filterSubcat, setFilterSubcat] = useState(null);
  const [hideCategorized, setHideCategorized] = usePersistentState("app.hideCategorized", false);
  const [showFavoritesOnly, setShowFavoritesOnly] = usePersistentState("app.favOnly", false);
  const [showUnpaidOnly, setShowUnpaidOnly] = usePersistentState("app.unpaidOnly", false);
  const [searchTerm, setSearchTerm] = useState("");
  const [planillaSearch, setPlanillaSearch] = useState("");
  const [showMacroPanel, setShowMacroPanel] = usePersistentState("app.showMacroPanel", false);
  const [entryTab, setEntryTab] = usePersistentState("app.entryTab", "texto");
  // Month/year you're standing on: kept across a refresh of this tab, but a
  // new tab (or another day) opens on today's month as usual.
  const [selectedMonth, setSelectedMonth] = usePersistentState("app.selectedMonth", nowMonth, true);
  const [plannerYear, setPlannerYear] = usePersistentState("app.plannerYear", () => new Date().getFullYear(), true);
  const [syncMonth, setSyncMonth] = useState(nowMonth());
  const [modal, setModal] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showEncryption, setShowEncryption] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 820);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 820); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // "Notebook mode": when the space actually available for the planilla isn't
  // enough to show all 12 month columns at their normal width, show as many
  // as DO fit instead — centered on the selected month — rather than
  // shrinking every cell. The topbar swaps year-navigation for a "ver los 12
  // meses" toggle to match (see Topbar.jsx). 1366px window width (a common
  // small notebook screen) is the smallest size this is meant to comfortably
  // support.
  const contentRef = useRef(null);
  const [notebookMonthCount, setNotebookMonthCount] = useState(12);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const CATCOL_W = 395, TOTALCOL_W = 140, MONTHCOL_W = 130;
    function update() {
      const available = el.clientWidth - CATCOL_W - TOTALCOL_W - 64; // ~24px table border/padding slack
      setNotebookMonthCount(Math.max(3, Math.min(12, Math.floor(available / MONTHCOL_W))));
    }
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, [dataLoaded]);
  const notebookMode = notebookMonthCount < 12;
  // Manual override, like Excel/Sheets' "show hidden columns": lets you go
  // back to seeing all 12 months (with horizontal scroll) even while in
  // notebook mode, instead of the centered-on-selected-month view.
  const [showAllMonthsOverride, setShowAllMonthsOverride] = usePersistentState("app.showAllMonths", false);

  const t = makeI18n(lang);
  setTxLang(lang);

  // Save status + connectivity: silent when everything's fine, a small toast
  // when a save is being retried, failed, or the device went offline.
  const [saveState, setSaveState] = useState("ok"); // ok | retrying | failed | recovered | offline
  useEffect(() => {
    let hideTimer = null;
    const onStatus = (e) => {
      const st = e.detail?.state;
      clearTimeout(hideTimer);
      if (st === "ok") { setSaveState((p) => (p === "offline" ? p : "ok")); return; }
      setSaveState(st);
      if (st === "recovered") hideTimer = setTimeout(() => setSaveState("ok"), 2500);
    };
    const onOffline = () => setSaveState("offline");
    const onOnline = () => { setSaveState((p) => (p === "offline" ? "ok" : p)); retryFailedWrites(); };
    window.addEventListener("gx-save-status", onStatus);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (typeof navigator !== "undefined" && navigator.onLine === false) setSaveState("offline");
    return () => { window.removeEventListener("gx-save-status", onStatus); window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); clearTimeout(hideTimer); };
  }, []);

  // ---- auth wiring ----
  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      setUser(session?.user || null);
      setAuthChecked(true);
    })();
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") setUser(session.user);
      else if (event === "SIGNED_OUT") { setUser(null); setDataLoaded(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---- load data once logged in ----
  useEffect(() => {
    if (!user) return;
    (async () => {
      const meta = await getEncMeta();
      setEncMeta(meta);
      if (meta.encrypted && !encKeyRef.current) {
        setNeedsUnlock(true);
        return;
      }
      setNeedsUnlock(false);

      const got = await storage.getMany([MACRO_KEY, SEC_KEY, TXN_KEY, DEBTS_KEY, FACT_KEY, CELL_KEY, DOLAR_KEY, EUR_KEY, LANG_KEY, CURRENCY_KEY, NOTIF_KEY, HIDE_ZEROS_KEY, RECALC_CUR_KEY, LEARN_CAP_KEY, SYNC_KEY, STATEMENTS_KEY]);
      const rMacro = (got[MACRO_KEY] || null);
      let mt = null;
      try { mt = rMacro && rMacro.value ? JSON.parse(rMacro.value) : null; } catch (e) { mt = null; }
      if (!mt) { mt = DEFAULT_MACROS.map((m) => ({ ...m })); await storage.set(MACRO_KEY, JSON.stringify(mt)); }
      setMacroTags(mt);

      const rSec = (got[SEC_KEY] || null);
      let sec = null;
      try { sec = rSec && rSec.value ? JSON.parse(rSec.value) : null; } catch (e) { sec = null; }
      if (!sec) { sec = []; await storage.set(SEC_KEY, JSON.stringify(sec)); }
      setSections(sec);

      const rTxn = (got[TXN_KEY] || null);
      let txns = [];
      try { txns = rTxn && rTxn.value ? JSON.parse(rTxn.value) : []; } catch (e) { txns = []; }
      txns.forEach((tr) => { if (!tr.month) tr.month = nowMonth(); });
      setTransactions(txns);

      const rDebts = (got[DEBTS_KEY] || null);
      let debtsData = [];
      try { debtsData = rDebts && rDebts.value ? JSON.parse(rDebts.value) : []; } catch (e) { debtsData = []; }
      setDebts(debtsData);

      const rFact = (got[FACT_KEY] || null);
      let fact = null;
      try { fact = rFact && rFact.value ? JSON.parse(rFact.value) : null; } catch (e) { fact = null; }
      setFacturacion(fact ? { ...defaultFacturacion(), ...fact } : defaultFacturacion());
      {
        const rSt = got[STATEMENTS_KEY];
        let st = [];
        try { st = rSt && rSt.value ? JSON.parse(rSt.value) : []; } catch (e) { st = []; }
        setStatements(Array.isArray(st) ? st : []);
      }

      const rCell = (got[CELL_KEY] || null);
      let cd = {};
      try { cd = rCell && rCell.value ? JSON.parse(rCell.value) : {}; } catch (e) { cd = {}; }
      setCellData(cd);

      const rDolar = (got[DOLAR_KEY] || null);
      let db = {};
      try { db = rDolar && rDolar.value ? JSON.parse(rDolar.value) : {}; } catch (e) { db = {}; }
      setDolarByMonth(db);

      const rEur = (got[EUR_KEY] || null);
      let eb = {};
      try { eb = rEur && rEur.value ? JSON.parse(rEur.value) : {}; } catch (e) { eb = {}; }
      setEurByMonth(eb);

      const rLang = (got[LANG_KEY] || null);
      setLangState(rLang && rLang.value ? rLang.value : "es");

      const rCur = (got[CURRENCY_KEY] || null);
      setPrimaryCurrencyState(rCur && rCur.value ? rCur.value : "ARS");

      const rNotif = (got[NOTIF_KEY] || null);
      setNotificationsEnabledState(rNotif && rNotif.value != null ? rNotif.value === "true" : true);

      const rHideZeros = (got[HIDE_ZEROS_KEY] || null);
      setHideZerosState(rHideZeros && rHideZeros.value != null ? rHideZeros.value === "true" : true);

      const rRecalcCur = (got[RECALC_CUR_KEY] || null);
      setRecalcOnCurrencyChangeState(rRecalcCur && rRecalcCur.value != null ? rRecalcCur.value === "true" : false);

      const rLearnCap = (got[LEARN_CAP_KEY] || null);
      setLearnedKeywordCapState(rLearnCap && rLearnCap.value ? Number(rLearnCap.value) || 40 : 40);

      const rSync = (got[SYNC_KEY] || null);
      let sc = { monthCells: {} };
      try { sc = rSync && rSync.value ? JSON.parse(rSync.value) : { monthCells: {} }; } catch (e) { sc = { monthCells: {} }; }
      if (!sc.monthCells) sc.monthCells = {};
      setSyncConfig(sc);

      setDataLoaded(true);
    })();
  }, [user, storage, unlockVersion]);

  // Resumen's own encryption status — cheap metadata only, always readable
  // regardless of lock state (it's just "is this on, and with which salt").
  useEffect(() => {
    if (!user) return;
    (async () => {
      const meta = await getEncMeta(RESUMEN_ENC_META_KEY);
      setResumenEncMeta(meta);
      setResumenMetaLoaded(true);
    })();
  }, [user]);

  async function loadResumenData() {
    const got = await resumenStorage.getMany([RESUMEN_BOXES_KEY, RESUMEN_CURR_KEY, RESUMEN_RATES_KEY, RESUMEN_DISPLAY_KEY]);
    const rBoxes = (got[RESUMEN_BOXES_KEY] || null);
    let boxes = [];
    try { boxes = rBoxes && rBoxes.value ? JSON.parse(rBoxes.value) : []; } catch (e) { boxes = []; }
    // Safety net: anything that isn't a list of boxes (e.g. ciphertext that
    // couldn't be decrypted) means "locked", never "empty".
    if (!Array.isArray(boxes)) {
      if (boxes && boxes.__enc) { resumenEncKeyRef.current = null; setResumenNeedsUnlock(true); return; }
      boxes = [];
    }
    setResumenBoxes(boxes);

    const rCurr = (got[RESUMEN_CURR_KEY] || null);
    let curr = ["ARS", "USD", "EUR", "BTC", "ETH", "SOL"];
    try { curr = rCurr && rCurr.value ? JSON.parse(rCurr.value) : curr; } catch (e) { /* keep default */ }
    if (!Array.isArray(curr)) curr = ["ARS", "USD", "EUR", "BTC", "ETH", "SOL"];
    setResumenCurrencies(curr);

    const rRates = (got[RESUMEN_RATES_KEY] || null);
    let rates = { ARS: 1, USD: 1535, EUR: 1735, BTC: 0, ETH: 0, SOL: 0 };
    try { rates = rRates && rRates.value ? JSON.parse(rRates.value) : rates; } catch (e) { /* keep default */ }
    if (!rates || typeof rates !== "object" || rates.__enc) rates = { ARS: 1, USD: 1535, EUR: 1735, BTC: 0, ETH: 0, SOL: 0 };
    if (rates.ARS == null) rates.ARS = 1;
    setResumenRates(rates);

    const rDisp = (got[RESUMEN_DISPLAY_KEY] || null);
    setResumenDisplayCurrencyState(rDisp && rDisp.value && !String(rDisp.value).startsWith("{") ? rDisp.value : "ARS");

    setResumenDataLoaded(true);
  }

  // Only checks/loads Resumen's data once the user actually opens that view —
  // the rest of the app never touches it, so it stays untouched (and, once a
  // password is set, encrypted) unless someone deliberately goes there.
  useEffect(() => {
    if (view !== "resumen" || !user || !resumenMetaLoaded) return;
    if (resumenEncMeta.encrypted && !resumenEncKeyRef.current) {
      // Same password as the app's encryption → the app's key opens it too.
      if (!vaultManualLock && encMeta.encrypted && encKeyRef.current && encMeta.salt === resumenEncMeta.salt) {
        resumenEncKeyRef.current = encKeyRef.current;
      } else {
        setResumenNeedsUnlock(true);
        return;
      }
    }
    setResumenNeedsUnlock(false);
    if (!resumenDataLoaded) loadResumenData();
  }, [view, user, resumenEncMeta, resumenMetaLoaded, resumenUnlockVersion, encMeta]);

  const saveResumenBoxes = (v) => resumenStorage.set(RESUMEN_BOXES_KEY, JSON.stringify(v));
  const saveResumenCurrencies = (v) => resumenStorage.set(RESUMEN_CURR_KEY, JSON.stringify(v));
  const saveResumenRates = (v) => resumenStorage.set(RESUMEN_RATES_KEY, JSON.stringify(v));
  function setResumenDisplayCurrency(v) { setResumenDisplayCurrencyState(v); resumenStorage.set(RESUMEN_DISPLAY_KEY, v); }

  async function unlockResumen(password) {
    const key = await deriveAndVerifyKey(password, resumenEncMeta.salt, RESUMEN_DOMAIN_KEYS); // throws if wrong
    resumenEncKeyRef.current = key;
    vaultManualLock = false;
    setResumenUnlockVersion((v) => v + 1);
  }

  function lockResumen() {
    vaultManualLock = true;
    resumenEncKeyRef.current = null;
    setResumenDataLoaded(false);
    setResumenBoxes([]);
    setResumenNeedsUnlock(true);
  }

  async function reencryptResumen(newKey) {
    const prevKey = resumenEncKeyRef.current;
    resumenEncKeyRef.current = newKey;
    try {
      await Promise.all([
        resumenStorage.set(RESUMEN_BOXES_KEY, JSON.stringify(resumenBoxes)),
        resumenStorage.set(RESUMEN_CURR_KEY, JSON.stringify(resumenCurrencies)),
        resumenStorage.set(RESUMEN_RATES_KEY, JSON.stringify(resumenRates)),
        resumenStorage.set(RESUMEN_DISPLAY_KEY, resumenDisplayCurrency),
      ]);
    } catch (e) {
      resumenEncKeyRef.current = prevKey;
      throw e;
    }
  }

  async function enableResumenEncryption(password, confirmPassword) {
    if (password.length < 8) throw new Error(tx("Usá al menos 8 caracteres."));
    if (password !== confirmPassword) throw new Error(tx("Las contraseñas no coinciden."));
    if (!isSecureContextAvailable()) throw new Error(tx("El cifrado necesita HTTPS (o localhost). Esta página no cumple ese requisito."));
    // One password for everything: if the app is already encrypted, the
    // Bóveda must use that same password (and salt).
    let salt = generateSalt();
    if (encMeta.encrypted && encMeta.salt) {
      try { await deriveAndVerifyKey(password, encMeta.salt); } catch { throw new Error(tx("Usá la misma contraseña del cifrado de la app.")); }
      salt = encMeta.salt;
    }
    const key = await deriveKey(password, salt);
    await reencryptResumen(key);
    await saveEncMeta(user.id, { encrypted: true, salt }, RESUMEN_ENC_META_KEY);
    setResumenEncMeta({ encrypted: true, salt });
  }

  // No "disable" is exposed in the UI on purpose — this section is meant to
  // stay encrypted at all times once set up. Changing the password re-derives
  // a new key and re-encrypts everything with it in one step.
  async function changeResumenPassword(oldPassword, newPassword, confirmNewPassword) {
    if (newPassword.length < 8) throw new Error(tx("Usá al menos 8 caracteres."));
    if (newPassword !== confirmNewPassword) throw new Error(tx("Las contraseñas nuevas no coinciden."));
    await deriveAndVerifyKey(oldPassword, resumenEncMeta.salt, RESUMEN_DOMAIN_KEYS); // throws if wrong
    const shared = encMeta.encrypted && encMeta.salt === resumenEncMeta.salt;
    const salt = generateSalt();
    const key = await deriveKey(newPassword, salt);
    await reencryptResumen(key);
    await saveEncMeta(user.id, { encrypted: true, salt }, RESUMEN_ENC_META_KEY);
    setResumenEncMeta({ encrypted: true, salt });
    // Shared password: the app's encryption changes along with it.
    if (shared) {
      await reencryptEverything(key);
      await saveEncMeta(user.id, { encrypted: true, salt });
      setEncMeta({ encrypted: true, salt });
    }
  }

  // ---- persistence setters (fire-and-forget, mirrors the original) ----
  const saveSections = (v) => storage.set(SEC_KEY, JSON.stringify(v));
  const saveTransactions = (v) => storage.set(TXN_KEY, JSON.stringify(v));
  const saveDebts = (v) => storage.set(DEBTS_KEY, JSON.stringify(v));
  const saveFacturacion = (v) => storage.set(FACT_KEY, JSON.stringify(v));
  const saveStatements = (v) => storage.set(STATEMENTS_KEY, JSON.stringify(v));
  const saveCellData = (v) => storage.set(CELL_KEY, JSON.stringify(v));
  const saveDolar = (v) => storage.set(DOLAR_KEY, JSON.stringify(v));
  const saveEur = (v) => storage.set(EUR_KEY, JSON.stringify(v));
  const saveMacroTags = (v) => storage.set(MACRO_KEY, JSON.stringify(v));
  const saveSyncConfig = (v) => storage.set(SYNC_KEY, JSON.stringify(v));

  function setLang(v) { setLangState(v); storage.set(LANG_KEY, v); }
  function setPrimaryCurrency(v) { setPrimaryCurrencyState(v); storage.set(CURRENCY_KEY, v); }

  // ---- encryption ----
  async function unlockWithPassword(password) {
    const key = await deriveAndVerifyKey(password, encMeta.salt); // throws (OperationError) if wrong
    encKeyRef.current = key;
    setUnlockVersion((v) => v + 1);
  }

  async function reencryptEverything(newKey) {
    const prevKey = encKeyRef.current;
    encKeyRef.current = newKey;
    try {
      await Promise.all([
        storage.set(SEC_KEY, JSON.stringify(sections)),
        storage.set(TXN_KEY, JSON.stringify(transactions)),
        storage.set(DEBTS_KEY, JSON.stringify(debts)),
        storage.set(FACT_KEY, JSON.stringify(facturacion)),
        storage.set(STATEMENTS_KEY, JSON.stringify(statements)),
        storage.set(CELL_KEY, JSON.stringify(cellData)),
        storage.set(DOLAR_KEY, JSON.stringify(dolarByMonth)),
        storage.set(EUR_KEY, JSON.stringify(eurByMonth)),
        storage.set(MACRO_KEY, JSON.stringify(macroTags)),
        storage.set(SYNC_KEY, JSON.stringify(syncConfig)),
        storage.set(LANG_KEY, lang),
        storage.set(CURRENCY_KEY, primaryCurrency),
        storage.set(NOTIF_KEY, String(notificationsEnabled)),
        storage.set(HIDE_ZEROS_KEY, String(hideZeros)),
        storage.set(RECALC_CUR_KEY, String(recalcOnCurrencyChange)),
        storage.set(LEARN_CAP_KEY, String(learnedKeywordCap)),
      ]);
    } catch (e) {
      encKeyRef.current = prevKey;
      throw e;
    }
  }

  async function enableEncryption(password, confirmPassword) {
    if (password.length < 8) throw new Error(tx("Usá al menos 8 caracteres."));
    if (password !== confirmPassword) throw new Error(tx("Las contraseñas no coinciden."));
    if (!isSecureContextAvailable()) throw new Error(tx("El cifrado necesita HTTPS (o localhost). Esta página no cumple ese requisito."));
    // If the Bóveda already has a password, the app uses that same one.
    let salt = generateSalt();
    if (resumenEncMeta.encrypted && resumenEncMeta.salt) {
      try { await deriveAndVerifyKey(password, resumenEncMeta.salt, RESUMEN_DOMAIN_KEYS); } catch { throw new Error(tx("Usá la misma contraseña de la Bóveda.")); }
      salt = resumenEncMeta.salt;
    }
    const key = await deriveKey(password, salt);
    await reencryptEverything(key);
    await saveEncMeta(user.id, { encrypted: true, salt });
    setEncMeta({ encrypted: true, salt });
    if (resumenEncMeta.encrypted && resumenEncMeta.salt === salt) {
      resumenEncKeyRef.current = key;
      vaultManualLock = false;
      setResumenUnlockVersion((v) => v + 1);
    }
  }

  async function disableEncryption(password) {
    await deriveAndVerifyKey(password, encMeta.salt); // throws if wrong
    await reencryptEverything(null);
    await saveEncMeta(user.id, { encrypted: false });
    setEncMeta({ encrypted: false });
  }

  // ---- live cross-device sync ----
  useEffect(() => {
    if (!user || !dataLoaded) return;
    const setterByKey = {
      [SEC_KEY]: (v) => setSections(JSON.parse(v)),
      [TXN_KEY]: (v) => setTransactions(JSON.parse(v)),
      [DEBTS_KEY]: (v) => setDebts(JSON.parse(v)),
      [FACT_KEY]: (v) => setFacturacion({ ...defaultFacturacion(), ...JSON.parse(v) }),
      [STATEMENTS_KEY]: (v) => { const st = JSON.parse(v); setStatements(Array.isArray(st) ? st : []); },
      [CELL_KEY]: (v) => setCellData(JSON.parse(v)),
      [DOLAR_KEY]: (v) => setDolarByMonth(JSON.parse(v)),
      [EUR_KEY]: (v) => setEurByMonth(JSON.parse(v)),
      [MACRO_KEY]: (v) => setMacroTags(JSON.parse(v)),
      [SYNC_KEY]: (v) => setSyncConfig(JSON.parse(v)),
      [LANG_KEY]: (v) => setLangState(v),
      [CURRENCY_KEY]: (v) => setPrimaryCurrencyState(v),
      [NOTIF_KEY]: (v) => setNotificationsEnabledState(v === "true"),
      [HIDE_ZEROS_KEY]: (v) => setHideZerosState(v === "true"),
      [RECALC_CUR_KEY]: (v) => setRecalcOnCurrencyChangeState(v === "true"),
    };
    return subscribeToChanges(user.id, () => encKeyRef.current, (key, value) => {
      try { setterByKey[key]?.(value); } catch (e) { console.error("realtime apply", key, e); }
    });
  }, [user, dataLoaded]);

  // Bóveda syncs live too, just like everything else — even though it's
  // encrypted, this channel only ever hands over raw ciphertext to decrypt
  // (or plain values pre-encryption-setup), same as the main app's channel.
  useEffect(() => {
    if (!user || !resumenDataLoaded) return;
    const setterByKey = {
      [RESUMEN_BOXES_KEY]: (v) => { const b = JSON.parse(v); if (Array.isArray(b)) setResumenBoxes(b); },
      [RESUMEN_CURR_KEY]: (v) => setResumenCurrencies(JSON.parse(v)),
      [RESUMEN_RATES_KEY]: (v) => setResumenRates(JSON.parse(v)),
      [RESUMEN_DISPLAY_KEY]: (v) => setResumenDisplayCurrencyState(v),
    };
    return subscribeToChanges(user.id, () => resumenEncKeyRef.current, (key, value) => {
      try { setterByKey[key]?.(value); } catch (e) { console.error("realtime apply resumen", key, e); }
    }, "resumen");
  }, [user, resumenDataLoaded]);

  function setNotificationsEnabled(updater) {
    setNotificationsEnabledState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      storage.set(NOTIF_KEY, String(next));
      if (next && typeof Notification !== "undefined" && Notification.permission === "default") { try { Notification.requestPermission(); } catch (e) { /* noop */ } }
      return next;
    });
  }
  function setHideZeros(updater) {
    setHideZerosState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      storage.set(HIDE_ZEROS_KEY, String(next));
      return next;
    });
  }
  function freezeConvertedValues() {
    // Called right before turning recalcOnCurrencyChange off: whatever each
    // non-overridden cell is CURRENTLY showing (already correctly converted,
    // since this runs while the setting is still on) becomes its new real,
    // permanent value — stamped as entered in today's global currency.
    const next = {};
    Object.keys(cellData).forEach((month) => {
      next[month] = {};
      Object.keys(cellData[month]).forEach((subId) => {
        const cell = cellData[month][subId];
        if (cell.currency) {
          next[month][subId] = cell; // has its own currency — untouched
        } else {
          const displayed = finalValuePesosBase(subId, month);
          next[month][subId] = { value: displayed, currency: null, enteredCurrency: primaryCurrency, ...(cell.unpaid ? { unpaid: true } : {}) };
        }
      });
    });
    setCellData(next);
    saveCellData(next);

    // Same treatment for shared/common expense line items.
    const nextSections = sections.map((s) => ({
      ...s,
      subcats: s.subcats.map((sc) => {
        if (!sc.split?.common?.length) return sc;
        const common = sc.split.common.map((item) => {
          const amounts = {};
          Object.keys(item.amounts || {}).forEach((month) => {
            amounts[month] = commonItemDisplayValue(item, month);
          });
          return { ...item, amounts, enteredCurrency: primaryCurrency };
        });
        return { ...sc, split: { ...sc.split, common } };
      }),
    }));
    setSections(nextSections);
    saveSections(nextSections);
  }
  function setRecalcOnCurrencyChange(updater) {
    setRecalcOnCurrencyChangeState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (prev && !next) freezeConvertedValues();
      storage.set(RECALC_CUR_KEY, String(next));
      return next;
    });
  }
  function setLearnedKeywordCap(v) {
    const n = Math.max(1, Math.round(Number(v) || 40));
    setLearnedKeywordCapState(n);
    storage.set(LEARN_CAP_KEY, String(n));
  }

  // ---- modal helpers ----
  function showAlertModal(message) { setModal({ type: "alert", message }); }
  function showConfirmModal(message, onConfirm) { setModal({ type: "confirm", message, onConfirm }); }
  function showPromptModal(message, onConfirm, defaultValue, buttonLabel) {
    setModal({ type: "prompt", message, onConfirm, defaultValue, buttonLabel });
  }
  function showChoiceModal(message, options, onConfirm) {
    setModal({ type: "choice", message, options, onConfirm });
  }

  // ---- derived helpers (recomputed on demand, mirrors original global functions) ----
  function allSubcatsFlat() {
    const out = [];
    sections.forEach((sec, si) => sec.subcats.forEach((sc) => out.push({ ...sc, sectionId: sec.id, sectionName: sec.name, sectionIdx: si })));
    return out;
  }
  function findSubcat(id) { return allSubcatsFlat().find((s) => s.id === id); }
  function findSectionOf(subcatId) { return sections.find((sec) => sec.subcats.some((sc) => sc.id === subcatId)); }
  function sectionColor(idx) { return PALETTE[idx % PALETTE.length]; }
  function findMacro(id) { return macroTags.find((mt) => mt.id === id) || macroTags[macroTags.length - 1] || DEFAULT_MACROS[DEFAULT_MACROS.length - 1]; }
  // Picks the MOST SPECIFIC match instead of the first one found: a merchant
  // you already categorized by hand (learned keyword equal to the whole
  // description) wins outright; otherwise the longest matching keyword wins,
  // so a short generic word ("SUPER") can't steal "SUPER COTO 063" from a
  // subcategory that learned the full merchant name. Ties keep planilla order.
  function guessCategory(desc) {
    const D = normalize(desc).trim();
    if (!D) return null;
    let best = null, bestScore = -1;
    for (const sc of allSubcatsFlat()) {
      for (const kw of sc.learnedKeywords || []) {
        const K = normalize(kw).trim();
        if (!K || !D.includes(K)) continue;
        const score = K === D ? 10000 + K.length : K.length;
        if (score > bestScore) { best = sc.id; bestScore = score; }
      }
      for (const kw of sc.keywords || []) {
        const K = normalize(kw).trim();
        if (!K || !D.includes(K)) continue;
        const score = K.length + 0.5; // curated beats learned on equal length
        if (score > bestScore) { best = sc.id; bestScore = score; }
      }
    }
    return best;
  }
  function autoSum(subcatId, month) { return transactions.filter((tr) => tr.catId === subcatId && tr.month === month).reduce((a, tr) => a + tr.amount, 0); }
  function getDolarRate(month) {
    if (dolarByMonth[month] != null && dolarByMonth[month] > 0) return dolarByMonth[month];
    let [y, m] = month.split("-").map(Number);
    for (let i = 0; i < 36; i++) { m--; if (m < 1) { m = 12; y--; } const k = `${y}-${String(m).padStart(2, "0")}`; if (dolarByMonth[k] != null && dolarByMonth[k] > 0) return dolarByMonth[k]; }
    return 1500;
  }
  function getEuroRate(month) {
    if (eurByMonth[month] != null && eurByMonth[month] > 0) return eurByMonth[month];
    let [y, m] = month.split("-").map(Number);
    for (let i = 0; i < 36; i++) { m--; if (m < 1) { m = 12; y--; } const k = `${y}-${String(m).padStart(2, "0")}`; if (eurByMonth[k] != null && eurByMonth[k] > 0) return eurByMonth[k]; }
    return 1600;
  }
  function getCell(month, subId) { return (cellData[month] && cellData[month][subId]) || null; }
  // NOTE: transactions pending in "lista del mes" are NOT counted here until they've
  // been approved (folded into the cell via the ✓ / "Aprobar todo" actions in
  // ListaView, which write an explicit cellData entry). autoSum() itself still exists
  // as a convenience seed (e.g. when starting to type into an empty planilla cell),
  // but it must never be read automatically as a cell's live/displayed value.
  function cellRawEntryValue(subId, month) { const cell = getCell(month, subId); return cell ? cell.value : 0; }
  function effectiveCurrency(subId, month) {
    const cell = getCell(month, subId);
    if (cell) return cell.currency || primaryCurrency;
    return primaryCurrency;
  }
  function finalValuePesosBase(subId, month) {
    const cell = getCell(month, subId);
    if (!cell) return 0;
    if (!cell.currency) {
      if (!recalcOnCurrencyChange) return cell.value; // pure relabel, no math
      // Recalculate: convert from whichever currency was active when this number
      // was actually typed (recorded on the cell) into the current global one.
      const origin = cell.enteredCurrency || "ARS"; // legacy cells predate this field
      if (origin === primaryCurrency) return cell.value;
      let pesos = cell.value;
      if (origin === "USD") pesos = cell.value * getDolarRate(month);
      else if (origin === "EUR") pesos = cell.value * getEuroRate(month);
      if (primaryCurrency === "USD") return pesos / getDolarRate(month);
      if (primaryCurrency === "EUR") return pesos / getEuroRate(month);
      return pesos;
    }
    if (cell.currency === primaryCurrency) return cell.value; // matches global anyway
    // Explicit override in a currency other than the current global one: convert
    // through pesos so it lines up with everything else in the total. This always
    // applies regardless of the setting above — it's a real, deliberate choice.
    let pesos = cell.value;
    if (cell.currency === "USD") pesos = cell.value * getDolarRate(month);
    else if (cell.currency === "EUR") pesos = cell.value * getEuroRate(month);
    if (primaryCurrency === "USD") return pesos / getDolarRate(month);
    if (primaryCurrency === "EUR") return pesos / getEuroRate(month);
    return pesos;
  }
  // The number shown/edited IN the cell itself. A cell with its own explicit
  // currency (colored toggle) always shows its own raw number, in its own terms —
  // that identity doesn't change with the global currency. A plain cell (no
  // override) has no currency identity of its own, so under "recalcular
  // conversión" it follows the global currency for real, same as the totals do.
  function cellDisplayValue(subId, month) {
    const cell = getCell(month, subId);
    if (cell && cell.currency) return cell.value;
    return finalValuePesosBase(subId, month);
  }
  // Reverses cellDisplayValue: given a number the person just typed while looking
  // at the converted display, returns what should actually be stored so the
  // underlying amount stays consistent regardless of which currency is active.
  function displayToRaw(subId, month, displayNum) {
    const cell = getCell(month, subId);
    if (cell && cell.currency) return displayNum; // has its own currency — store as typed
    if (!recalcOnCurrencyChange) return displayNum;
    const origin = cell?.enteredCurrency || "ARS";
    if (origin === primaryCurrency) return displayNum;
    let pesos = displayNum;
    if (primaryCurrency === "USD") pesos = displayNum * getDolarRate(month);
    else if (primaryCurrency === "EUR") pesos = displayNum * getEuroRate(month);
    if (origin === "USD") return pesos / getDolarRate(month);
    if (origin === "EUR") return pesos / getEuroRate(month);
    return displayNum;
  }
  function commonItemDisplayValue(item, month) {
    const raw = parseFloat(item.amounts?.[month]) || 0;
    if (!raw) return 0;
    if (!recalcOnCurrencyChange) return raw;
    const origin = item.enteredCurrency || "ARS";
    if (origin === primaryCurrency) return raw;
    let pesos = raw;
    if (origin === "USD") pesos = raw * getDolarRate(month);
    else if (origin === "EUR") pesos = raw * getEuroRate(month);
    if (primaryCurrency === "USD") return pesos / getDolarRate(month);
    if (primaryCurrency === "EUR") return pesos / getEuroRate(month);
    return pesos;
  }
  function commonItemDisplayToRaw(item, month, displayNum) {
    if (!recalcOnCurrencyChange) return displayNum;
    const origin = item.enteredCurrency || "ARS";
    if (origin === primaryCurrency) return displayNum;
    let pesos = displayNum;
    if (primaryCurrency === "USD") pesos = displayNum * getDolarRate(month);
    else if (primaryCurrency === "EUR") pesos = displayNum * getEuroRate(month);
    if (origin === "USD") return pesos / getDolarRate(month);
    if (origin === "EUR") return pesos / getEuroRate(month);
    return pesos;
  }
  function commonExpenseTotal(subId, month) {
    const sc = findSubcat(subId);
    if (!sc?.split?.enabled) return 0;
    const commonTotal = (sc.split.common || []).reduce((a, c) => a + commonItemDisplayValue(c, month), 0);
    if (!commonTotal) return 0;
    // Each person's equal share (commonTotal / headcount) counts toward the rubro
    // total unless that person is set to "Resta del total" (excluded).
    const peopleCount = sc.split.people.length || 1;
    const perPerson = commonTotal / peopleCount;
    let contribution = 0;
    sc.split.people.forEach((p) => {
      if (p.effect === "subtract") return;
      contribution += perPerson;
    });
    return contribution;
  }
  function splitAdjustment(subId, month) {
    const sc = findSubcat(subId);
    if (!sc?.split?.enabled) return 0;
    const base = finalValuePesosBase(subId, month);
    let adj = 0;
    sc.split.people.forEach((p) => {
      if (p.effect === "subtract") adj -= base * ((p.pct || 0) / 100);
    });
    return adj;
  }
  function finalValuePesos(subId, month) {
    return finalValuePesosBase(subId, month) + commonExpenseTotal(subId, month) + splitAdjustment(subId, month);
  }
  function macroTotalByTag(month, tagId) { return allSubcatsFlat().filter((sc) => sc.macro === tagId).reduce((a, sc) => a + finalValuePesos(sc.id, month), 0); }
  // "No pagado" flag: a per-cell marker (cell.unpaid) for amounts already
  // written into the planilla but not actually paid yet (e.g. a card statement
  // loaded before paying it). Purely informational — it never changes totals;
  // pendingTotal() just sums the marked cells so the month shows what's owed.
  function isUnpaid(month, subId) { return !!getCell(month, subId)?.unpaid; }
  function toggleUnpaid(month, subId) {
    setCellData((prev) => {
      const next = { ...prev, [month]: { ...(prev[month] || {}) } };
      const existing = next[month][subId] || { value: 0, currency: null, enteredCurrency: primaryCurrency };
      const updated = { ...existing };
      if (existing.unpaid) delete updated.unpaid; else updated.unpaid = true;
      next[month][subId] = updated;
      saveCellData(next);
      return next;
    });
  }
  // Fecha de vencimiento de un gasto (YYYY-MM-DD). Poner una fecha lo marca
  // como no pagado; null la saca.
  function setCellDue(month, subId, due) {
    setCellData((prev) => {
      const next = { ...prev, [month]: { ...(prev[month] || {}) } };
      const existing = next[month][subId] || { value: 0, currency: null, enteredCurrency: primaryCurrency };
      const updated = { ...existing };
      if (due) { updated.due = due; updated.unpaid = true; } else delete updated.due;
      next[month][subId] = updated;
      saveCellData(next);
      return next;
    });
  }
  function pendingTotal(month) {
    const monthCells = cellData[month] || {};
    return allSubcatsFlat().reduce((a, sc) => (monthCells[sc.id]?.unpaid ? a + finalValuePesosBase(sc.id, month) : a), 0);
  }
  function totalGastos(month) { return macroTags.filter((mt) => mt.includeInTotal).reduce((sum, mt) => sum + macroTotalByTag(month, mt.id), 0); }
  function money(n, forMonth) {
    const val = n || 0;
    const symbol = primaryCurrency === "EUR" ? "€" : "$";
    const formatted = val.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${formatted} ${symbol}`;
  }

  function goMonth(delta) {
    setSelectedMonth((m) => {
      const next = shiftMonth(m, delta);
      setPlannerYear(parseInt(next.split("-")[0], 10));
      return next;
    });
  }
  function changePlannerYear(delta) {
    setPlannerYear((y) => {
      const newYear = y + delta;
      setSelectedMonth((m) => `${newYear}-${m.split("-")[1]}`);
      return newYear;
    });
  }
  function goToday() {
    const n = new Date();
    setSelectedMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
    setPlannerYear(n.getFullYear());
  }
  function pickMonth(monthKey) {
    setSelectedMonth(monthKey);
    setPlannerYear(parseInt(monthKey.split("-")[0], 10));
  }

  // "Vaciar este mes": the Lista and the planilla are different things — the
  // planilla's month can hold values typed by hand that have nothing to do
  // with the Lista. So it asks which one, and the destructive "both" option
  // needs a second, explicit confirmation.
  function clearMonth() {
    const label = monthLabel(selectedMonth, lang);
    const txCount = transactions.filter((tr) => tr.month === selectedMonth).length;
    const cellCount = Object.values(cellData[selectedMonth] || {}).filter((c) => c && (Number(c.value) || c.formula)).length;
    if (!txCount && !cellCount) { showAlertModal(tx("No hay nada para vaciar en {label}.", { label })); return; }
    const clearTx = () => {
      const nextTx = transactions.filter((tr) => tr.month !== selectedMonth);
      setTransactions(nextTx);
      saveTransactions(nextTx);
    };
    const clearCells = () => {
      const nextCell = { ...cellData };
      delete nextCell[selectedMonth];
      setCellData(nextCell);
      saveCellData(nextCell);
    };
    const options = [];
    if (txCount) options.push({ label: txn(txCount, "Vaciar solo la Lista del mes ({n} movimiento pendiente)", "Vaciar solo la Lista del mes ({n} movimientos pendientes)"), value: "lista" });
    if (cellCount) options.push({ label: txn(cellCount, "Vaciar también la planilla de {label} ({n} celda)", "Vaciar también la planilla de {label} ({n} celdas)", { label }), value: "todo" });
    showChoiceModal(
      tx("¿Qué querés vaciar de {label}?", { label }) + (cellCount ? " " + txn(cellCount, "Ojo: la planilla de ese mes tiene {n} celda con valor (pueden ser cargas a mano, no solo lo aprobado desde la Lista).", "Ojo: la planilla de ese mes tiene {n} celdas con valores (pueden ser cargas a mano, no solo lo aprobado desde la Lista).") : ""),
      options,
      (v) => {
        if (v === "lista") { clearTx(); return; }
        showConfirmModal(
          txCount
            ? tx("Se van a borrar los {txCount} movimientos de la Lista y TODAS las celdas de la planilla de {label} ({cellCount}), también las cargadas a mano. No se puede deshacer. ¿Seguro?", { txCount, label, cellCount })
            : tx("Se van a borrar TODAS las celdas de la planilla de {label} ({cellCount}), también las cargadas a mano. No se puede deshacer. ¿Seguro?", { label, cellCount }),
          () => { clearTx(); clearCells(); }
        );
      }
    );
  }

  // Backup: everything as JSON. The Bóveda goes in as its raw rows (still
  // encrypted, so it works even while locked). If the app's encryption is on,
  // the whole file is encrypted with that same key.
  async function exportData() {
    try {
      const payload = { sections, transactions, debts, cellData, dolarByMonth, eurByMonth, macroTags, syncConfig, facturacion, statements };
      const vaultRows = await rawRows(RESUMEN_DOMAIN_KEYS);
      if (Object.keys(vaultRows).length) payload.vault = { salt: resumenEncMeta.encrypted ? resumenEncMeta.salt : null, rows: vaultRows };
      let out = payload;
      if (encMeta.encrypted) {
        if (!encKeyRef.current) throw new Error(tx("Desbloqueá tus datos para exportar."));
        out = { gastosBackup: 2, encrypted: true, salt: encMeta.salt, ...(await encryptValue(encKeyRef.current, JSON.stringify(payload))) };
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gastos_backup_" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
    } catch (err) {
      showAlertModal((err && err.message) || String(err));
    }
  }

  // Puts a backup's Bóveda back. Same salt as the current Bóveda → the
  // ciphertext is written as is. No Bóveda here yet → it's adopted with its
  // own salt. Different password → it's asked for, decrypted and re-saved
  // with the current key.
  async function restoreVault(vb) {
    try {
      const rows = vb.rows || {};
      if (vb.salt && resumenEncMeta.encrypted && resumenEncMeta.salt === vb.salt) {
        await rawWrite(user.id, rows);
        if (resumenEncKeyRef.current && !resumenNeedsUnlock) await loadResumenData();
        return;
      }
      if (!resumenEncMeta.encrypted) {
        await rawWrite(user.id, rows);
        if (vb.salt) {
          await saveEncMeta(user.id, { encrypted: true, salt: vb.salt }, RESUMEN_ENC_META_KEY);
          setResumenEncMeta({ encrypted: true, salt: vb.salt });
          return;
        }
        if (resumenDataLoaded) await loadResumenData();
        return;
      }
      if (!resumenEncKeyRef.current || resumenNeedsUnlock) {
        showAlertModal(tx("El backup tiene datos de la Bóveda, pero no se restauraron porque está bloqueada (o sin configurar) ahora mismo. Desbloqueala y volvé a restaurar si los querés."));
        return;
      }
      let plain = rows;
      if (vb.salt) {
        const pw = await askPassword(tx("Bóveda del backup"), tx("La Bóveda de este backup tiene otra contraseña. Ingresala para restaurarla."), tx("Cancelar"), tx("Restaurar"));
        if (pw == null) return;
        const key = await deriveKey(pw, vb.salt);
        plain = {};
        for (const [k, v] of Object.entries(rows)) plain[k] = looksEncrypted(v) ? await decryptValue(key, JSON.parse(v)) : v;
      }
      await Promise.all(Object.entries(plain).map(([k, v]) => resumenStorage.set(k, v)));
      await loadResumenData();
    } catch (err) {
      showAlertModal(tx("Contraseña incorrecta."));
    }
  }

  function restoreData(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    evt.target.value = ""; // so picking the same file again still triggers onChange
    const reader = new FileReader();
    reader.onload = async (e) => {
      let data;
      try { data = JSON.parse(e.target.result); } catch (err) { showAlertModal(t("invalidFile")); return; }
      // Encrypted backup: open it with the current key if it's the same one,
      // otherwise ask for the password it was made with.
      if (data && data.encrypted && data.salt && data.iv && data.ciphertext) {
        try {
          let key = encMeta.encrypted && encKeyRef.current && encMeta.salt === data.salt ? encKeyRef.current : null;
          if (!key) {
            const pw = await askPassword(tx("Backup cifrado"), tx("Ingresá la contraseña de cifrado con la que se hizo este backup."), tx("Cancelar"), tx("Abrir"));
            if (pw == null) return;
            key = await deriveKey(pw, data.salt);
          }
          data = JSON.parse(await decryptValue(key, data));
        } catch {
          showAlertModal(tx("Contraseña incorrecta."));
          return;
        }
      }
      showConfirmModal(t("confirmRestore"), () => {
        const nextSections = data.sections || sections;
        const nextTx = data.transactions || [];
        const nextDebts = data.debts || [];
        const nextCell = data.cellData || {};
        const nextDolar = data.dolarByMonth || {};
        const nextEur = data.eurByMonth || {};
        const nextMacro = data.macroTags || macroTags;
        const nextSync = data.syncConfig || { monthCells: {} };
        setSections(nextSections); saveSections(nextSections);
        setTransactions(nextTx); saveTransactions(nextTx);
        setDebts(nextDebts); saveDebts(nextDebts);
        setCellData(nextCell); saveCellData(nextCell);
        setDolarByMonth(nextDolar); saveDolar(nextDolar);
        setEurByMonth(nextEur); saveEur(nextEur);
        setMacroTags(nextMacro); saveMacroTags(nextMacro);
        setSyncConfig(nextSync); saveSyncConfig(nextSync);
        if (data.facturacion) { const nf = { ...defaultFacturacion(), ...data.facturacion }; setFacturacion(nf); saveFacturacion(nf); }
        if (Array.isArray(data.statements)) { setStatements(data.statements); saveStatements(data.statements); }
        // Older backups (before v153) carried the Bóveda as plain JSON: only
        // restored if it's unlocked right now.
        if (data.resumenBoxes && resumenEncMeta.encrypted && !resumenNeedsUnlock) {
          setResumenBoxes(data.resumenBoxes); saveResumenBoxes(data.resumenBoxes);
          if (data.resumenCurrencies) { setResumenCurrencies(data.resumenCurrencies); saveResumenCurrencies(data.resumenCurrencies); }
          if (data.resumenRates) { setResumenRates(data.resumenRates); saveResumenRates(data.resumenRates); }
          if (data.resumenDisplayCurrency) setResumenDisplayCurrency(data.resumenDisplayCurrency);
        } else if (data.resumenBoxes) {
          showAlertModal(tx("El backup tiene datos de la Bóveda, pero no se restauraron porque está bloqueada (o sin configurar) ahora mismo. Desbloqueala y volvé a restaurar si los querés."));
        }
        if (data.vault) restoreVault(data.vault);
      });
    };
    reader.readAsText(file);
  }

  async function wipeAllData() {
    const hasVault = resumenEncMeta.encrypted || (Array.isArray(resumenBoxes) && resumenBoxes.length > 0);
    const ans = await wipeDialog({
      title: t("confirmWipeAll"), hasVault, needPw: false,
      vaultLabel: tx("Borrar también la Bóveda (sus datos y su contraseña)"),
      pwPlaceholder: tx("Contraseña de la Bóveda"), cancel: tx("Cancelar"), ok: t("wipeAllData"),
    });
    if (!ans) return;
    const emptySections = [], emptyTx = [], emptyCell = {}, emptyDolar = {}, emptyEur = {}, emptyDebts = [];
    const freshMacros = DEFAULT_MACROS.map((m) => ({ ...m }));
    const emptySync = { monthCells: {} };
    setSections(emptySections); saveSections(emptySections);
    setTransactions(emptyTx); saveTransactions(emptyTx);
    setDebts(emptyDebts); saveDebts(emptyDebts);
    setCellData(emptyCell); saveCellData(emptyCell);
    setDolarByMonth(emptyDolar); saveDolar(emptyDolar);
    setEurByMonth(emptyEur); saveEur(emptyEur);
    setMacroTags(freshMacros); saveMacroTags(freshMacros);
    setSyncConfig(emptySync); saveSyncConfig(emptySync);
    const freshFact = defaultFacturacion();
    setFacturacion(freshFact); saveFacturacion(freshFact);
    setStatements([]); saveStatements([]);
    setShowSettings(false);
    if (ans.vault) {
      try {
        const { error } = await sb.from("kv_store").delete().in("key", [...RESUMEN_DOMAIN_KEYS, RESUMEN_ENC_META_KEY]);
        if (error) throw error;
        resumenEncKeyRef.current = null;
        vaultManualLock = false;
        setResumenBoxes([]);
        setResumenDataLoaded(false);
        setResumenNeedsUnlock(false);
        setResumenEncMeta({ encrypted: false });
      } catch (err) {
        showAlertModal(String((err && err.message) || err));
      }
    }
  }
  // Separate, narrower "reset": strips only the auto-learned merchant keywords
  // from every subcategory, leaving everything else (categories, hand-curated
  // keywords, cellData, transactions) exactly as it was.
  function clearAllLearnedKeywords() {
    const next = sections.map((sec) => ({
      ...sec,
      subcats: sec.subcats.map((sc) => ({ ...sc, learnedKeywords: [] })),
    }));
    setSections(next);
    saveSections(next);
  }

  async function signOut() { await sb.auth.signOut(); }

  // ---- alertas (barra de abajo + notificaciones) ----
  const alerts = useMemo(() => {
    try {
      return computeAlerts({ cellData, allSubcatsFlat, findSectionOf, finalValue: finalValuePesosBase, primaryCurrency, transactions, facturacion, debts, dolarByMonth, getDolarRate, getEuroRate, lang });
    } catch (e) { console.warn("alerts", e); return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellData, sections, primaryCurrency, transactions, facturacion, debts, dolarByMonth, eurByMonth, lang, recalcOnCurrencyChange, alertsDay]);
  useEffect(() => {
    if (alerts.length < 2 || alertsPaused) return;
    const id = setInterval(() => setAlertIdx((i) => (i + 1) % alerts.length), 4000);
    return () => clearInterval(id);
  }, [alerts.length, alertsPaused]);
  useEffect(() => { if (alertIdx >= alerts.length) setAlertIdx(0); }, [alerts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // recalcular al cambiar de día aunque la app quede abierta
  useEffect(() => {
    const id = setInterval(() => setAlertsDay(new Date().toDateString()), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  function goToAlert(a) {
    const g = a.go || {};
    if (g.month) {
      setSelectedMonth(g.month);
      setPlannerYear(parseInt(g.month.slice(0, 4), 10));
    }
    if (g.view) setView(g.view);
  }
  // Notificaciones del sistema: con el botón prendido, al abrir y cada hora,
  // si hay algo urgente (vencidos, vence hoy/pronto, tope del monotributo).
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  useEffect(() => {
    if (!notificationsEnabled || !user || typeof Notification === "undefined") return;
    let cancelled = false;
    const fire = () => {
      if (cancelled || Notification.permission !== "granted") return;
      const body = notificationBody(alertsRef.current);
      if (!body) return;
      try { new Notification(tx("Gastos App — alertas"), { body, tag: "gastos-alerts", icon: undefined }); } catch (e) { /* noop */ }
    };
    const start = () => { setTimeout(fire, 4000); };
    if (Notification.permission === "default") Notification.requestPermission().then(start).catch(() => {});
    else start();
    const id = setInterval(fire, 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [notificationsEnabled, user]);

  const ctx = {
    t, lang, setLang, primaryCurrency, setPrimaryCurrency,
    notificationsEnabled, setNotificationsEnabled, hideZeros, setHideZeros, recalcOnCurrencyChange, setRecalcOnCurrencyChange,
    learnedKeywordCap, setLearnedKeywordCap, clearAllLearnedKeywords,
    sections, setSections, saveSections,
    transactions, setTransactions, saveTransactions, debts, setDebts, saveDebts,
    cellData, setCellData, saveCellData,
    dolarByMonth, setDolarByMonth, saveDolar,
    eurByMonth, setEurByMonth, saveEur,
    macroTags, setMacroTags, saveMacroTags,
    syncConfig, setSyncConfig, saveSyncConfig,
    view, setView, filterSubcat, setFilterSubcat,
    hideCategorized, setHideCategorized, showFavoritesOnly, setShowFavoritesOnly, showUnpaidOnly, setShowUnpaidOnly, searchTerm, setSearchTerm, planillaSearch, setPlanillaSearch,
    showMacroPanel, setShowMacroPanel,
    entryTab, setEntryTab, selectedMonth, setSelectedMonth,
    plannerYear, setPlannerYear, syncMonth, setSyncMonth,
    showAlertModal, showConfirmModal, showPromptModal, showChoiceModal,
    allSubcatsFlat, findSubcat, findSectionOf, sectionColor, findMacro, guessCategory,
    autoSum, getDolarRate, getEuroRate, getCell, cellRawEntryValue, effectiveCurrency, cellDisplayValue, displayToRaw, commonItemDisplayValue, commonItemDisplayToRaw,
    finalValuePesos, finalValuePesosBase, macroTotalByTag, totalGastos, money,
    facturacion, setFacturacion, saveFacturacion,
    statements, setStatements, saveStatements,
    isUnpaid, toggleUnpaid, setCellDue, pendingTotal,
    goMonth, goToday, changePlannerYear, pickMonth, clearMonth, exportData, restoreData, wipeAllData,
    showSettings, setShowSettings, showEncryption, setShowEncryption, isMobile, notebookMode, notebookMonthCount, showAllMonthsOverride, setShowAllMonthsOverride,
    monthLabel, monthFullLabel, parseCellInput, parseAmount, evalFormula,
    user, signOut,
    encMeta, unlockWithPassword, enableEncryption, disableEncryption,
    resumenEncMeta, resumenMetaLoaded, resumenDataLoaded, resumenNeedsUnlock, resumenBoxes, setResumenBoxes, saveResumenBoxes,
    resumenCurrencies, setResumenCurrencies, saveResumenCurrencies,
    resumenRates, setResumenRates, saveResumenRates,
    resumenDisplayCurrency, setResumenDisplayCurrency,
    unlockResumen, lockResumen, enableResumenEncryption, changeResumenPassword,
    showResumenEncryption, setShowResumenEncryption,
  };

  if (!authChecked) return null;
  if (!user) return <LoginScreen />;
  if (needsUnlock) return <UnlockScreen ctx={ctx} />;
  if (!dataLoaded) {
    return (
      <div className="gx-boot-screen">
        <div className="gx-boot-msg mono">{tx("Cargando...")}</div>
      </div>
    );
  }

  return (
    <div className="gx-root">
      <div className="gx-body">
        <Sidebar ctx={ctx} />
        <div className="main">
          <Topbar ctx={ctx} />
          <div className="content" ref={contentRef}>
            {view === "planilla" && <PlanillaView ctx={ctx} />}
            {view === "lista" && <ListaView ctx={ctx} />}
            {view === "deudas" && <DeudasView ctx={ctx} />}
            {view === "resumen" && <ResumenView ctx={ctx} />}
            {view === "facturacion" && <FacturacionView ctx={ctx} />}
            {view === "resumenes" && <StatementsView ctx={ctx} />}
            {view === "sync" && <SyncView ctx={ctx} />}
          </div>
        </div>
      </div>
      {isMobile && (
        <div className="mobileSessionBar">
          <div>
            <div className="account-name">{user?.is_anonymous ? tx("Invitado") : maskEmail(user?.email)}</div>
            <div className="account-sub">{user?.is_anonymous ? tx("Sesión de prueba") : tx("Con cuenta")}</div>
          </div>
          <button className="account-logout" onClick={signOut} title={tx("Cerrar sesión")}>{tx("Salir")}</button>
        </div>
      )}
      {saveState !== "ok" && (
        <div className={`gx-toast ${saveState}`} role="status">
          <span className="gx-toast-dot" />
          {saveState === "retrying" && tx("No se pudo guardar el último cambio. Reintentando…")}
          {saveState === "failed" && <>{tx("Hay cambios sin guardar. Revisá la conexión y no cierres la app.")} <button className="gx-toast-act" onClick={() => { setSaveState("retrying"); retryFailedWrites(); }}>{tx("Reintentar")}</button></>}
          {saveState === "recovered" && tx("Cambios guardados.")}
          {saveState === "offline" && tx("Sin conexión. Lo que cambies puede no guardarse hasta que vuelva.")}
          {(saveState === "failed" || saveState === "offline") && <button onClick={() => setSaveState("ok")} title={tx("Cerrar")}>✕</button>}
        </div>
      )}
      {(() => {
        const cur = alerts.length ? alerts[alertIdx % alerts.length] : null;
        const hot = alerts.some((a) => a.urgent);
        return (
          <div className={`urgent-bar ${cur ? "urgent-bar--tappable" : ""}`}
            onMouseEnter={() => setAlertsPaused(true)} onMouseLeave={() => setAlertsPaused(false)}
            onClick={() => cur && goToAlert(cur)} title={cur ? tx("Ir a esta alerta") : undefined}>
            <span className={`urgent-label ${hot ? "" : "urgent-label--off"} ${cur && !hot ? "urgent-label--info" : ""}`}><span className={`urgent-dot ${hot ? "" : "urgent-dot--off"}`}></span>{tx("ALERTAS")}</span>
            {cur ? (
              <span className="urgent-item" key={alertIdx}>
                <span className={`urgent-chip urgent-chip--${cur.kind}`}>{cur.chip}</span>
                <span className="urgent-title">{cur.title}</span>
                {cur.meta && <span className="urgent-meta">{cur.meta}</span>}
              </span>
            ) : (
              <span className="urgent-empty">{tx("Sin vencimientos ni alertas por ahora.")}</span>
            )}
            {alerts.length > 1 && (
              <span className="urgent-nav" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setAlertIdx((i) => (i - 1 + alerts.length) % alerts.length)} title={tx("Anterior")}>‹</button>
                <span className="urgent-count mono">{(alertIdx % alerts.length) + 1}/{alerts.length}</span>
                <button onClick={() => setAlertIdx((i) => (i + 1) % alerts.length)} title={tx("Siguiente")}>›</button>
              </span>
            )}
          </div>
        );
      })()}
      <Modal modal={modal} onClose={() => setModal(null)} t={t} />
      {showSettings && <SettingsModal ctx={ctx} />}
      {showEncryption && <EncryptionModal ctx={ctx} />}
      {showResumenEncryption && <ResumenEncryptionModal ctx={ctx} />}
    </div>
  );
}
