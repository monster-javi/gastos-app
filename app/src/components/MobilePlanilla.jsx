import DateButton from "./DatePicker.jsx";
import { fmtDue } from "../alerts.js";
import React, { useRef, useState } from "react";
import { normalize, fmtInt } from "../utils.js";
import MonthPicker from "./MonthPicker.jsx";
import CellDetails from "./CellDetails.jsx";
import { tx, getTxLang } from "../tx.js";

export default function MobilePlanilla({ ctx }) {
  const {
    sections, setSections, saveSections, selectedMonth, goMonth, finalValuePesos, money, totalGastos,
    planillaSearch, setPlanillaSearch, sectionColor, cellDisplayValue, displayToRaw, macroTags, autoSum, hideZeros,
    getCell, setCellData, saveCellData, evalFormula, parseCellInput, primaryCurrency, showPromptModal, showFavoritesOnly,
    isUnpaid, toggleUnpaid, pendingTotal,
  } = ctx;
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const pressTimer = useRef(null);
  const pressFired = useRef(false);
  const pressStartX = useRef(0);
  const pressStartY = useRef(0);
  const [editSheet, setEditSheet] = useState(null); // { secId, subId, name, macro }
  const [detailSub, setDetailSub] = useState(null); // subId whose "Ver detalles" sheet is open

  function toggleCurrency(month, subId) {
    setCellData((prev) => {
      const next = { ...prev, [month]: { ...(prev[month] || {}) } };
      const existing = next[month][subId] || { value: 0, currency: null };
      const others = ["ARS", "USD", "EUR"].filter((c) => c !== primaryCurrency);
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
    const cell = getCell(month, subId);
    if (!cell || !cell.currency) return "";
    return cell.currency === "USD" ? "usd" : cell.currency === "EUR" ? "eur" : "ars";
  }

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goMonth(1); // swipe left -> next month
      else goMonth(-1); // swipe right -> previous month
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  function startPress(e, onLongPress) {
    pressStartX.current = e.touches[0].clientX;
    pressStartY.current = e.touches[0].clientY;
    pressFired.current = false;
    pressTimer.current = setTimeout(() => { pressFired.current = true; onLongPress(); }, 550);
  }
  function movePress(e) {
    const dx = Math.abs(e.touches[0].clientX - pressStartX.current);
    const dy = Math.abs(e.touches[0].clientY - pressStartY.current);
    // Any real drag (scrolling) cancels the long-press AND the tap — this was
    // triggering collapse/expand by accident while just trying to scroll.
    if (dx > 8 || dy > 8) { cancelPress(); pressFired.current = true; }
  }
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }
  function longPressHandlers(onLongPress, onClick) {
    return {
      onTouchStart: (e) => startPress(e, onLongPress),
      onTouchMove: movePress,
      onTouchEnd: (e) => { cancelPress(); if (!pressFired.current && onClick) onClick(); },
    };
  }

  function renameSection(secId, currentName) {
    showPromptModal(tx("Renombrar rubro"), (name) => {
      const clean = (name || "").trim();
      if (!clean) return;
      const next = sections.map((s) => (s.id === secId ? { ...s, name: clean } : s));
      setSections(next);
      saveSections(next);
    }, currentName, tx("Guardar"));
  }
  function openEditSheet(secId, subId, sc) {
    setEditSheet({ secId, subId, name: sc.name, macro: sc.macro });
  }
  function saveEditSheet() {
    if (!editSheet) return;
    const clean = editSheet.name.trim();
    if (!clean) return;
    const next = sections.map((s) => (s.id === editSheet.secId
      ? { ...s, subcats: s.subcats.map((sc) => (sc.id === editSheet.subId ? { ...sc, name: clean, macro: editSheet.macro } : sc)) }
      : s));
    setSections(next);
    saveSections(next);
    setEditSheet(null);
  }
  function toggleFavoriteSub(secId, subId) {
    const next = sections.map((s) => (s.id === secId ? { ...s, subcats: s.subcats.map((sc) => (sc.id === subId ? { ...sc, favorite: !sc.favorite } : sc)) } : s));
    setSections(next);
    saveSections(next);
  }
  function toggleSectionCollapse(secId) {
    const next = sections.map((s) => (s.id === secId ? { ...s, collapsed: !s.collapsed } : s));
    setSections(next);
    saveSections(next);
  }

  function commitMobileCell(subId, month, rawStr) {
    const trimmed = String(rawStr).trim();
    if (trimmed === "") {
      setCellData((prev) => {
        const next = { ...prev, [month]: { ...(prev[month] || {}) } };
        const existing = next[month][subId];
        const cur = existing ? existing.currency || null : null;
        next[month][subId] = { value: 0, currency: cur, enteredCurrency: cur ? undefined : primaryCurrency, ...(existing?.unpaid ? { unpaid: true } : {}) };
        saveCellData(next);
        return next;
      });
      return 0;
    }
    let n, formula;
    if (trimmed.startsWith("=")) {
      n = evalFormula(trimmed);
      if (isNaN(n)) return undefined;
      formula = trimmed;
    } else {
      const parsed = parseCellInput(trimmed);
      const cell = getCell(month, subId);
      n = (cell && cell.currency) ? parsed : displayToRaw(subId, month, parsed);
    }
    setCellData((prev) => {
      const next = { ...prev, [month]: { ...(prev[month] || {}) } };
      const existing = next[month][subId];
      const cur = existing ? existing.currency || null : null;
      next[month][subId] = { value: n, currency: cur, formula, enteredCurrency: cur ? undefined : primaryCurrency, ...(existing?.unpaid ? { unpaid: true } : {}), ...(formula && existing?.items ? { items: existing.items } : {}) };
      saveCellData(next);
      return next;
    });
    return cellDisplayValue(subId, month);
  }

  const q = normalize(planillaSearch.trim());

  return (
    <div className="mobilePlanilla">
      <div className="mobileMonthNav">
        <button className="mobileMonthBtn" onClick={() => goMonth(-1)}>‹</button>
        <MonthPicker ctx={ctx} monthKey={selectedMonth} />
        <button className="mobileMonthBtn" onClick={() => goMonth(1)}>›</button>
      </div>

      <div className="mobileList" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {sections.map((sec, si) => {
          const secMatches = q && normalize(sec.name).includes(q);
          let subs = !q
            ? sec.subcats
            : sec.subcats.filter((sc) => secMatches || normalize(sc.name).includes(q));
          if (showFavoritesOnly) subs = subs.filter((sc) => sc.favorite);
          const anyFilterActive = !!q || showFavoritesOnly;
          if (anyFilterActive && subs.length === 0) return null;
          const expanded = anyFilterActive ? true : !sec.collapsed;
          const secTotal = sec.subcats.reduce((a, sc) => a + finalValuePesos(sc.id, selectedMonth), 0);
          return (
            <div key={sec.id} className="mobileSection">
              <div
                className="mobileSectionHeader"
                style={{ borderLeftColor: sectionColor(si), "--chip": sectionColor(si) }}
                {...longPressHandlers(() => renameSection(sec.id, sec.name), () => toggleSectionCollapse(sec.id))}
              >
                <span>{sec.name}</span>
                <span className="mobileSecRight">
                  {!expanded && secTotal ? <span className="mobileSecTotalPill">{money(secTotal, selectedMonth)}</span> : null}
                  <span className="mobileSecChevron">{expanded ? "⌄" : "›"}</span>
                </span>
              </div>
              {expanded && subs.map((sc) => {
                const disp = cellDisplayValue(sc.id, selectedMonth);
                return (
                  <div key={sc.id} className="mobileRow">
                    <button
                      className={`favStar mobileFavStar ${sc.favorite ? "on" : ""}`}
                      onClick={() => toggleFavoriteSub(sec.id, sc.id)}
                      title={sc.favorite ? tx("Quitar de favoritos") : tx("Marcar como favorito")}
                    >{sc.favorite ? "★" : "☆"}</button>
                    <span className="mobileRowName" {...longPressHandlers(() => openEditSheet(sec.id, sc.id, sc))}>{sc.name}</span>
                    <div className={`mobileRowValueWrap ${isUnpaid(selectedMonth, sc.id) ? "unpaid" : ""}`}>
                      <input
                        className="mobileRowInput"
                        defaultValue={disp ? fmtInt(disp) : ""}
                        key={sc.id + "-" + selectedMonth + "-" + disp}
                        placeholder={hideZeros ? "" : "0"}
                        inputMode="decimal"
                        onFocus={(e) => e.target.select()}
                        onBlur={(e) => {
                          const n = commitMobileCell(sc.id, selectedMonth, e.target.value);
                          e.target.value = n ? fmtInt(n) : "";
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                      />
                      <button
                        className={`mobileCurToggle ${curClass(selectedMonth, sc.id)}`}
                        onClick={() => toggleCurrency(selectedMonth, sc.id)}
                        title={tx("Cambiar moneda de esta celda")}
                      >
                        {curSymbol(getCell(selectedMonth, sc.id)?.currency)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mobileTotalCard">
        <div className="mobileTotalLine">
          <span>{tx("Total del mes")}</span>
          <strong>{money(totalGastos(selectedMonth), selectedMonth)}</strong>
        </div>
        {pendingTotal(selectedMonth) ? (
          <div className="mobileTotalLine pending">
            <span><span className="pendingMark" />{tx("Pendiente de pago")}</span>
            <strong>{money(pendingTotal(selectedMonth), selectedMonth)}</strong>
          </div>
        ) : null}
      </div>

      {detailSub && <CellDetails ctx={ctx} month={selectedMonth} subId={detailSub} onClose={() => setDetailSub(null)} sheet />}
      {editSheet && (
        <div className="mobileSheetOverlay" onClick={(e) => { if (e.target === e.currentTarget) setEditSheet(null); }}>
          <div className="mobileSheet">
            <div className="mobileSheetTitle">{tx("Editar subcategoría")}</div>
            <input
              className="gx-inline-input"
              value={editSheet.name}
              onChange={(e) => setEditSheet({ ...editSheet, name: e.target.value })}
              placeholder={tx("Nombre")}
              autoFocus
            />
            <select
              className="gx-inline-input"
              value={editSheet.macro}
              onChange={(e) => setEditSheet({ ...editSheet, macro: e.target.value })}
              style={{ marginTop: 8 }}
            >
              {macroTags.map((mt) => <option value={mt.id} key={mt.id}>{mt.name}</option>)}
            </select>
            <button
              className={`mobileUnpaidToggle ${isUnpaid(selectedMonth, editSheet.subId) ? "on" : ""}`}
              onClick={() => toggleUnpaid(selectedMonth, editSheet.subId)}
            >
              <span className="pendingMark" />
              {isUnpaid(selectedMonth, editSheet.subId) ? tx("No pagado este mes — tocar para marcar pagado") : tx("Marcar como no pagado este mes")}
            </button>
            {(() => {
              const c = getCell(selectedMonth, editSheet.subId);
              return (
                <div className="mobileDueRow">
                  <span>◷ {tx("Vence")}</span>
                  <DateButton className="gx-inline-input mobileDueBtn" value={c?.due || ""}
                    onChange={(v) => ctx.setCellDue(selectedMonth, editSheet.subId, v)}>
                    {c?.due ? fmtDue(c.due, getTxLang()) : tx("Elegir fecha")}
                  </DateButton>
                  {c?.due && <button className="pillBtn" onClick={() => ctx.setCellDue(selectedMonth, editSheet.subId, null)}>{tx("Quitar")}</button>}
                </div>
              );
            })()}
            {(() => {
              const c = getCell(selectedMonth, editSheet.subId);
              if (!c || !(c.formula || (c.items || []).length)) return null;
              return (
                <button className="mobileUnpaidToggle" onClick={() => { setDetailSub(editSheet.subId); setEditSheet(null); }}>
                  ≡ {tx("Ver detalles de {mes}", { mes: selectedMonth ? ctx.monthFullLabel(selectedMonth, getTxLang()).toLowerCase() : "" })}
                </button>
              );
            })()}
            <div className="mobileSheetActions">
              <button className="miniBtn" onClick={() => setEditSheet(null)}>{tx("Cancelar")}</button>
              <button className="primaryTop" onClick={saveEditSheet}>{tx("Guardar")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
