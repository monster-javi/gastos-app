import React, { useRef } from "react";
import { Upload, Download } from "lucide-react";
import { tx } from "../tx.js";
import { setTheme, isLightTheme } from "../dialogs.js";

export default function SettingsModal({ ctx }) {
  const {
    t, setShowSettings, showConfirmModal, wipeAllData, hideZeros, setHideZeros,
    recalcOnCurrencyChange, setRecalcOnCurrencyChange, exportData, restoreData,
    lang, setLang, primaryCurrency, setPrimaryCurrency,
    learnedKeywordCap, setLearnedKeywordCap, clearAllLearnedKeywords,
  } = ctx;
  const restoreRef = useRef(null);

  // wipeAllData shows its own dialog (with the "también la Bóveda" option).
  function confirmWipe() {
    wipeAllData();
  }
  function confirmClearLearned() {
    showConfirmModal(
      tx("¿Borrar todas las palabras que la app aprendió sola de la lista mensual? Las que cargaste vos a mano en cada subcategoría no se tocan."),
      () => clearAllLearnedKeywords()
    );
  }

  return (
    <div className="gx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
      <div className="gx-modal-box gx-settings-box">
        <div className="gx-settings-header">
          <strong>{t("settingsTitle")}</strong>
          <button className="miniBtn" onClick={() => setShowSettings(false)}>{t("close")}</button>
        </div>

        <div className="gx-settings-group-title">{tx("General")}</div>
        <div className="gx-settings-row">
          <div>
            <div className="gx-settings-row-title">{t("lang")}</div>
          </div>
          <select className="pillBtn" style={{ padding: "6px 8px", width: 90 }} value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="es">ESP</option>
            <option value="en">ENG</option>
          </select>
        </div>
        <div className="gx-settings-row">
          <div>
            <div className="gx-settings-row-title">{t("currency")}</div>
          </div>
          <select className="pillBtn" style={{ padding: "6px 8px", width: 100 }} value={primaryCurrency} onChange={(e) => setPrimaryCurrency(e.target.value)}>
            <option value="ARS">ARS $</option>
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
          </select>
        </div>
        <div className="gx-settings-row">
          <div>
            <div className="gx-settings-row-title">{tx("Tema")}</div>
          </div>
          <select className="pillBtn" style={{ padding: "6px 8px", width: 100 }} defaultValue={isLightTheme() ? "light" : "dark"} onChange={(e) => setTheme(e.target.value)}>
            <option value="dark">{tx("Oscuro")}</option>
            <option value="light">{tx("Claro")}</option>
          </select>
        </div>

        <div className="gx-settings-group-title">{tx("Preferencias")}</div>
        <div className="gx-settings-row">
          <div className="gx-settings-row-title">{tx("Ocultar \"0\"")}</div>
          <button
            className={`switch ${hideZeros ? "switch--on" : ""}`}
            onClick={() => setHideZeros((v) => !v)}
            title={tx("Ocultar 0")}
          >
            <span className="switch-knob"></span>
          </button>
        </div>
        <div className="gx-settings-row">
          <div className="gx-settings-row-title">{tx("Recalcular conversión al cambiar moneda")}</div>
          <button
            className={`switch ${recalcOnCurrencyChange ? "switch--on" : ""}`}
            onClick={() => setRecalcOnCurrencyChange((v) => !v)}
            title={tx("Recalcular conversión al cambiar moneda")}
          >
            <span className="switch-knob"></span>
          </button>
        </div>

        <div className="gx-settings-group-title">{tx("Datos")}</div>
        <div className="gx-settings-row">
          <div className="gx-settings-row-title">{t("export")} / {t("restore")}</div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="pillBtn iconText" onClick={exportData}><Upload size={14} /> {t("export")}</button>
            <button className="pillBtn iconText" onClick={() => restoreRef.current?.click()}><Download size={14} /> {t("restore")}</button>
            <input ref={restoreRef} type="file" accept="application/json" style={{ display: "none" }} onChange={restoreData} />
          </div>
        </div>

        <div className="gx-settings-group-title">{tx("Categorización automática")}</div>
        <div className="gx-settings-row">
          <div className="gx-settings-row-title">{tx("Palabras aprendidas a recordar por subcategoría")}</div>
          <input
            type="number"
            min={1}
            className="pillBtn"
            style={{ padding: "6px 8px", width: 70, textAlign: "center" }}
            value={learnedKeywordCap}
            onChange={(e) => setLearnedKeywordCap(e.target.value)}
          />
        </div>
        <div className="gx-settings-row">
          <div className="gx-settings-row-title">{tx("Borrar palabras aprendidas automáticamente")}</div>
          <button className="pillBtn" onClick={confirmClearLearned}>{tx("Borrar aprendidas")}</button>
        </div>

        <div className="gx-settings-group-title">{tx("Zona de riesgo")}</div>
        <div className="gx-settings-row gx-settings-danger">
          <div className="gx-settings-row-title">{t("wipeAllData")}</div>
          <button className="gx-danger-btn" onClick={confirmWipe}>{t("wipeAllData")}</button>
        </div>
      </div>
    </div>
  );
}
