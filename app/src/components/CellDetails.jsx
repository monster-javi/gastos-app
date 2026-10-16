import React, { useEffect } from "react";
import { tx, getTxLang } from "../tx.js";
import { evalFormula, fmtInt, round2, monthFullLabel } from "../utils.js";

// Splits "=a+b-c*2" into its top-level signed terms: [{sign, expr}].
export function formulaTerms(formula) {
  const f = String(formula || "").trim().replace(/^=/, "");
  const terms = [];
  let depth = 0, cur = "", sign = 1;
  for (const ch of f) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if ((ch === "+" || ch === "-") && depth === 0) {
      if (cur.trim() === "") { if (ch === "-") sign = -sign; continue; }
      if (!/[*/]$/.test(cur.trim())) { terms.push({ sign, expr: cur.trim() }); sign = ch === "-" ? -1 : 1; cur = ""; continue; }
    }
    cur += ch;
  }
  if (cur.trim()) terms.push({ sign, expr: cur.trim() });
  return terms.map((t) => ({ ...t, value: evalFormula("=" + t.expr) }));
}

function sym(c) { return c === "USD" ? "US$" : c === "EUR" ? "€" : "$"; }
function money(n, c) { const v = round2(n); return `${sym(c)} ${v ? fmtInt(v) : "0"}`; }
function originLabel(it) {
  if (it.method === "manual") return "manual";
  if (it.method === "ia" || (it.source && !/\.(csv|xlsx?|xls)$/i.test(it.source) && it.source !== "texto libre")) return "IA";
  if (it.source) return "archivo";
  return "";
}

// "Ver detalles" for a planilla cell: every term of its formula, matched with
// the movement it came from (description + note + origin) when it was approved
// from the Lista del mes. Terms typed by hand show as "Carga manual".
export default function CellDetails({ ctx, month, subId, onClose, style, sheet }) {
  const { getCell, findSubcat, primaryCurrency } = ctx;
  const cell = getCell(month, subId) || {};
  const cur = cell.currency || primaryCurrency;
  const sc = findSubcat(subId);
  const terms = cell.formula ? formulaTerms(cell.formula) : [{ sign: 1, expr: String(cell.value || 0), value: Number(cell.value) || 0 }];
  const pool = (cell.items || []).map((it, i) => ({ ...it, _i: i }));
  const used = new Set();
  const rows = terms.map((t) => {
    const match = t.sign > 0 ? pool.find((it) => !used.has(it._i) && Math.abs(round2(it.amount) - round2(t.value)) < 0.01) : null;
    if (match) used.add(match._i);
    return { ...t, item: match || null };
  });
  const orphans = pool.filter((it) => !used.has(it._i));

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = (
    <div className={`cellDetails ${sheet ? "sheet" : ""}`} style={style} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="cdHead">
        <div>
          <div className="cdTitle">{sc ? sc.name : tx("Celda")}</div>
          <div className="cdSub">{monthFullLabel(month, getTxLang())} {month.slice(0, 4)}{cell.unpaid ? tx(" · no pagado") : ""}</div>
        </div>
        <button className="cdClose" onClick={onClose} title={tx("Cerrar")}>✕</button>
      </div>
      <div className="cdRows">
        {rows.map((r, i) => (
          <div className={`cdRow ${r.item ? "" : "plain"}`} key={i}>
            <span className={`cdSign ${r.sign < 0 ? "neg" : ""}`}>{r.sign < 0 ? "−" : "+"}</span>
            <div className="cdText">
              {r.item ? (
                <>
                  <div className="cdDesc">{r.item.desc || tx("Movimiento")}{originLabel(r.item) && <span className={`lstTag ${originLabel(r.item) === "IA" ? "ia" : originLabel(r.item)}`}>{tx(originLabel(r.item))}</span>}</div>
                  {r.item.note && <div className="cdNote">{r.item.note}</div>}
                  <div className="cdMeta">
                    {r.item.source && r.item.source !== "texto libre" ? r.item.source : ""}
                    {r.item.origAmount != null ? `${r.item.source && r.item.source !== "texto libre" ? " · " : ""}${tx("original {amount}", { amount: money(r.item.origAmount, r.item.origCurrency) })}` : ""}
                  </div>
                </>
              ) : (
                <div className="cdDesc muted">{/[*/()]/.test(r.expr) ? r.expr : tx("Carga manual")}</div>
              )}
            </div>
            <span className="cdAmt mono">{isNaN(r.value) ? "?" : money(Math.abs(r.value), cur)}</span>
          </div>
        ))}
      </div>
      <div className="cdTotal"><span>{tx("Total")}</span><span className="mono">{money(cell.value, cur)}</span></div>
      {orphans.length > 0 && (
        <div className="cdOrphans">
          <div className="cdOrphTitle">{tx("Ya no figuran en la fórmula")}</div>
          {orphans.map((it) => <div className="cdOrph" key={it._i}><span>{it.desc}{it.note ? ` — ${it.note}` : ""}</span><span className="mono">{money(it.amount, cur)}</span></div>)}
        </div>
      )}
      {!(cell.items || []).length && cell.formula && (
        <div className="cdHint">{tx("Los montos aprobados desde la Lista del mes a partir de ahora guardan su descripción y nota acá.")}</div>
      )}
    </div>
  );
  if (sheet) return <div className="mobileSheetOverlay" onClick={onClose}>{body}</div>;
  return body;
}
