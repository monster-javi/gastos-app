// Traducción de textos fijos de la interfaz.
// Uso: tx("Texto en español") o tx("Hay {n} deudas", { n: 3 }).
// En español devuelve el texto tal cual (con las variables reemplazadas);
// en inglés lo busca en los diccionarios de src/i18n/*.js (clave = texto en
// español exacto). Si falta la traducción, queda en español.
import fact from "./i18n/en_facturacion.js";
import deudas from "./i18n/en_deudas.js";
import boveda from "./i18n/en_boveda.js";
import lista from "./i18n/en_lista.js";
import planilla from "./i18n/en_planilla.js";
import shell from "./i18n/en_shell.js";
import extra from "./i18n/en_extra.js";

const EN = Object.assign({}, shell, planilla, lista, deudas, fact, boveda, extra);

let current = "es";
export function setTxLang(l) { current = l === "en" ? "en" : "es"; }
export function getTxLang() { return current; }

export function tx(es, vars) {
  let s = current === "en" && Object.prototype.hasOwnProperty.call(EN, es) ? EN[es] : es;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
// Plural simple: txn(n, "{n} deuda", "{n} deudas")
export function txn(n, one, many, vars) { return tx(n === 1 ? one : many, { n, ...(vars || {}) }); }
