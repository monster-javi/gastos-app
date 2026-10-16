import React, { useState } from "react";
import { tx } from "../tx.js";

export default function UnlockScreen({ ctx }) {
  const { unlockWithPassword, signOut } = ctx;
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleUnlock() {
    setError("");
    if (!password) { setError(tx("Ingresá tu contraseña de cifrado.")); return; }
    setBusy(true);
    try {
      await unlockWithPassword(password);
    } catch (e) {
      setError(e?.name === "OperationError" ? tx("Contraseña incorrecta.") : tx("No se pudo desbloquear: {msg}", { msg: String(e?.message || e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gx-boot-screen">
      <div className="gx-auth-card">
        <div className="brand"><span className="dot" />Gastos App</div>
        <p className="gx-auth-guest-hint" style={{ marginTop: -6, marginBottom: 4 }}>
          {tx("Tus datos están cifrados. Ingresá tu contraseña de cifrado para desbloquearlos.")}
        </p>

        <input
          type="password"
          className="gx-auth-input"
          placeholder={tx("Contraseña de cifrado")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          autoFocus
        />

        {error && <div className="gx-auth-error">{error}</div>}

        <button className="gx-auth-btn" disabled={busy} onClick={handleUnlock}>
          {busy ? tx("Desbloqueando...") : tx("Desbloquear")}
        </button>

        <button className="gx-auth-switch" onClick={signOut}>
          {tx("Cerrar sesión")}
        </button>
      </div>
    </div>
  );
}
