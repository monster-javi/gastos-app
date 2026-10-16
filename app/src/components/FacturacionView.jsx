import React, { useEffect, useMemo, useState } from "react";
import { fmtInt, parseCellInput, round2, bridgeConvert, shiftMonth, monthFullLabel, uid, normalize } from "../utils.js";
import { usePersistentState } from "../uiState.js";
import { tx, txn, getTxLang } from "../tx.js";

// Monotributo annual gross-income caps (ingresos brutos anuales), ARCA table
// in force from August 2026. They change twice a year, so they're editable
// from the "Topes" modal; this is only the starting point / "restaurar".
export const DEFAULT_TOPES = {
  A: 12009410.45, B: 17595182.74, C: 24670494.31, D: 30628651.43, E: 36028231.33, F: 45151659.41,
  G: 53995798.87, H: 81924660.37, I: 91699761.9, J: 105012519.2, K: 126610838.75,
};
export const DEFAULT_TOPES_VIGENCIA = "Agosto 2026 (ARCA)";
const CATS = Object.keys(DEFAULT_TOPES);

export function defaultFacturacion() {
  return {
    // Legacy single regime/category (pre-v138). Now each year keeps its own
    // in regimeByYear; these only seed years that were never set.
    regime: "monotributo",
    category: "A",
    regimeByYear: {}, // "2026" -> { regime: "monotributo" | "autonomo", category: "A".."K" }
    topes: { ...DEFAULT_TOPES },
    topesVigencia: DEFAULT_TOPES_VIGENCIA,
    // { id, billMonth "YYYY-MM" (when it's invoiced/collected — counts for the tope),
    //   period "YYYY-MM" | null (month worked → links to that month's box),
    //   detail, client, fav, budget{amount,currency}, official{...}, unofficial{...} }
    invoices: [],
    // "YYYY-MM" (month worked) -> { rows: [{ id, label, days, rate, currency }] }
    boxes: {},
  };
}

// Regime for a given year: its own setting if it has one, otherwise the most
// recent earlier year's (so a new year starts as the previous one ended).
export function regimeFor(F, year) {
  const map = F.regimeByYear || {};
  if (map[year]) return { ...map[year], inheritedFrom: null };
  const prev = Object.keys(map).map(Number).filter((y) => y < year).sort((a, b) => b - a)[0];
  if (prev) return { ...map[prev], inheritedFrom: prev };
  return { regime: F.regime || "monotributo", category: F.category || "A", inheritedFrom: "default" };
}

const CURS = ["ARS", "USD", "EUR"];
function nextCur(c) { return CURS[(CURS.indexOf(c || "ARS") + 1) % CURS.length]; }
function curSymbol(c) { return c === "USD" ? "US$" : c === "EUR" ? "€" : "$"; }
function toggleSymbol(c) { return c === "EUR" ? "€" : "$"; }
function curClass(c) { return c === "USD" ? "usd" : c === "EUR" ? "eur" : "ars"; }
function fmtMoney(amount, cur) {
  const n = round2(amount);
  return `${curSymbol(cur)} ${n ? fmtInt(n) : "0"}`;
}
function fmt2(n) { return (Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function shortMonth(key) { return `${monthFullLabel(key, getTxLang()).slice(0, 3)} ${key.slice(2, 4)}`; }
function autoDetail(period) {
  if (!period) return "";
  return `x ${monthFullLabel(period, "es").toLowerCase()} ${period.split("-")[0]}`;
}
function nowMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// Sum {amount,currency} items keeping each currency separate — mixed
// currencies are shown as "US$ 3.485 + $ 200.000", never silently converted.
function sumByCur(list) {
  const out = {};
  list.forEach((m) => {
    const a = Number(m?.amount) || 0;
    if (!a) return;
    const c = m.currency || "ARS";
    out[c] = (out[c] || 0) + a;
  });
  return out;
}
function fmtMulti(byCur) {
  const keys = CURS.filter((c) => byCur[c]);
  if (!keys.length) return "";
  return keys.map((c) => fmtMoney(byCur[c], c)).join(" + ");
}
function rowCur(r, box) { return r.currency || box?.currency || "USD"; }

function TextField({ value, onCommit, placeholder, className, list }) {
  return (
    <input
      className={className}
      defaultValue={value || ""}
      key={value || ""}
      placeholder={placeholder}
      list={list}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (value || "")) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

function NumField({ value, onCommit, className, placeholder }) {
  const shown = round2(value) ? fmtInt(round2(value)) : "";
  return (
    <input
      className={`mono ${className || ""}`}
      defaultValue={shown}
      key={shown}
      placeholder={placeholder ?? "0"}
      inputMode="decimal"
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        const n = parseCellInput(e.target.value);
        if (round2(n) !== round2(value)) onCommit(n);
        else e.target.value = shown;
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

function AmountField({ money, onAmount, onCurrency }) {
  const cur = money?.currency || "ARS";
  return (
    <div className="factAmount">
      <NumField value={money?.amount || 0} onCommit={onAmount} placeholder="—" />
      <button className={`curToggle ${curClass(cur)}`} onClick={onCurrency} title={tx("Moneda: {cur} (clic para cambiar)", { cur })}>{toggleSymbol(cur)}</button>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export default function FacturacionView({ ctx }) {
  const { facturacion: F, setFacturacion, saveFacturacion, getDolarRate, getEuroRate, showConfirmModal, isMobile } = ctx;
  const [year, setYear] = usePersistentState("fact.year", () => new Date().getFullYear(), true);
  const [collapsed, setCollapsed] = usePersistentState("fact.collapsedMonths", {}); // billMonth -> true
  const [favOnly, setFavOnly] = usePersistentState("fact.favOnly", false);
  const [showTopes, setShowTopes] = useState(false);
  // Mobile compact table: "Mes" is fixed, the other two columns are chosen by the user.
  const [colA, setColA] = usePersistentState("fact.mColA", "client"); // client | detail | period
  const [colB, setColB] = usePersistentState("fact.mColB", "official"); // official | unofficial | budget
  const [openInv, setOpenInv] = useState(null);
  // Right-click menu on an invoice row (mark as not collected yet).
  const [invMenu, setInvMenu] = useState(null); // { x, y, id }
  useEffect(() => {
    if (!invMenu) return;
    const close = () => setInvMenu(null);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [invMenu]);
  function openInvMenu(e, id) {
    e.preventDefault();
    setInvMenu({ id, x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 60) });
  }
  function toggleUncollected(id) { updateInvoice(id, (x) => { if (x.uncollected) delete x.uncollected; else x.uncollected = true; }); }

  function update(mutator) {
    setFacturacion((prev) => {
      const draft = JSON.parse(JSON.stringify(prev));
      mutator(draft);
      saveFacturacion(draft);
      return draft;
    });
  }
  function updateInvoice(id, mutator) {
    update((d) => { const inv = d.invoices.find((x) => x.id === id); if (inv) mutator(inv); });
  }

  const toARS = (m, month) => bridgeConvert(Number(m?.amount) || 0, m?.currency || "ARS", "ARS", getDolarRate(month), getEuroRate(month));
  const toUSD = (m, month) => bridgeConvert(Number(m?.amount) || 0, m?.currency || "ARS", "USD", getDolarRate(month), getEuroRate(month));

  const allYearInvoices = useMemo(() => F.invoices
    .map((inv, i) => ({ ...inv, _i: i }))
    .filter((inv) => inv.billMonth && inv.billMonth.startsWith(`${year}-`))
    .sort((a, b) => (a.billMonth === b.billMonth ? a._i - b._i : a.billMonth < b.billMonth ? -1 : 1)), [F.invoices, year]);
  const yearInvoices = favOnly ? allYearInvoices.filter((x) => x.fav) : allYearInvoices;

  const byMonth = useMemo(() => {
    const groups = [];
    yearInvoices.forEach((inv) => {
      let g = groups.find((x) => x.month === inv.billMonth);
      if (!g) { g = { month: inv.billMonth, items: [] }; groups.push(g); }
      g.items.push(inv);
    });
    return groups;
  }, [yearInvoices]);

  // ---- regime (per year) + totals for the cards — always over ALL invoices of the year ----
  const reg = regimeFor(F, year);
  const isMono = reg.regime === "monotributo";
  function setRegime(patch) {
    update((d) => {
      if (!d.regimeByYear) d.regimeByYear = {};
      const cur = regimeFor(d, year);
      d.regimeByYear[year] = { regime: cur.regime, category: cur.category, ...patch };
    });
  }
  const officialARS = allYearInvoices.reduce((a, inv) => a + toARS(inv.official, inv.billMonth), 0);
  const officialUSD = allYearInvoices.reduce((a, inv) => a + toUSD(inv.official, inv.billMonth), 0);
  const altARS = allYearInvoices.reduce((a, inv) => a + toARS(inv.unofficial, inv.billMonth), 0);
  const altUSD = allYearInvoices.reduce((a, inv) => a + toUSD(inv.unofficial, inv.billMonth), 0);
  const tope = Number(F.topes?.[reg.category]) || 0;
  const disponible = tope - officialARS;
  const pct = tope ? Math.min(100, (officialARS / tope) * 100) : 0;
  const level = !tope ? "ok" : officialARS > tope ? "over" : pct >= 90 ? "danger" : pct >= 70 ? "warn" : "ok";
  const fitsCategory = CATS.find((c) => (Number(F.topes?.[c]) || 0) >= officialARS) || null;

  // ---- invoices ----
  function lastInvoice() { return F.invoices.length ? F.invoices[F.invoices.length - 1] : null; }
  function newInvoice(fields = {}) {
    const last = lastInvoice();
    const billMonth = fields.billMonth || (String(year) === nowMonthKey().slice(0, 4) ? nowMonthKey() : `${year}-01`);
    const period = fields.period !== undefined ? fields.period : shiftMonth(billMonth, -1);
    return {
      id: uid(),
      billMonth,
      period,
      detail: fields.detail !== undefined ? fields.detail : autoDetail(period),
      client: fields.client !== undefined ? fields.client : (last?.client || ""),
      fav: false,
      budget: fields.budget || { amount: 0, currency: last?.budget?.currency || "USD" },
      official: { amount: 0, currency: "ARS" },
      unofficial: { amount: 0, currency: "USD" },
    };
  }
  function addInvoices(list) {
    update((d) => { list.forEach((inv) => d.invoices.push(inv)); });
    setCollapsed((c) => { const n = { ...c }; list.forEach((inv) => { delete n[inv.billMonth]; }); return n; });
    setFavOnly(false);
  }
  function deleteInvoice(inv) {
    const label = [inv.detail, inv.client].filter(Boolean).join(" · ") || tx("esta factura");
    showConfirmModal(tx("¿Borrar {label}?", { label }), () => update((d) => { d.invoices = d.invoices.filter((x) => x.id !== inv.id); }));
  }
  function setPeriod(inv, period) {
    updateInvoice(inv.id, (x) => {
      // Keep the detail in sync while it's still the auto-generated text.
      if (!x.detail || x.detail === autoDetail(x.period)) x.detail = autoDetail(period);
      x.period = period || null;
    });
  }

  const clients = useMemo(() => [...new Set(F.invoices.map((x) => (x.client || "").trim()).filter(Boolean))], [F.invoices]);
  const monthOptions = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const moveOptions = Array.from({ length: 14 }, (_, i) => shiftMonth(`${year - 1}-12`, i));
  const periodOptions = Array.from({ length: 24 }, (_, i) => shiftMonth(`${year - 1}-01`, i));

  const allCollapsed = byMonth.length > 0 && byMonth.every((g) => collapsed[g.month]);
  function toggleAll() {
    if (allCollapsed) setCollapsed((c) => { const n = { ...c }; byMonth.forEach((g) => { delete n[g.month]; }); return n; });
    else setCollapsed((c) => { const n = { ...c }; byMonth.forEach((g) => { n[g.month] = true; }); return n; });
  }
  function toggleMonth(m) { setCollapsed((c) => { const n = { ...c }; if (n[m]) delete n[m]; else n[m] = true; return n; }); }

  // ---- boxes (jornadas por mes trabajado) ----
  function getBox(m) { return F.boxes?.[m] || { rows: [] }; }
  function boxTotals(m) {
    const b = getBox(m);
    return sumByCur(b.rows.map((r) => ({ amount: (Number(r.days) || 0) * (Number(r.rate) || 0), currency: rowCur(r, b) })));
  }
  function updateBox(m, mutator) {
    update((d) => {
      if (!d.boxes) d.boxes = {};
      if (!d.boxes[m]) d.boxes[m] = { rows: [] };
      mutator(d.boxes[m]);
    });
  }
  const knownLabels = useMemo(() => {
    const set = new Set(["Jornada 3D", "Jornada supervisión", "Jornada sup. set asist."]);
    Object.values(F.boxes || {}).forEach((b) => (b.rows || []).forEach((r) => { if (r.label) set.add(r.label); }));
    return [...set];
  }, [F.boxes]);
  // When a jornada type is used again, bring back the most recent rate (and
  // its currency) used for that same type in any month.
  function lastRateFor(label) {
    const key = normalize((label || "").trim());
    const months = Object.keys(F.boxes || {}).sort().reverse();
    for (const m of months) {
      const b = F.boxes[m];
      const r = (b.rows || []).find((x) => normalize((x.label || "").trim()) === key && Number(x.rate) > 0);
      if (r) return { rate: Number(r.rate), currency: rowCur(r, b) };
    }
    return null;
  }
  function addBoxRow(m) {
    updateBox(m, (b) => {
      const prev = b.rows.length ? b.rows[b.rows.length - 1] : null;
      // New row: same type as the row above; in an empty month, the type used
      // most recently in any other month.
      let label = prev ? prev.label : null;
      if (!label) {
        const used = Object.keys(F.boxes || {}).sort().reverse().map((k) => F.boxes[k]?.rows || []).find((rows) => rows.length);
        label = used ? used[used.length - 1].label : (knownLabels[0] || "Jornada");
      }
      const last = lastRateFor(label);
      b.rows.push({ id: uid(), label, days: 0, rate: last?.rate || 0, currency: prev ? rowCur(prev, b) : (last?.currency || "USD") });
    });
  }
  function linkedInvoices(m) { return F.invoices.filter((x) => x.period === m); }
  // One invoice per currency: a month with jornadas in pesos AND in dollars is
  // invoiced as two separate facturas (one per currency), each linked to the box.
  function createInvoicesFromBox(m, onlyCurs) {
    const totals = boxTotals(m);
    const curs = (onlyCurs || CURS).filter((c) => totals[c]);
    addInvoices(curs.map((c) => newInvoice({ billMonth: shiftMonth(m, 1), period: m, budget: { amount: round2(totals[c]), currency: c } })));
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const lang = getTxLang();
    const inv = allYearInvoices.map((x) => ({
      [tx("Mes de cobro")]: `${monthFullLabel(x.billMonth, lang)} ${x.billMonth.slice(0, 4)}`,
      [tx("Período trabajado")]: x.period ? `${monthFullLabel(x.period, lang)} ${x.period.slice(0, 4)}` : "",
      [tx("Detalle")]: x.detail || "",
      [tx("Cliente")]: x.client || "",
      [tx("Favorita")]: x.fav ? "★" : "",
      [tx("Presupuestado")]: Number(x.budget?.amount) || 0, [tx("Moneda presup.")]: x.budget?.currency || "",
      [tx("Cobrado")]: Number(x.official?.amount) || 0, [tx("Moneda cobrado")]: x.official?.currency || "",
      [tx("Cobrado alternativo")]: Number(x.unofficial?.amount) || 0, [tx("Moneda alternativo")]: x.unofficial?.currency || "",
    }));
    const jor = [];
    monthOptions.forEach((m) => {
      const b = getBox(m);
      b.rows.forEach((r) => jor.push({
        [tx("Mes trabajado")]: `${monthFullLabel(m, lang)} ${m.slice(0, 4)}`,
        [tx("Jornada")]: r.label || "", [tx("Días")]: Number(r.days) || 0, [tx("Precio por jornada")]: Number(r.rate) || 0,
        [tx("Moneda")]: rowCur(r, b), [tx("Subtotal")]: round2((Number(r.days) || 0) * (Number(r.rate) || 0)),
      }));
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inv.length ? inv : [{ Info: tx("Sin facturas") }]), tx("Facturas {year}", { year }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jor.length ? jor : [{ Info: tx("Sin jornadas") }]), tx("Jornadas {year}", { year }));
    XLSX.writeFile(wb, `${tx("facturacion")}_${year}.xlsx`);
  }

  const COLS = 9;

  function renderInvoiceRow(inv, g, idx) {
    return (
      <tr
        className={`factInvRow ${idx === 0 ? "groupStart" : ""} ${inv.uncollected ? "uncollected" : ""}`}
        key={inv.id}
        onMouseDown={(e) => { if (e.button === 2) e.preventDefault(); }}
        onContextMenu={(e) => openInvMenu(e, inv.id)}
      >
        {idx === 0 && (
          <td className="cMes factMesCell" rowSpan={g.items.length} onClick={() => toggleMonth(g.month)} title={tx("Colapsar este mes")}>
            <span className="factChev">▾</span>
            <span className="factMonthName">{monthFullLabel(g.month, getTxLang())}</span>
            {g.items.length > 1 && <span className="factMonthCount">{g.items.length}</span>}
          </td>
        )}
        <td className="cFav">
          <button className={`favStar ${inv.fav ? "on" : ""}`} onClick={() => updateInvoice(inv.id, (x) => { x.fav = !x.fav; })} title={inv.fav ? tx("Quitar de favoritas") : tx("Marcar como favorita")}>{inv.fav ? "★" : "☆"}</button>
        </td>
        <td className="cPeriodo">
          <select className="factBareSelect" value={inv.period || ""} onChange={(e) => setPeriod(inv, e.target.value || null)} title={tx("Mes trabajado (lo vincula con su box de jornadas)")}>
            <option value="">—</option>
            {(inv.period && !periodOptions.includes(inv.period) ? [inv.period, ...periodOptions] : periodOptions).map((m) => (
              <option key={m} value={m}>{shortMonth(m)}</option>
            ))}
          </select>
        </td>
        <td className="cDetalle">
          <TextField className="factText" value={inv.detail} placeholder="Detalle" onCommit={(v) => updateInvoice(inv.id, (x) => { x.detail = v; })} />
        </td>
        <td className="cCliente">
          <TextField className="factText" value={inv.client} placeholder="Cliente" list="factClients" onCommit={(v) => updateInvoice(inv.id, (x) => { x.client = v; })} />
        </td>
        <td className="cNum">
          <AmountField money={inv.budget}
            onAmount={(n) => updateInvoice(inv.id, (x) => { x.budget = { ...x.budget, amount: n }; })}
            onCurrency={() => updateInvoice(inv.id, (x) => { x.budget = { ...x.budget, currency: nextCur(x.budget?.currency) }; })} />
        </td>
        <td className="cNum cCobrado" title={inv.uncollected ? tx("No cobrado todavía (clic derecho para cambiar)") : undefined}>
          <AmountField money={inv.official}
            onAmount={(n) => updateInvoice(inv.id, (x) => { x.official = { ...x.official, amount: n }; })}
            onCurrency={() => updateInvoice(inv.id, (x) => { x.official = { ...x.official, currency: nextCur(x.official?.currency) }; })} />
        </td>
        <td className="cNum">
          <AmountField money={inv.unofficial}
            onAmount={(n) => updateInvoice(inv.id, (x) => { x.unofficial = { ...x.unofficial, amount: n }; })}
            onCurrency={() => updateInvoice(inv.id, (x) => { x.unofficial = { ...x.unofficial, currency: nextCur(x.unofficial?.currency) }; })} />
        </td>
        <td className="cAct">
          <span className="factMoveWrap" title={tx("Mover a otro mes de cobro")}>
            <CalendarIcon />
            <select value={inv.billMonth} onChange={(e) => updateInvoice(inv.id, (x) => { x.billMonth = e.target.value; })}>
              {moveOptions.map((m) => <option key={m} value={m}>{monthFullLabel(m, getTxLang())} {m.slice(0, 4)}</option>)}
            </select>
          </span>
          <button className="rowDelete" onClick={() => deleteInvoice(inv)} title={tx("Borrar factura")}>✕</button>
        </td>
      </tr>
    );
  }

  const COL_A = { client: tx("Cliente"), detail: tx("Detalle"), period: tx("Período") };
  const COL_B = { official: tx("Cobrado"), unofficial: tx("Cobrado alt."), budget: tx("Presupuestado") };
  function aText(inv) { return colA === "client" ? inv.client : colA === "detail" ? inv.detail : (inv.period ? shortMonth(inv.period) : ""); }
  function renderMobileEditor(inv) {
    return (
      <div className="factMEditor">
        <div className="factMField"><span>{tx("Período")}</span>
          <select className="factSelect" value={inv.period || ""} onChange={(e) => setPeriod(inv, e.target.value || null)}>
            <option value="">—</option>
            {(inv.period && !periodOptions.includes(inv.period) ? [inv.period, ...periodOptions] : periodOptions).map((m) => <option key={m} value={m}>{monthFullLabel(m, getTxLang())} {m.slice(0, 4)}</option>)}
          </select>
        </div>
        <div className="factMField"><span>{tx("Detalle")}</span><TextField className="factText" value={inv.detail} placeholder="Detalle" onCommit={(v) => updateInvoice(inv.id, (x) => { x.detail = v; })} /></div>
        <div className="factMField"><span>{tx("Cliente")}</span><TextField className="factText" value={inv.client} placeholder="Cliente" list="factClients" onCommit={(v) => updateInvoice(inv.id, (x) => { x.client = v; })} /></div>
        {[["budget", tx("Presupuestado")], ["official", tx("Cobrado")], ["unofficial", tx("Cobrado alternativo")]].map(([k, l]) => (
          <div className="factMField" key={k}><span>{l}</span>
            <AmountField money={inv[k]}
              onAmount={(n) => updateInvoice(inv.id, (x) => { x[k] = { ...x[k], amount: n }; })}
              onCurrency={() => updateInvoice(inv.id, (x) => { x[k] = { ...x[k], currency: nextCur(x[k]?.currency) }; })} />
          </div>
        ))}
        <div className="factMField"><span>{tx("Mes de cobro")}</span>
          <select className="factSelect" value={inv.billMonth} onChange={(e) => { const v = e.target.value; updateInvoice(inv.id, (x) => { x.billMonth = v; }); }}>
            {moveOptions.map((m) => <option key={m} value={m}>{monthFullLabel(m, getTxLang())} {m.slice(0, 4)}</option>)}
          </select>
        </div>
        <div className="factMActions">
          <button className={`pillBtn ${inv.fav ? "factPillOn" : ""}`} onClick={() => updateInvoice(inv.id, (x) => { x.fav = !x.fav; })}>{inv.fav ? "★" : "☆"}</button>
          <button className={`pillBtn ${inv.uncollected ? "factPillOn" : ""}`} onClick={() => toggleUncollected(inv.id)}>{inv.uncollected ? tx("No cobrado") : tx("Marcar no cobrado")}</button>
          <span className="spacer" />
          <button className="pillBtn factMDelete" onClick={() => deleteInvoice(inv)}>{tx("Borrar")}</button>
          <button className="primaryTop" onClick={() => setOpenInv(null)}>{tx("Listo")}</button>
        </div>
      </div>
    );
  }
  function renderMobileList() {
    return (
      <div className="factMList">
        <div className="factMRow factMHead">
          <span>{tx("Mes")}</span>
          <label className="factMColPick">
            <span>{COL_A[colA]} ▾</span>
            <select value={colA} onChange={(e) => setColA(e.target.value)}>{Object.entries(COL_A).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="factMColPick right">
            <span>{COL_B[colB]} ▾</span>
            <select value={colB} onChange={(e) => setColB(e.target.value)}>{Object.entries(COL_B).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
        </div>
        {byMonth.length === 0 && <div className="factEmpty">{favOnly ? tx("No hay facturas favoritas en {year}.", { year }) : tx("Todavía no hay facturas en {year}.", { year })}</div>}
        {byMonth.map((g) => collapsed[g.month] ? (
          <div className="factMRow factMSum" key={g.month} onClick={() => toggleMonth(g.month)}>
            <span className="factMMes"><span className="factChev">▸</span>{monthFullLabel(g.month, getTxLang()).slice(0, 3)}{g.items.length > 1 && <span className="factMonthCount">{g.items.length}</span>}</span>
            <span className="factEllipsis factMA">{[...new Set(g.items.map(aText).filter(Boolean))].join(", ")}</span>
            <span className="mono factMB">{fmtMulti(sumByCur(g.items.map((x) => x[colB]))) || "—"}</span>
          </div>
        ) : g.items.map((inv, idx) => (
          <React.Fragment key={inv.id}>
            <div className={`factMRow ${idx === 0 ? "groupStart" : ""} ${openInv === inv.id ? "open" : ""} ${inv.uncollected ? "uncollected" : ""}`} onClick={() => setOpenInv(openInv === inv.id ? null : inv.id)}>
              <span className="factMMes" onClick={(e) => { if (idx === 0) { e.stopPropagation(); toggleMonth(g.month); } }}>
                {idx === 0 ? <><span className="factChev">▾</span>{monthFullLabel(g.month, getTxLang()).slice(0, 3)}</> : null}
              </span>
              <span className="factEllipsis factMA">{inv.fav && <span className="favStar on">★ </span>}{aText(inv) || <span className="factMuted">—</span>}</span>
              <span className="mono factMB">{Number(inv[colB]?.amount) ? fmtMoney(inv[colB].amount, inv[colB].currency) : <span className="factMuted">—</span>}</span>
            </div>
            {openInv === inv.id && renderMobileEditor(inv)}
          </React.Fragment>
        )))}
        {byMonth.length > 0 && (
          <div className="factMRow factMTotal">
            <span>{tx("Total")}</span><span />
            <span className="mono factMB">{fmtMulti(sumByCur(yearInvoices.map((x) => x[colB]))) || "—"}</span>
          </div>
        )}
        {yearInvoices.some((x) => x.uncollected) && (
          <div className="factMRow factMPend">
            <span><span className="pendingMark" />{tx("Sin cobrar")}</span><span className="factMuted">{tx("presupuestado")}</span>
            <span className="mono factMB">{fmtMulti(sumByCur(yearInvoices.filter((x) => x.uncollected).map((x) => x.budget)))}</span>
          </div>
        )}
      </div>
    );
  }

  function renderCollapsedRow(g) {
    const periods = [...new Set(g.items.map((x) => x.period).filter(Boolean))].map(shortMonth).join(", ");
    const details = [...new Set(g.items.map((x) => x.detail).filter(Boolean))].join(" · ");
    const cls = [...new Set(g.items.map((x) => x.client).filter(Boolean))].join(", ");
    return (
      <tr className={`factSumRow groupStart ${g.items.some((x) => x.uncollected) ? "uncollected" : ""}`} key={g.month} onClick={() => toggleMonth(g.month)} title={tx("Expandir este mes")}>
        <td className="cMes factMesCell">
          <span className="factChev">▸</span>
          <span className="factMonthName">{monthFullLabel(g.month, getTxLang())}</span>
          {g.items.length > 1 && <span className="factMonthCount">{g.items.length}</span>}
        </td>
        <td className="cFav">{g.items.some((x) => x.fav) ? <span className="favStar on">★</span> : null}</td>
        <td className="cPeriodo factSumText">{periods}</td>
        <td className="cDetalle factSumText factEllipsis">{details}</td>
        <td className="cCliente factSumText factEllipsis">{cls}</td>
        <td className="cNum mono">{fmtMulti(sumByCur(g.items.map((x) => x.budget)))}</td>
        <td className="cNum mono cCobrado">{fmtMulti(sumByCur(g.items.map((x) => x.official)))}</td>
        <td className="cNum mono">{fmtMulti(sumByCur(g.items.map((x) => x.unofficial)))}</td>
        <td className="cAct"></td>
      </tr>
    );
  }

  return (
    <div className="factWrap">
      <div className="factYearNav">
        <button className="pillBtn" onClick={() => setYear((y) => y - 1)}>‹</button>
        <span className="factYearLabel">{year}</span>
        <button className="pillBtn" onClick={() => setYear((y) => y + 1)}>›</button>
        <span className="spacer" />
        <button className="pillBtn" onClick={exportExcel} title={tx("Descargar facturas y jornadas de este año en Excel")}>{tx("Exportar {year} a Excel", { year })}</button>
      </div>

      {/* ---- resumen / monotributo ---- */}
      <div className={`factCards ${isMono ? "" : "autonomo"}`}>
        <div className="factCard factRegimeCard">
          <div className="factCardLabel">{tx("RÉGIMEN")} · {year}</div>
          <div className="factRegimeRow">
            <div className="factSeg">
              <button className={isMono ? "on" : ""} onClick={() => setRegime({ regime: "monotributo" })}>Monotributo</button>
              <button className={!isMono ? "on" : ""} onClick={() => setRegime({ regime: "autonomo" })}>{tx("Autónomo")}</button>
            </div>
          </div>
          {isMono && (
            <div className="factRegimeRow">
              <span className="factMuted">{tx("Categoría")}</span>
              <select className="factSelect" value={reg.category} onChange={(e) => setRegime({ category: e.target.value })}>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="pillBtn factTopesBtn" onClick={() => setShowTopes(true)} title={tx("Editar los topes de cada categoría")}>⚙ {tx("Topes")}</button>
            </div>
          )}
          <div className="factHint">
            {typeof reg.inheritedFrom === "number" ? tx("Igual que {prev} — cambialo si en {year} es distinto.", { prev: reg.inheritedFrom, year }) : isMono ? tx("Topes vigentes: {v}", { v: F.topesVigencia === DEFAULT_TOPES_VIGENCIA ? tx(DEFAULT_TOPES_VIGENCIA) : (F.topesVigencia || "—") }) : tx("Sin tope de facturación.")}
          </div>
        </div>

        <div className="factCard">
          <div className="factCardLabel">{tx("FACTURADO")} · {year}</div>
          <div className="factCardValue mono">{fmtMoney(officialARS, "ARS")}</div>
          <div className="factCardSub mono">≈ {fmtMoney(officialUSD, "USD")}</div>
          {isMono && officialARS > 0 && (
            <div className="factHint">{fitsCategory ? <>{tx("Con lo facturado entrás en categoría")} <strong>{fitsCategory}</strong></> : tx("Superás el tope de la categoría K")}</div>
          )}
        </div>

        {isMono && (
          <div className={`factCard factTopeCard ${level}`}>
            <div className="factCardLabel">{tx("POSIBLE PARA FACTURAR · CAT. {cat}", { cat: reg.category })}</div>
            <div className="factCardValue mono">{disponible >= 0 ? fmtMoney(disponible, "ARS") : `− ${fmtMoney(-disponible, "ARS")}`}</div>
            <div className="factBar"><div className="factBarFill" style={{ width: `${pct}%` }} /></div>
            <div className="factCardSub">
              {level === "over" ? tx("Te pasaste del tope") : tx("{pct}% usado", { pct: getTxLang() === "en" ? pct.toFixed(1) : pct.toFixed(1).replace(".", ",") })} · {tx("tope")} {fmtMoney(tope, "ARS")}
            </div>
          </div>
        )}

        <div className="factCard">
          <div className="factCardLabel">{tx("COBRADO ALTERNATIVO")} · {year}</div>
          <div className="factCardValue mono">{fmtMoney(altUSD, "USD")}</div>
          <div className="factCardSub mono">≈ {fmtMoney(altARS, "ARS")}</div>
        </div>
      </div>

      {/* ---- facturas ---- */}
      <div className="factSectionHead">
        <span className="factSectionTitle">{tx("Facturas {year}", { year })}</span>
        <span className="factMuted">{txn(allYearInvoices.length, "{n} factura", "{n} facturas")}</span>
        <span className="spacer" />
        <button className={`pillBtn ${favOnly ? "factPillOn" : ""}`} onClick={() => setFavOnly((v) => !v)} title={tx("Mostrar solo las facturas marcadas con ★")}>★ {tx("Favoritas")}</button>
        {byMonth.length > 0 && (
          <button className="pillBtn" onClick={toggleAll}>{allCollapsed ? tx("Expandir todo") : tx("Colapsar todo")}</button>
        )}
        <button className="primaryTop" onClick={() => addInvoices([newInvoice()])}>{tx("+ Nueva factura")}</button>
      </div>

      {isMobile ? renderMobileList() : (
      <div className="factTableScroll">
        <table className="factTable">
          <colgroup>
            <col className="wMes" /><col className="wFav" /><col className="wPeriodo" /><col className="wDetalle" /><col className="wCliente" />
            <col className="wNum" /><col className="wNum" /><col className="wNum" /><col className="wAct" />
          </colgroup>
          <thead>
            <tr>
              <th>{tx("Mes de cobro")}</th>
              <th></th>
              <th title={tx("Mes trabajado — lo vincula con su box de jornadas")}>{tx("Período")}</th>
              <th>{tx("Detalle")}</th>
              <th>{tx("Cliente")}</th>
              <th className="cNum">{tx("Presupuestado")}</th>
              <th className="cNum">{tx("Cobrado")}</th>
              <th className="cNum">{tx("Cobrado alternativo")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {byMonth.length === 0 && (
              <tr><td colSpan={COLS} className="factEmpty">{favOnly ? tx("No hay facturas favoritas en {year}.", { year }) : tx("Todavía no hay facturas en {year}. Usá “+ Nueva factura” o “Crear factura” desde un box de jornadas.", { year })}</td></tr>
            )}
            {byMonth.map((g) => (collapsed[g.month]
              ? renderCollapsedRow(g)
              : g.items.map((inv, idx) => renderInvoiceRow(inv, g, idx))))}
          </tbody>
          {byMonth.length > 0 && (
            <tfoot>
              <tr className="factTotalRow">
                <td colSpan={5}>{tx("Total {year}", { year })}{favOnly ? ` (${tx("favoritas")})` : ""}</td>
                <td className="cNum mono">{fmtMulti(sumByCur(yearInvoices.map((x) => x.budget)))}</td>
                <td className="cNum mono">{fmtMulti(sumByCur(yearInvoices.map((x) => x.official)))}</td>
                <td className="cNum mono">{fmtMulti(sumByCur(yearInvoices.map((x) => x.unofficial)))}</td>
                <td></td>
              </tr>
              {yearInvoices.some((x) => x.uncollected) && (
                <tr className="factPendRow">
                  <td colSpan={5}><span className="pendingMark" />{tx("Pendiente de cobro ({n})", { n: yearInvoices.filter((x) => x.uncollected).length })}</td>
                  <td className="cNum mono">{fmtMulti(sumByCur(yearInvoices.filter((x) => x.uncollected).map((x) => x.budget)))}</td>
                  <td></td><td></td><td></td>
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>
      )}
      <datalist id="factClients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="factLabels">{knownLabels.map((c) => <option key={c} value={c} />)}</datalist>

      {/* ---- jornadas por mes ---- */}
      <div className="factSectionHead factBoxesHead">
        <span className="factSectionTitle">{tx("Período por mes trabajado")} · {year}</span>
        <span className="factMuted">{tx("Lo trabajado en un mes se factura y cobra el mes siguiente (diciembre se cobra en enero).")}</span>
      </div>
      <div className="factBoxGrid">
        {monthOptions.map((m) => {
          const b = getBox(m);
          const totals = boxTotals(m);
          const totalCurs = CURS.filter((c) => totals[c]);
          const linked = linkedInvoices(m);
          const linkedTotals = sumByCur(linked.map((x) => x.budget));
          const allCurs = CURS.filter((c) => totals[c] || linkedTotals[c]);
          const diffs = !b.rows.length ? [] : allCurs.map((c) => ({ c, d: round2((totals[c] || 0) - (linkedTotals[c] || 0)) })).filter((x) => Math.abs(x.d) >= 1);
          const missingCurs = totalCurs.filter((c) => !linkedTotals[c]);
          const isCurrent = m === nowMonthKey();
          const billMonths = [...new Set(linked.map((x) => x.billMonth))].map((bm) => (getTxLang() === "en" ? monthFullLabel(bm, "en") : monthFullLabel(bm, "es").toLowerCase()) + (bm.slice(0, 4) !== m.slice(0, 4) ? " " + bm.slice(0, 4) : ""));
          return (
            <div className={`factBox ${b.rows.length ? "" : "empty"} ${isCurrent ? "current" : ""}`} key={m}>
              <div className="factBoxHead">
                <span className="factBoxMonth">{monthFullLabel(m, getTxLang()).toUpperCase()} {m.slice(0, 4)}</span>
              </div>

              {b.rows.map((r) => (
                <div className="factBoxRow" key={r.id}>
                  <div className="factBoxRowTop">
                    <TextField className="factBoxLabel" value={r.label} list="factLabels" placeholder={tx("Tipo de jornada")}
                      onCommit={(v) => updateBox(m, (bx) => {
                        const row = bx.rows.find((x) => x.id === r.id); if (!row) return;
                        row.label = v;
                        if (!Number(row.rate)) { const lr = lastRateFor(v); if (lr) { row.rate = lr.rate; row.currency = lr.currency; } }
                      })} />
                    <button className="factBoxRowDel" title={tx("Quitar")} onClick={() => updateBox(m, (bx) => { bx.rows = bx.rows.filter((x) => x.id !== r.id); })}>✕</button>
                  </div>
                  <div className="factBoxCalc">
                    <NumField className="factBoxDays" value={r.days} placeholder="0" onCommit={(n) => updateBox(m, (bx) => { const row = bx.rows.find((x) => x.id === r.id); if (row) row.days = n; })} />
                    <span className="factMuted">{tx("días ×")}</span>
                    <NumField className="factBoxRate" value={r.rate} placeholder="0" onCommit={(n) => updateBox(m, (bx) => { const row = bx.rows.find((x) => x.id === r.id); if (row) row.rate = n; })} />
                    <button className={`curToggle ${curClass(rowCur(r, b))}`} title={tx("Moneda de esta jornada: {cur}", { cur: rowCur(r, b) })}
                      onClick={() => updateBox(m, (bx) => { const row = bx.rows.find((x) => x.id === r.id); if (row) row.currency = nextCur(rowCur(row, bx)); })}>{toggleSymbol(rowCur(r, b))}</button>
                    <span className="factBoxSub mono">{fmtMoney((Number(r.days) || 0) * (Number(r.rate) || 0), rowCur(r, b))}</span>
                  </div>
                </div>
              ))}

              <button className="factBoxAdd" onClick={() => addBoxRow(m)}>{tx("+ Agregar")}</button>

              {(totalCurs.length > 0 || linked.length > 0) && (
                <div className="factBoxFoot">
                  {totalCurs.length > 0 && (
                    <div className="factBoxTotals">
                      {totalCurs.map((c) => <div className="factBoxTotal mono" key={c}>{fmtMoney(totals[c], c)}</div>)}
                    </div>
                  )}
                  {linked.length > 0 && (
                    <div className={`factBoxStatus ${!b.rows.length ? "" : diffs.length ? "warn" : "ok"}`}>
                      {b.rows.length && !diffs.length ? "✓ " : ""}{tx("Facturado en {months}", { months: billMonths.join(", ") })}
                      {diffs.map((x) => <span key={x.c}> · {x.d > 0 ? tx("faltan") : tx("sobran")} {fmtMoney(Math.abs(x.d), x.c)}</span>)}
                    </div>
                  )}
                  {linked.length === 0 && totalCurs.length > 0 && (
                    <button className="factBoxInvoiceBtn" onClick={() => createInvoicesFromBox(m)}>
                      {totalCurs.length > 1 ? tx("Crear {n} facturas (una por moneda) en {month} →", { n: totalCurs.length, month: (getTxLang() === "en" ? monthFullLabel(shiftMonth(m, 1), "en") : monthFullLabel(shiftMonth(m, 1), "es").toLowerCase()) }) : tx("Crear factura en {month} →", { month: (getTxLang() === "en" ? monthFullLabel(shiftMonth(m, 1), "en") : monthFullLabel(shiftMonth(m, 1), "es").toLowerCase()) })}
                    </button>
                  )}
                  {linked.length > 0 && missingCurs.length > 0 && (
                    <button className="factBoxInvoiceBtn" onClick={() => createInvoicesFromBox(m, missingCurs)}>
                      {tx("Crear factura en {curs} →", { curs: missingCurs.map((c) => (c === "ARS" ? tx("pesos") : c === "USD" ? tx("dólares") : tx("euros"))).join(tx(" y ")) })}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {invMenu && (() => {
        const inv = F.invoices.find((x) => x.id === invMenu.id);
        if (!inv) return null;
        return (
          <div className="cellMenu" style={{ left: invMenu.x, top: invMenu.y }} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
            <button className="cellMenuItem" onClick={() => { toggleUncollected(inv.id); setInvMenu(null); }}>
              {inv.uncollected ? <><span className="cellMenuIcon paid">✓</span>{tx("Marcar como cobrado")}</> : <><span className="cellMenuIcon unpaid" />{tx("Marcar como no cobrado")}</>}
            </button>
            <button className="cellMenuItem" onClick={() => { updateInvoice(inv.id, (x) => { x.fav = !x.fav; }); setInvMenu(null); }}>
              <span className="cellMenuIcon">{inv.fav ? "☆" : "★"}</span>{inv.fav ? tx("Quitar de favoritas") : tx("Marcar como favorita")}
            </button>
          </div>
        );
      })()}
      {showTopes && (
        <TopesModal
          F={F}
          onClose={() => setShowTopes(false)}
          onSave={(topes, vigencia) => { update((d) => { d.topes = topes; d.topesVigencia = vigencia; }); setShowTopes(false); }}
        />
      )}
    </div>
  );
}

function TopesModal({ F, onClose, onSave }) {
  const [vals, setVals] = useState(() => Object.fromEntries(CATS.map((c) => [c, Number(F.topes?.[c]) ? fmt2(F.topes[c]) : ""])));
  const [vigencia, setVigencia] = useState(F.topesVigencia || "");
  function restore() {
    setVals(Object.fromEntries(CATS.map((c) => [c, fmt2(DEFAULT_TOPES[c])])));
    setVigencia(DEFAULT_TOPES_VIGENCIA);
  }
  function save() {
    const topes = Object.fromEntries(CATS.map((c) => [c, parseCellInput(vals[c])]));
    onSave(topes, vigencia.trim());
  }
  return (
    <div className="gx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gx-modal-box factTopesModal">
        <strong className="gx-enc-title">{tx("Topes del monotributo")}</strong>
        <div className="hint factTopesHint">{tx("Ingresos brutos anuales máximos por categoría. ARCA los actualiza en febrero y agosto.")}</div>
        <div className="factTopesList">
          {CATS.map((c) => (
            <label className="factTopeRow" key={c}>
              <span className="factTopeCat">{c}</span>
              <span className="factMuted">$</span>
              <input className="mono" value={vals[c]} inputMode="decimal" onChange={(e) => setVals({ ...vals, [c]: e.target.value })} />
            </label>
          ))}
        </div>
        <label className="factTopeRow factVigencia">
          <span className="factMuted">{tx("Vigentes desde")}</span>
          <input value={vigencia} onChange={(e) => setVigencia(e.target.value)} placeholder={tx("Ej: Agosto 2026")} />
        </label>
        <div className="gx-modal-actions">
          <button className="pillBtn" onClick={restore}>{tx("Restaurar agosto 2026")}</button>
          <span className="spacer" />
          <button className="gx-enc-cancel" onClick={onClose}>{tx("Cancelar")}</button>
          <button className="primaryTop" onClick={save}>{tx("Guardar")}</button>
        </div>
      </div>
    </div>
  );
}
