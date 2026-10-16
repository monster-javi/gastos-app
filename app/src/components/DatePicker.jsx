import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MONTH_FULL_ES, MONTH_FULL_EN } from "../utils.js";
import { tx, getTxLang } from "../tx.js";

// Calendario con la misma estética que el selector de mes de la planilla.
// value / onPick usan "YYYY-MM-DD".

function iso(y, m, d) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function todayIso() { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); }
const DOW_ES = ["L", "M", "M", "J", "V", "S", "D"];
const DOW_EN = ["M", "T", "W", "T", "F", "S", "S"];

export function DatePopover({ anchorRect, value, onPick, onClose, onClear }) {
  const base = value || todayIso();
  const [y0, m0] = base.split("-").map(Number);
  const [view, setView] = useState({ y: y0, m: m0 - 1 });
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const lang = getTxLang();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchorRect) return;
    const W = el.offsetWidth, H = el.offsetHeight;
    let left = anchorRect.left + anchorRect.width / 2 - W / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
    let top = anchorRect.bottom + 6;
    if (top + H > window.innerHeight - 8) top = Math.max(8, anchorRect.top - H - 6);
    setPos({ left, top });
  }, [anchorRect, view]);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("touchstart", onDoc, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("touchstart", onDoc, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const first = new Date(view.y, view.m, 1);
  const startDow = (first.getDay() + 6) % 7; // lunes primero
  const daysIn = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const today = todayIso();
  const shift = (delta) => setView((v) => { let m = v.m + delta, y = v.y; while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } return { y, m }; });
  const monthName = (lang === "en" ? MONTH_FULL_EN : MONTH_FULL_ES)[view.m];

  return createPortal(
    <div className="gx-root gxDatePopWrap">
      <div className="monthPickerPop gxDatePop" ref={ref} style={{ left: pos.left, top: pos.top }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="monthPickerHeader">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="pillBtn" onClick={() => shift(-1)}>‹</button>
            <span className="monthPickerYear gxDateTitle">{monthName} {view.y}</span>
            <button className="pillBtn" onClick={() => shift(1)}>›</button>
          </div>
          <button className="pillBtn" onClick={() => onPick(today)}>{tx("Hoy")}</button>
        </div>
        <div className="gxDateDow">{(lang === "en" ? DOW_EN : DOW_ES).map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="gxDateGrid">
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const k = iso(view.y, view.m, d);
            return (
              <button key={i} className={`monthPickerCell gxDateCell ${k === value ? "selected" : ""} ${k === today ? "today" : ""}`} onClick={() => onPick(k)}>{d}</button>
            );
          })}
        </div>
        {onClear && value && <button className="pillBtn gxDateClear" onClick={onClear}>{tx("Quitar fecha")}</button>}
      </div>
    </div>,
    document.body
  );
}

// Botón que abre el calendario. children = lo que se muestra en el botón.
export default function DateButton({ value, onChange, onClear, className, title, children }) {
  const [rect, setRect] = useState(null);
  const btn = useRef(null);
  return (
    <>
      <button type="button" ref={btn} className={className} title={title}
        onClick={(e) => { e.stopPropagation(); setRect(rect ? null : btn.current.getBoundingClientRect()); }}>
        {children}
      </button>
      {rect && (
        <DatePopover anchorRect={rect} value={value}
          onPick={(v) => { onChange(v); setRect(null); }}
          onClear={onClear ? () => { onClear(); setRect(null); } : undefined}
          onClose={() => setRect(null)} />
      )}
    </>
  );
}
