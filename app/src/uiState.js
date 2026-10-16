import { useEffect, useState } from "react";

// UI state that should survive a page refresh (where you were, what was
// collapsed). Purely per-device view preferences — never real data, so it
// lives in the browser, not in Supabase. `session` = only for this tab
// (survives refresh, resets in a new tab/day), otherwise kept on the device.
function store(session) {
  try { return session ? window.sessionStorage : window.localStorage; } catch (e) { return null; }
}
export function usePersistentState(key, initial, session = false) {
  const [val, setVal] = useState(() => {
    const fallback = typeof initial === "function" ? initial() : initial;
    try {
      const raw = store(session)?.getItem("gx:" + key);
      return raw != null ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  });
  useEffect(() => {
    try { store(session)?.setItem("gx:" + key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ }
  }, [key, val, session]);
  return [val, setVal];
}
