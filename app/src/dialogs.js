// Small standalone dialogs (plain DOM, outside React) used from async flows:
// asking for a backup's password while restoring, and the "borrar todo"
// confirmation with the optional "también la Bóveda" checkbox.

const OVERLAY_CSS = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";
const BOX_CSS = "background:var(--surface-2,#14171b);color:var(--text,#e9ebee);border:0;border-radius:16px;padding:22px;width:100%;max-width:340px;font:13.5px/1.5 Geist,Inter,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.5)";
const INPUT_CSS = "width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #2a2f37;background:#191d22;color:#e9ebee;font:inherit";
const CANCEL_CSS = "padding:8px 14px;border-radius:9px;border:1px solid #2a2f37;background:transparent;color:#e9ebee;font:inherit;cursor:pointer";

// Resolves with the typed password, or null if cancelled.
export function askPassword(title, message, cancelLabel, okLabel) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = OVERLAY_CSS;
    const form = document.createElement("form");
    form.style.cssText = BOX_CSS;
    const head = document.createElement("div");
    head.style.cssText = "font-weight:700;font-size:16px;margin-bottom:8px";
    head.textContent = title;
    const desc = document.createElement("div");
    desc.style.cssText = "color:var(--text-dim,#8d94a0);margin-bottom:14px";
    desc.textContent = message;
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "current-password";
    input.style.cssText = INPUT_CSS;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:14px";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = cancelLabel;
    cancel.style.cssText = CANCEL_CSS;
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.textContent = okLabel;
    ok.style.cssText = "padding:8px 14px;border-radius:9px;border:0;background:#4c8dff;color:#fff;font:inherit;font-weight:600;cursor:pointer";
    row.append(cancel, ok);
    form.append(head, desc, input, row);
    overlay.append(form);
    const done = (v) => { overlay.remove(); resolve(v); };
    cancel.onclick = () => done(null);
    form.onsubmit = (e) => { e.preventDefault(); done(input.value); };
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") done(null); });
    document.body.appendChild(overlay);
    input.focus();
  });
}

// opts: { title, hasVault, needPw, vaultLabel, pwPlaceholder, cancel, ok }
// Resolves with { vault: boolean, pw: string }, or null if cancelled.
export function wipeDialog(opts) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = OVERLAY_CSS;
    const form = document.createElement("form");
    form.style.cssText = BOX_CSS;
    const head = document.createElement("div");
    head.style.cssText = "font-weight:700;font-size:16px;margin-bottom:14px";
    head.textContent = opts.title;
    const label = document.createElement("label");
    label.style.cssText = "display:flex;gap:8px;align-items:flex-start;color:#c9ced6;cursor:pointer";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.style.cssText = "margin-top:3px";
    const span = document.createElement("span");
    span.textContent = opts.vaultLabel;
    label.append(check, span);
    const pw = document.createElement("input");
    pw.type = "password";
    pw.placeholder = opts.pwPlaceholder;
    pw.autocomplete = "current-password";
    pw.style.cssText = "display:none;" + INPUT_CSS + ";margin-top:10px";
    check.onchange = () => {
      pw.style.display = check.checked && opts.needPw ? "block" : "none";
      if (check.checked && opts.needPw) pw.focus();
    };
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:16px";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = opts.cancel;
    cancel.style.cssText = CANCEL_CSS;
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.textContent = opts.ok;
    ok.style.cssText = "padding:8px 14px;border-radius:9px;border:1px solid #f87171;background:rgba(248,113,113,.12);color:#f87171;font:inherit;font-weight:600;cursor:pointer";
    row.append(cancel, ok);
    form.append(head);
    if (opts.hasVault) form.append(label, pw);
    form.append(row);
    overlay.append(form);
    const done = (v) => { overlay.remove(); resolve(v); };
    cancel.onclick = () => done(null);
    form.onsubmit = (e) => { e.preventDefault(); done({ vault: check.checked, pw: pw.value }); };
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") done(null); });
    document.body.appendChild(overlay);
    cancel.focus();
  });
}

// Light / dark theme. The class is also set before React loads by a small
// script in index.html, so there's no dark flash when light is chosen.
export function setTheme(mode) {
  const light = mode === "light";
  document.documentElement.classList.toggle("theme-light", light);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#f3f4f7" : "#0f1116");
  try { localStorage.setItem("gx_theme", light ? "light" : "dark"); } catch { /* storage blocked */ }
}
export function isLightTheme() {
  return document.documentElement.classList.contains("theme-light");
}
