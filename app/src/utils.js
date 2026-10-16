export const PALETTE = ["#3B82F6", "#22C55E", "#A855F7", "#F59E0B", "#14B8A6", "#84CC16", "#EC4899", "#38BDF8", "#F97316", "#60A5FA", "#FACC15", "#4ADE80"];
export const MONTH_ABBR_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const MONTH_ABBR_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_FULL_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const MONTH_FULL_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const DEFAULT_MACROS = [
  { id: "TARJETA_CREDITO", name: "Tarjeta Crédito", color: "#A855F7", includeInTotal: true, visible: false },
  { id: "PMC", name: "PagoMisCuentas", color: "#3B82F6", includeInTotal: true, visible: true },
  { id: "EFECTIVO", name: "Efectivo", color: "#22C55E", includeInTotal: true, visible: true },
  { id: "TRANSFERENCIA", name: "Transferencia", color: "#F59E0B", includeInTotal: true, visible: true },
  { id: "RESUMEN_TARJETA", name: "Resumen TARJETA", color: "#14B8A6", includeInTotal: true, visible: true },
  { id: "SIN_ASIGNAR", name: "Sin Asignar", color: "#8B93A1", includeInTotal: false, visible: true },
];

export function uid() {
  return "x" + Math.random().toString(36).slice(2, 9);
}

export function normalize(s) {
  return (s || "").toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function fmtInt(n) {
  return n ? n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "";
}

export function fmtRate(n) {
  if (!n) return "";
  if (Math.abs(n) >= 1) return fmtInt(n);
  for (let dec = 2; dec <= 8; dec++) {
    if (parseFloat(n.toFixed(dec)) !== 0) {
      return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }
  }
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

export function parseCellInput(s) {
  let str = String(s).trim();
  if (!str) return 0;
  let neg = false;
  if (str.startsWith("-")) { neg = true; str = str.slice(1); }
  const decMatch = str.match(/[.,](\d{1,2})$/);
  if (decMatch) {
    const head = str.slice(0, str.length - decMatch[0].length).replace(/[.,]/g, "");
    str = (head || "0") + "." + decMatch[1];
  } else {
    str = str.replace(/[.,]/g, "");
  }
  str = str.replace(/[^0-9.]/g, "");
  const n = parseFloat(str);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

export function parseAmount(raw) {
  if (typeof raw === "number") return raw;
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  s = s.replace(/\$/g, "").replace(/\s/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (/,\d{1,2}$/.test(s)) { s = s.replace(/\./g, "").replace(",", "."); } else { s = s.replace(/,/g, ""); }
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return neg ? -n : n;
}

export function monAbbr(idx, lang) {
  return (lang === "en" ? MONTH_ABBR_EN : MONTH_ABBR_ES)[idx];
}

export function maskEmail(email) {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at === -1) return email;
  return email.slice(0, at) + "...";
}

export function monthLabel(key, lang) {
  const [y, m] = key.split("-");
  return `${monAbbr(parseInt(m) - 1, lang)} ${y}`;
}

export function monthFullLabel(key, lang) {
  const [, m] = key.split("-");
  return (lang === "en" ? MONTH_FULL_EN : MONTH_FULL_ES)[parseInt(m) - 1];
}

export function shiftMonth(key, delta) {
  let [y, m] = key.split("-").map(Number);
  m += delta;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

// Converts an amount from one currency to another, bridging through pesos (ARS)
// exactly like the planilla anual's own currency logic. Used to fold "lista del
// mes" items (each with their own currency) into a planilla cell of a possibly
// different currency, and to show a group's total in the primary currency.
export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function bridgeConvert(amount, fromCur, toCur, dolarRate, euroRate) {
  const from = fromCur || "ARS";
  const to = toCur || "ARS";
  if (from === to) return amount;
  let pesos = amount;
  if (from === "USD") pesos = amount * dolarRate;
  else if (from === "EUR") pesos = amount * euroRate;
  if (to === "USD") return pesos / dolarRate;
  if (to === "EUR") return pesos / euroRate;
  return pesos;
}

// Generic multi-currency bridge, for Resumen: ratesToBase maps each currency
// code to "how many base-currency units per 1 unit of it" (the base currency
// itself — usually ARS — has rate 1). Works for any number of currencies,
// unlike bridgeConvert above which is hardcoded to just USD/EUR.
export function convertViaRates(amount, fromCur, toCur, ratesToBase) {
  if (fromCur === toCur) return amount;
  const from = ratesToBase[fromCur] ?? 1;
  const to = ratesToBase[toCur] ?? 1;
  return (amount * from) / to;
}

export function evalFormula(str) {
  const expr = str.slice(1).trim();
  if (!expr || !/^[0-9+\-*/().,\s]+$/.test(expr)) return NaN;
  try {
    const cleaned = expr.replace(/,/g, ".");
    const result = Function('"use strict"; return (' + cleaned + ")")();
    return typeof result === "number" && isFinite(result) ? result : NaN;
  } catch (e) {
    return NaN;
  }
}
