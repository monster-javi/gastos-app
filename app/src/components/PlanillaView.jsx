import { fmtDue } from "../alerts.js";
import DateButton from "./DatePicker.jsx";
import React, { useEffect, useRef, useState } from "react";
import { usePersistentState } from "../uiState.js";
import CellDetails from "./CellDetails.jsx";
import { History, RefreshCw, ChevronsDownUp, ChevronsUpDown, FoldHorizontal, UnfoldHorizontal, Download } from "lucide-react";
import { fmtInt, fmtRate, monAbbr, uid, PALETTE, normalize, shiftMonth } from "../utils.js";
import MobilePlanilla from "./MobilePlanilla.jsx";
import { tx, txn, getTxLang } from "../tx.js";

function MacroPanel({ ctx }) {
  const { t, macroTags, setMacroTags, saveMacroTags, allSubcatsFlat, sections, setSections, saveSections, setShowMacroPanel, showAlertModal, showConfirmModal } = ctx;
  const [newName, setNewName] = useState("");
  const [newInclude, setNewInclude] = useState(true);

  function renameMacroTag(id, name) {
    setMacroTags((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, name: name.trim() || m.name } : m));
      saveMacroTags(next);
      return next;
    });
  }
  function toggleInclude(id, checked) {
    setMacroTags((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, includeInTotal: checked } : m));
      saveMacroTags(next);
      return next;
    });
  }
  function toggleVisible(id, checked) {
    setMacroTags((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, visible: checked } : m));
      saveMacroTags(next);
      return next;
    });
  }
  function deleteTag(id) {
    if (macroTags.length <= 1) { showAlertModal(t("atLeastOneMethod")); return; }
    const affected = allSubcatsFlat().filter((sc) => sc.macro === id).length;
    const fallback = macroTags.find((m) => m.id !== id);
    const tagName = macroTags.find((m) => m.id === id)?.name;
    const msg = affected > 0
      ? txn(affected, "Hay {n} subcategoría usando este método. Se reasigna a \"{fallback}\". ¿Borrar de todas formas?", "Hay {n} subcategorías usando este método. Se reasignan a \"{fallback}\". ¿Borrar de todas formas?", { fallback: fallback.name })
      : tx("¿Borrar el método \"{name}\"?", { name: tagName });
    showConfirmModal(msg, () => {
      const nextSections = sections.map((sec) => ({ ...sec, subcats: sec.subcats.map((sc) => (sc.macro === id ? { ...sc, macro: fallback.id } : sc)) }));
      setSections(nextSections);
      saveSections(nextSections);
      const nextTags = macroTags.filter((m) => m.id !== id);
      setMacroTags(nextTags);
      saveMacroTags(nextTags);
    });
  }
  function addTag() {
    const name = newName.trim();
    if (!name) return;
    const color = PALETTE[macroTags.length % PALETTE.length];
    const next = [...macroTags, { id: uid(), name, color, includeInTotal: newInclude, visible: true }];
    setMacroTags(next);
    saveMacroTags(next);
    setNewName("");
    setNewInclude(true);
  }

  const rowGrid = { display: "grid", gridTemplateColumns: "10px 1fr 40px 40px 18px", alignItems: "center", gap: 6 };
  const chunkSize = Math.ceil(macroTags.length / 3) || 1;
  const columns = [[], [], []];
  macroTags.forEach((tag, i) => columns[Math.min(2, Math.floor(i / chunkSize))].push(tag));

  return (
    <div className="entryPanel" style={{ marginBottom: 16, maxWidth: 870 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>{t("methodsTitle")}</strong>
        <button className="miniBtn" onClick={() => setShowMacroPanel(false)}>{t("close")}</button>
      </div>
      <div style={{ display: "flex", gap: 28 }}>
        {columns.map((col, ci) => (
          <div key={ci} className="macroPanelCol">
            <div style={{ ...rowGrid, padding: "0 0 5px", borderBottom: "1px solid var(--border)", marginBottom: 3 }}>
              <span></span>
              <span className="hint" style={{ margin: 0, fontSize: 10 }}>{t("nameCol")}</span>
              <span className="hint" style={{ margin: 0, textAlign: "center", fontSize: 10 }}>{t("sumsCol")}</span>
              <span className="hint" style={{ margin: 0, textAlign: "center", fontSize: 10 }}>{t("visibleCol")}</span>
              <span></span>
            </div>
            {col.map((tag) => (
              <div key={tag.id} style={{ ...rowGrid, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: tag.color, flexShrink: 0 }}></span>
                <input
                  defaultValue={tag.name}
                  className="gx-inline-input small"
                  onBlur={(e) => renameMacroTag(tag.id, e.target.value)}
                />
                <input type="checkbox" defaultChecked={tag.includeInTotal} onChange={(e) => toggleInclude(tag.id, e.target.checked)} style={{ justifySelf: "center", width: 12, height: 12 }} />
                <input type="checkbox" defaultChecked={tag.visible !== false} onChange={(e) => toggleVisible(tag.id, e.target.checked)} style={{ justifySelf: "center", width: 12, height: 12 }} />
                <button className="miniBtn tiny" onClick={() => deleteTag(tag.id)} title={tx("Borrar")}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="macroPanelNewRow">
        <input
          placeholder={t("newMethodPlaceholder")}
          className="gx-inline-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <label className="macroPanelNewCheck">
          <input type="checkbox" checked={newInclude} onChange={(e) => setNewInclude(e.target.checked)} />
          {t("sumsCol")}
        </label>
        <button className="primaryTop" onClick={addTag}>{t("add")}</button>
      </div>
    </div>
  );
}

function PersonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <circle cx="7" cy="5" r="2.6" fill="currentColor" />
      <path d="M1.5 14.5c0-3 2.5-5.3 5.5-5.3s5.5 2.3 5.5 5.3" fill="currentColor" />
      <circle cx="14.5" cy="4.5" r="2.2" fill="currentColor" opacity="0.65" />
      <path d="M10.8 14.2c.3-2.6 2.2-4.6 4.6-4.6 2.5 0 4.5 2.1 4.6 4.8" fill="currentColor" opacity="0.65" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <line x1="5" y1="5.3" x2="11" y2="5.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="5" y1="10.7" x2="9" y2="10.7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", transform: "scale(1.35)" }}>
      <path d="M8 1.5c-2.2 0-4 1.7-4 4 0 3 4 8.5 4 8.5s4-5.5 4-8.5c0-2.3-1.8-4-4-4z" fill="currentColor" />
      <circle cx="8" cy="5.5" r="1.6" fill="var(--panel)" />
    </svg>
  );
}

export default function PlanillaView({ ctx }) {
  const {
    t, lang, sections, setSections, saveSections, macroTags, plannerYear, selectedMonth,
    showMacroPanel, setShowMacroPanel,
    dolarByMonth, eurByMonth, setDolarByMonth, setEurByMonth, saveDolar, saveEur,
    getDolarRate, getEuroRate, cellData, setCellData, saveCellData, getCell,
    finalValuePesos, finalValuePesosBase, effectiveCurrency, cellRawEntryValue, cellDisplayValue, displayToRaw, commonItemDisplayValue, commonItemDisplayToRaw, recalcOnCurrencyChange, autoSum, allSubcatsFlat, findSubcat,
    macroTotalByTag, totalGastos, money, sectionColor, findMacro,
    showPromptModal, showConfirmModal, setView, setFilterSubcat, hideZeros, planillaSearch, showFavoritesOnly, showUnpaidOnly, isMobile,
    isUnpaid, toggleUnpaid, pendingTotal,
  } = ctx;

  const [newSecName, setNewSecName] = useState("");
  const [addingSubFor, setAddingSubFor] = useState(null);
  const [showPersonTotals, setShowPersonTotals] = usePersistentState("planilla.showPersonTotals", {});
  const [copied, setCopied] = useState(false);
  const [showHistoric, setShowHistoric] = usePersistentState("planilla.showHistoric", false);
  const [activeCell, setActiveCell] = useState(null); // { subId, month }
  // Right-click menu on a planilla cell (currently: mark paid / not paid).
  const [cellMenu, setCellMenu] = useState(null); // { x, y, month, subId }
  const [cellDetail, setCellDetail] = useState(null); // { x, y, month, subId }

  // Exports the whole year (always the 12 months, not just the visible ones):
  // 1) the planilla as you see it, in the primary currency, with rubro subtotals
  // 2) every cell exactly as entered (own currency, formula, no pagado)
  // 3) the breakdown of approved movements (description, note, origin)
  async function exportPlanillaExcel() {
    const XLSX = await import("xlsx");
    const pc = ctx.primaryCurrency || "ARS";
    const xl = getTxLang();
    const H = {
      mes: tx("Mes"), rubro: tx("Rubro"), sub: tx("Subcategoría"), valor: tx("Valor"), moneda: tx("Moneda"),
      equiv: tx("Equivalente {pc}", { pc }), formula: tx("Fórmula"), noPagado: tx("No pagado"), monto: tx("Monto"),
      desc: tx("Descripción"), nota: tx("Nota"), origen: tx("Origen"), original: tx("Original"), aprobado: tx("Aprobado"),
    };
    const ym = Array.from({ length: 12 }, (_, i) => `${plannerYear}-${String(i + 1).padStart(2, "0")}`);
    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const head = [tx("Rubro"), tx("Subcategoría"), tx("Método de pago"), ...ym.map((m) => monAbbr(parseInt(m.slice(5)) - 1, xl)), tx("Total")];
    const aoa = [head];
    sections.forEach((sec) => {
      const secVals = ym.map((m) => r2(sec.subcats.reduce((a, sc) => a + finalValuePesos(sc.id, m), 0)));
      aoa.push([sec.name, "", "", ...secVals.map((v) => v || null), r2(secVals.reduce((a, b) => a + b, 0)) || null]);
      sec.subcats.forEach((sc) => {
        const vals = ym.map((m) => r2(finalValuePesos(sc.id, m)));
        aoa.push(["", sc.name, findMacro(sc.macro)?.name || "", ...vals.map((v) => v || null), r2(vals.reduce((a, b) => a + b, 0)) || null]);
      });
    });
    const tot = ym.map((m) => r2(totalGastos(m)));
    aoa.push([tx("TOTAL GASTOS"), "", "", ...tot, r2(tot.reduce((a, b) => a + b, 0))]);
    const ws1 = XLSX.utils.aoa_to_sheet(aoa);
    ws1["!cols"] = [{ wch: 18 }, { wch: 24 }, { wch: 18 }, ...ym.map(() => ({ wch: 13 })), { wch: 14 }];

    const cellsRows = [];
    const itemRows = [];
    ym.forEach((m) => sections.forEach((sec) => sec.subcats.forEach((sc) => {
      const c = getCell(m, sc.id);
      if (!c || !(Number(c.value) || c.formula)) return;
      const mes = `${monAbbr(parseInt(m.slice(5)) - 1, xl)} ${m.slice(0, 4)}`;
      cellsRows.push({
        [H.mes]: mes, [H.rubro]: sec.name, [H.sub]: sc.name,
        [H.valor]: r2(c.value), [H.moneda]: c.currency || pc, [H.equiv]: r2(finalValuePesosBase(sc.id, m)),
        [H.formula]: c.formula || "", [H.noPagado]: c.unpaid ? tx("Sí") : "",
      });
      (c.items || []).forEach((it) => itemRows.push({
        [H.mes]: mes, [H.rubro]: sec.name, [H.sub]: sc.name, [H.monto]: r2(it.amount), [H.moneda]: c.currency || pc,
        [H.desc]: it.desc || "", [H.nota]: it.note || "", [H.origen]: it.source || "",
        [H.original]: it.origAmount != null ? `${it.origCurrency} ${it.origAmount}` : "",
        [H.aprobado]: it.approvedAt ? new Date(it.approvedAt).toLocaleDateString(xl === "en" ? "en-US" : "es-AR") : "",
      }));
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, tx("Planilla {year} ({pc})", { year: plannerYear, pc }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cellsRows.length ? cellsRows : [{ Info: tx("Sin datos") }]), tx("Celdas"));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows.length ? itemRows : [{ Info: tx("Todavía no hay movimientos aprobados con detalle") }]), tx("Detalle de movimientos"));
    XLSX.writeFile(wb, `planilla_${plannerYear}.xlsx`);
  }
  useEffect(() => {
    if (!cellDetail) return;
    const close = () => setCellDetail(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("resize", close); };
  }, [cellDetail]);
  useEffect(() => {
    if (!cellMenu) return;
    const close = () => setCellMenu(null);
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
  }, [cellMenu]);
  function openCellMenu(e, month, subId) {
    e.preventDefault();
    const menuW = 220, menuH = 124;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    setCellMenu({ x, y, month, subId });
  }
  useEffect(() => {
    if (isMobile) document.body.classList.add("mobilePlanillaMode");
    else document.body.classList.remove("mobilePlanillaMode");
    return () => document.body.classList.remove("mobilePlanillaMode");
  }, [isMobile]);
  const pendingFocusRef = useRef(null);
  const dragStateRef = useRef(null);
  const dragHoverElRef = useRef(null);
  const tableWrapRef = useRef(null);
  const theadRef = useRef(null);
  const [showFloatingBar, setShowFloatingBar] = useState(false);
  const [floatingBarRect, setFloatingBarRect] = useState({ left: 0, top: 0, width: 0 });
  const [colWidths, setColWidths] = useState([]); // actual rendered px width of each header cell (catCol, 12 months, total)
  const [hScroll, setHScroll] = useState(0);

  useEffect(() => {
    const contentEl = tableWrapRef.current?.closest(".content");
    if (!contentEl) return;
    function update() {
      if (!theadRef.current || !tableWrapRef.current) return;
      const theadRect = theadRef.current.getBoundingClientRect();
      const contentRect = contentEl.getBoundingClientRect();
      const wrapRect = tableWrapRef.current.getBoundingClientRect();
      // Show the floating month bar once the real header has scrolled above the
      // visible area, hide it again once the real header comes back into view.
      setShowFloatingBar(theadRect.bottom < contentRect.top);
      setFloatingBarRect({ left: wrapRect.left, top: contentRect.top, width: wrapRect.width });
      const ths = theadRef.current.querySelectorAll("th");
      setColWidths(Array.from(ths).map((th) => th.getBoundingClientRect().width));
    }
    update();
    contentEl.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    if (theadRef.current) ro.observe(theadRef.current);
    return () => {
      contentEl.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, []);

  // "Notebook mode" for the month columns: measured/decided in App.jsx
  // (shared with the topbar's "ver los 12 meses" toggle).
  const { notebookMode, notebookMonthCount, showAllMonthsOverride, setShowAllMonthsOverride } = ctx;
  const effectiveNotebookMode = notebookMode && !showAllMonthsOverride;
  const months = effectiveNotebookMode
    ? Array.from({ length: notebookMonthCount }, (_, i) => shiftMonth(selectedMonth, i - Math.floor((notebookMonthCount - 1) / 2)))
    : Array.from({ length: 12 }, (_, i) => `${plannerYear}-${String(i + 1).padStart(2, "0")}`);
  function monthGradientColor(monthKey) {
    const [sy, sm] = selectedMonth.split("-").map(Number);
    const [y, m] = monthKey.split("-").map(Number);
    const dist = Math.abs((y * 12 + m) - (sy * 12 + sm));
    // Dark: current month white, fading to gray. Light: current month near
    // black, fading to gray (never reaching the background).
    const v = document.documentElement.classList.contains("theme-light") ? Math.min(150, 20 + dist * 14) : Math.max(120, 255 - dist * 14);
    return `rgb(${v},${v},${v})`;
  }

  useEffect(() => {
    if (!pendingFocusRef.current) return;
    const { subId, col } = pendingFocusRef.current;
    pendingFocusRef.current = null;
    const el = tableWrapRef.current?.querySelector(`input[data-subid="${subId}"][data-col="${col}"]`);
    if (el) { el.focus(); el.select(); }
  });

  function toggleSecExpand(id) {
    const next = sections.map((s) => (s.id === id ? { ...s, collapsed: !s.collapsed } : s));
    setSections(next);
    saveSections(next);
  }

  function commitCell(month, subId, rawStr) {
    const { evalFormula, parseCellInput } = ctx;
    const trimmed = String(rawStr).trim();
    if (trimmed === "") {
      setCellData((prev) => {
        const next = { ...prev, [month]: { ...(prev[month] || {}) } };
        const existing = next[month][subId];
        const cur = existing ? existing.currency || null : null;
        next[month][subId] = { value: 0, currency: cur, enteredCurrency: cur ? undefined : ctx.primaryCurrency, ...(existing?.unpaid ? { unpaid: true } : {}) };
        saveCellData(next);
        return next;
      });
      return 0;
    }
    let n;
    let formula;
    if (trimmed.startsWith("=")) {
      n = evalFormula(trimmed);
      if (isNaN(n)) return undefined; // invalid formula: leave the DOM text as typed
      formula = trimmed;
    } else {
      n = parseCellInput(trimmed);
    }
    setCellData((prev) => {
      const next = { ...prev, [month]: { ...(prev[month] || {}) } };
      const existing = next[month][subId];
      const cur = existing ? existing.currency || null : null;
      next[month][subId] = { value: n, currency: cur, formula, enteredCurrency: cur ? undefined : ctx.primaryCurrency, ...(existing?.unpaid ? { unpaid: true } : {}), ...(formula && existing?.items ? { items: existing.items } : {}) };
      saveCellData(next);
      return next;
    });
    return n;
  }

  function toggleCurrency(month, subId) {
    setCellData((prev) => {
      const next = { ...prev, [month]: { ...(prev[month] || {}) } };
      const existing = next[month][subId] || { value: 0, currency: null };
      const others = ["ARS", "USD", "EUR"].filter((c) => c !== ctx.primaryCurrency);
      let currency;
      if (existing.currency === others[0]) currency = others[1];
      else if (existing.currency === others[1]) currency = null;
      else currency = others[0];
      next[month][subId] = { ...existing, currency };
      saveCellData(next);
      return next;
    });
  }

  function curSymbol(c) { return c === "USD" ? "$" : c === "EUR" ? "€" : "$"; }
  function curClass(month, subId) {
    const cell = (cellData[month] || {})[subId];
    if (!cell || !cell.currency) return "";
    return cell.currency === "USD" ? "usd" : cell.currency === "EUR" ? "eur" : "ars";
  }

  function handleGridKey(e, subId, colIdx) {
    const flat = allSubcatsFlat().map((sc) => sc.id);
    const rowIdx = flat.indexOf(subId);
    const input = e.target;
    let dr = 0, dc = 0, shouldMove = false;
    if (e.key === "ArrowDown" || e.key === "Enter") { dr = 1; shouldMove = true; }
    else if (e.key === "ArrowUp") { dr = -1; shouldMove = true; }
    else if (e.key === "ArrowRight" && input.selectionStart === input.value.length) { dc = 1; shouldMove = true; }
    else if (e.key === "ArrowLeft" && input.selectionStart === 0) { dc = -1; shouldMove = true; }
    else if (e.key === "Tab") { dc = e.shiftKey ? -1 : 1; shouldMove = true; }
    if (!shouldMove) return;
    e.preventDefault();
    const tr = rowIdx + dr, tc = colIdx + dc;
    const target = (tr >= 0 && tr < flat.length && tc >= 0 && tc <= 11) ? { subId: flat[tr], col: tc } : { subId, col: colIdx };
    pendingFocusRef.current = target;
    input.blur();
    // Fallback: if commitCell didn't actually change state (e.g. value unchanged),
    // no re-render happens, so the focus effect below never runs. Consume it here instead.
    setTimeout(() => {
      if (!pendingFocusRef.current) return;
      pendingFocusRef.current = null;
      const el = tableWrapRef.current?.querySelector(`input[data-subid="${target.subId}"][data-col="${target.col}"]`);
      if (el) { el.focus(); el.select(); }
    }, 0);
  }

  function copyMonthColumn(month) {
    const text = allSubcatsFlat().map((sc) => Math.round(finalValuePesos(sc.id, month))).join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  function moveSection(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[idx], next[j]] = [next[j], next[idx]];
    setSections(next);
    saveSections(next);
  }
  function renameSection(id, name) {
    const next = sections.map((s) => (s.id === id ? { ...s, name } : s));
    setSections(next);
    saveSections(next);
  }
  function renameSectionPrompt(id) {
    const sec = sections.find((s) => s.id === id);
    if (!sec) return;
    showPromptModal(t("promptRenameSection"), (name) => renameSection(id, name), sec.name, t("save"));
  }
  function removeSection(id) {
    showConfirmModal(t("confirmDeleteSection"), () => {
      const sec = sections.find((s) => s.id === id);
      const subIds = sec.subcats.map((sc) => sc.id);
      const nextSections = sections.filter((s) => s.id !== id);
      setSections(nextSections);
      saveSections(nextSections);
      ctx.setTransactions((prev) => {
        const next = prev.map((tr) => (subIds.includes(tr.catId) ? { ...tr, catId: null } : tr));
        ctx.saveTransactions(next);
        return next;
      });
      setCellData((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((m) => { next[m] = { ...next[m] }; subIds.forEach((sid) => delete next[m][sid]); });
        saveCellData(next);
        return next;
      });
    });
  }
  function addSection() {
    const name = newSecName.trim();
    if (!name) return;
    const newSec = { id: uid(), name, subcats: [] };
    setSections([...sections, newSec]);
    saveSections([...sections, newSec]);
    setNewSecName("");
  }
  function renameSub(secId, subId, name) {
    const next = sections.map((s) => (s.id === secId ? { ...s, subcats: s.subcats.map((sc) => (sc.id === subId ? { ...sc, name } : sc)) } : s));
    setSections(next);
    saveSections(next);
  }
  function toggleFavoriteSub(secId, subId) {
    const next = sections.map((s) => (s.id === secId ? { ...s, subcats: s.subcats.map((sc) => (sc.id === subId ? { ...sc, favorite: !sc.favorite } : sc)) } : s));
    setSections(next);
    saveSections(next);
  }
  function removeSub(secId, subId) {
    showConfirmModal(t("confirmDeleteSub"), () => {
      const next = sections.map((s) => (s.id === secId ? { ...s, subcats: s.subcats.filter((sc) => sc.id !== subId) } : s));
      setSections(next);
      saveSections(next);
      ctx.setTransactions((prev) => {
        const n2 = prev.map((tr) => (tr.catId === subId ? { ...tr, catId: null } : tr));
        ctx.saveTransactions(n2);
        return n2;
      });
      setCellData((prev) => {
        const n3 = { ...prev };
        Object.keys(n3).forEach((m) => { n3[m] = { ...n3[m] }; delete n3[m][subId]; });
        saveCellData(n3);
        return n3;
      });
    });
  }
  function commitNewSub(secId, name) {
    const clean = name.trim();
    if (!clean) return;
    const next = sections.map((s) => (s.id === secId ? { ...s, subcats: [...s.subcats, { id: uid(), name: clean, macro: "SIN_ASIGNAR", keywords: [clean.toUpperCase()] }] } : s));
    setSections(next);
    saveSections(next);
  }
  function handleMacroChange(e, secId, subId) {
    const val = e.target.value;
    if (val === "__new__") { setShowMacroPanel(true); return; }
    const next = sections.map((s) => (s.id === secId ? { ...s, subcats: s.subcats.map((sc) => (sc.id === subId ? { ...sc, macro: val } : sc)) } : s));
    setSections(next);
    saveSections(next);
  }

  function updateSubcat(secId, subId, patch) {
    const next = sections.map((s) => (s.id === secId ? { ...s, subcats: s.subcats.map((sc) => (sc.id === subId ? { ...sc, ...patch } : sc)) } : s));
    setSections(next);
    saveSections(next);
  }
  function toggleSplit(secId, subId, sc) {
    if (sc.split?.enabled) return; // handled by the collapse toggle now — remove people manually to undo
    showPromptModal(t("splitPrompt"), (val) => {
      const n = parseInt(val, 10);
      if (!n || n < 2) return;
      const pct = Math.round((100 / n) * 100) / 100;
      const people = Array.from({ length: n }, () => ({ id: uid(), name: "", pct, effect: "none" }));
      updateSubcat(secId, subId, { split: { enabled: true, people, common: [] } });
    });
  }
  function updateSplitPerson(secId, subId, sc, idx, field, value) {
    const people = sc.split.people.map((p, i) => (i === idx ? { ...p, [field]: field === "pct" ? (parseFloat(value) || 0) : value } : p));
    updateSubcat(secId, subId, { split: { ...sc.split, people } });
  }
  function addSplitPerson(secId, subId, sc) {
    const people = [...sc.split.people, { id: uid(), name: "", pct: 0, effect: "none" }];
    updateSubcat(secId, subId, { split: { ...sc.split, people } });
  }
  function removeSplitPerson(secId, subId, sc, idx) {
    const people = sc.split.people.filter((_, i) => i !== idx);
    if (people.length === 0) { updateSubcat(secId, subId, { split: null }); return; }
    updateSubcat(secId, subId, { split: { ...sc.split, people } });
  }
  function adjustPercentages(secId, subId, sc) {
    const total = sc.split.people.reduce((a, p) => a + (parseFloat(p.pct) || 0), 0);
    if (!total) return;
    const people = sc.split.people.map((p) => ({ ...p, pct: Math.round(((p.pct || 0) / total) * 10000) / 100 }));
    updateSubcat(secId, subId, { split: { ...sc.split, people } });
  }
  function addSplitCommon(secId, subId, sc) {
    const common = [...(sc.split.common || []), { id: uid(), label: "", amounts: {} }];
    updateSubcat(secId, subId, { split: { ...sc.split, common } });
  }
  function renameSplitCommon(secId, subId, sc, idx, label) {
    const common = sc.split.common.map((c, i) => (i === idx ? { ...c, label } : c));
    updateSubcat(secId, subId, { split: { ...sc.split, common } });
  }
  function setSplitCommonMonth(secId, subId, sc, idx, month, value) {
    const common = sc.split.common.map((c, i) => (i === idx ? { ...c, amounts: { ...c.amounts, [month]: value }, enteredCurrency: ctx.primaryCurrency } : c));
    updateSubcat(secId, subId, { split: { ...sc.split, common } });
  }
  function removeSplitCommon(secId, subId, sc, idx) {
    const common = sc.split.common.filter((_, i) => i !== idx);
    updateSubcat(secId, subId, { split: { ...sc.split, common } });
  }
  function repeatCommonToDecember(secId, subId, sc, idx) {
    const c = sc.split.common[idx];
    let lastVal = null, lastIdx = -1;
    months.forEach((m, i) => {
      const v = c.amounts?.[m];
      if (v) { lastVal = v; lastIdx = i; }
    });
    if (lastIdx === -1) return;
    const amounts = { ...c.amounts };
    for (let i = lastIdx + 1; i < months.length; i++) amounts[months[i]] = lastVal;
    const common = sc.split.common.map((cc, i) => (i === idx ? { ...cc, amounts } : cc));
    updateSubcat(secId, subId, { split: { ...sc.split, common } });
  }
  function toggleNoteEditor(secId, subId, sc) {
    updateSubcat(secId, subId, { noteExpanded: !sc.noteExpanded });
  }
  function setNoteMonth(secId, subId, sc, month, value) {
    updateSubcat(secId, subId, { noteByMonth: { ...(sc.noteByMonth || {}), [month]: value } });
  }
  function hasAnyNote(sc) {
    if ((sc.noteGeneral || "").trim()) return true;
    return sc.noteByMonth && Object.values(sc.noteByMonth).some((v) => (v || "").trim());
  }
  function clearAllNotes(secId, subId) {
    updateSubcat(secId, subId, { noteByMonth: {}, noteGeneral: "", noteExpanded: false });
  }
  function toggleSplitCollapse(secId, subId, sc) {
    updateSubcat(secId, subId, { split: { ...sc.split, collapsed: !sc.split.collapsed } });
  }
  function togglePinPerson(secId, subId, sc, personId) {
    const people = sc.split.people.map((p) => (p.id === personId ? { ...p, pinned: !p.pinned } : p));
    updateSubcat(secId, subId, { split: { ...sc.split, people } });
  }
  function collapseAll(collapse) {
    const next = sections.map((s) => ({
      ...s,
      collapsed: collapse,
      subcats: s.subcats.map((sc) => ({
        ...sc,
        split: sc.split?.enabled ? { ...sc.split, collapsed: collapse } : sc.split,
        noteExpanded: hasAnyNote(sc) ? !collapse : sc.noteExpanded,
      })),
    }));
    setSections(next);
    saveSections(next);
  }
  function anythingExpanded() {
    return sections.some((s) => !s.collapsed || s.subcats.some((sc) => (sc.split?.enabled && !sc.split.collapsed) || (hasAnyNote(sc) && sc.noteExpanded)));
  }

  // ---- currency quoting: dolarByMonth/eurByMonth are always ARS-per-unit.
  // Every quote row shows "how many units of the PRIMARY currency equal 1 unit of
  // the other currency" — e.g. primary=ARS, cur=USD -> pesos per dollar (big number);
  // primary=USD, cur=ARS -> dollars per peso (tiny number). Same formula throughout. ----
  const primary = ctx.primaryCurrency;
  const otherCurrencies = ["ARS", "USD", "EUR"].filter((c) => c !== primary);
  const primarySymbol = primary === "EUR" ? "€" : "$";
  const todayMonthKey = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; })();
  function isFutureMonth(m) { return m > todayMonthKey; }
  function rateOf(cur, dolar, eur) { return cur === "ARS" ? 1 : cur === "USD" ? dolar : eur; }
  function quoteValue(cur, month) {
    const dolar = getDolarRate(month), eur = getEuroRate(month);
    const primaryRate = rateOf(primary, dolar, eur);
    return primaryRate ? rateOf(cur, dolar, eur) / primaryRate : 0;
  }
  function parseQuoteNumber(s) {
    const n = parseFloat(String(s).trim().replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  function commitQuote(cur, month, rawStr) {
    const v = parseQuoteNumber(rawStr);
    const dolar = getDolarRate(month), eur = getEuroRate(month);
    if (primary === "ARS") {
      if (cur === "USD") { const next = { ...dolarByMonth, [month]: v }; setDolarByMonth(next); saveDolar(next); }
      else { const next = { ...eurByMonth, [month]: v }; setEurByMonth(next); saveEur(next); }
    } else if (primary === "USD") {
      if (cur === "ARS") { const next = { ...dolarByMonth, [month]: v ? 1 / v : 0 }; setDolarByMonth(next); saveDolar(next); }
      else { const next = { ...eurByMonth, [month]: v * dolar }; setEurByMonth(next); saveEur(next); }
    } else {
      if (cur === "ARS") { const next = { ...eurByMonth, [month]: v ? 1 / v : 0 }; setEurByMonth(next); saveEur(next); }
      else { const next = { ...dolarByMonth, [month]: v * eur }; setDolarByMonth(next); saveDolar(next); }
    }
  }

  const [fetchingRates, setFetchingRates] = useState(false);
  const [fetchRatesMsg, setFetchRatesMsg] = useState("");
  async function fetchOfficialRates() {
    setFetchingRates(true);
    setFetchRatesMsg("");
    try {
      const [usdRes, eurRes] = await Promise.all([
        fetch("https://dolarapi.com/v1/dolares/oficial"),
        fetch("https://dolarapi.com/v1/cotizaciones/eur"),
      ]);
      const usdData = await usdRes.json();
      const eurData = await eurRes.json();
      const usdVal = usdData?.venta;
      const eurVal = eurData?.venta;
      if (!usdVal || !eurVal) throw new Error("Respuesta inesperada");
      const nextDolar = { ...dolarByMonth, [todayMonthKey]: usdVal };
      const nextEur = { ...eurByMonth, [todayMonthKey]: eurVal };
      setDolarByMonth(nextDolar); saveDolar(nextDolar);
      setEurByMonth(nextEur); saveEur(nextEur);
      setFetchRatesMsg(tx("✓ Actualizado"));
    } catch (err) {
      setFetchRatesMsg(tx("Error al conectar"));
    } finally {
      setFetchingRates(false);
      setTimeout(() => setFetchRatesMsg(""), 4000);
    }
  }

  const [fetchingYear, setFetchingYear] = useState(false);
  function lastBusinessDay(year, month) {
    const d = new Date(year, month, 0); // day 0 of next month = last day of `month`
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
  }
  async function fetchYearOfficialRates() {
    setFetchingYear(true);
    setFetchRatesMsg("");
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonthNum = now.getMonth() + 1;
    const nextDolar = { ...dolarByMonth };
    const nextEur = { ...eurByMonth };
    let okCount = 0, eurCount = 0;
    try {
      for (let m = 1; m < curMonthNum; m++) {
        const lbd = lastBusinessDay(curYear, m);
        const y = lbd.getFullYear(), mm = String(lbd.getMonth() + 1).padStart(2, "0"), dd = String(lbd.getDate()).padStart(2, "0");
        const monthKey = `${curYear}-${String(m).padStart(2, "0")}`;
        let usdRate = null;
        try {
          const res = await fetch(`https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/${y}/${mm}/${dd}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.venta) { usdRate = data.venta; nextDolar[monthKey] = usdRate; okCount++; }
          }
        } catch (e) { /* keep going with the rest of the months */ }
        if (usdRate) {
          // ECB reference rate (how many EUR is 1 USD) for that date. If that exact date
          // isn't a published ECB business day, step back a few days and retry.
          let eurPerUsd = null;
          for (let back = 0; back < 5 && !eurPerUsd; back++) {
            const d2 = new Date(y, lbd.getMonth(), lbd.getDate() - back);
            const y2 = d2.getFullYear(), mm2 = String(d2.getMonth() + 1).padStart(2, "0"), dd2 = String(d2.getDate()).padStart(2, "0");
            try {
              const fxRes = await fetch(`https://api.frankfurter.app/${y2}-${mm2}-${dd2}?from=USD&to=EUR`);
              if (fxRes.ok) {
                const fxData = await fxRes.json();
                if (fxData?.rates?.EUR) eurPerUsd = fxData.rates.EUR;
              }
            } catch (e) { /* try the next day back */ }
          }
          if (eurPerUsd) { nextEur[monthKey] = usdRate / eurPerUsd; eurCount++; }
        }
      }
      setDolarByMonth(nextDolar); saveDolar(nextDolar);
      setEurByMonth(nextEur); saveEur(nextEur);
      setFetchRatesMsg(okCount ? tx("✓ {usd} mes(es) USD, {eur} mes(es) EUR", { usd: okCount, eur: eurCount }) : tx("No se pudo traer el histórico"));
    } finally {
      setFetchingYear(false);
      setTimeout(() => setFetchRatesMsg(""), 6000);
    }
  }

  function personTotalsForSection(sec) {
    const totals = {}; // name -> { [month]: sum }
    sec.subcats.forEach((sc) => {
      if (!sc.split?.enabled || !sc.split.people?.length) return;
      months.forEach((m) => {
        const peopleCount = sc.split.people.length || 1;
        const commonForPerson = (sc.split.common || []).reduce((a, c) => a + commonItemDisplayValue(c, m), 0) / peopleCount;
        const base = cellDisplayValue(sc.id, m);
        sc.split.people.forEach((p) => {
          const name = (p.name || "").trim();
          if (!name) return;
          const share = base * ((p.pct || 0) / 100) + commonForPerson;
          if (!totals[name]) totals[name] = {};
          totals[name][m] = (totals[name][m] || 0) + share;
        });
      });
    });
    return totals;
  }

  // ---- row drag & drop (mouse-based, mirrors the original) ----
  function startRowDrag(e, type, secId, subId) {
    e.preventDefault();
    dragStateRef.current = { type, secId, subId };
    document.body.style.cursor = "grabbing";
    document.addEventListener("mousemove", onRowDragMove);
    document.addEventListener("mouseup", onRowDragEnd);
  }
  function onRowDragMove(e) {
    if (!dragStateRef.current) return;
    if (dragHoverElRef.current) { dragHoverElRef.current.classList.remove("dragOver"); dragHoverElRef.current = null; }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const row = el.closest("tr.subRow, tr.sectionRow");
    if (row) { row.classList.add("dragOver"); dragHoverElRef.current = row; }
  }
  function onRowDragEnd(e) {
    document.removeEventListener("mousemove", onRowDragMove);
    document.removeEventListener("mouseup", onRowDragEnd);
    document.body.style.cursor = "";
    if (dragHoverElRef.current) { dragHoverElRef.current.classList.remove("dragOver"); dragHoverElRef.current = null; }
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el ? el.closest("tr.subRow, tr.sectionRow") : null;
    if (!row) return;
    const targetSecId = row.dataset.rowsec;
    const targetSubId = row.dataset.rowsub || null;
    const droppedOnHeader = row.classList.contains("sectionRow");

    if (drag.type === "sub") {
      const fromSecIdx = sections.findIndex((s) => s.id === drag.secId);
      if (fromSecIdx < 0) return;
      const fromSec = sections[fromSecIdx];
      const idx = fromSec.subcats.findIndex((sc) => sc.id === drag.subId);
      if (idx < 0 || drag.subId === targetSubId) return;
      const toSecIdx = sections.findIndex((s) => s.id === targetSecId);
      if (toSecIdx < 0) return;
      const sameSection = fromSecIdx === toSecIdx;
      const origTargetIdx = droppedOnHeader ? -1 : sections[toSecIdx].subcats.findIndex((sc) => sc.id === targetSubId);
      const next = sections.map((s) => ({ ...s, subcats: [...s.subcats] }));
      const [moved] = next[fromSecIdx].subcats.splice(idx, 1);
      let targetIdx;
      if (droppedOnHeader) targetIdx = 0;
      else {
        targetIdx = next[toSecIdx].subcats.findIndex((sc) => sc.id === targetSubId);
        if (targetIdx < 0) targetIdx = next[toSecIdx].subcats.length;
        else if (sameSection && origTargetIdx > idx) targetIdx += 1; // dragging downward: land after the target row
      }
      next[toSecIdx].subcats.splice(targetIdx, 0, moved);
      setSections(next);
      saveSections(next);
    }
  }

  const totalCard = (
    <div className="macroCard total">
      <div className="lbl">{tx("Total Gastos")} · {monthLabel2(selectedMonth, lang)}</div>
      <div className="val mono">{money(totalGastos(selectedMonth))}</div>
    </div>
  );

  function monthLabel2(m, l) {
    // small local wrapper to avoid re-importing under a different name
    const { monthLabel } = ctx;
    return monthLabel ? monthLabel(m, l) : m;
  }

  function formulaBarDisplay(subId, month) {
    const cell = getCell(month, subId);
    if (cell?.formula) return cell.formula;
    const disp = cellDisplayValue(subId, month);
    return disp ? fmtInt(disp) : "";
  }
  function commitFormulaBarValue(month, subId, inputStr) {
    const trimmed = inputStr.trim();
    let toStore = inputStr;
    if (trimmed && !trimmed.startsWith("=")) {
      const parsed = ctx.parseCellInput(trimmed);
      if (!isNaN(parsed)) toStore = String(displayToRaw(subId, month, parsed));
    }
    return commitCell(month, subId, toStore);
  }

  if (isMobile) return <MobilePlanilla ctx={ctx} />;

  return (
    <>
      {showFloatingBar && (
        <div className="floatingMonthBar" style={{ left: floatingBarRect.left, top: floatingBarRect.top, width: floatingBarRect.width }}>
          <div className="floatingMonthBarInner" style={{ transform: `translateX(${-hScroll}px)` }}>
            <div className="fmbCell fmbCatCol" style={{ width: colWidths[0] }}>{t("colName")}</div>
            {months.map((m, i) => <div className="fmbCell" style={{ width: colWidths[i + 1] }} key={m}>{monAbbr(parseInt(m.split("-")[1]) - 1, lang)}</div>)}
            <div className="fmbCell fmbTotal" style={{ width: colWidths[13] }}>{t("total")}</div>
          </div>
        </div>
      )}
      {showFloatingBar && (() => {
        const fbSub = activeCell ? findSubcat(activeCell.subId) : null;
        const fbCell = activeCell ? getCell(activeCell.month, activeCell.subId) : null;
        const fbRaw = activeCell ? formulaBarDisplay(activeCell.subId, activeCell.month) : "";
        return (
          <div className="floatingFormulaBar" style={{ left: floatingBarRect.left, top: floatingBarRect.top + 34, width: floatingBarRect.width }}>
            {activeCell && (
              <div className="formulaBar">
                <span className="formulaBarLabel">{fbSub?.name} · {monAbbr(parseInt(activeCell.month.split("-")[1]) - 1, lang)}</span>
                <input
                  className="formulaBarInput"
                  defaultValue={fbRaw}
                  key={"floating-" + activeCell.subId + "-" + activeCell.month + "-" + fbRaw}
                  placeholder="fx"
                  onBlur={(e) => commitFormulaBarValue(activeCell.month, activeCell.subId, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                />
              </div>
            )}
            <button className="miniBtn collapseAllBtn" style={{ marginLeft: 12 }} onClick={() => collapseAll(anythingExpanded())} title={anythingExpanded() ? tx("Colapsar todo") : tx("Expandir todo")}>
              {anythingExpanded() ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
            </button>
          </div>
        );
      })()}
      <div className="macroBar">
        {macroTags.filter((tag) => tag.visible !== false).map((tag) => (
          <div className="macroCard" key={tag.id}>            <div className="lbl"><span className="sw" style={{ background: tag.color }}></span>{tag.name} · {ctx.monthLabel(selectedMonth, lang)}</div>
            <div className="val mono">{money(macroTotalByTag(selectedMonth, tag.id))}</div>
          </div>
        ))}
        {totalCard}
      </div>

      <div className="dolarRow">
        <button className="pillBtn" onClick={() => setShowMacroPanel((v) => !v)}>{t("paymentMethods")}</button>
        <button className={`pillBtn iconText ${showHistoric ? "on" : ""}`} onClick={() => setShowHistoric((v) => !v)}><History size={13} /> {t("historicBtn")}</button>
        <button className="pillBtn iconText" onClick={fetchYearOfficialRates} disabled={fetchingRates || fetchingYear} title={tx("Trae la cotización oficial del último día hábil de cada mes ya transcurrido este año (dólar y euro)")}>
          <RefreshCw size={13} className={fetchingYear ? "spin" : ""} /> {fetchingYear ? tx("Actualizando...") : tx("Actualizar año")}
        </button>
        <button className="pillBtn iconText" onClick={fetchOfficialRates} disabled={fetchingRates || fetchingYear} title={tx("Trae la cotización oficial de hoy (dólar y euro) desde dolarapi.com")}>
          <RefreshCw size={13} className={fetchingRates ? "spin" : ""} /> {fetchingRates ? tx("Actualizando...") : tx("Actualizar hoy")}
        </button>
        <button className="pillBtn iconText" onClick={exportPlanillaExcel} title={tx("Descargar la planilla {year} completa en Excel (12 meses, celdas y detalle de movimientos)", { year: plannerYear })}>
          <Download size={13} /> {tx("Exportar a Excel")}
        </button>

        <span className="dolarDivider"></span>

        {otherCurrencies.map((cur) => (
          <React.Fragment key={cur}>
            <span className="quoteLabel" title={tx("Cuánto vale 1 unidad de esta moneda, expresado en tu moneda principal.")}>{cur}→{primary} {primarySymbol}</span>
            <input
              className="mono"
              defaultValue={isFutureMonth(selectedMonth) ? "" : fmtRate(quoteValue(cur, selectedMonth))}
              placeholder={isFutureMonth(selectedMonth) ? "—" : ""}
              disabled={isFutureMonth(selectedMonth)}
              title={isFutureMonth(selectedMonth) ? tx("Todavía no llegamos a este mes") : undefined}
              key={cur + "-" + selectedMonth + "-" + primary}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => commitQuote(cur, selectedMonth, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
            />
          </React.Fragment>
        ))}
        {fetchRatesMsg && <span className="fetchRatesMsg">{fetchRatesMsg}</span>}

        <span className="spacer"></span>

        {activeCell && (() => {
          const fbSub = findSubcat(activeCell.subId);
          const fbCell = getCell(activeCell.month, activeCell.subId);
          const fbRaw = formulaBarDisplay(activeCell.subId, activeCell.month);
          return (
            <div className="formulaBar">
              <span className="formulaBarLabel">{fbSub?.name} · {monAbbr(parseInt(activeCell.month.split("-")[1]) - 1, lang)}</span>
              <input
                className="formulaBarInput"
                defaultValue={fbRaw}
                key={activeCell.subId + "-" + activeCell.month + "-" + fbRaw}
                placeholder="fx"
                onBlur={(e) => {
                  commitFormulaBarValue(activeCell.month, activeCell.subId, e.target.value);
                  setTimeout(() => {
                    const active = document.activeElement;
                    const staysInFormulaFlow = active && (active.classList?.contains("formulaBarInput") || active.dataset?.subid !== undefined);
                    if (!staysInFormulaFlow) setActiveCell(null);
                  }, 0);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
              />
            </div>
          );
        })()}

        {notebookMode && (
          <button
            className={`miniBtn collapseAllBtn ${!showAllMonthsOverride ? "on" : ""}`}
            onClick={() => setShowAllMonthsOverride((v) => !v)}
            title={showAllMonthsOverride ? tx("Centrar en el mes seleccionado") : tx("Ver los 12 meses del año, con scroll horizontal")}
          >
            {showAllMonthsOverride ? <UnfoldHorizontal size={13} /> : <FoldHorizontal size={13} />}
          </button>
        )}
        <button className="miniBtn collapseAllBtn" onClick={() => collapseAll(anythingExpanded())} title={anythingExpanded() ? tx("Colapsar todo") : tx("Expandir todo")}>
          {anythingExpanded() ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
        </button>
      </div>

      {showMacroPanel && <MacroPanel ctx={ctx} />}

      <div style={{ overflowX: "auto" }} ref={tableWrapRef} onScroll={(e) => setHScroll(e.currentTarget.scrollLeft)}>
        {showHistoric && (
          <table className="grid histTable" style={effectiveNotebookMode ? { width: 395 + 140 + notebookMonthCount * 130, minWidth: 0 } : undefined}>
            <colgroup>
              <col style={{ width: 395 }} />
              {months.map((m) => <col key={m} style={{ width: 130 }} />)}
              <col style={{ width: 140 }} />
            </colgroup>
            <tbody>
              {otherCurrencies.map((cur) => (
                <tr key={cur}>
                  <td className="catCol">{cur} → {primary} ({primarySymbol})</td>
                  {months.map((m) => (
                    <td className={`cell ${isFutureMonth(m) ? "futureCell" : ""}`} key={m}>
                      <div className="cellInner">
                        <input
                          className="num"
                          defaultValue={isFutureMonth(m) ? "" : fmtRate(quoteValue(cur, m))}
                          placeholder={isFutureMonth(m) ? "—" : ""}
                          disabled={isFutureMonth(m)}
                          title={isFutureMonth(m) ? tx("Todavía no llegamos a este mes") : undefined}
                          key={"hist-" + cur + "-" + m + "-" + dolarByMonth[m] + "-" + eurByMonth[m] + "-" + primary}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => commitQuote(cur, m, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                        />
                      </div>
                    </td>
                  ))}
                  <td className="cell"></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <table className="grid" style={effectiveNotebookMode ? { width: 395 + 140 + notebookMonthCount * 130, minWidth: 0 } : undefined}>
          <colgroup>
            <col style={{ width: 395 }} />
            {months.map((m) => <col key={m} style={{ width: 130 }} />)}
            <col style={{ width: 140 }} />
          </colgroup>
          <thead ref={theadRef}>
            <tr>
              <th className="catCol">{t("colName")}</th>
              {months.map((m) => <th key={m} className={m === selectedMonth ? "current" : ""}>{monAbbr(parseInt(m.split("-")[1]) - 1, lang)}</th>)}
              <th>{t("total")}</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec, si) => {
              const searchActive = planillaSearch.trim().length > 0;
              const searchDigits = planillaSearch.replace(/\D/g, "");
              function subcatMatches(sc) {
                if (normalize(sc.name).includes(normalize(planillaSearch))) return true;
                if (!searchDigits) return false;
                const total = Math.round(months.reduce((a, m) => a + finalValuePesos(sc.id, m), 0));
                if (String(total).includes(searchDigits)) return true;
                return months.some((m) => String(Math.round(finalValuePesos(sc.id, m))).includes(searchDigits));
              }
              const secNameMatches = searchActive && normalize(sec.name).includes(normalize(planillaSearch));
              let matchedSubcats = searchActive
                ? (secNameMatches ? sec.subcats : sec.subcats.filter(subcatMatches))
                : sec.subcats;
              if (showFavoritesOnly) matchedSubcats = matchedSubcats.filter((sc) => sc.favorite);
              if (showUnpaidOnly) {
                const yearPrefix = `${ctx.plannerYear}-`;
                const yearMonths = Object.keys(ctx.cellData || {}).filter((k) => k.startsWith(yearPrefix));
                matchedSubcats = matchedSubcats.filter((sc) => yearMonths.some((m) => isUnpaid(m, sc.id)));
              }
              const anyFilterActive = searchActive || showFavoritesOnly || showUnpaidOnly;
              if (anyFilterActive && matchedSubcats.length === 0) return null;
              const secMonthTotals = months.map((m) => sec.subcats.reduce((a, sc) => a + finalValuePesos(sc.id, m), 0));
              const expanded = anyFilterActive ? true : !sec.collapsed;
              return (
                <React.Fragment key={sec.id}>
                  <tr className="sectionRow" data-rowsec={sec.id} style={{ "--chip": sectionColor(si) }}>
                    <th className="catCol" onClick={() => toggleSecExpand(sec.id)} title={tx("Click para plegar/desplegar")} style={{ cursor: "pointer" }}>
                      <span className="secColorBar" style={{ background: sectionColor(si) }}></span>
                      <span className="secNameText">{sec.name}</span>
                      <span className="spacer"></span>
                      <button className="miniBtn" onClick={(e) => { e.stopPropagation(); renameSectionPrompt(sec.id); }} title={tx("Renombrar rubro")}>✎</button>
                      <button className="miniBtn" onClick={(e) => { e.stopPropagation(); moveSection(si, -1); }}>↑</button>
                      <button className="miniBtn" onClick={(e) => { e.stopPropagation(); moveSection(si, 1); }}>↓</button>
                      <button className="miniBtn" onClick={(e) => { e.stopPropagation(); removeSection(sec.id); }} title={tx("Borrar rubro")}>✕</button>
                    </th>
                    {secMonthTotals.map((v, i) => <td className="totalCell num" style={{ color: v ? monthGradientColor(months[i]) : undefined }} key={i}>{v ? money(v, months[i]) : ""}</td>)}
                    <td className="totalCell num">{money(secMonthTotals.reduce((a, b) => a + b, 0))}</td>
                  </tr>

                  {expanded && matchedSubcats.map((sc) => {
                    let rowTotal = 0;
                    const tag = findMacro(sc.macro);
                    const cells = months.map((m, mi) => {
                      const effCur = effectiveCurrency(sc.id, m);
                      const rawVal = cellDisplayValue(sc.id, m);
                      rowTotal += finalValuePesos(sc.id, m);
                      const isCurrent = m === selectedMonth;
                      const unpaid = isUnpaid(m, sc.id);
                      return (
                        <td
                          className={`cell ${isCurrent ? "current" : ""} ${unpaid ? "unpaid" : ""}`}
                          key={m}
                          // Right button must NOT focus the input: focusing opens the
                          // formula bar, which shifts the grid down mid-click and the
                          // context menu would then land on a different row.
                          onMouseDown={(e) => { if (e.button === 2) e.preventDefault(); }}
                          onContextMenu={(e) => openCellMenu(e, m, sc.id)}
                          title={unpaid ? (getCell(m, sc.id)?.due ? tx("No pagado · vence {date} (clic derecho para cambiar)", { date: fmtDue(getCell(m, sc.id).due, getTxLang()) }) : tx("No pagado (clic derecho para cambiar)")) : undefined}
                        >
                          <div className="cellInner">
                            <input
                              className="num"
                              data-subid={sc.id}
                              data-col={mi}
                              defaultValue={rawVal ? fmtInt(rawVal) : ""}
                              key={`${sc.id}-${m}-${rawVal}`}
                              placeholder={hideZeros ? "" : "0"}
                              onFocus={(e) => { e.target.value = e.target.value.replace(/\./g, ""); e.target.dataset.origValue = e.target.value; e.target.select(); setActiveCell({ subId: sc.id, month: m }); }}
                              onBlur={(e) => {
                                if (e.target.value !== e.target.dataset.origValue) {
                                  let inputStr = e.target.value;
                                  const trimmed = inputStr.trim();
                                  if (trimmed && !trimmed.startsWith("=")) {
                                    const parsed = ctx.parseCellInput(trimmed);
                                    if (!isNaN(parsed)) inputStr = String(displayToRaw(sc.id, m, parsed));
                                  }
                                  const n = commitCell(m, sc.id, inputStr);
                                  if (n === null) e.target.value = "";
                                  else if (n !== undefined) e.target.value = fmtInt(cellDisplayValue(sc.id, m));
                                } else {
                                  e.target.value = rawVal ? fmtInt(rawVal) : "";
                                }
                                setTimeout(() => {
                                  const active = document.activeElement;
                                  const staysInFormulaFlow = active && (active.classList?.contains("formulaBarInput") || active.dataset?.subid !== undefined);
                                  if (!staysInFormulaFlow) setActiveCell(null);
                                }, 0);
                              }}
                              onKeyDown={(e) => handleGridKey(e, sc.id, mi)}
                            />
                            <button
                              className={`curToggle ${curClass(m, sc.id)}`}
                              onClick={() => toggleCurrency(m, sc.id)}
                              style={{ visibility: hideZeros && !rawVal ? "hidden" : "visible" }}
                            >{curSymbol(effCur)}</button>
                          </div>
                        </td>
                      );
                    });
                    return (
                      <React.Fragment key={sc.id}>
                      <tr className="subRow" data-rowsec={sec.id} data-rowsub={sc.id}>
                        <td className="catCol indent">
                          <span className="dragHandle" onMouseDown={(e) => startRowDrag(e, "sub", sec.id, sc.id)}>⠿</span>
                          <button
                            className={`favStar ${sc.favorite ? "on" : ""}`}
                            onClick={() => toggleFavoriteSub(sec.id, sc.id)}
                            title={sc.favorite ? tx("Quitar de favoritos") : tx("Marcar como favorito")}
                          >{sc.favorite ? "★" : "☆"}</button>
                          <input className="subNameInput" defaultValue={sc.name} onBlur={(e) => renameSub(sec.id, sc.id, e.target.value)} />
                          <span className="catRightCluster">
                            <button
                              className={`miniBtn noteBtn ${hasAnyNote(sc) ? (sc.noteExpanded ? "on" : "dim") : "hoverOnly"}`}
                              onClick={() => toggleNoteEditor(sec.id, sc.id, sc)}
                              title={t("addNoteLink")}
                            ><NoteIcon /></button>
                            <button
                              className={`miniBtn personSlot ${sc.split?.enabled ? (sc.split.collapsed ? "on" : "dim") : "hoverOnly"}`}
                              onClick={() => (sc.split?.enabled ? toggleSplitCollapse(sec.id, sc.id, sc) : toggleSplit(sec.id, sc.id, sc))}
                              title={sc.split?.enabled ? (sc.split.collapsed ? tx("Mostrar personas") : tx("Ocultar personas")) : tx("Dividir entre personas")}
                            ><PersonIcon /></button>
                            <select className="macroSelect" style={{ background: tag.color + "22", color: tag.color, borderColor: tag.color + "66" }} value={sc.macro} onChange={(e) => handleMacroChange(e, sec.id, sc.id)}>
                              {macroTags.map((mt) => <option value={mt.id} key={mt.id}>{mt.name}</option>)}
                              <option value="__new__">{tx("+ Nueva etiqueta…")}</option>
                            </select>
                            <span className="rowActions">
                              <button className="miniBtn" onClick={() => removeSub(sec.id, sc.id)} title={tx("Borrar subcategoría")}>✕</button>
                            </span>
                          </span>
                        </td>
                        {cells}
                        <td className="totalCell num">{money(rowTotal)}</td>
                      </tr>

                      {sc.noteExpanded && (
                        <tr className="noteRow">
                          <td className="catCol indent2 splitGrid">
                            <span className="gridSlot"></span>
                            <input
                              className="noteRowInput noteGeneralInput"
                              style={{ gridColumn: "2 / 6" }}
                              placeholder={t("noteRowLabel")}
                              defaultValue={sc.noteGeneral || ""}
                              key={"general-" + (sc.noteGeneral || "")}
                              onBlur={(e) => updateSubcat(sec.id, sc.id, { noteGeneral: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                            />
                            <button className="miniBtn tiny" onClick={() => clearAllNotes(sec.id, sc.id)} title={tx("Borrar todas las notas de esta fila")}>✕</button>
                          </td>
                          {months.map((m) => (
                            <td className="cell noteCell" key={m}>
                              <input
                                className="noteRowInput"
                                placeholder="—"
                                defaultValue={(sc.noteByMonth || {})[m] || ""}
                                key={m + "-note-" + ((sc.noteByMonth || {})[m] || "")}
                                onBlur={(e) => setNoteMonth(sec.id, sc.id, sc, m, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                              />
                            </td>
                          ))}
                          <td className="cell noteCell"></td>
                        </tr>
                      )}

                      {sc.split?.enabled && (
                        <>
                          {sc.split.people.map((p, idx) => {
                            const isCollapsed = sc.split.collapsed;
                            if (isCollapsed && !p.pinned) return null;
                            let personRowTotal = 0;
                            return (
                              <tr className="splitRow splitPersonRow" key={p.id}>
                                <td className="catCol indent2 splitGrid">
                                  <button
                                    className={`miniBtn tiny pinBtn ${p.pinned ? "on" : ""}`}
                                    onClick={() => togglePinPerson(sec.id, sc.id, sc, p.id)}
                                    title={tx("Fijar esta persona (queda visible al colapsar)")}
                                  ><PinIcon /></button>
                                  <input
                                    className="splitNameInput gridName"
                                    placeholder={t("personName")}
                                    value={p.name}
                                    data-personname={sc.id}
                                    data-pidx={idx}
                                    onChange={(e) => updateSplitPerson(sec.id, sc.id, sc, idx, "name", e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const next = tableWrapRef.current?.querySelector(`input[data-personname="${sc.id}"][data-pidx="${idx + 1}"]`);
                                        if (next) next.focus();
                                        else e.target.blur();
                                      }
                                    }}
                                  />
                                  <span className="gridSpacer"></span>
                                  <span className="pctGroup">
                                    <input className="splitPctInput" type="number" step="0.01" value={p.pct} onChange={(e) => updateSplitPerson(sec.id, sc.id, sc, idx, "pct", e.target.value)} />
                                    <span className="splitPct">%</span>
                                  </span>
                                  <select
                                    className={`effectPill gridPill ${p.effect === "add" ? "effect-add" : p.effect === "subtract" ? "effect-subtract" : ""}`}
                                    value={p.effect || "none"}
                                    onChange={(e) => updateSplitPerson(sec.id, sc.id, sc, idx, "effect", e.target.value)}
                                  >
                                    <option value="none">{t("effectNone")}</option>
                                    <option value="subtract">{t("effectSubtract")}</option>
                                  </select>
                                  <button className="miniBtn" onClick={() => removeSplitPerson(sec.id, sc.id, sc, idx)}>✕</button>
                                </td>
                                {months.map((m) => {
                                  const share = cellDisplayValue(sc.id, m) * (p.pct / 100);
                                  personRowTotal += share;
                                  return (
                                    <td className="cell splitShareCell" key={m}>
                                      <span className="mono">{fmtInt(Math.round(share))}</span>
                                    </td>
                                  );
                                })}
                                <td className="totalCell num small">{money(personRowTotal)}</td>
                              </tr>
                            );
                          })}
                          {!sc.split.collapsed && (sc.split.common || []).map((c, idx) => (
                            <tr className="splitRow splitCommon" key={c.id}>
                              <td className="catCol indent2 splitGrid">
                                <span className="gridSlot"></span>
                                <input className="splitNameInput gridName" placeholder={t("commonLabel")} value={c.label} onChange={(e) => renameSplitCommon(sec.id, sc.id, sc, idx, e.target.value)} />
                                <span className="gridSpacer"></span>
                                <span className="pctGroup">
                                  <button className="miniBtn tiny" onClick={() => repeatCommonToDecember(sec.id, sc.id, sc, idx)} title={t("repeatToDec")}>→</button>
                                </span>
                                <span className="gridSlot"></span>
                                <button className="miniBtn tiny" onClick={() => removeSplitCommon(sec.id, sc.id, sc, idx)}>✕</button>
                              </td>
                              {months.map((m) => {
                                const dispAmt = commonItemDisplayValue(c, m);
                                return (
                                <td className="cell splitCommonCell" key={m}>
                                  <input
                                    className="num"
                                    defaultValue={dispAmt ? fmtInt(dispAmt) : ""}
                                    key={m + "-" + dispAmt}
                                    placeholder={hideZeros ? "" : "0"}
                                    onFocus={(e) => { e.target.value = e.target.value.replace(/\./g, ""); e.target.select(); }}
                                    onBlur={(e) => {
                                      const typed = ctx.parseCellInput(e.target.value) || 0;
                                      const v = commonItemDisplayToRaw(c, m, typed);
                                      setSplitCommonMonth(sec.id, sc.id, sc, idx, m, v);
                                      e.target.value = typed ? fmtInt(typed) : "";
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                                  />
                                </td>
                                );
                              })}
                              <td className="cell"></td>
                            </tr>
                          ))}
                          {!sc.split.collapsed && (
                            <tr className="splitRow splitActions">
                              <td className="catCol indent2" colSpan={1}>
                                <button className="addSubBtn" onClick={() => addSplitPerson(sec.id, sc.id, sc)}>{t("addPerson")}</button>
                                <button className="addSubBtn" onClick={() => addSplitCommon(sec.id, sc.id, sc)}>{t("addCommon")}</button>
                              </td>
                              <td colSpan={months.length + 1}></td>
                            </tr>
                          )}
                        </>
                      )}
                      </React.Fragment>
                    );
                  })}
                  {expanded && (() => {
                    const personTotals = personTotalsForSection(sec);
                    const names = Object.keys(personTotals);
                    return (
                      <>
                        <tr>
                          <td className="catCol" style={{ paddingLeft: 26 }}>
                            {addingSubFor === sec.id ? (
                              <input
                                className="inlineAddInput"
                                autoFocus
                                placeholder={t("promptNewSub")}
                                onBlur={(e) => { commitNewSub(sec.id, e.target.value); setAddingSubFor(null); }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { commitNewSub(sec.id, e.target.value); e.target.value = ""; }
                                  if (e.key === "Escape") setAddingSubFor(null);
                                }}
                              />
                            ) : (
                              <button className="addSubBtn" onClick={() => setAddingSubFor(sec.id)}>{t("addSubcat")}</button>
                            )}
                            {names.length > 0 && (
                              <button className="personTotalsToggle" onClick={() => setShowPersonTotals((p) => ({ ...p, [sec.id]: !p[sec.id] }))}>
                                {showPersonTotals[sec.id] ? tx("− Ver totales por persona") : tx("+ Ver totales por persona")}
                              </button>
                            )}
                          </td>
                          <td colSpan={months.length + 1}></td>
                        </tr>
                        {showPersonTotals[sec.id] && names.map((name) => {
                          let rowTotal2 = 0;
                          return (
                            <tr className="splitRow personTotalRow" key={name}>
                              <td className="catCol splitGrid">
                                <span className="gridSlot"></span>
                                <span className="gridName personTotalName">{name}</span>
                                <span className="gridSpacer"></span>
                                <span className="gridSlot"></span>
                                <span className="gridSlot"></span>
                                <span className="gridSlot"></span>
                              </td>
                              {months.map((m) => {
                                const v = personTotals[name][m] || 0;
                                rowTotal2 += v;
                                return (
                                  <td className="cell splitShareCell" key={m}>
                                    <span className="mono">{v ? fmtInt(Math.round(v)) : ""}</span>
                                  </td>
                                );
                              })}
                              <td className="totalCell num small">{money(rowTotal2)}</td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })()}
                </React.Fragment>
              );
            })}
            <tr className="totalRow">
              <th className="catCol">{t("totalGastos")}</th>
              {months.map((m) => <td className="totalCell num" key={m}>{money(totalGastos(m), m)}</td>)}
              <td className="totalCell num">{money(months.reduce((a, m) => a + totalGastos(m), 0))}</td>
            </tr>
            {months.some((m) => pendingTotal(m)) && (
              <tr className="pendingRow">
                <th className="catCol"><span className="pendingMark" />{tx("Pendiente de pago")}</th>
                {months.map((m) => { const v = pendingTotal(m); return <td className="pendingCell num" key={m}>{v ? money(v, m) : ""}</td>; })}
                <td className="pendingCell num">{money(months.reduce((a, m) => a + pendingTotal(m), 0))}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="addSectionRow">
        <input
          placeholder={t("newSectionPlaceholder")}
          value={newSecName}
          onChange={(e) => setNewSecName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addSection(); }}
        />
        <button onClick={addSection}>{t("addSection")}</button>
      </div>
      <p className="hint" style={{ marginTop: 12, maxWidth: 700 }}>{t("dragHint")}</p>
      {copied && <span className="copiedNote">{tx("Columna copiada ✓")}</span>}
      {cellDetail && (
        <CellDetails ctx={ctx} month={cellDetail.month} subId={cellDetail.subId} onClose={() => setCellDetail(null)} style={{ position: "fixed", left: cellDetail.x, top: cellDetail.y }} />
      )}
      {cellMenu && (
        <div className="cellMenu" style={{ left: cellMenu.x, top: cellMenu.y }} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          <button
            className="cellMenuItem"
            onClick={() => { toggleUnpaid(cellMenu.month, cellMenu.subId); setCellMenu(null); }}
          >
            {isUnpaid(cellMenu.month, cellMenu.subId)
              ? <><span className="cellMenuIcon paid">✓</span>{tx("Marcar como pagado")}</>
              : <><span className="cellMenuIcon unpaid" />{tx("Marcar como no pagado")}</>}
          </button>
          {(() => {
            const c = getCell(cellMenu.month, cellMenu.subId);
            return (
              <div className="cellMenuItem cellMenuDue">
                <DateButton className="cellMenuDueLbl" value={c?.due || ""} title={tx("Fecha de vencimiento: te avisa en la barra de alertas")}
                  onChange={(v) => { ctx.setCellDue(cellMenu.month, cellMenu.subId, v); setCellMenu(null); }}>
                  <span className="cellMenuIcon">◷</span>{c?.due ? tx("Vence {date}", { date: fmtDue(c.due, getTxLang()) }) : tx("Fecha de vencimiento…")}
                </DateButton>
                {c?.due && <button className="cellMenuDueClear" onClick={() => { ctx.setCellDue(cellMenu.month, cellMenu.subId, null); setCellMenu(null); }} title={tx("Quitar vencimiento")}>✕</button>}
              </div>
            );
          })()}
          {(() => {
            const c = getCell(cellMenu.month, cellMenu.subId);
            if (!c || !(c.formula || (c.items || []).length)) return null;
            return (
              <button
                className="cellMenuItem"
                onClick={() => {
                  const W = 440, H = 420;
                  setCellDetail({ month: cellMenu.month, subId: cellMenu.subId, x: Math.max(8, Math.min(cellMenu.x, window.innerWidth - W - 12)), y: Math.max(8, Math.min(cellMenu.y, window.innerHeight - H - 12)) });
                  setCellMenu(null);
                }}
              >
                <span className="cellMenuIcon">≡</span>{tx("Ver detalles")}
              </button>
            );
          })()}
        </div>
      )}
    </>
  );
}
