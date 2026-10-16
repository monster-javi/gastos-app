import React, { useRef, useState } from "react";
import { usePersistentState } from "../uiState.js";
import { tx, txn } from "../tx.js";
import { normalize, parseAmount, uid, bridgeConvert, round2, fmtInt, parseCellInput } from "../utils.js";

// Column each group sits in, kept between renders (reset when the month or filter changes).
const stableCols = { ctx: null, map: {} };

export default function ListaView({ ctx }) {
  const {
    t, lang, entryTab, setEntryTab, selectedMonth, monthLabel,
    transactions, setTransactions, saveTransactions,
    sections, allSubcatsFlat, findSubcat, findSectionOf, sectionColor,
    filterSubcat, setFilterSubcat, hideCategorized, searchTerm, money,
    guessCategory, showConfirmModal, showAlertModal,
    cellData, setCellData, saveCellData, getCell, showChoiceModal,
    setSections, saveSections, learnedKeywordCap,
    primaryCurrency, getDolarRate, getEuroRate,
  } = ctx;

  const freeTextRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mapping, setMapping] = useState(null); // {headers, rawRows, filename, colDesc, colAmt, hasHeader}
  const [openGroups, setOpenGroups] = usePersistentState("lista.collapsedGroups", {}); // id -> collapsed bool (default open)
  const [editingNote, setEditingNote] = useState(null); // idx
  const [pickingRubro, setPickingRubro] = useState({}); // idx -> chosen sectionId while picking
  // Per-subrubro "convertir todo a X" override: when on, approving (✓ or "Aprobar
  // todo") for that subrubro skips the currency question entirely and always
  // converts into the chosen currency. Lives only in this view's session state —
  // it's a one-off shortcut, not a saved setting for the category.
  const [groupOverride, setGroupOverride] = useState({}); // subId -> { on, currency }

  function processFreeText() {
    const raw = freeTextRef.current?.value || "";
    if (!raw.trim()) return;
    const chunks = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const additions = [];
    chunks.forEach((chunk) => {
      const m = chunk.match(/(-?\$?\s?\d[\d.,]*)\s*$/);
      if (!m) return;
      const amount = parseAmount(m[1]);
      if (isNaN(amount) || amount === 0) return;
      const desc = chunk.slice(0, m.index).trim() || chunk;
      additions.push({ desc, amount, currency: null, source: "texto libre", catId: guessCategory(desc), method: "manual", note: "", month: selectedMonth });
    });
    if (freeTextRef.current) freeTextRef.current.value = "";
    if (!additions.length) return;
    const next = [...transactions, ...additions];
    setTransactions(next);
    saveTransactions(next);
  }
  function assignCategory(idx, catId) {
    const tr = transactions[idx];
    const next = transactions.map((t, i) => (i === idx ? { ...t, catId } : t));
    setTransactions(next);
    saveTransactions(next);
    setPickingRubro((p) => { const n = { ...p }; delete n[idx]; return n; });
    learnKeyword(tr?.desc, catId);
  }
  // Every time something gets categorized BY HAND, teach that merchant's exact
  // description to the chosen subcategory as a new "learned" keyword — so next
  // time it (or a file import, or a statement Claude loads) shows up with the
  // same description, guessCategory() catches it on its own.
  // These learned keywords are kept separate from the ones you curate by hand
  // (sc.keywords, untouched here) and capped at LEARNED_KEYWORD_CAP per
  // subcategory: once full, the oldest learned one is dropped to make room for
  // the new one, so this never grows into an unbounded pile of one-off merchant
  // strings.
  // These learned keywords are kept separate from the ones you curate by hand
  // (sc.keywords, untouched here) and capped at learnedKeywordCap (configurable
  // in Settings, default 40) per subcategory: once full, the oldest learned one
  // is dropped to make room for the new one, so this never grows into an
  // unbounded pile of one-off merchant strings.
  function learnKeyword(desc, catId) {
    if (!desc || !catId) return;
    const kw = normalize(desc);
    if (!kw) return;
    if (guessCategory(desc) === catId) return;
    const cap = learnedKeywordCap || 40;
    // The same merchant string can only point to ONE subcategory: the latest
    // hand correction wins, so it's removed from wherever it was learned before.
    const nextSections = sections.map((sec) => ({
      ...sec,
      subcats: sec.subcats.map((sc) => {
        if (sc.id !== catId) {
          const lk = sc.learnedKeywords || [];
          return lk.some((k) => normalize(k) === kw) ? { ...sc, learnedKeywords: lk.filter((k) => normalize(k) !== kw) } : sc;
        }
        const curated = sc.keywords || [];
        if (curated.some((k) => normalize(k) === kw)) return sc;
        const learned = sc.learnedKeywords || [];
        if (learned.some((k) => normalize(k) === kw)) return sc;
        let nextLearned = [...learned, kw];
        if (nextLearned.length > cap) nextLearned = nextLearned.slice(nextLearned.length - cap);
        return { ...sc, learnedKeywords: nextLearned };
      }),
    }));
    setSections(nextSections);
    saveSections(nextSections);
  }
  function clearCategory(idx) {
    const next = transactions.map((tr, i) => (i === idx ? { ...tr, catId: null } : tr));
    setTransactions(next);
    saveTransactions(next);
    setPickingRubro((p) => { const n = { ...p }; delete n[idx]; return n; });
  }

  function handleFile(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const XLSX = await import("xlsx");
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
      if (!rawRows.length) { showAlertModal(t("couldNotRead")); return; }
      const headers = rawRows[0].map((h, i) => (h !== undefined && h !== "" ? String(h) : tx("Columna {n}", { n: i + 1 })));
      let colDesc = 0, colAmt = 0;
      headers.forEach((h, i) => {
        const H = normalize(h);
        if (/DESC|DETALLE|COMERCIO|CONCEPTO/.test(H)) colDesc = i;
        if (/IMPORTE|MONTO|VALOR|TOTAL/.test(H)) colAmt = i;
      });
      setMapping({ headers, rawRows, filename: file.name, colDesc, colAmt, hasHeader: "yes" });
    };
    reader.readAsArrayBuffer(file);
  }

  function importRows() {
    if (!mapping) return;
    const { rawRows, colDesc, colAmt, hasHeader, filename } = mapping;
    const startRow = hasHeader === "yes" ? 1 : 0;
    const additions = [];
    for (let r = startRow; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row) continue;
      const desc = row[colDesc];
      const amount = parseAmount(row[colAmt]);
      if (!desc || isNaN(amount) || amount === 0) continue;
      additions.push({ desc: String(desc), amount, currency: null, source: filename, catId: guessCategory(String(desc)), method: "auto", note: "", month: selectedMonth });
    }
    const next = [...transactions, ...additions];
    setTransactions(next);
    saveTransactions(next);
    setMapping(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function editNote(idx, value) {
    const next = transactions.map((tr, i) => (i === idx ? { ...tr, note: value.trim() } : tr));
    setTransactions(next);
    saveTransactions(next);
    setEditingNote(null);
  }
  function editAmount(idx, value) {
    const n = parseCellInput(value);
    const next = transactions.map((tr, i) => (i === idx ? { ...tr, amount: isNaN(n) ? 0 : n } : tr));
    setTransactions(next);
    saveTransactions(next);
  }
  function deleteTxn(idx) {
    const next = transactions.filter((_, i) => i !== idx);
    setTransactions(next);
    saveTransactions(next);
  }
  function curSymbol(c) { return c === "USD" ? "$" : c === "EUR" ? "€" : "$"; }
  function curClass(c) {
    if (!c) return "";
    return c === "USD" ? "usd" : c === "EUR" ? "eur" : "ars";
  }
  // Same 3-state cycle as the planilla anual's own currency toggle: null (=
  // whatever the primary currency is) -> the other two currencies -> back to null.
  function toggleTxCurrency(idx) {
    const others = ["ARS", "USD", "EUR"].filter((c) => c !== primaryCurrency);
    const next = transactions.map((tr, i) => {
      if (i !== idx) return tr;
      let currency;
      if (tr.currency === others[0]) currency = others[1];
      else if (tr.currency === others[1]) currency = null;
      else currency = others[0];
      return { ...tr, currency };
    });
    setTransactions(next);
    saveTransactions(next);
  }
  // Folds one or more amounts into a planilla cell in an EXACT target currency
  // (no conversion decision made here — that's already been resolved by
  // attemptFold before this runs). Anything not already in targetCur gets
  // converted via bridgeConvert; same-currency items pass through untouched.
  function foldIntoCellAtCurrency(catId, month, items, targetCur) {
    const cell = getCell(month, catId);
    let base, baseFormula;
    if (cell?.formula) {
      base = round2(cell.value);
      baseFormula = cell.formula;
    } else if (cell) {
      base = round2(cell.value);
      baseFormula = null; // plain manual value (possibly 0) — no formula yet
    } else {
      base = 0;
      baseFormula = null;
    }
    const dolarRate = getDolarRate(month), euroRate = getEuroRate(month);
    // Keep every item as its own term in the formula (never pre-summed into one
    // lump number) — so "Aprobar todo" reads exactly like approving one by one,
    // e.g. "=5000+3000+1200", and you can always tell what made up the total.
    const amounts = items.map((it) => round2(bridgeConvert(Number(it.amount) || 0, it.currency || primaryCurrency, targetCur, dolarRate, euroRate)));
    const sumToAdd = round2(amounts.reduce((a, n) => a + n, 0));
    const addedTerms = amounts.map((n) => `+${n}`).join("");
    let newFormula, newValue;
    if (baseFormula) {
      newFormula = `${baseFormula}${addedTerms}`;
      newValue = round2(base + sumToAdd);
    } else if (base) {
      newFormula = `=${base}${addedTerms}`;
      newValue = round2(base + sumToAdd);
    } else {
      // Nothing there before (or it was exactly 0): starts as its own formula,
      // term by term, so the breakdown is visible from the very first one.
      newFormula = `=${amounts[0]}${amounts.slice(1).map((n) => `+${n}`).join("")}`;
      newValue = sumToAdd;
    }
    // A plain-primary result is stored as currency:null (same convention the
    // planilla itself uses); anything else keeps its own explicit currency tag,
    // shown with the colored $/€ toggle, exactly like a manually-typed cell.
    const cellCurrency = targetCur === primaryCurrency ? null : targetCur;
    // Keep the "why" of each term: description, note and origin of every
    // approved movement, so the planilla can later show where the number came
    // from ("Ver detalles" on right-click). Same order as the added terms.
    const approvedAt = new Date().toISOString();
    const breakdown = items.map((it, i) => ({
      amount: amounts[i],
      desc: it.desc || "",
      note: it.note || "",
      source: it.source || "",
      method: it.method || "",
      ...((it.currency || primaryCurrency) !== targetCur ? { origAmount: Number(it.amount) || 0, origCurrency: it.currency || primaryCurrency } : {}),
      approvedAt,
    }));
    const nextCellData = { ...cellData, [month]: { ...(cellData[month] || {}) } };
    nextCellData[month][catId] = {
      value: newValue,
      currency: cellCurrency,
      formula: newFormula,
      enteredCurrency: cellCurrency ? undefined : primaryCurrency,
      ...(cell?.unpaid ? { unpaid: true } : {}),
      items: [...(cell?.items || []), ...breakdown],
    };
    setCellData(nextCellData);
    saveCellData(nextCellData);
  }
  function curLabel(c) { return c === "USD" ? "USD" : c === "EUR" ? "EUR" : tx("pesos"); }
  function getGroupOverride(subId) { return groupOverride[subId] || { on: false, currency: null }; }
  function toggleGroupOverrideOn(subId) {
    setGroupOverride((p) => ({ ...p, [subId]: { ...getGroupOverride(subId), on: !getGroupOverride(subId).on } }));
  }
  function cycleGroupOverrideCurrency(subId) {
    const others = ["ARS", "USD", "EUR"].filter((c) => c !== primaryCurrency);
    setGroupOverride((p) => {
      const cur = getGroupOverride(subId).currency;
      let next;
      if (cur === others[0]) next = others[1];
      else if (cur === others[1]) next = null;
      else next = others[0];
      return { ...p, [subId]: { ...getGroupOverride(subId), currency: next } };
    });
  }
  // Decides WHICH currency a bake should land in, asking the person when it's
  // ambiguous, then folds and runs afterCommit() (which removes the baked rows
  // from the list) once the currency is settled.
  function attemptFold(catId, month, items, afterCommit) {
    const cell = getCell(month, catId);
    const itemCurs = [...new Set(items.map((it) => it.currency || primaryCurrency))];
    if (cell) {
      // A currency is already established for this cell — that's the anchor.
      const cellCur = cell.currency || primaryCurrency;
      const mismatched = itemCurs.filter((c) => c !== cellCur);
      if (mismatched.length) {
        const msg = items.length > 1
          ? tx("Esta celda de la planilla ya tiene un monto cargado en {cell}. Algunos de estos gastos están en {items}. ¿Convertirlos a {cell} y sumarlos?", { cell: curLabel(cellCur), items: mismatched.map(curLabel).join(" / ") })
          : tx("Esta celda de la planilla ya tiene un monto cargado en {cell}. Este gasto está en {item}. ¿Convertirlo a {cell} y sumarlo?", { cell: curLabel(cellCur), item: curLabel(itemCurs[0]) });
        showConfirmModal(msg, () => { foldIntoCellAtCurrency(catId, month, items, cellCur); afterCommit(); });
        return;
      }
      foldIntoCellAtCurrency(catId, month, items, cellCur);
      afterCommit();
      return;
    }
    // No manual/baked value yet — nothing to anchor to.
    if (itemCurs.length === 1) {
      // Single currency involved: the cell simply adopts it, no conversion at all.
      foldIntoCellAtCurrency(catId, month, items, itemCurs[0]);
      afterCommit();
      return;
    }
    // Mixed currencies with no established cell currency: ask which one to
    // standardize on for this cell going forward.
    const options = itemCurs.map((c) => ({ label: tx("Todo a {cur}", { cur: curLabel(c) }), value: c }));
    showChoiceModal(
      tx("Estos gastos están en distintas monedas. ¿A qué moneda los sumo en la planilla?"),
      options,
      (chosenCur) => { foldIntoCellAtCurrency(catId, month, items, chosenCur); afterCommit(); }
    );
  }
  function bakeIntoTotal(idx) {
    const tr = transactions[idx];
    if (!tr.catId) return;
    const finish = () => {
      // The amount now lives permanently in the planilla — remove it from this
      // list so it can never accidentally get baked in twice.
      const next = transactions.filter((_, i) => i !== idx);
      setTransactions(next);
      saveTransactions(next);
    };
    const ov = getGroupOverride(tr.catId);
    if (ov.on) { foldIntoCellAtCurrency(tr.catId, tr.month, [tr], ov.currency || primaryCurrency); finish(); return; }
    attemptFold(tr.catId, tr.month, [tr], finish);
  }
  // "Aprobar todo": bakes every pending, categorized transaction of one subrubro
  // (for the month currently open) into the planilla in a single step, instead of
  // clicking the ✓ on each row one by one.
  function approveGroup(subId) {
    if (!subId) return;
    const monthRows = transactions.filter((tr) => tr.catId === subId && tr.month === selectedMonth);
    if (!monthRows.length) return;
    const finish = () => {
      const next = transactions.filter((tr) => !(tr.catId === subId && tr.month === selectedMonth));
      setTransactions(next);
      saveTransactions(next);
    };
    const ov = getGroupOverride(subId);
    if (ov.on) { foldIntoCellAtCurrency(subId, selectedMonth, monthRows, ov.currency || primaryCurrency); finish(); return; }
    attemptFold(subId, selectedMonth, monthRows, finish);
  }

  function isCategorized(tr) {
    return !!(tr.catId && findSubcat(tr.catId));
  }

  const unassignedMode = filterSubcat === "__unassigned__";
  const monthAll = transactions.map((tr, i) => ({ ...tr, _idx: i })).filter((tr) => tr.month === selectedMonth);
  let list = monthAll;
  if (unassignedMode) list = list.filter((tr) => !isCategorized(tr));
  else if (filterSubcat) list = list.filter((tr) => tr.catId === filterSubcat);
  if (hideCategorized) list = list.filter((tr) => !isCategorized(tr));
  if (searchTerm.trim()) list = list.filter((tr) => normalize(tr.desc).includes(normalize(searchTerm)));

  // ---- summary (always over the whole month, not the filtered view) ----
  const toPrimary = (tr) => bridgeConvert(Number(tr.amount) || 0, tr.currency || primaryCurrency, primaryCurrency, getDolarRate(tr.month), getEuroRate(tr.month));
  const pendingTotal = monthAll.reduce((a, tr) => a + toPrimary(tr), 0);
  const uncats = monthAll.filter((tr) => !isCategorized(tr));
  const uncatTotal = uncats.reduce((a, tr) => a + toPrimary(tr), 0);
  const sources = [];
  monthAll.forEach((tr) => {
    const k = originKind(tr);
    const s = k === "manual" ? tx("Cargados manualmente") : k === "ia" ? tx("{source} (IA)", { source: tr.source }) : (tr.source || tx("Sin origen"));
    const found = sources.find((x) => x.name === s);
    if (found) found.count++; else sources.push({ name: s, count: 1 });
  });

  // Uncategorized first (it's what needs attention), then subrubros in planilla order.
  let groupSubIds;
  if (unassignedMode) groupSubIds = [null];
  else if (filterSubcat) groupSubIds = [filterSubcat];
  else groupSubIds = [null, ...allSubcatsFlat().map((sc) => sc.id)];

  // Same "convertir todo" override as before, folded into one chip that cycles
  // auto → primary → other currencies → auto.
  const curSeq = ["auto", primaryCurrency, ...["ARS", "USD", "EUR"].filter((c) => c !== primaryCurrency)];
  function overrideLabel(subId) {
    const ov = getGroupOverride(subId);
    if (!ov.on) return "auto";
    return ov.currency || primaryCurrency;
  }
  function cycleOverride(subId) {
    const cur = overrideLabel(subId);
    const next = curSeq[(curSeq.indexOf(cur) + 1) % curSeq.length];
    setGroupOverride((p) => ({ ...p, [subId]: next === "auto" ? { on: false, currency: null } : { on: true, currency: next } }));
  }
  const curName = (c) => (c === "USD" ? "US$" : c === "EUR" ? "€" : "$");

  // Small origin tag: typed by hand, loaded by Claude from a statement (IA),
  // or imported from a file. Older Claude loads were saved as method "auto"
  // with a statement name (not a filename) as source — treated as IA too.
  function originKind(tr) {
    if (tr.method === "manual") return "manual";
    if (tr.method === "ia") return "ia";
    if (tr.source && !/\.(csv|xlsx?|xls)$/i.test(tr.source)) return "ia";
    return "archivo";
  }
  function originTag(tr) {
    const k = originKind(tr);
    const label = k === "manual" ? tx("manual") : k === "ia" ? tx("IA") : tx("archivo");
    return <span className={`lstTag ${k}`} title={tr.source ? tx("Origen: {source}", { source: tr.source }) : undefined}>{label}</span>;
  }

  function categorySelect(tr, catOk) {
    return (
      <select
        className={`lstCatSelect ${catOk ? "" : "needs"}`}
        value={catOk ? tr.catId : ""}
        onChange={(e) => (e.target.value ? assignCategory(tr._idx, e.target.value) : clearCategory(tr._idx))}
        title={catOk ? tx("Mover a otra categoría") : tx("Elegir categoría")}
      >
        <option value="">{catOk ? tx("Sin categoría") : tx("Elegir categoría…")}</option>
        {sections.map((s) => (
          <optgroup label={s.name} key={s.id}>
            {s.subcats.map((sc) => <option value={sc.id} key={sc.id}>{sc.name}</option>)}
          </optgroup>
        ))}
      </select>
    );
  }

  return (
    <div className="lstWrap">
      {/* ---- resumen ---- */}
      <div className="factCards lstCards">
        <div className="factCard">
          <div className="factCardLabel">{tx("PENDIENTE DE APROBAR")} · {monthLabel(selectedMonth, lang).toUpperCase()}</div>
          <div className="factCardValue mono">{money(pendingTotal, selectedMonth)}</div>
          <div className="factCardSub">{txn(monthAll.length, "{n} movimiento", "{n} movimientos")}</div>
        </div>
        <div
          className={`factCard lstUncatCard ${uncats.length ? "has" : ""} ${unassignedMode ? "on" : ""}`}
          onClick={() => uncats.length && setFilterSubcat(unassignedMode ? null : "__unassigned__")}
          title={uncats.length ? (unassignedMode ? tx("Ver todo") : tx("Ver solo los sin categorizar")) : undefined}
        >
          <div className="factCardLabel">{tx("SIN CATEGORIZAR")}</div>
          <div className="factCardValue mono">{uncats.length ? money(uncatTotal, selectedMonth) : "—"}</div>
          <div className="factCardSub">{uncats.length ? tx("{n} para asignar", { n: uncats.length }) + (unassignedMode ? tx(" · mostrando solo estos") : "") : tx("Todo categorizado ✓")}</div>
        </div>
        <div className="factCard">
          <div className="factCardLabel">{tx("ORIGEN")}</div>
          {sources.length ? (
            <div className="lstSources">
              {sources.slice(0, 3).map((s) => (
                <div className="lstSource" key={s.name}><span className="factEllipsis">{s.name}</span><span className="factMuted">{s.count}</span></div>
              ))}
              {sources.length > 3 && <div className="factMuted">{tx("+ {n} más", { n: sources.length - 3 })}</div>}
            </div>
          ) : <div className="factCardSub">{tx("Nada cargado todavía.")}</div>}
        </div>
      </div>

      {/* ---- carga ---- */}
      <div className="lstEntry">
        <div className="factSeg">
          <button className={entryTab === "texto" ? "on" : ""} onClick={() => setEntryTab("texto")}>{t("textTab")}</button>
          <button className={entryTab === "archivo" ? "on" : ""} onClick={() => setEntryTab("archivo")}>{t("fileTab")}</button>
        </div>
        {entryTab === "texto" ? (
          <>
            <input
              ref={freeTextRef}
              className="lstEntryInput"
              placeholder={tx("Ej: super 15000, nafta 8000 — se carga en {month}", { month: monthLabel(selectedMonth, lang) })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); processFreeText(); } }}
            />
            <button className="primaryTop" onClick={processFreeText}>{t("process")}</button>
          </>
        ) : (
          <>
            <button className="lstDrop" onClick={() => fileInputRef.current?.click()}>
              <strong>{t("fileClick")}</strong> <span className="factMuted">.csv / .xlsx — {t("fileHint")} {monthLabel(selectedMonth, lang)}</span>
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
          </>
        )}
      </div>
      {entryTab === "archivo" && mapping && (
        <div className="lstMapping">
          <div className="factMuted" style={{ marginBottom: 8 }}>{mapping.filename}</div>
          <div className="mapGrid">
            <div>
              <label>{t("colDesc")}</label>
              <select value={mapping.colDesc} onChange={(e) => setMapping({ ...mapping, colDesc: parseInt(e.target.value) })}>
                {mapping.headers.map((h, i) => <option value={i} key={i}>{h}{mapping.rawRows[1] && mapping.rawRows[1][i] !== undefined ? " — " + tx("ej:") + " " + String(mapping.rawRows[1][i]).slice(0, 18) : ""}</option>)}
              </select>
            </div>
            <div>
              <label>{t("colAmt")}</label>
              <select value={mapping.colAmt} onChange={(e) => setMapping({ ...mapping, colAmt: parseInt(e.target.value) })}>
                {mapping.headers.map((h, i) => <option value={i} key={i}>{h}{mapping.rawRows[1] && mapping.rawRows[1][i] !== undefined ? " — " + tx("ej:") + " " + String(mapping.rawRows[1][i]).slice(0, 18) : ""}</option>)}
              </select>
            </div>
            <div>
              <label>{t("hasHeader")}</label>
              <select value={mapping.hasHeader} onChange={(e) => setMapping({ ...mapping, hasHeader: e.target.value })}>
                <option value="yes">{t("yes")}</option>
                <option value="no">{t("no")}</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="pillBtn" onClick={() => { setMapping(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>{tx("Cancelar")}</button>
            <button className="primaryTop" onClick={importRows}>{t("importBtn")}</button>
          </div>
        </div>
      )}

      {/* ---- grupos ---- */}
      {monthAll.length === 0 && (
        <div className="debtEmpty">{tx("No hay movimientos pendientes en {month}. Cargalos arriba, con texto o desde un archivo.", { month: monthLabel(selectedMonth, lang) })}</div>
      )}
      {(() => {
        const renderGroup = (subId) => {
          const sc = subId ? findSubcat(subId) : null;
          const sec = subId ? findSectionOf(subId) : null;
          const secIdx = sec ? sections.findIndex((s) => s.id === sec.id) : -1;
          const color = sc ? sectionColor(secIdx) : "var(--amber)";
          const rows = list.filter((tr) => (subId ? isCategorized(tr) && tr.catId === subId : !isCategorized(tr)));
          if (rows.length === 0 && !(filterSubcat && subId === filterSubcat)) return null;
          const groupTotal = rows.reduce((a, tr) => a + toPrimary(tr), 0);
          const gid = subId || "none";
          const collapsed = !!openGroups[gid];
          const ov = subId ? overrideLabel(subId) : "auto";

          return (
            <div className={`lstGroup ${subId ? "" : "uncat"}`} key={gid}>
              <div className="lstGroupHead" style={{ "--chip": color }} onClick={() => setOpenGroups((p) => ({ ...p, [gid]: !p[gid] }))}>
                <span className="factChev">{collapsed ? "▸" : "▾"}</span>
                <span className="lstGroupBar" style={{ background: color }} />
                <span className="lstGroupName">
                  {sc ? sc.name : tx("Sin categorizar")}
                  {sec && <span className="lstGroupSec">{sec.name}</span>}
                </span>
                <span className="factMonthCount">{rows.length}</span>
                <span className="spacer" />
                <span className="lstGroupTotal mono">{money(groupTotal, selectedMonth)}</span>
                {subId && rows.length > 0 && (
                  <span className="lstGroupActions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`lstCurChip ${ov !== "auto" ? "on" : ""}`}
                      onClick={() => cycleOverride(subId)}
                      title={tx("Moneda en la que se suma a la planilla al aprobar: auto (pregunta si hace falta) o forzar una moneda")}
                    >
                      {tx("Sumar en: {cur}", { cur: ov === "auto" ? tx("auto") : curName(ov) })}
                    </button>
                    <button className="lstApproveAll" onClick={() => approveGroup(subId)} title={tx("Aprobar todos los movimientos de este subrubro y sumarlos a la planilla")}>
                      {rows.length > 1 ? tx("✓ Aprobar los {n}", { n: rows.length }) : tx("✓ Aprobar")}
                    </button>
                  </span>
                )}
              </div>
              {!collapsed && (
                <div className="lstRows">
                  {rows.length === 0 && <div className="emptyGroup">{t("noMovs")} {monthLabel(selectedMonth, lang)}</div>}
                  {rows.map((tr) => {
                    const catOk = isCategorized(tr);
                    return (
                      <div className="lstRow" key={tr._idx}>
                        <div className="lstMain">
                          <div className="lstDesc" title={tr.source ? tx("Origen: {source}", { source: tr.source }) : undefined}>
                            <span className="lstDescTxt">{tr.desc}</span>
                            {originTag(tr)}
                          </div>
                          {editingNote === tr._idx ? (
                            <input
                              className="lstNoteInput"
                              autoFocus
                              placeholder={tx("Nota")}
                              defaultValue={tr.note || ""}
                              onBlur={(e) => editNote(tr._idx, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingNote(null); }}
                            />
                          ) : tr.note ? (
                            <div className="lstNote filled" onClick={() => setEditingNote(tr._idx)} title={tx("Editar nota")}>{tr.note}</div>
                          ) : null}
                        </div>
                        <div className="lstAmount">
                          <input
                            className="mono"
                            defaultValue={round2(tr.amount) ? fmtInt(round2(tr.amount)) : ""}
                            key={tr._idx + "-" + tr.amount}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => {
                              editAmount(tr._idx, e.target.value);
                              const n = parseCellInput(e.target.value);
                              e.target.value = n ? fmtInt(n) : "";
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                          />
                          <button className={`curToggle ${curClass(tr.currency)}`} onClick={() => toggleTxCurrency(tr._idx)} title={tx("Cambiar la moneda de este gasto")}>{curSymbol(tr.currency || primaryCurrency)}</button>
                        </div>
                        <div className="lstCat" title={catOk ? tx("Mover a otra categoría") : tx("Elegir categoría")}><span className="lstCatIcon">⇄</span>{categorySelect(tr, catOk)}</div>
                        <div className="lstActs">
                          {!tr.note && editingNote !== tr._idx && <button className="lstNoteBtn" onClick={() => setEditingNote(tr._idx)} title={tx("Agregar nota")}>✎</button>}
                          <button className="rowDelete" onClick={() => deleteTxn(tr._idx)} title={tx("Borrar")}>✕</button>
                          <button className="lstOk" onClick={() => bakeIntoTotal(tr._idx)} disabled={!catOk} title={catOk ? tx("Aprobar: sumar a la planilla y sacarlo de la lista") : tx("Elegí una categoría para poder aprobar")}>✓</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        };
        // "Sin categorizar" goes full width on top (it's what needs attention);
        // the rest flows in two vertical columns of boxes.
        // Boxes fill left → right, then the next row (left, right…). "Sin
        // categorizar" is just the first box, highlighted.
        const boxes = groupSubIds.map(renderGroup).filter(Boolean);
        if (!boxes.length) return null;
        // Stable columns: each group keeps its column while you approve, so
        // emptying one only moves the groups below it in that same column.
        // First time: alternate left/right (same look as before). Groups that
        // show up later go to the shorter column.
        const ctxKey = selectedMonth + "|" + (unassignedMode ? "u" : filterSubcat || "");
        if (!stableCols.ctx || stableCols.ctx !== ctxKey) { stableCols.ctx = ctxKey; stableCols.map = {}; }
        const weight = (gid) => 2 + list.filter((tr) => (gid === "none" ? !isCategorized(tr) : isCategorized(tr) && tr.catId === gid)).length;
        const heights = [0, 0];
        boxes.forEach((b) => { const k = String(b.key); if (k in stableCols.map) heights[stableCols.map[k]] += weight(k); });
        const firstTime = !Object.keys(stableCols.map).length;
        boxes.forEach((b, i) => {
          const k = String(b.key);
          if (!(k in stableCols.map)) {
            const col = firstTime ? i % 2 : heights[1] < heights[0] ? 1 : 0;
            stableCols.map[k] = col;
            heights[col] += weight(k);
          }
        });
        const cols = [[], []];
        boxes.forEach((b, i) => cols[stableCols.map[String(b.key)]].push(<div className="lstColItem" style={{ order: i }} key={b.key}>{b}</div>));
        return (
          <div className="lstCols lstColsStable">
            <div className="lstColStack">{cols[0]}</div>
            <div className="lstColStack">{cols[1]}</div>
          </div>
        );
      })()}
    </div>
  );
}
