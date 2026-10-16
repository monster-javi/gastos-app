import React, { useState } from "react";
import { uid, fmtInt, round2, parseCellInput, MONTH_ABBR_ES, MONTH_ABBR_EN } from "../utils.js";
import { tx, getTxLang } from "../tx.js";
import DateButton from "./DatePicker.jsx";

// Cuenta compartida (viaje, salida, casa…). Vive dentro de debtsV1 como
// { id, kind: "grupo", name, currency, members: ["Yo", ...], entries: [], createdAt }
// entries:
//   gasto: { id, type: "gasto", payer, amount, detail, among: string[] | null (null = todos) }
//   pago:  { id, type: "pago", from, to, amount }   (alguien saldó parte de la cuenta)

export const ME = "Yo";

const CURS = ["ARS", "USD", "EUR"];
function nextCur(c) { return CURS[(CURS.indexOf(c || "ARS") + 1) % CURS.length]; }
function curSymbol(c) { return c === "USD" ? "US$" : c === "EUR" ? "€" : "$"; }
function toggleSymbol(c) { return c === "EUR" ? "€" : "$"; }
function curClass(c) { return c === "USD" ? "usd" : c === "EUR" ? "eur" : "ars"; }
export function fmtMoney(amount, cur) {
  const n = round2(amount);
  return `${curSymbol(cur)} ${n ? fmtInt(n) : "0"}`;
}

function localDay(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtShortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const lang = getTxLang();
  const mon = (lang === "en" ? MONTH_ABBR_EN : MONTH_ABBR_ES)[d.getMonth()];
  return lang === "en" ? `${mon} ${d.getDate()}` : `${d.getDate()} ${mon.toLowerCase()}`;
}

export function isGroup(d) { return d && d.kind === "grupo"; }

function amongOf(e, members) {
  const list = Array.isArray(e.among) && e.among.length ? e.among.filter((m) => members.includes(m)) : members;
  return list.length ? list : members;
}

// Saldo de cada persona: positivo = le deben, negativo = debe.
export function groupBalances(g) {
  const members = g.members || [ME];
  const bal = {}, paid = {}, share = {};
  members.forEach((m) => { bal[m] = 0; paid[m] = 0; share[m] = 0; });
  (g.entries || []).forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (!amt) return;
    if (e.type === "pago") {
      if (e.from in bal) bal[e.from] += amt;
      if (e.to in bal) bal[e.to] -= amt;
      return;
    }
    if (!(e.payer in bal)) return;
    bal[e.payer] += amt; paid[e.payer] += amt;
    const list = amongOf(e, members);
    list.forEach((m) => { bal[m] -= amt / list.length; share[m] += amt / list.length; });
  });
  return { bal, paid, share };
}

// Mínima cantidad de pagos para dejar a todos en cero.
export function groupTransfers(g) {
  const { bal } = groupBalances(g);
  const debtors = [], creditors = [];
  Object.entries(bal).forEach(([m, v]) => {
    const r = round2(v);
    if (r < -0.009) debtors.push({ m, v: -r });
    else if (r > 0.009) creditors.push({ m, v: r });
  });
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const x = Math.min(debtors[i].v, creditors[j].v);
    if (x > 0.009) out.push({ from: debtors[i].m, to: creditors[j].m, amount: round2(x) });
    debtors[i].v -= x; creditors[j].v -= x;
    if (debtors[i].v < 0.01) i++;
    if (creditors[j].v < 0.01) j++;
  }
  return out;
}

export function groupSpent(g) {
  return (g.entries || []).filter((e) => e.type !== "pago").reduce((a, e) => a + (Number(e.amount) || 0), 0);
}
export function groupSettled(g) {
  return (g.entries || []).some((e) => e.type !== "pago") && groupTransfers(g).length === 0;
}

function TextField({ value, onCommit, placeholder, className, list }) {
  return (
    <input className={className} defaultValue={value || ""} key={value || ""} placeholder={placeholder} list={list}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (value || "")) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
  );
}
function NumField({ value, onCommit, className }) {
  const shown = round2(value) ? fmtInt(round2(value)) : "";
  return (
    <input className={`mono ${className || ""}`} defaultValue={shown} key={shown} placeholder="0" inputMode="decimal"
      onFocus={(e) => e.target.select()}
      onBlur={(e) => { const n = parseCellInput(e.target.value); if (n && round2(n) !== round2(value)) onCommit(n); else e.target.value = shown; }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
  );
}

export function NewGroupCard({ people, onCreate, onCancel }) {
  const [name, setName] = useState("");
  const [who, setWho] = useState("");
  const members = [...new Set(who.split(/[,;]+/).map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== "yo"))];
  const ok = name.trim() && members.length > 0;
  function go() { if (ok) onCreate(name.trim(), members); }
  return (
    <div className="debtAddCard shAddCard">
      <span className="shAddIcon">⇄</span>
      <input className="debtInput shInName" placeholder={tx("Nombre (ej: Finde en la costa)")} value={name} autoFocus
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
      <input className="debtInput shInWho" list="debtPeople" placeholder={tx("Con quién (separados por coma: Juan, Ana)")} value={who}
        onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
      <span className="factMuted">{tx("Vos ya estás incluido")}</span>
      <span className="spacer" />
      <button className="pillBtn" onClick={onCancel}>{tx("Cancelar")}</button>
      <button className="primaryTop" onClick={go} disabled={!ok}>{tx("Crear")}</button>
    </div>
  );
}

export function SharedGroup({ g, update, remove, people, open, onToggle, isMobile }) {
  const members = g.members || [ME];
  const cur = g.currency || "ARS";
  const [draft, setDraft] = useState({ payer: ME, detail: "", amount: "" });
  const [newMember, setNewMember] = useState("");
  const [amongEdit, setAmongEdit] = useState(null); // entry id
  const [dragOrder, setDragOrder] = useState(null); // ids mientras se arrastra
  const [dragId, setDragId] = useState(null);
  const { bal, paid, share } = groupBalances(g);
  const transfers = groupTransfers(g);
  const spent = groupSpent(g);
  const settled = groupSettled(g);
  const myBal = round2(bal[ME] || 0);
  const entriesRaw = g.entries || [];
  const entries = dragOrder ? dragOrder.map((id) => entriesRaw.find((e) => e.id === id)).filter(Boolean) : entriesRaw;
  const usedBy = (m) => entries.some((e) => e.payer === m || e.from === m || e.to === m || (e.among || []).includes(m));

  function setEntries(next) { update({ entries: next }); }

  // ---- reordenar arrastrando la manijita (mouse y touch) ----
  function startDrag(ev, id) {
    ev.preventDefault();
    const order = entriesRaw.map((e) => e.id);
    let cur = order;
    setDragOrder(order); setDragId(id);
    const handle = ev.currentTarget;
    try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    const move = (pe) => {
      const el = document.elementFromPoint(pe.clientX, pe.clientY);
      const row = el && el.closest && el.closest("[data-sh-entry]");
      if (!row) return;
      const overId = row.getAttribute("data-sh-entry");
      if (!overId || overId === id) return;
      const from = cur.indexOf(id), to = cur.indexOf(overId);
      if (from < 0 || to < 0) return;
      const next = cur.slice(); next.splice(from, 1); next.splice(to, 0, id);
      cur = next; setDragOrder(next);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      const changed = cur.some((x, i) => x !== order[i]);
      if (changed) setEntries(cur.map((x) => entriesRaw.find((e) => e.id === x)).filter(Boolean));
      setDragOrder(null); setDragId(null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }
  function sortByDate() {
    const withIdx = entriesRaw.map((e, i) => ({ e, i }));
    withIdx.sort((a, b) => (a.e.at || "").localeCompare(b.e.at || "") || a.i - b.i);
    setEntries(withIdx.map((x) => x.e));
  }
  const sortedByDate = entriesRaw.every((e, i) => i === 0 || (entriesRaw[i - 1].at || "") <= (e.at || ""));
  const grip = (e) => (
    <span className="shGrip" onPointerDown={(ev) => startDrag(ev, e.id)} title={tx("Arrastrá para reordenar")}>⠿</span>
  );
  const dateCell = (e) => (
    <DateButton className="shDate" value={e.at ? localDay(e.at) : ""} title={tx("Fecha (clic para cambiarla)")}
      onChange={(v) => patchEntry(e.id, { at: new Date(v + "T12:00:00").toISOString() })}>
      {fmtShortDate(e.at)}
    </DateButton>
  );
  function addExpense() {
    const amt = parseCellInput(draft.amount);
    if (!amt) return;
    setEntries([...entries, { id: uid(), type: "gasto", payer: members.includes(draft.payer) ? draft.payer : ME, amount: amt, detail: draft.detail.trim(), among: null, at: new Date().toISOString() }]);
    setDraft({ ...draft, detail: "", amount: "" });
  }
  function patchEntry(id, patch) { setEntries(entries.map((e) => (e.id === id ? { ...e, ...patch } : e))); }
  function delEntry(id) { setEntries(entries.filter((e) => e.id !== id)); }
  function markPaid(t) { setEntries([...entries, { id: uid(), type: "pago", from: t.from, to: t.to, amount: t.amount, at: new Date().toISOString() }]); }
  function settleAll() { setEntries([...entries, ...transfers.map((t) => ({ id: uid(), type: "pago", from: t.from, to: t.to, amount: t.amount, at: new Date().toISOString() }))]); }
  function addMember() {
    const n = newMember.trim();
    if (!n || n.toLowerCase() === "yo" || members.includes(n)) { setNewMember(""); return; }
    update({ members: [...members, n] });
    setNewMember("");
  }
  function removeMember(m) {
    if (m === ME || usedBy(m)) return;
    update({ members: members.filter((x) => x !== m) });
  }
  function toggleAmong(e, m) {
    const cur0 = amongOf(e, members);
    let next = cur0.includes(m) ? cur0.filter((x) => x !== m) : [...cur0, m];
    if (!next.length) return;
    patchEntry(e.id, { among: next.length === members.length ? null : members.filter((x) => next.includes(x)) });
  }
  const amongLabel = (e) => {
    const list = amongOf(e, members);
    if (list.length === members.length) return members.length === 2 ? tx("a medias") : tx("entre {n}", { n: members.length });
    return tx("entre {list}", { list: list.map(name).join(", ") });
  };
  const name = (m) => (m === ME ? tx("Vos") : m);
  const verb = (t) => (t.from === ME ? tx("Le pagás a {to}", { to: t.to }) : t.to === ME ? tx("{from} te paga", { from: t.from }) : tx("{from} le paga a {to}", { from: t.from, to: t.to }));

  return (
    <div className={`debtBox shBox ${settled ? "settled" : ""}`}>
      <div className="debtBoxHead" onClick={onToggle}>
        <span className="factChev">{open ? "▾" : "▸"}</span>
        <span className="debtGroupDot shared" />
        <span onClick={(e) => e.stopPropagation()} className="shNameWrap">
          <TextField className="debtText shName" value={g.name} placeholder={tx("Nombre")} onCommit={(v) => v && update({ name: v })} />
        </span>
        {!isMobile && <span className="shMembersInline">{members.map(name).join(" · ")}</span>}
        <span className="spacer" />
        <span className="shHeadStat">
          <span className="factMuted">{tx("gastado")}</span> <span className="mono">{fmtMoney(spent, cur)}</span>
        </span>
        <span className={`debtBoxTotal mono ${settled ? "" : myBal > 0 ? "debtGreen" : myBal < 0 ? "debtRed" : ""}`}>
          {settled ? tx("Saldada ✓") : myBal > 0 ? tx("te deben {x}", { x: fmtMoney(myBal, cur) }) : myBal < 0 ? tx("debés {x}", { x: fmtMoney(-myBal, cur) }) : spent ? tx("estás a mano") : "—"}
        </span>
      </div>
      {open && (
        <div className="shBody">
          {/* ---- gastos ---- */}
          <div className="shCol">
            <div className="shColTitle">{tx("Gastos")} <span className="factMuted">{entries.filter((e) => e.type !== "pago").length}</span>
              <span className="spacer" />
              {entriesRaw.length > 1 && !sortedByDate && <button className="shSortBtn" onClick={sortByDate} title={tx("Ordenar todo por fecha")}>{tx("↓ por fecha")}</button>}
            </div>
            <div className="shAddRow">
              <select className="factSelect shPayer" value={members.includes(draft.payer) ? draft.payer : ME} onChange={(e) => setDraft({ ...draft, payer: e.target.value })} title={tx("¿Quién pagó?")}>
                {members.map((m) => <option key={m} value={m}>{m === ME ? tx("Pagué yo") : tx("Pagó {m}", { m })}</option>)}
              </select>
              <input className="debtInput shDetail" placeholder={tx("Qué (nafta, súper, cena…)")} value={draft.detail}
                onChange={(e) => setDraft({ ...draft, detail: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addExpense(); }} />
              <input className="debtInput mono shAmt" placeholder={tx("Total")} inputMode="decimal" value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addExpense(); }} />
              <button className="primaryTop shAddBtn" onClick={addExpense} disabled={!parseCellInput(draft.amount)}>+</button>
            </div>
            {entries.length === 0 && <div className="shEmpty">{tx("Cargá cada gasto con el total y quién lo pagó. La app divide sola.")}</div>}
            <div className="shList">
              {entries.map((e) => e.type === "pago" ? (
                <div className={`shRow pago ${dragId === e.id ? "dragging" : ""}`} key={e.id} data-sh-entry={e.id}>
                  {grip(e)}
                  {dateCell(e)}
                  <span className="shPayTag">{tx("✓ pago")}</span>
                  <span className="shPayText">{e.from === ME ? tx("Le pagaste a {to}", { to: e.to }) : e.to === ME ? tx("{from} te pagó", { from: e.from }) : tx("{from} le pagó a {to}", { from: e.from, to: e.to })}</span>
                  <span className="mono shRowAmt">{fmtMoney(e.amount, cur)}</span>
                  <button className="rowDelete" onClick={() => delEntry(e.id)} title={tx("Deshacer este pago")}>✕</button>
                </div>
              ) : (
                <div className={`shRow ${dragId === e.id ? "dragging" : ""}`} key={e.id} data-sh-entry={e.id}>
                  {grip(e)}
                  {dateCell(e)}
                  <select className="shRowPayer" value={e.payer} onChange={(ev) => patchEntry(e.id, { payer: ev.target.value })} title={tx("Quién pagó")}>
                    {members.map((m) => <option key={m} value={m}>{name(m)}</option>)}
                  </select>
                  <TextField className="debtText shRowDetail" value={e.detail} placeholder={tx("+ detalle")} onCommit={(v) => patchEntry(e.id, { detail: v })} />
                  {members.length > 1 && (
                    <button className={`shAmong ${amongOf(e, members).length !== members.length ? "custom" : ""}`} onClick={() => setAmongEdit(amongEdit === e.id ? null : e.id)} title={tx("Entre quiénes se divide este gasto")}>
                      {amongLabel(e)}
                    </button>
                  )}
                  <NumField className="shRowAmtIn" value={e.amount} onCommit={(n) => patchEntry(e.id, { amount: n })} />
                  <button className="rowDelete" onClick={() => delEntry(e.id)} title={tx("Borrar gasto")}>✕</button>
                  {amongEdit === e.id && (
                    <div className="shAmongEdit">
                      <span className="factMuted">{tx("Dividir entre:")}</span>
                      {members.map((m) => (
                        <button key={m} className={`shChip ${amongOf(e, members).includes(m) ? "on" : ""}`} onClick={() => toggleAmong(e, m)}>{name(m)}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---- cómo quedan ---- */}
          <div className="shCol shRight">
            <div className="shColTitle">{tx("Cómo quedan")}</div>
            <div className="shPeople">
              {members.map((m) => {
                const b = round2(bal[m] || 0);
                return (
                  <div className="shPerson" key={m}>
                    <span className={`shWho ${m === ME ? "me" : ""}`}>{name(m)}</span>
                    {m !== ME && !usedBy(m) && <button className="shRmMember" onClick={() => removeMember(m)} title={tx("Sacar del grupo")}>✕</button>}
                    <span className="shPersonSub factMuted">{tx("pagó {paid} · le toca {share}", { paid: fmtMoney(paid[m] || 0, cur), share: fmtMoney(share[m] || 0, cur) })}</span>
                    <span className="spacer" />
                    <span className={`mono shBal ${b > 0 ? "debtGreen" : b < 0 ? "debtRed" : ""}`}>{b > 0 ? "+" : b < 0 ? "−" : ""}{fmtMoney(Math.abs(b), cur)}</span>
                  </div>
                );
              })}
              <div className="shAddMember">
                <input className="debtInput" list="debtPeople" placeholder={tx("+ sumar persona")} value={newMember}
                  onChange={(e) => setNewMember(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addMember(); }} onBlur={addMember} />
              </div>
            </div>

            <div className="shColTitle shSettleTitle">
              {tx("Para saldar")}
              <span className="spacer" />
              {transfers.length > 1 && <button className="debtActBtn shSettleAll" onClick={settleAll}>{tx("Saldar todo")}</button>}
            </div>
            {transfers.length === 0
              ? <div className="shEmpty">{spent ? tx("Nadie le debe nada a nadie ✓") : tx("Todavía no hay gastos.")}</div>
              : transfers.map((t, i) => (
                <div className={`shTransfer ${t.to === ME ? "in" : t.from === ME ? "out" : ""}`} key={i}>
                  <span className="shTrText">{verb(t)}</span>
                  <span className="spacer" />
                  <span className="mono shTrAmt">{fmtMoney(t.amount, cur)}</span>
                  <button className="debtActBtn shTrBtn" onClick={() => markPaid(t)} title={tx("Registrar que este pago se hizo")}>{tx("✓ Pagado")}</button>
                </div>
              ))}

            <div className="shFoot">
              <button className={`curToggle ${curClass(cur)}`} onClick={() => update({ currency: nextCur(cur) })} title={tx("Moneda de la cuenta: {cur} (clic para cambiar)", { cur })}>{toggleSymbol(cur)}</button>
              <span className="factMuted">{cur}</span>
              <span className="spacer" />
              <button className="pillBtn shDelete" onClick={remove}>{tx("Borrar cuenta")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
