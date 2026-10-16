import React from "react";
import { maskEmail } from "../utils.js";
import { tx } from "../tx.js";

function VaultIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="1.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function StatementsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  );
}

export default function Sidebar({ ctx }) {
  const { t, view, setView, setFilterSubcat, user, signOut, notificationsEnabled, setNotificationsEnabled, isMobile } = ctx;

  function go(v) {
    setView(v);
    setFilterSubcat(null);
  }

  const items = [
    { key: "planilla", icon: "▦", label: t("navPlanilla") },
    { key: "lista", icon: "☰", label: t("navLista") },
    { key: "deudas", icon: "◈", label: tx("Deudas") },
    { key: "resumen", icon: <VaultIcon />, label: tx("Bóveda") },
    { key: "__divider__" },
    { key: "facturacion", icon: <InvoiceIcon />, label: tx("Facturación") },
    { key: "resumenes", icon: <StatementsIcon />, label: tx("Resúmenes") },
  ];

  return (
    <div className="sidebar">
      <div className="brand"><span className="dot"></span> <span>{t("brand")}</span></div>

      {!isMobile && (
        <>
          <div className="navSection">{t("vistas")}</div>
          {items.map((it) => (it.key === "__divider__" ? <div key={it.key} className="navDivider" /> : (
            <div
              key={it.key}
              className={`navItem ${view === it.key ? "active" : ""}`}
              onClick={() => go(it.key)}
            >
              <span className="icon">{it.icon}</span>
              <span className="navLabel">{it.label}</span>
            </div>
          )))}

          <div className="sidebar-spacer"></div>

          <div className="account-row">
            <div>
              <div className="account-name">{user?.is_anonymous ? tx("Invitado") : maskEmail(user?.email)}</div>
              <div className="account-sub">{user?.is_anonymous ? tx("Sesión de prueba") : tx("Con cuenta")}</div>
            </div>
            <button className="account-logout" onClick={signOut} title={tx("Cerrar sesión")}>{tx("Salir")}</button>
          </div>

          <div className="notif-toggle-row">
            <div>
              <div className="notif-toggle-title">{tx("Notificaciones")}</div>
              <div className="notif-toggle-sub">{notificationsEnabled ? tx("Activas · cada hora") : tx("Apagadas")}</div>
            </div>
            <button
              className={`switch ${notificationsEnabled ? "switch--on" : ""}`}
              onClick={() => setNotificationsEnabled((v) => !v)}
              title={tx("Activar/desactivar notificaciones")}
            >
              <span className="switch-knob"></span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
