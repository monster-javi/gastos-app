import React, { useMemo, useState } from "react";
import { uid, fmtInt, round2, parseCellInput } from "../utils.js";
import { usePersistentState } from "../uiState.js";
import { tx, txn } from "../tx.js";
import { ME, isGroup, groupTransfers, groupSettled, SharedGroup, NewGroupCard } from "./SharedAccounts.jsx";

// Debt shape: { id, direction: "meDeben" | "debo", person, detail, amount,
// currency (null = primary currency, for debts created before v139),
// installments, paid: bool[], createdAt }

const CURS = ["ARS", "USD", "EUR"];
function nextCur(c) { return CURS[(CURS.indexOf(c || "ARS") + 1) % CURS.length]; }
function curSymbol(c) { return c === "USD" ? "US$" : c === "EUR" ? "€" : "$"; }
function toggleSymbol(c) { return c === "EUR" ? "€" : "$"; }
function curClass(c) { return c === "USD" ? "usd" : c === "EUR" ? "eur" : "ars"; }
function fmtMoney(amount, cur) {
  const n = round2(amount);
  return `${curSymbol(cur)} ${n ? fmtInt(n) : "0"}`;
}
function sumByCur(list) {
  const out = {};
  list.forEach(({ amount, currency }) => { if (amount) out[currency] = (out[currency] || 0) + amount; });
  return out;
}
function MultiMoney({ byCur, empty = "$ 0" }) {
  const keys = CURS.filter((c) => byCur[c]);
  if (!keys.length) return <>{empty}</>;
  return <>{keys.map((c, i) => <span key={c} className="debtMultiLine">{i > 0 ? "+ " : ""}{fmtMoney(byCur[c], c)}</span>)}</>;
}

function TextField({ value, onCommit, placeholder, className, list }) {
  return (
    <input
      className={className}
      defaultValue={value || ""}
      key={value || ""}
      placeholder={placeholder}
      list={list}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (value || "")) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}
function NumField({ value, onCommit, className, placeholder, integer }) {
  const shown = round2(value) ? (integer ? String(value) : fmtInt(round2(value))) : "";
  return (
    <input
      className={`mono ${className || ""}`}
      defaultValue={shown}
      key={shown}
      placeholder={placeholder ?? "0"}
      inputMode={integer ? "numeric" : "decimal"}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        const n = integer ? parseInt(e.target.value, 10) : parseCellInput(e.target.value);
        if (n && round2(n) !== round2(value)) onCommit(n);
        else e.target.value = shown;
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

export default function DeudasView({ ctx }) {
  const { debts, setDebts, saveDebts, showConfirmModal, primaryCurrency, isMobile } = ctx;
  const [filter, setFilter] = usePersistentState("deudas.filter", "todas"); // todas | meDeben | debo
  const [hideSettled, setHideSettled] = usePersistentState("deudas.hideSettled", false);
  const [collapsed, setCollapsed] = usePersistentState("deudas.collapsed", {}); // direction -> true
  const [adding, setAdding] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupOpen, setGroupOpen] = usePersistentState("deudas.groupOpen", {}); // id -> bool
  const [draft, setDraft] = useState({ direction: "meDeben", person: "", detail: "", amount: "", currency: primaryCurrency, installments: "1", split: 1 });

  const cur = (d) => d.currency || primaryCurrency;
  const quota = (d) => (Number(d.amount) || 0) / (d.installments || 1);
  const paidCount = (d) => (d.paid || []).filter(Boolean).length;
  const remaining = (d) => quota(d) * ((d.installments || 1) - paidCount(d));
  const settled = (d) => paidCount(d) >= (d.installments || 1);

  function commit(next) { setDebts(next); saveDebts(next); }
  function updateDebt(id, patch) { commit(debts.map((d) => (d.id === id ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d))); }

  function addDebt() {
    const total = parseCellInput(draft.amount);
    const n = Math.max(1, parseInt(draft.installments, 10) || 1);
    if (!total || !draft.person.trim()) return;
    const split = draft.split || 1;
    const amt = round2(total / split);
    commit([...debts, {
      id: uid(), direction: draft.direction, person: draft.person.trim(), detail: draft.detail.trim(),
      amount: amt, currency: draft.currency, installments: n, paid: Array(n).fill(false), createdAt: new Date().toISOString(),
      ...(split > 1 ? { splitOf: { total, n: split } } : {}),
    }]);
    setDraft({ ...draft, person: "", detail: "", amount: "", installments: "1", split: 1 });
    setAdding(false);
    setCollapsed((c) => { const x = { ...c }; delete x[draft.direction]; return x; });
  }
  function toggleInstallment(d, idx) { updateDebt(d.id, { paid: d.paid.map((p, i) => (i === idx ? !p : p)) }); }
  function setAllPaid(d, value) { updateDebt(d.id, { paid: d.paid.map(() => value) }); }
  function setInstallments(d, n) {
    n = Math.max(1, Math.min(120, n));
    let paid = (d.paid || []).slice(0, n);
    while (paid.length < n) paid.push(false);
    updateDebt(d.id, { installments: n, paid });
  }
  function deleteDebt(d) {
    showConfirmModal(tx("¿Borrar la deuda con {person}?", { person: d.person }), () => commit(debts.filter((x) => x.id !== d.id)));
  }

  const plain = debts.filter((d) => !isGroup(d));
  const sharedGroups = debts.filter(isGroup);
  const people = useMemo(() => [...new Set([
    ...debts.filter((d) => !isGroup(d)).map((d) => (d.person || "").trim()),
    ...debts.filter(isGroup).flatMap((g) => g.members || []).filter((m) => m !== ME),
  ].filter(Boolean))], [debts]);
  const owed = plain.filter((d) => d.direction === "meDeben");
  const owe = plain.filter((d) => d.direction === "debo");
  // Lo que me toca en cada cuenta compartida (pagos sugeridos donde participo yo)
  const groupFlows = sharedGroups.flatMap((g) => groupTransfers(g)
    .filter((t) => t.from === ME || t.to === ME)
    .map((t) => ({ dir: t.to === ME ? "meDeben" : "debo", person: t.to === ME ? t.from : t.to, amount: t.amount, currency: g.currency || "ARS", group: g })));
  const flowsIn = groupFlows.filter((f) => f.dir === "meDeben");
  const flowsOut = groupFlows.filter((f) => f.dir === "debo");
  const pendingOwedDebts = sumByCur(owed.map((d) => ({ amount: remaining(d), currency: cur(d) })));
  const pendingOweDebts = sumByCur(owe.map((d) => ({ amount: remaining(d), currency: cur(d) })));
  const pendingOwed = sumByCur([...owed.map((d) => ({ amount: remaining(d), currency: cur(d) })), ...flowsIn]);
  const pendingOwe = sumByCur([...owe.map((d) => ({ amount: remaining(d), currency: cur(d) })), ...flowsOut]);
  // Neto por persona (deudas sueltas + cuentas compartidas)
  const perPerson = {};
  const addNet = (person, currency, v) => { if (!person || !v) return; const k = person.trim(); perPerson[k] = perPerson[k] || {}; perPerson[k][currency] = (perPerson[k][currency] || 0) + v; };
  owed.forEach((d) => addNet(d.person, cur(d), remaining(d)));
  owe.forEach((d) => addNet(d.person, cur(d), -remaining(d)));
  groupFlows.forEach((f) => addNet(f.person, f.currency, f.dir === "meDeben" ? f.amount : -f.amount));
  const perPersonList = Object.entries(perPerson)
    .map(([p, byCur]) => [p, Object.fromEntries(Object.entries(byCur).filter(([, v]) => Math.abs(v) >= 0.01))])
    .filter(([, byCur]) => Object.keys(byCur).length)
    .sort((a, b) => Math.abs(Object.values(b[1])[0]) - Math.abs(Object.values(a[1])[0]));
  const balance = {};
  CURS.forEach((c) => { const v = (pendingOwed[c] || 0) - (pendingOwe[c] || 0); if (Math.abs(v) >= 0.01) balance[c] = v; });
  const openCount = (list) => list.filter((d) => !settled(d)).length;
  const openLine = (list, flows) => {
    const n = openCount(list);
    const gs = new Set(flows.map((f) => f.group.id)).size;
    const a = txn(n, "{n} deuda abierta", "{n} deudas abiertas");
    return gs ? `${a} · ${txn(gs, "{n} cuenta compartida", "{n} cuentas compartidas")}` : a;
  };
  function updateGroup(id, patch) { updateDebt(id, patch); }
  function createGroup(name, members) {
    const g = { id: uid(), kind: "grupo", name, currency: primaryCurrency || "ARS", members: [ME, ...members], entries: [], createdAt: new Date().toISOString() };
    commit([...debts, g]);
    setGroupOpen((o) => ({ ...o, [g.id]: true }));
    setAddingGroup(false);
  }
  function deleteGroup(g) {
    showConfirmModal(tx("¿Borrar la cuenta compartida “{name}” con todos sus gastos?", { name: g.name }), () => commit(debts.filter((x) => x.id !== g.id)));
  }
  const visibleGroups = hideSettled ? sharedGroups.filter((g) => !groupSettled(g)) : sharedGroups;

  const groups = [
    { key: "meDeben", label: tx("Me deben"), items: owed },
    { key: "debo", label: tx("Debo"), items: owe },
  ].filter((g) => filter === "todas" || filter === g.key);

  function visible(items) { return hideSettled ? items.filter((d) => !settled(d)) : items; }

  function renderPills(d) {
    return (
      <div className="debtPills">
        {(d.paid || []).map((p, i) => (
          <button key={i} className={`debtPill ${p ? "paid" : ""}`} onClick={() => toggleInstallment(d, i)} title={p ? tx("Cuota {i} de {n} — pagada", { i: i + 1, n: d.installments }) : tx("Cuota {i} de {n}", { i: i + 1, n: d.installments })}>
            {p ? "✓" : i + 1}
          </button>
        ))}
      </div>
    );
  }
  function renderAmount(d) {
    return (
      <div className="debtAmount">
        <NumField value={d.amount} onCommit={(n) => updateDebt(d.id, { amount: n })} />
        <button className={`curToggle ${curClass(cur(d))}`} onClick={() => updateDebt(d.id, { currency: nextCur(cur(d)) })} title={tx("Moneda: {cur} (clic para cambiar)", { cur: cur(d) })}>{toggleSymbol(cur(d))}</button>
      </div>
    );
  }

  return (
    <div className="debtWrap">
      {/* ---- resumen ---- */}
      <div className="factCards debtCards">
        <div className="factCard">
          <div className="factCardLabel">{tx("ME DEBEN · PENDIENTE")}</div>
          <div className="factCardValue mono debtGreen"><MultiMoney byCur={pendingOwed} /></div>
          <div className="factCardSub">{openLine(owed, flowsIn)}</div>
        </div>
        <div className="factCard">
          <div className="factCardLabel">{tx("DEBO · PENDIENTE")}</div>
          <div className="factCardValue mono debtRed"><MultiMoney byCur={pendingOwe} /></div>
          <div className="factCardSub">{openLine(owe, flowsOut)}</div>
        </div>
        <div className="factCard">
          <div className="factCardLabel">{tx("BALANCE")}</div>
          <div className="factCardValue mono debtBalanceVal">
            {Object.keys(balance).length
              ? CURS.filter((c) => balance[c]).map((c, i) => (
                <span key={c} className={`debtMultiLine ${balance[c] > 0 ? "debtGreen" : "debtRed"}`}>{balance[c] > 0 ? "+" : "−"} {fmtMoney(Math.abs(balance[c]), c)}</span>
              ))
              : "$ 0"}
          </div>
          <div className="factCardSub">{tx("Lo que te deben menos lo que debés")}</div>
        </div>
      </div>

      {perPersonList.length > 0 && (
        <div className="debtPeopleStrip">
          <span className="debtPeopleLbl">{tx("Por persona")}</span>
          {perPersonList.map(([p, byCur]) => {
            const pos = Object.values(byCur)[0] > 0;
            return (
              <span key={p} className={`debtPersonChip ${pos ? "pos" : "neg"}`} title={pos ? tx("{p} te debe (neto)", { p }) : tx("Le debés a {p} (neto)", { p })}>
                <span className="debtPersonName">{p}</span>
                <span className="debtPersonVerb">{pos ? tx("te debe") : tx("le debés")}</span>
                {CURS.filter((c) => byCur[c]).map((c) => <span key={c} className="mono debtPersonAmt">{byCur[c] > 0 === pos ? "" : (byCur[c] > 0 ? "+" : "−")}{fmtMoney(Math.abs(byCur[c]), c)}</span>)}
              </span>
            );
          })}
        </div>
      )}

      {/* ---- toolbar ---- */}
      <div className="factSectionHead">
        <span className="factSectionTitle">{tx("Deudas")}</span>
        <span className="factMuted">{txn(plain.length, "{n} deuda", "{n} deudas")}{sharedGroups.length ? ` · ${txn(sharedGroups.length, "{n} cuenta compartida", "{n} cuentas compartidas")}` : ""}</span>
        <span className="spacer" />
        <div className="factSeg">
          {[["todas", tx("Todas")], ["meDeben", tx("Me deben")], ["debo", tx("Debo")]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <button className={`pillBtn ${hideSettled ? "factPillOn" : ""}`} onClick={() => setHideSettled((v) => !v)} title={tx("Ocultar las deudas con todas las cuotas pagadas")}>
          {hideSettled ? tx("Mostrando solo abiertas") : tx("Ocultar saldadas")}
        </button>
        {!addingGroup && <button className="pillBtn shNewBtn" onClick={() => { setAddingGroup(true); setAdding(false); }} title={tx("Viaje o salida con gastos entre varios: la app calcula quién le debe a quién")}>{tx("+ Cuenta compartida")}</button>}
        {!adding && <button className="primaryTop" onClick={() => { setAdding(true); setAddingGroup(false); }}>{tx("+ Nueva deuda")}</button>}
      </div>

      {addingGroup && <NewGroupCard people={people} onCreate={createGroup} onCancel={() => setAddingGroup(false)} />}

      {/* ---- alta ---- */}
      {adding && (
        <div className="debtAddCard">
          <div className="factSeg">
            <button className={draft.direction === "meDeben" ? "on" : ""} onClick={() => setDraft({ ...draft, direction: "meDeben" })}>{tx("Me deben")}</button>
            <button className={draft.direction === "debo" ? "on" : ""} onClick={() => setDraft({ ...draft, direction: "debo" })}>{tx("Debo")}</button>
          </div>
          <input className="debtInput debtInPerson" list="debtPeople" placeholder={draft.direction === "meDeben" ? tx("¿Quién te debe?") : tx("¿A quién le debés?")} value={draft.person} autoFocus
            onChange={(e) => setDraft({ ...draft, person: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addDebt(); }} />
          <input className="debtInput debtInDetail" placeholder={tx("Detalle (opcional)")} value={draft.detail}
            onChange={(e) => setDraft({ ...draft, detail: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addDebt(); }} />
          <div className="debtAmount debtInAmount">
            <input className="debtInput mono" placeholder={tx("Importe total")} inputMode="decimal" value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addDebt(); }} />
            <button className={`curToggle ${curClass(draft.currency)}`} onClick={() => setDraft({ ...draft, currency: nextCur(draft.currency) })} title={tx("Moneda: {cur}", { cur: draft.currency })}>{toggleSymbol(draft.currency)}</button>
          </div>
          <button className={`debtSplitBtn ${(draft.split || 1) > 1 ? "on" : ""}`} onClick={() => setDraft({ ...draft, split: (draft.split || 1) >= 5 ? 1 : (draft.split || 1) + 1 })}
            title={tx("Si cargás el total de algo que pagó uno solo, dividilo: la deuda queda por la parte que corresponde")}>
            {(draft.split || 1) === 1 ? tx("Sin dividir") : draft.split === 2 ? tx("÷ 2 · a medias") : `÷ ${draft.split}`}
          </button>
          {(draft.split || 1) > 1 && parseCellInput(draft.amount) > 0 && (
            <span className="debtSplitPreview mono">= {fmtMoney(parseCellInput(draft.amount) / draft.split, draft.currency)}</span>
          )}
          <label className="debtInQuotas">
            <input className="debtInput mono" inputMode="numeric" value={draft.installments}
              onChange={(e) => setDraft({ ...draft, installments: e.target.value.replace(/[^0-9]/g, "") })} onKeyDown={(e) => { if (e.key === "Enter") addDebt(); }} />
            <span className="factMuted">{tx("cuotas")}</span>
          </label>
          <span className="spacer" />
          <button className="pillBtn" onClick={() => setAdding(false)}>{tx("Cancelar")}</button>
          <button className="primaryTop" onClick={addDebt} disabled={!draft.person.trim() || !parseCellInput(draft.amount)}>{tx("Guardar")}</button>
        </div>
      )}
      <datalist id="debtPeople">{people.map((p) => <option key={p} value={p} />)}</datalist>

      {debts.length === 0 && !adding && !addingGroup && (
        <div className="debtEmpty">{tx("Todavía no cargaste ninguna deuda. Usá “+ Nueva deuda” para algo puntual, o “+ Cuenta compartida” para un viaje o salida con gastos entre varios.")}</div>
      )}

      {/* ---- listado: "Me deben" a la izquierda, "Debo" a la derecha ---- */}
      {plain.length > 0 && (
        <div className={`debtCols ${groups.length === 1 ? "single" : ""}`}>
          {groups.map((g) => {
            const items = visible(g.items);
            const isOpen = !collapsed[g.key];
            const hiddenSettled = g.items.length - items.length;
            const pend = g.key === "meDeben" ? pendingOwedDebts : pendingOweDebts;
            return (
              <div className={`debtBox ${g.key}`} key={g.key}>
                <div className="debtBoxHead" onClick={() => setCollapsed((c) => { const x = { ...c }; if (x[g.key]) delete x[g.key]; else x[g.key] = true; return x; })}>
                  <span className="factChev">{isOpen ? "▾" : "▸"}</span>
                  <span className={`debtGroupDot ${g.key}`} />
                  <span className="debtGroupName">{g.label}</span>
                  <span className="factMonthCount">{g.items.length}</span>
                  <span className="spacer" />
                  <span className={`debtBoxTotal mono ${g.key === "meDeben" ? "debtGreen" : "debtRed"}`}><MultiMoney byCur={pend} /></span>
                </div>
                {isOpen && (
                  <div className="debtBoxBody">
                    {items.length === 0 && <div className="debtBoxEmpty">{g.items.length ? tx("Todas saldadas ✓") : g.key === "meDeben" ? tx("Nadie te debe nada.") : tx("No debés nada.")}</div>}
                    {items.map((d) => {
                      const pct = Math.round((paidCount(d) / (d.installments || 1)) * 100);
                      return (
                        <div className={`debtItem ${settled(d) ? "settled" : ""}`} key={d.id}>
                          <div className="debtItemTop">
                            <div className="debtItemWho">
                              <TextField className="debtText debtPersonText" value={d.person} list="debtPeople" placeholder={tx("Persona")} onCommit={(v) => v && updateDebt(d.id, { person: v })} />
                              <TextField className="debtText debtDetailText" value={d.detail} placeholder={tx("+ detalle")} onCommit={(v) => updateDebt(d.id, { detail: v })} />
                              {d.splitOf && <span className="debtSplitNote">{tx("{part} de {total}", { part: d.splitOf.n === 2 ? tx("mitad") : `1/${d.splitOf.n}`, total: fmtMoney(d.splitOf.total, cur(d)) })}</span>}
                            </div>
                            <div className="debtItemPend">
                              <span className={`mono debtItemBig ${settled(d) ? "" : g.key === "meDeben" ? "debtGreen" : "debtRed"}`}>{settled(d) ? tx("Saldada ✓") : fmtMoney(remaining(d), cur(d))}</span>
                              <span className="debtItemLbl">{settled(d) ? "" : tx("pendiente")}</span>
                            </div>
                          </div>
                          <div className={`debtBar ${g.key}`}><div className="debtBarFill" style={{ width: `${pct}%` }} /></div>
                          <div className="debtItemBottom">
                            {renderPills(d)}
                            <span className="debtPaidCount">{paidCount(d)}/{d.installments}</span>
                            {!settled(d)
                              ? <button className="debtActBtn" onClick={() => setAllPaid(d, true)} title={tx("Marcar todas las cuotas como pagadas")}>{tx("Saldar")}</button>
                              : <button className="debtActBtn" onClick={() => setAllPaid(d, false)} title={tx("Volver a marcar todas como impagas")}>{tx("Reabrir")}</button>}
                            <span className="spacer" />
                            <span className="debtItemMeta">
                              <NumField integer className="debtQuotaInput" value={d.installments} onCommit={(n) => setInstallments(d, n)} />
                              <span className="factMuted">× {fmtMoney(quota(d), cur(d))} · {tx("total")}</span>
                              {renderAmount(d)}
                            </span>
                          </div>
                          <div className="debtItemActs">
                            <button className="rowDelete" onClick={() => deleteDebt(d)} title={tx("Borrar deuda")}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                    {hiddenSettled > 0 && <div className="debtBoxFoot">{txn(hiddenSettled, "{n} saldada oculta", "{n} saldadas ocultas")}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---- cuentas compartidas ---- */}
      {sharedGroups.length > 0 && (
        <div className="shSection">
          <div className="factSectionHead shSectionHead">
            <span className="factSectionTitle">{tx("Cuentas compartidas")}</span>
            <span className="factMuted">{tx("Gastos entre varios — cada uno carga lo que pagó y la app calcula quién le debe a quién")}</span>
          </div>
          {visibleGroups.length === 0 && <div className="debtBoxFoot">{tx("Todas saldadas ✓")}</div>}
          <div className="shGroups">
            {visibleGroups.map((g) => {
              const isOpen = groupOpen[g.id] ?? !groupSettled(g);
              return (
                <SharedGroup key={g.id} g={g} people={people} isMobile={isMobile}
                  open={isOpen} onToggle={() => setGroupOpen((o) => ({ ...o, [g.id]: !isOpen }))}
                  update={(patch) => updateGroup(g.id, patch)} remove={() => deleteGroup(g)} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
