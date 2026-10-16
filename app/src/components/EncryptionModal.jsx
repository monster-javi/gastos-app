import React, { useState } from "react";
import { tx } from "../tx.js";

// Same flow as Task App: a status view first, then a separate step to turn
// encryption on or off.
export default function EncryptionModal({ ctx }) {
  const { setShowEncryption, encMeta, enableEncryption, disableEncryption, resumenEncMeta } = ctx;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("status"); // status | enable | disable
  const hasVault = !!(resumenEncMeta && resumenEncMeta.encrypted);

  function backToStatus() {
    setStep("status");
    setPassword("");
    setConfirm("");
    setError("");
  }

  async function handleEnable() {
    setError("");
    setBusy(true);
    try {
      await enableEncryption(password, confirm);
      setShowEncryption(false);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setError("");
    if (!password) { setError(tx("Ingresá tu contraseña de cifrado actual.")); return; }
    setBusy(true);
    try {
      await disableEncryption(password);
      setShowEncryption(false);
    } catch (e) {
      setError(e?.name === "OperationError" ? tx("Contraseña incorrecta.") : tx("No se pudo desactivar: {msg}", { msg: String(e?.message || e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gx-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowEncryption(false); }}>
      <div className="gx-enc-box">
        <button className="gx-enc-close" onClick={() => setShowEncryption(false)} title={tx("Cerrar")}>✕</button>
        <strong className="gx-enc-title">{tx("Cifrado de extremo a extremo")}</strong>

        {step === "status" && (
          <>
            <p className="gx-enc-desc">
              {encMeta.encrypted
                ? tx("Tus datos se cifran en tu navegador antes de guardarse (AES-256-GCM). Nadie con acceso a la base de datos puede leerlos.")
                : tx("Tus datos se guardan sin cifrar. Podés activar el cifrado de extremo a extremo cuando quieras.")}
            </p>
            <div className="gx-enc-actions">
              <button className="gx-enc-cancel" onClick={() => setShowEncryption(false)}>{tx("Cerrar")}</button>
              {encMeta.encrypted
                ? <button className="gx-enc-danger" onClick={() => setStep("disable")}>{tx("Desactivar cifrado")}</button>
                : <button className="gx-enc-primary" onClick={() => setStep("enable")}>{tx("Activar cifrado")}</button>}
            </div>
          </>
        )}

        {step === "disable" && (
          <>
            <p className="gx-enc-desc">
              {tx("Ingresá tu contraseña de cifrado actual para confirmar que querés desactivarlo. Una vez desactivado, tus datos quedan sin cifrar en la base de datos.")
                + (hasVault ? " " + tx("La Bóveda sigue cifrada con esta misma contraseña.") : "")}
            </p>
            <div className="gx-enc-fields">
              <input
                type="password"
                className="gx-enc-input"
                placeholder={tx("Contraseña de cifrado actual")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDisable()}
                autoFocus
              />
              {error && <div className="gx-auth-error">{error}</div>}
            </div>
            <div className="gx-enc-actions">
              <button className="gx-enc-cancel" onClick={backToStatus}>{tx("Cancelar")}</button>
              <button className="gx-enc-danger" disabled={busy} onClick={handleDisable}>
                {busy ? tx("Verificando...") : tx("Confirmar y desactivar")}
              </button>
            </div>
          </>
        )}

        {step === "enable" && (
          <>
            <p className="gx-enc-desc">
              {hasVault
                ? tx("Usá la contraseña de tu Bóveda: va a servir para las dos. Nunca sale de este navegador. Si la olvidás, no hay forma de recuperar los datos.")
                : tx("Creá una contraseña de cifrado. Es distinta de tu contraseña de acceso y nunca sale de este navegador. Si la olvidás, no hay forma de recuperar los datos.")}
            </p>
            <div className="gx-enc-fields">
              <input
                type="password"
                className="gx-enc-input"
                placeholder={hasVault ? tx("Contraseña de la Bóveda") : tx("Contraseña de cifrado")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <input
                type="password"
                className="gx-enc-input"
                placeholder={tx("Repetí la contraseña")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEnable()}
              />
              {error && <div className="gx-auth-error">{error}</div>}
            </div>
            <div className="gx-enc-actions">
              <button className="gx-enc-cancel" onClick={backToStatus}>{tx("Cancelar")}</button>
              <button className="gx-enc-primary" disabled={busy} onClick={handleEnable}>
                {busy ? tx("Activando...") : tx("Activar cifrado")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
