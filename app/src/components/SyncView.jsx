import React, { useState } from "react";
import { tx } from "../tx.js";

function fetchJSONP(url) {
  return new Promise((resolve, reject) => {
    const cbName = "jsonp_cb_" + Date.now();
    window[cbName] = (data) => { resolve(data); cleanup(); };
    const script = document.createElement("script");
    script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cbName;
    script.onerror = () => { reject(new Error(tx("No se pudo conectar (revisá la URL)"))); cleanup(); };
    function cleanup() { delete window[cbName]; script.remove(); }
    document.body.appendChild(script);
    setTimeout(() => { if (window[cbName]) { reject(new Error(tx("Tiempo de espera agotado"))); cleanup(); } }, 10000);
  });
}

export default function SyncView({ ctx }) {
  const { t, lang, plannerYear, syncMonth, setSyncMonth, syncConfig, setSyncConfig, saveSyncConfig, monthLabel, allSubcatsFlat, finalValuePesos, cellData, setCellData, saveCellData } = ctx;

  const [url, setUrl] = useState(syncConfig.url || "");
  const [token, setToken] = useState(syncConfig.token || "");
  const [sheet, setSheet] = useState(syncConfig.sheet || "");
  const [cell, setCell] = useState((syncConfig.monthCells || {})[syncMonth] || "");
  const [status, setStatus] = useState({ msg: "", err: false });

  const months = Array.from({ length: 12 }, (_, i) => `${plannerYear}-${String(i + 1).padStart(2, "0")}`);
  const mappedEntries = Object.entries(syncConfig.monthCells || {});

  function persistBase() {
    const next = { ...syncConfig, url: url.trim(), token: token.trim(), sheet: sheet.trim() };
    setSyncConfig(next);
    saveSyncConfig(next);
    return next;
  }

  function saveMonthCell() {
    const base = persistBase();
    const next = { ...base, monthCells: { ...(base.monthCells || {}), [syncMonth]: cell.trim() } };
    setSyncConfig(next);
    saveSyncConfig(next);
  }

  async function syncPull() {
    const base = persistBase();
    const c = (base.monthCells || {})[syncMonth];
    const flat = allSubcatsFlat();
    if (!base.url || !c) { setStatus({ msg: tx("Falta URL o celda para este mes"), err: true }); return; }
    const reqUrl = `${base.url}?sheet=${encodeURIComponent(base.sheet)}&cell=${encodeURIComponent(c)}&count=${flat.length}&token=${encodeURIComponent(base.token)}`;
    setStatus({ msg: tx("Trayendo..."), err: false });
    try {
      const data = await fetchJSONP(reqUrl);
      if (data && data.error) throw new Error(data.error);
      const next = { ...cellData };
      flat.forEach((sc, i) => {
        next[syncMonth] = { ...(next[syncMonth] || {}) };
        next[syncMonth][sc.id] = { value: Number(data[i]) || 0, currency: "ARS" };
      });
      setCellData(next);
      saveCellData(next);
      setStatus({ msg: tx("Traído ✓"), err: false });
    } catch (e) {
      setStatus({ msg: tx("Error: {msg}", { msg: e.message }), err: true });
    }
  }

  async function syncPush() {
    const base = persistBase();
    const c = (base.monthCells || {})[syncMonth];
    const flat = allSubcatsFlat();
    if (!base.url || !c) { setStatus({ msg: tx("Falta URL o celda para este mes"), err: true }); return; }
    const values = flat.map((sc) => Math.round(finalValuePesos(sc.id, syncMonth)));
    const body = JSON.stringify({ sheet: base.sheet, cell: c, values, token: base.token });
    setStatus({ msg: tx("Enviando..."), err: false });
    try {
      await fetch(base.url, { method: "POST", mode: "no-cors", body });
      setStatus({ msg: tx("Enviado ✓ (sin confirmación por CORS)"), err: false });
    } catch (e) {
      setStatus({ msg: tx("Error: {msg}", { msg: e.message }), err: true });
    }
  }

  return (
    <>
      <p className="hint" style={{ maxWidth: 640, marginBottom: 16 }}>{t("syncHint")}</p>
      <div className="syncGrid">
        <div><label>{t("webAppUrl")}</label><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" /></div>
        <div><label>{t("token")}</label><input value={token} onChange={(e) => setToken(e.target.value)} /></div>
        <div><label>{t("sheetName")}</label><input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="2026" /></div>
        <div>
          <label>{t("monthToSync")}</label>
          <select value={syncMonth} onChange={(e) => { setSyncMonth(e.target.value); setCell((syncConfig.monthCells || {})[e.target.value] || ""); }}>
            {months.map((m) => <option value={m} key={m}>{monthLabel(m, lang)}</option>)}
          </select>
        </div>
      </div>
      <div className="syncGrid" style={{ gridTemplateColumns: "1fr auto" }}>
        <div><label>{t("startCell")} {monthLabel(syncMonth, lang)}</label><input value={cell} onChange={(e) => setCell(e.target.value)} placeholder={tx("ej: D18")} /></div>
        <div style={{ alignSelf: "end" }}><button className="pillBtn" onClick={saveMonthCell}>{t("saveCell")}</button></div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0 20px" }}>
        <button className="pillBtn" onClick={syncPull}>{t("pull")}</button>
        <button className="primaryTop" onClick={syncPush}>{t("push")}</button>
        {status.msg && <span className={`syncStatus ${status.err ? "err" : "ok"}`}>{status.msg}</span>}
      </div>
      {mappedEntries.length > 0 && (
        <div className="mapList">
          <div className="hint" style={{ marginBottom: 6 }}>{t("savedCells")}</div>
          {mappedEntries.map(([m, c]) => (
            <div className="mapRow" key={m}><span className="m">{monthLabel(m, lang)}</span><span className="c mono">{c}</span></div>
          ))}
        </div>
      )}
    </>
  );
}
