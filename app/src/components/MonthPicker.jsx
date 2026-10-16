import React, { useEffect, useRef, useState } from "react";
import { MONTH_ABBR_ES, MONTH_ABBR_EN } from "../utils.js";
import { tx } from "../tx.js";

export default function MonthPicker({ ctx, monthKey, label }) {
  const { lang, pickMonth } = ctx;
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(parseInt(monthKey.split("-")[0], 10));
  const wrapRef = useRef(null);

  const [selYear, selMonth] = monthKey.split("-").map(Number);
  const months = lang === "en" ? MONTH_ABBR_EN : MONTH_ABBR_ES;

  useEffect(() => {
    if (open) setPickerYear(selYear);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(mIdx) {
    const mm = String(mIdx + 1).padStart(2, "0");
    pickMonth(`${pickerYear}-${mm}`);
    setOpen(false);
  }

  return (
    <div className="monthPickerWrap" ref={wrapRef}>
      <button className="monthPickerTrigger" onClick={() => setOpen((v) => !v)}>
        {label || `${ctx.monthFullLabel(monthKey, lang)} ${selYear}`}
      </button>
      {open && (
        <div className="monthPickerPop">
          <div className="monthPickerHeader">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="pillBtn" onClick={() => setPickerYear((y) => y - 1)}>‹</button>
              <span className="monthPickerYear">{pickerYear}</span>
              <button className="pillBtn" onClick={() => setPickerYear((y) => y + 1)}>›</button>
            </div>
            <button className="pillBtn" onClick={() => { ctx.goToday(); setOpen(false); }}>{tx("Hoy")}</button>
          </div>
          <div className="monthPickerGrid">
            {months.map((m, i) => {
              const isSelected = pickerYear === selYear && i + 1 === selMonth;
              return (
                <button
                  key={m}
                  className={`monthPickerCell ${isSelected ? "selected" : ""}`}
                  onClick={() => choose(i)}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
