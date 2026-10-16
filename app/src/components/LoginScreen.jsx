import React, { useState } from "react";
import { sb } from "../supabase.js";
import { tx } from "../tx.js";

export default function LoginScreen() {
  const [authView, setAuthView] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleEmailSignIn() {
    setError(""); setNotice("");
    if (!email.trim() || !password) { setError(tx("Completá email y contraseña.")); return; }
    setBusy(true);
    const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(err.message);
  }

  async function handleEmailSignUp() {
    setError(""); setNotice("");
    if (!email.trim() || !password) { setError(tx("Completá email y contraseña.")); return; }
    if (password.length < 6) { setError(tx("La contraseña necesita al menos 6 caracteres.")); return; }
    setBusy(true);
    const { error: err } = await sb.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice(tx("Te mandamos un mail para confirmar la cuenta — revisá tu bandeja de entrada."));
  }

  async function handleGuestLogin() {
    setError(""); setNotice("");
    setBusy(true);
    const { error: err } = await sb.auth.signInAnonymously();
    setBusy(false);
    if (err) setError(tx("No se pudo entrar como invitado — el proyecto necesita tener 'Anonymous sign-ins' activado en Supabase."));
  }

  return (
    <div className="gx-boot-screen">
      <div className="gx-auth-card">
        <div className="brand"><span className="dot" />{tx("Gastos App")}</div>

        <input
          type="email"
          className="gx-auth-input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          className="gx-auth-input"
          placeholder={tx("Contraseña")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (authView === "login" ? handleEmailSignIn() : handleEmailSignUp())}
        />

        {error && <div className="gx-auth-error">{error}</div>}
        {notice && <div className="gx-auth-notice">{notice}</div>}

        <button className="gx-auth-btn" disabled={busy} onClick={authView === "login" ? handleEmailSignIn : handleEmailSignUp}>
          {busy ? tx("Un momento...") : authView === "login" ? tx("Ingresar") : tx("Crear cuenta")}
        </button>

        <button
          className="gx-auth-switch"
          onClick={() => { setAuthView(authView === "login" ? "signup" : "login"); setError(""); setNotice(""); }}
        >
          {authView === "login" ? tx("¿No tenés cuenta? Creá una") : tx("¿Ya tenés cuenta? Ingresá")}
        </button>

        <div className="gx-auth-divider"><span>{tx("o")}</span></div>

        <button className="gx-auth-guest-btn" disabled={busy} onClick={handleGuestLogin}>
          {tx("Probar sin cuenta")}
        </button>
        <p className="gx-auth-guest-hint">{tx("Entrás directo, sin registrarte. Tus datos quedan atados a este navegador.")}</p>
      </div>
    </div>
  );
}
