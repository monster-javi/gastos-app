import React, { useState } from "react";
import { tx } from "../tx.js";
import { usePersistentState } from "../uiState.js";

// "Resúmenes": every card statement that gets loaded into the Lista del mes
// is also kept here (stored as "statementsV1"), grouped by month: totals,
// dates, interest/fees/taxes and every line, so you can look something up
// without opening the PDF. Statements are written by Claude when it loads a
// PDF (see README); here they're only shown, searched and deleted.

const CURRENCIES = ["ARS", "USD", "EUR"];

function moneyFmt(n, cur) {
  const prefix = cur === "USD" ? "US$ " : cur === "EUR" ? "€ " : "$ ";
  return prefix + (Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function hasAmount(o) { return !!o && CURRENCIES.some((k) => Number(o[k])); }
function moneyMulti(o) {
  const ks = CURRENCIES.filter((k) => Number(o && o[k]));
  return ks.length ? ks.map((k) => moneyFmt(Number(o[k]), k)).join(" + ") : moneyFmt(0, "ARS");
}
function TotalLines({ totals }) {
  const o = totals || {};
  const ks = CURRENCIES.filter((k) => Number(o[k]));
  if (!ks.length) return <span className="stmtTotLine mono">—</span>;
  return ks.map((k) => <span className="stmtTotLine mono" key={k}>{moneyFmt(Number(o[k]), k)}</span>);
}
const norm = (x) => String(x == null ? "" : x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const fmtDate = (d) => { if (!d) return ""; const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d); };
const fmtShort = (d) => { if (!d) return ""; const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : String(d); };

export default function StatementsView({ ctx }) {
  const all = Array.isArray(ctx.statements) ? ctx.statements : [];
  const { setStatements, saveStatements, showConfirmModal, findSubcat } = ctx;
  const lang = ctx.lang || "es";
  const [year, setYear] = usePersistentState("stmt.year", () => new Date().getFullYear(), true);
  const [collapsed, setCollapsed] = usePersistentState("stmt.collapsed", {});
  const [open, setOpen] = useState({});
  const [q, setQ] = useState("");
  const qq = norm(q.trim());

  const monthName = (k) => {
    const [y, m] = k.split("-").map(Number);
    const n = new Date(y, m - 1, 1).toLocaleString(lang === "en" ? "en-US" : "es-AR", { month: "long" });
    return n.charAt(0).toUpperCase() + n.slice(1) + " " + y;
  };
  const monthShort = (k) => {
    const [y, m] = String(k).split("-").map(Number);
    if (!y || !m) return String(k);
    const n = new Date(y, m - 1, 1).toLocaleString(lang === "en" ? "en-US" : "es-AR", { month: "short" }).replace(".", "");
    return n.charAt(0).toUpperCase() + n.slice(1) + " " + String(y).slice(2);
  };
  const cardName = (st) => {
    if (st.card) return st.card;
    try { const sc = st.catId && findSubcat ? findSubcat(st.catId) : null; return (sc && sc.name) || tx("Tarjeta"); } catch { return tx("Tarjeta"); }
  };
  // Older records may have a flat "items" list instead of sections.
  const sectionsOf = (st) => (Array.isArray(st.sections) && st.sections.length ? st.sections : [{ title: tx("Movimientos"), items: st.items || [] }]);
  const rowText = (it) => norm([it.desc, it.ref, it.cuota, it.date, fmtDate(it.date), it.amount, it.note].join(" "));
  // Search: a match on the statement itself shows it whole; otherwise only
  // the matching lines are shown.
  const match = (st) => {
    if (!qq) return { ok: true, all: true };
    const head = norm([cardName(st), st.bank, st.source, st.number, st.notes, st.paymentMethod].join(" ")).includes(qq);
    const secs = sectionsOf(st).map((s) => ({ ...s, items: head || norm(s.title).includes(qq) ? s.items || [] : (s.items || []).filter((it) => rowText(it).includes(qq)) }));
    const hits = secs.reduce((a, s) => a + s.items.length, 0);
    return { ok: head || hits > 0, all: head, secs, hits };
  };

  const inYear = all.filter((st) => String(st.month || "").startsWith(year + "-"));
  const groups = [];
  inYear.map((st) => ({ st, m: match(st) })).filter((x) => x.m.ok).forEach((x) => {
    let g = groups.find((g) => g.month === x.st.month);
    if (!g) { g = { month: x.st.month, items: [] }; groups.push(g); }
    g.items.push(x);
  });
  groups.sort((a, b) => (a.month < b.month ? 1 : -1));
  groups.forEach((g) => g.items.sort((a, b) => (String(a.st.due || a.st.closing || "") < String(b.st.due || b.st.closing || "") ? -1 : 1)));
  const yearsWith = [...new Set(all.map((st) => Number(String(st.month || "").slice(0, 4))).filter(Boolean))];

  function del(st) {
    showConfirmModal(tx("¿Borrar el registro del resumen de {card} ({month})? No toca la planilla ni la lista.", { card: cardName(st), month: monthName(st.month) }), () => {
      setStatements((prev) => { const next = (prev || []).filter((x) => x.id !== st.id); saveStatements(next); return next; });
    });
  }
  function sumBy(items) {
    const o = {};
    items.forEach(({ st }) => { const t = st.totals || {}; CURRENCIES.forEach((k) => { if (Number(t[k])) o[k] = (o[k] || 0) + Number(t[k]); }); });
    return o;
  }
  const fact = (label, value, cls) => (value ? (
    <div className={`stmtFact ${cls || ""}`}><span className="stmtFactLabel">{label}</span><span className="stmtFactValue">{value}</span></div>
  ) : null);
  const amountCell = (it, cur) => {
    const ic = it.currency || "ARS";
    return ic === cur || (cur === "ARS" && ic !== "USD") ? <span className={Number(it.amount) < 0 ? "neg" : ""}>{moneyFmt(Number(it.amount) || 0, ic)}</span> : null;
  };

  function renderBody(st, m) {
    const b = st.breakdown || null;
    const secs = qq ? m.secs : sectionsOf(st);
    const showUsd = secs.some((s) => (s.items || []).some((it) => it.currency === "USD")) || hasAmount(st.totals && { USD: st.totals.USD });
    // Interest and fees always show (even at $0): that's what matters most.
    const tiles = b ? [["consumos", tx("Consumos"), b.consumos], ["intereses", tx("Intereses"), b.intereses], ["comisiones", tx("Comisiones"), b.comisiones], ["impuestos", tx("Impuestos"), b.impuestos]] : [];
    return (
      <div className="stmtBody">
        <div className="stmtFacts">
          {fact(tx("Cierre"), fmtDate(st.closing))}
          {fact(tx("Vencimiento"), fmtDate(st.due))}
          {fact(tx("Pago mínimo"), hasAmount(st.minPayment) ? moneyMulti(st.minPayment) : "")}
          {fact(tx("Próximo cierre"), fmtDate(st.nextClosing))}
          {fact(tx("Próximo vencimiento"), fmtDate(st.nextDue))}
          {fact(tx("Saldo anterior"), st.prevBalance ? moneyMulti(st.prevBalance) : "")}
          {fact(tx("Pagos del período"), st.payments ? moneyMulti(st.payments) : "")}
          {fact(tx("Forma de pago"), st.paymentMethod || "", "wide")}
        </div>
        {tiles.length > 0 && (
          <div className="stmtBreak">
            {tiles.map(([k, label, val]) => (
              <div className={`stmtTile ${k} ${hasAmount(val) ? "on" : "zero"}`} key={k}>
                <span className="stmtTileLabel">{label}</span>
                <span className="stmtTileValue mono">{moneyMulti(val)}</span>
              </div>
            ))}
          </div>
        )}
        {secs.filter((s) => (s.items || []).length || (!qq && hasAmount(s.subtotal))).map((s, si) => (
          <div className="stmtSec" key={si}>
            <div className="stmtSecHead">
              <span className="stmtSecTitle">{s.title}</span>
              {s.subtitle && <span className="stmtSecSub">{s.subtitle}</span>}
              <span className="spacer" />
              {hasAmount(s.subtotal) && <span className="stmtSecTotal mono">{moneyMulti(s.subtotal)}</span>}
            </div>
            {(s.items || []).length > 0 && (
              <div className="stmtTableScroll">
                <table className={`stmtTable ${showUsd ? "usd" : ""}`}>
                  <colgroup>
                    <col className="cDate" /><col /><col className="cCuota" /><col className="cRef" /><col className="cAmt" />
                    {showUsd && <col className="cAmtU" />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="cDate">{tx("Fecha")}</th>
                      <th>{tx("Descripción")}</th>
                      <th className="cCuota">{tx("Cuota")}</th>
                      <th className="cRef">{tx("Comprobante")}</th>
                      <th className="num">{tx("Pesos")}</th>
                      {showUsd && <th className="num">{tx("Dólares")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(s.items || []).map((it, i) => (
                      <tr key={i}>
                        <td className="mono cDate">{fmtShort(it.date)}</td>
                        <td className="cDesc"><span>{it.desc}</span>{it.note && <span className="stmtRowNote">{it.note}</span>}</td>
                        <td className="mono cCuota">{it.cuota || ""}</td>
                        <td className="mono cRef">{it.ref || ""}</td>
                        <td className="num mono">{amountCell(it, "ARS")}</td>
                        {showUsd && <td className="num mono">{amountCell(it, "USD")}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {!qq && Array.isArray(st.upcoming) && st.upcoming.some((u) => hasAmount(u)) && (
          <div className="stmtSec">
            <div className="stmtSecHead"><span className="stmtSecTitle">{tx("Cuotas a vencer")}</span></div>
            <div className="stmtUpcoming">
              {st.upcoming.filter((u) => hasAmount(u)).map((u) => (
                <div className="stmtUp" key={u.month}>
                  <span className="stmtUpMonth">{monthShort(u.month)}</span>
                  <span className="stmtUpValue mono">{moneyMulti(u)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {st.notes && <div className="stmtNotes">{st.notes}</div>}
        <div className="stmtFoot">
          <span className="stmtSource">{[st.source, st.number ? tx("Resumen N° {n}", { n: st.number }) : ""].filter(Boolean).join(" · ")}</span>
          <span className="spacer" />
          <button className="stmtDelBtn" onClick={() => del(st)}>{tx("Borrar registro")}</button>
        </div>
      </div>
    );
  }

  function renderCard({ st, m }) {
    const isOpen = qq ? true : !!open[st.id];
    const b = st.breakdown || {};
    const extra = hasAmount(b.intereses) || hasAmount(b.comisiones);
    return (
      <div className={`stmtCard ${isOpen ? "open" : ""}`} key={st.id}>
        <div className="stmtCardHead" onClick={() => { if (!qq) setOpen((o) => ({ ...o, [st.id]: !o[st.id] })); }}>
          <span className="factChev">{isOpen ? "▾" : "▸"}</span>
          <div className="stmtCardTitle">
            <span className="stmtCardName">{cardName(st)}</span>
            <span className="stmtCardBank">{[st.bank, st.due ? tx("Vence {d}", { d: fmtDate(st.due) }) : ""].filter(Boolean).join(" · ")}</span>
          </div>
          <span className="spacer" />
          {extra && <span className="stmtFlag" title={tx("Tiene intereses o comisiones")}>{tx("Int./Com.")}</span>}
          {qq && !m.all && <span className="stmtHits">{m.hits === 1 ? tx("1 coincidencia") : tx("{n} coincidencias", { n: m.hits })}</span>}
          <div className="stmtTotals"><TotalLines totals={st.totals} /></div>
        </div>
        {isOpen && renderBody(st, m)}
      </div>
    );
  }

  return (
    <div className="factWrap stmtWrap">
      <div className="factYearNav">
        <button className="pillBtn" onClick={() => setYear((y) => y - 1)}>‹</button>
        <span className="factYearLabel">{year}</span>
        <button className="pillBtn" onClick={() => setYear((y) => y + 1)}>›</button>
        <span className="spacer" />
        <span className="searchBoxWrap stmtSearchWrap">
          <input className="searchBox stmtSearch" placeholder={tx("Buscar en los resúmenes…")} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="stmtSearchClear" onClick={() => setQ("")} title={tx("Limpiar")}>✕</button>}
        </span>
      </div>
      {all.length === 0 && (
        <div className="stmtEmpty">{tx("Acá van a quedar guardados los resúmenes de tarjeta que se cargan en la Lista del mes: totales, cierre, vencimiento y cada movimiento, para buscar un dato sin abrir el PDF.")}</div>
      )}
      {all.length > 0 && groups.length === 0 && (
        <div className="stmtEmpty">
          {qq
            ? tx("Ningún resumen de {year} coincide con \"{q}\".", { year, q: q.trim() })
            : tx("No hay resúmenes guardados en {year}.", { year }) + (yearsWith.length ? " " + tx("Hay en: {years}.", { years: yearsWith.sort().join(", ") }) : "")}
        </div>
      )}
      {groups.map((g) => {
        const isCol = !qq && !!collapsed[g.month];
        return (
          <div className="stmtMonth" key={g.month}>
            <div className="stmtMonthHead" onClick={() => setCollapsed((o) => ({ ...o, [g.month]: !o[g.month] }))}>
              <span className="factChev">{isCol ? "▸" : "▾"}</span>
              <span className="stmtMonthName">{monthName(g.month)}</span>
              <span className="factMonthCount">{g.items.length}</span>
              <span className="spacer" />
              <span className="stmtMonthTotal"><TotalLines totals={sumBy(g.items)} /></span>
            </div>
            {!isCol && <div className="stmtCards">{g.items.map(renderCard)}</div>}
          </div>
        );
      })}
    </div>
  );
}
