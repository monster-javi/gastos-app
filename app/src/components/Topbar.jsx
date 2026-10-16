import React, { useRef, useState } from "react";
import { Cloud, Settings, Upload, Download, Lock, LockOpen, Menu } from "lucide-react";
import MonthPicker from "./MonthPicker.jsx";
import { uid } from "../utils.js";
import { tx } from "../tx.js";

function GlobalControls({ ctx }) {
  const { t, lang, setLang, primaryCurrency, setPrimaryCurrency } = ctx;
  return (
    <>
      <select className="pillBtn" style={{ padding: "6px 8px", width: 66, flexShrink: 0 }} title={t("lang")} value={lang} onChange={(e) => setLang(e.target.value)}>
        <option value="es">ESP</option>
        <option value="en">ENG</option>
      </select>
      <select className="pillBtn" style={{ padding: "6px 8px", width: 76, flexShrink: 0 }} title={t("currency")} value={primaryCurrency} onChange={(e) => setPrimaryCurrency(e.target.value)}>
        <option value="ARS">ARS $</option>
        <option value="USD">USD $</option>
        <option value="EUR">EUR €</option>
      </select>
    </>
  );
}

function SettingsButton({ ctx }) {
  const { setShowSettings } = ctx;
  return (
    <button className="pillBtn icon-only" onClick={() => setShowSettings(true)} title={tx("Configuración")}>
      <Settings size={14} />
    </button>
  );
}

function EncryptionButton({ ctx }) {
  const { setShowEncryption, encMeta } = ctx;
  return (
    <button
      className={`pillBtn icon-only ${encMeta?.encrypted ? "on" : ""}`}
      onClick={() => setShowEncryption(true)}
      title={encMeta?.encrypted ? tx("Cifrado activado") : tx("Cifrado de datos")}
    >
      {encMeta?.encrypted ? <Lock size={14} /> : <LockOpen size={14} />}
    </button>
  );
}

function ResumenEncryptionButton({ ctx }) {
  const { resumenEncMeta, resumenNeedsUnlock, lockResumen, showConfirmModal } = ctx;
  if (!resumenEncMeta?.encrypted) {
    return <button className="pillBtn iconText" disabled title={tx("Esta sección todavía no tiene contraseña configurada")}><LockOpen size={14} /> {tx("Sin cifrar")}</button>;
  }
  if (resumenNeedsUnlock) {
    return <button className="pillBtn iconText on" disabled title={tx("Bloqueada")}><Lock size={14} /> {tx("Bloqueada")}</button>;
  }
  return (
    <button
      className="pillBtn iconText on"
      onClick={() => showConfirmModal(tx("¿Bloquear la Bóveda ahora? Vas a necesitar la contraseña de esta sección para volver a entrar."), lockResumen)}
      title={tx("Bloquear esta sección")}
    >
      <Lock size={14} /> {tx("Cifrada")}
    </button>
  );
}

function SyncButton({ ctx }) {
  const { view, setView } = ctx;
  return (
    <button
      className={`pillBtn icon-only syncIconBtn ${view === "sync" ? "on" : ""}`}
      onClick={() => setView("sync")}
      title={tx("Sincronizar con Google Sheets")}
    >
      <Cloud size={14} />
    </button>
  );
}

function MobilePlanillaHeader({ ctx }) {
  const { t, setView, setFilterSubcat, setShowSettings, planillaSearch, setPlanillaSearch, showFavoritesOnly, setShowFavoritesOnly, sections, setSections, saveSections, showPromptModal } = ctx;
  const [navOpen, setNavOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  function go(v) {
    setView(v);
    setFilterSubcat(null);
    setNavOpen(false);
  }

  function addRubro() {
    setAddOpen(false);
    showPromptModal(tx("Nombre del nuevo rubro"), (name) => {
      const clean = (name || "").trim();
      if (!clean) return;
      const next = [...sections, { id: uid(), name: clean, subcats: [] }];
      setSections(next);
      saveSections(next);
    }, "", tx("Crear"));
  }

  function addSubcatTo(secId) {
    setAddOpen(false);
    showPromptModal(tx("Nombre de la subcategoría"), (name) => {
      const clean = (name || "").trim();
      if (!clean) return;
      const next = sections.map((s) => (s.id === secId
        ? { ...s, subcats: [...s.subcats, { id: uid(), name: clean, macro: "SIN_ASIGNAR", keywords: [clean.toUpperCase()] }] }
        : s));
      setSections(next);
      saveSections(next);
    }, "", tx("Crear"));
  }

  return (
    <div className="mobileHeaderWrap">
      <div className="mobileHeaderRow">
        <div className="mobileNavMenuWrap">
          <button className="pillBtn icon-only" onClick={() => setNavOpen((v) => !v)} title={tx("Menú")}>
            <Menu size={18} />
          </button>
          {navOpen && (
            <>
              <div className="mobileNavBackdrop" onClick={() => setNavOpen(false)}></div>
              <div className="mobileNavMenu">
                <div className="mobileNavMenuItem" onClick={() => go("planilla")}>{t("navPlanilla")}</div>
                <div className="mobileNavMenuItem" onClick={() => go("lista")}>{t("navLista")}</div>
                <div className="mobileNavMenuItem" onClick={() => go("deudas")}>{tx("Deudas")}</div>
                <div className="mobileNavMenuItem" onClick={() => go("resumen")}>{tx("Bóveda")}</div>
                <div className="mobileNavDivider" />
                <div className="mobileNavMenuItem" onClick={() => go("facturacion")}>{tx("Facturación")}</div>
                <div className="mobileNavMenuItem" onClick={() => go("resumenes")}>{tx("Resúmenes")}</div>
                {/* Lista del mes: ícono reservado para implementar a futuro en mobile */}
              </div>
            </>
          )}
        </div>
        <span className="searchBoxWrap mobileSearchWrap">
          <input
            className="searchBox mobileSearch"
            placeholder={tx("Buscar")}
            value={planillaSearch}
            onChange={(e) => setPlanillaSearch(e.target.value)}
          />
          {planillaSearch && <button className="searchClearBtn" onClick={() => setPlanillaSearch("")} title={tx("Borrar búsqueda")}>✕</button>}
        </span>
        <button
          className={`pillBtn icon-only favoritesFilterBtn ${showFavoritesOnly ? "on" : ""}`}
          onClick={() => setShowFavoritesOnly((v) => !v)}
          title={tx("Ver solo las subcategorías favoritas")}
        >★</button>
        <div className="mobileNavMenuWrap">
          <button className="mobileAddBtn" onClick={() => setAddOpen((v) => !v)} title={tx("Agregar")}>+</button>
          {addOpen && (
            <>
              <div className="mobileNavBackdrop" onClick={() => setAddOpen(false)}></div>
              <div className="mobileNavMenu mobileNavMenu--right">
                <div className="mobileNavMenuItem" onClick={addRubro}>{tx("+ RUBRO")}</div>
                <div className="mobileNavMenuDivider"></div>
                {sections.map((s) => (
                  <div className="mobileNavMenuItem" key={s.id} onClick={() => addSubcatTo(s.id)}>{s.name}</div>
                ))}
              </div>
            </>
          )}
        </div>
        <button className="pillBtn icon-only" onClick={() => setShowSettings(true)} title={tx("Configuración")}><Settings size={18} /></button>
      </div>
      <div className="mobileHeaderDivider"></div>
    </div>
  );
}

function MobileGenericHeader({ ctx, title, showMonthPicker }) {
  const { t, setView, setFilterSubcat, setShowSettings, selectedMonth, lang, monthFullLabel } = ctx;
  const [navOpen, setNavOpen] = useState(false);
  const monthLabelRaw = monthFullLabel(selectedMonth, lang);
  const monthLabelCap = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
  function go(v) {
    setView(v);
    setFilterSubcat(null);
    setNavOpen(false);
  }
  return (
    <div className="mobileHeaderWrap">
      <div className="mobileHeaderRow">
        <div className="mobileNavMenuWrap">
          <button className="pillBtn icon-only" onClick={() => setNavOpen((v) => !v)} title={tx("Menú")}>
            <Menu size={18} />
          </button>
          {navOpen && (
            <>
              <div className="mobileNavBackdrop" onClick={() => setNavOpen(false)}></div>
              <div className="mobileNavMenu">
                <div className="mobileNavMenuItem" onClick={() => go("planilla")}>{t("navPlanilla")}</div>
                <div className="mobileNavMenuItem" onClick={() => go("lista")}>{t("navLista")}</div>
                <div className="mobileNavMenuItem" onClick={() => go("deudas")}>{tx("Deudas")}</div>
                <div className="mobileNavMenuItem" onClick={() => go("resumen")}>{tx("Bóveda")}</div>
                <div className="mobileNavDivider" />
                <div className="mobileNavMenuItem" onClick={() => go("facturacion")}>{tx("Facturación")}</div>
                <div className="mobileNavMenuItem" onClick={() => go("resumenes")}>{tx("Resúmenes")}</div>
              </div>
            </>
          )}
        </div>
        <div className="mobileHeaderTitle">
          {showMonthPicker
            ? <MonthPicker ctx={ctx} monthKey={selectedMonth} label={tx("Lista de {month} {year}", { month: monthLabelCap, year: selectedMonth.split("-")[0] })} />
            : title}
        </div>
        <button className="pillBtn icon-only" onClick={() => setShowSettings(true)} title={tx("Configuración")}><Settings size={18} /></button>
      </div>
      <div className="mobileHeaderDivider"></div>
    </div>
  );
}

export default function Topbar({ ctx }) {
  const { t, view, selectedMonth, lang, goMonth, goToday, changePlannerYear, plannerYear, notebookMode, showAllMonthsOverride, setShowAllMonthsOverride, filterSubcat, findSubcat, transactions, hideCategorized, setHideCategorized, showFavoritesOnly, setShowFavoritesOnly, showUnpaidOnly, setShowUnpaidOnly, setFilterSubcat, searchTerm, setSearchTerm, planillaSearch, setPlanillaSearch, exportData, restoreData, clearMonth, isMobile } = ctx;
  const effectiveNotebookMode = notebookMode && !showAllMonthsOverride;
  const restoreRef = useRef(null);

  const unassignedN = transactions.filter((tr) => tr.month === selectedMonth && !(tr.catId && ctx.findSubcat(tr.catId))).length;

  let title = "";
  if (view === "planilla") title = t("titlePlanilla");
  else if (view === "lista") title = filterSubcat ? (findSubcat(filterSubcat)?.name || t("titleLista")) : t("titleLista");
  else if (view === "deudas") title = tx("Deudas");
  else if (view === "resumen") title = tx("Bóveda");
  else if (view === "facturacion") title = tx("Facturación");
  else if (view === "resumenes") title = tx("Resúmenes");
  else if (view === "sync") title = t("titleSync");

  return (
    <div className="topbar">
      {!(isMobile && (view === "planilla" || view === "deudas" || view === "lista" || view === "resumen" || view === "facturacion" || view === "resumenes")) && <h1>{title}</h1>}
      {view === "planilla" && !isMobile && (
        <>
          <div className="monthNav">
            <button onClick={() => goMonth(-1)}>‹</button>
            <MonthPicker ctx={ctx} monthKey={selectedMonth} />
            <button onClick={() => goMonth(1)}>›</button>
          </div>
          {!effectiveNotebookMode && (
            <div className="yearNav" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="pillBtn" onClick={() => changePlannerYear(-1)}>‹</button>
              <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 40, textAlign: "center", display: "inline-block" }}>{plannerYear}</span>
              <button className="pillBtn" onClick={() => changePlannerYear(1)}>›</button>
            </div>
          )}
          <button className="pillBtn" onClick={goToday}>{t("today")}</button>
          <span className="searchBoxWrap">
            <input
              className="searchBox"
              placeholder={tx("Buscar…")}
              value={planillaSearch}
              onChange={(e) => setPlanillaSearch(e.target.value)}
            />
            {planillaSearch && <button className="searchClearBtn" onClick={() => setPlanillaSearch("")} title={tx("Borrar búsqueda")}>✕</button>}
          </span>
          <button
            className={`pillBtn favoritesFilterBtn ${showFavoritesOnly ? "on" : ""}`}
            onClick={() => setShowFavoritesOnly((v) => !v)}
            title={tx("Ver solo las subcategorías favoritas")}
          >{tx("★ Favoritos")}</button>
          <button
            className={`pillBtn unpaidFilterBtn ${showUnpaidOnly ? "on" : ""}`}
            onClick={() => setShowUnpaidOnly((v) => !v)}
            title={tx("Ver solo las subcategorías con gastos sin pagar en el año")}
          ><span className="pendingMark" />{tx("No pagado")}</button>
          <span className="spacer"></span>
          <EncryptionButton ctx={ctx} />
          <SettingsButton ctx={ctx} />
          <SyncButton ctx={ctx} />
          <GlobalControls ctx={ctx} />
        </>
      )}
      {view === "planilla" && isMobile && (
        <MobilePlanillaHeader ctx={ctx} />
      )}
      {view === "deudas" && !isMobile && (
        <>
          <span className="spacer"></span>
          <EncryptionButton ctx={ctx} />
          <SettingsButton ctx={ctx} />
          <SyncButton ctx={ctx} />
          <GlobalControls ctx={ctx} />
        </>
      )}
      {view === "deudas" && isMobile && (
        <MobileGenericHeader ctx={ctx} title={tx("Deudas")} />
      )}
      {view === "resumen" && !isMobile && (
        <>
          <span className="spacer"></span>
          <ResumenEncryptionButton ctx={ctx} />
          <SettingsButton ctx={ctx} />
          <SyncButton ctx={ctx} />
          <GlobalControls ctx={ctx} />
        </>
      )}
      {view === "resumen" && isMobile && (
        <MobileGenericHeader ctx={ctx} title={tx("Bóveda")} />
      )}
      {view === "facturacion" && !isMobile && (
        <>
          <span className="spacer"></span>
          <EncryptionButton ctx={ctx} />
          <SettingsButton ctx={ctx} />
          <SyncButton ctx={ctx} />
          <GlobalControls ctx={ctx} />
        </>
      )}
      {view === "facturacion" && isMobile && (
        <MobileGenericHeader ctx={ctx} title={tx("Facturación")} />
      )}
      {view === "resumenes" && !isMobile && (
        <>
          <span className="spacer"></span>
          <SettingsButton ctx={ctx} />
          <SyncButton ctx={ctx} />
          <GlobalControls ctx={ctx} />
        </>
      )}
      {view === "resumenes" && isMobile && (
        <MobileGenericHeader ctx={ctx} title={tx("Resúmenes")} />
      )}
      {view === "lista" && !isMobile && (
        <>
          <div className="monthNav">            <button onClick={() => goMonth(-1)}>‹</button>
            <MonthPicker ctx={ctx} monthKey={selectedMonth} />
            <button onClick={() => goMonth(1)}>›</button>
          </div>
          <button className="pillBtn" onClick={goToday}>{t("today")}</button>
          <span className="searchBoxWrap">
            <input
              className="searchBox"
              placeholder={t("searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && <button className="searchClearBtn" onClick={() => setSearchTerm("")} title={tx("Borrar búsqueda")}>✕</button>}
          </span>
          <button className={`pillBtn ${hideCategorized ? "on" : ""}`} onClick={() => setHideCategorized((v) => !v)}>
            {hideCategorized ? t("showAll") : t("hideCategorized")}
          </button>
          {filterSubcat && <button className="pillBtn" onClick={() => setFilterSubcat(null)}>{t("removeFilter")}</button>}
          <button className="pillBtn" onClick={clearMonth}>{t("clearMonth")}</button>
          <span className="spacer"></span>
          <EncryptionButton ctx={ctx} />
          <SettingsButton ctx={ctx} />
          <SyncButton ctx={ctx} />
          <GlobalControls ctx={ctx} />
        </>
      )}
      {view === "lista" && isMobile && (
        <MobileGenericHeader ctx={ctx} title={t("titleLista")} showMonthPicker />
      )}
      {view === "sync" && (
        <>
          <span className="spacer"></span>
          <EncryptionButton ctx={ctx} />
          <SettingsButton ctx={ctx} />
          <SyncButton ctx={ctx} />
          <GlobalControls ctx={ctx} />
        </>
      )}
    </div>
  );
}
