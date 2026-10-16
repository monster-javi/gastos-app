import React, { useState } from "react";
import { tx } from "../tx.js";

// Only ever used for CHANGING an existing Resumen password — the initial
// setup (when there's no password yet) is its own inline card in
// ResumenView.jsx, not this modal. There's deliberately no "disable" option
// here: this section is meant to stay encrypted at all times once set up.
export default function ResumenEncryptionModal({ ctx }) {
  const { setShowResumenEncryption, changeResumenPassword } = ctx;

  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleChange() {
    setError("");
    if (!oldPassword) { setError(tx("Ingresá la contraseña actual de esta sección.")); return; }
    setBusy(true);
    try {
      await changeResumenPassword(oldPassword, password, confirm);
      setDone(true);
    } catch (e) {
      setError(e?.name === "OperationError" ? tx("Contraseña actual incorrecta.") : String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowResumenEncryption(false); }}>
      <div className="gx-enc-box">
        <button className="gx-enc-close" onClick={() => setShowResumenEncryption(false)} title={tx("Cerrar")}>✕</button>
        <strong className="gx-enc-title">{tx("Cambiar contraseña de la Bóveda")}</strong>
        {done ? (
          <>
            <p className="gx-enc-desc">{tx("Listo — la contraseña de esta sección se actualizó.")}</p>
            <div className="gx-enc-actions">
              <button className="gx-enc-primary" onClick={() => setShowResumenEncryption(false)}>{tx("Cerrar")}</button>
            </div>
          </>
        ) : (
          <>
            <p className="gx-enc-desc">
              {tx("Si la olvidás, no se puede recuperar.")}
            </p>
            <div className="gx-enc-fields">
              <input
                type="password"
                className="gx-enc-input"
                placeholder={tx("Contraseña actual de la Bóveda")}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoFocus
              />
              <input
                type="password"
                className="gx-enc-input"
                placeholder={tx("Contraseña nueva")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                type="password"
                className="gx-enc-input"
                placeholder={tx("Repetí la contraseña nueva")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChange()}
              />
              {error && <div className="gx-auth-error">{error}</div>}
            </div>
            <div className="gx-enc-actions">
              <button className="gx-enc-cancel" onClick={() => setShowResumenEncryption(false)}>{tx("Cancelar")}</button>
              <button className="gx-enc-primary" disabled={busy} onClick={handleChange}>
                {busy ? tx("Un momento...") : tx("Cambiar contraseña")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
