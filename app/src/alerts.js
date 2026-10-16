// Alertas de la barra de abajo (y de las notificaciones).
// Todo se calcula a partir de los datos que la app ya tiene; nada se guarda.
import { tx } from "./tx.js";
import { fmtInt, round2, monthFullLabel, bridgeConvert } from "./utils.js";
import { regimeFor } from "./components/FacturacionView.jsx";
import { isGroup, groupTransfers, ME } from "./components/SharedAccounts.jsx";

const DAY = 86400000;
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / DAY); }
function mName(month, lang) { const n = monthFullLabel(month, lang); return lang === "en" ? n : n.toLowerCase(); }
function curSymbol(c) { return c === "USD" ? "US$" : c === "EUR" ? "€" : "$"; }
function money(n, cur) { const r = round2(n); return `${curSymbol(cur)} ${r ? fmtInt(r) : "0"}`; }
export function fmtDue(iso, lang) {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-US" : "es-AR", { day: "numeric", month: "short" }).replace(".", "");
}

// kind → color del chip: vencido (rojo), hoy (ámbar), pronto (azul), impago (ámbar),
// tope (rojo), cobro (ámbar), deuda (verde/rojo), lista (azul), cotiz (azul)
// urgent: true → entra en la notificación del sistema
export function computeAlerts(p) {
  const { cellData, allSubcatsFlat, findSectionOf, finalValue, primaryCurrency, transactions, facturacion, debts, dolarByMonth, getDolarRate, getEuroRate, lang } = p;
  const today = todayISO();
  const nowMonth = today.slice(0, 7);
  const out = [];
  const subs = allSubcatsFlat();
  const subName = (id) => subs.find((s) => s.id === id)?.name || "—";

  // ---- planilla: no pagados / vencimientos ----
  Object.keys(cellData || {}).sort().forEach((month) => {
    if (month > nowMonth) return;
    const cells = cellData[month] || {};
    Object.entries(cells).forEach(([subId, c]) => {
      if (!c || !c.unpaid) return;
      if (!subs.some((s) => s.id === subId)) return;
      const amount = money(finalValue(subId, month), primaryCurrency);
      const name = subName(subId);
      const go = { view: "planilla", month };
      const mLabel = mName(month, lang);
      if (c.due) {
        const d = daysBetween(today, c.due);
        if (d < 0) out.push({ kind: "vencido", rank: 0, urgent: true, chip: tx("Vencido"), title: name, meta: tx("{amount} · venció el {date}", { amount, date: fmtDue(c.due, lang) }), go });
        else if (d === 0) out.push({ kind: "hoy", rank: 1, urgent: true, chip: tx("Vence hoy"), title: name, meta: amount, go });
        else if (d <= 3) out.push({ kind: "pronto", rank: 2, urgent: true, chip: d === 1 ? tx("Vence mañana") : tx("Vence en {n} días", { n: d }), title: name, meta: tx("{amount} · {date}", { amount, date: fmtDue(c.due, lang) }), go });
        else out.push({ kind: "impago", rank: 5, chip: tx("Sin pagar"), title: name, meta: tx("{amount} · vence el {date}", { amount, date: fmtDue(c.due, lang) }), go });
      } else {
        out.push({ kind: "impago", rank: 5, chip: tx("Sin pagar"), title: name, meta: tx("{amount} · {month}", { amount, month: mLabel }), go });
      }
    });
  });

  // ---- facturación: tope del monotributo (≥ 90 %) y facturas sin cobrar ----
  const F = facturacion || {};
  const year = new Date().getFullYear();
  const reg = regimeFor(F, year);
  if (reg.regime === "monotributo") {
    const tope = Number(F.topes?.[reg.category]) || 0;
    const toARS = (m, month) => bridgeConvert(Number(m?.amount) || 0, m?.currency || "ARS", "ARS", getDolarRate(month), getEuroRate(month));
    const used = (F.invoices || []).filter((inv) => (inv.billMonth || "").startsWith(String(year))).reduce((a, inv) => a + toARS(inv.official, inv.billMonth), 0);
    if (tope && used / tope >= 0.9) {
      const pct = Math.round((used / tope) * 100);
      out.push({
        kind: "tope", rank: 1, urgent: true,
        chip: used > tope ? tx("Tope superado") : tx("Tope {pct}%", { pct }),
        title: tx("Monotributo categoría {cat}", { cat: reg.category }),
        meta: used > tope ? tx("te pasaste {x}", { x: money(used - tope, "ARS") }) : tx("te quedan {x} para facturar en {year}", { x: money(tope - used, "ARS"), year }),
        go: { view: "facturacion" },
      });
    }
  }
  (F.invoices || []).filter((inv) => inv.uncollected).forEach((inv) => {
    const b = inv.budget || {};
    out.push({
      kind: "cobro", rank: 6, chip: tx("Sin cobrar"),
      title: inv.client || inv.detail || tx("Factura"),
      meta: tx("{amount} · {month}", { amount: money(b.amount, b.currency || "ARS"), month: mName(inv.billMonth, lang) }),
      go: { view: "facturacion" },
    });
  });

  // ---- resumen de deudas (informativo: nunca va a las notificaciones) ----
  {
    const owed = {}, owe = {}, perPerson = {};
    const add = (bag, cur, v) => { bag[cur] = (bag[cur] || 0) + v; };
    const addP = (who, cur, v) => { const k = (who || "").trim(); if (!k) return; perPerson[k] = perPerson[k] || {}; add(perPerson[k], cur, v); };
    (debts || []).forEach((d) => {
      if (isGroup(d)) {
        const cur = d.currency || "ARS";
        groupTransfers(d).forEach((t) => {
          if (t.to === ME) { add(owed, cur, t.amount); addP(t.from, cur, t.amount); }
          else if (t.from === ME) { add(owe, cur, t.amount); addP(t.to, cur, -t.amount); }
        });
        return;
      }
      const n = d.installments || 1;
      const paidN = (d.paid || []).filter(Boolean).length;
      const rem = ((Number(d.amount) || 0) / n) * Math.max(0, n - paidN);
      if (rem < 0.01) return;
      const cur = d.currency || primaryCurrency || "ARS";
      if (d.direction === "meDeben") { add(owed, cur, rem); addP(d.person, cur, rem); }
      else if (d.direction === "debo") { add(owe, cur, rem); addP(d.person, cur, -rem); }
    });
    const fmtBag = (bag) => ["ARS", "USD", "EUR"].filter((c) => Math.abs(bag[c] || 0) >= 0.01).map((c) => money(bag[c], c)).join(" + ");
    const parts = [];
    if (fmtBag(owed)) parts.push(tx("te deben {x}", { x: fmtBag(owed) }));
    if (fmtBag(owe)) parts.push(tx("debés {x}", { x: fmtBag(owe) }));
    if (parts.length) {
      const people = Object.entries(perPerson)
        .map(([who, bag]) => [who, Object.entries(bag).filter(([, v]) => Math.abs(v) >= 0.01)])
        .filter(([, list]) => list.length)
        .sort((a, b) => Math.abs(b[1][0][1]) - Math.abs(a[1][0][1]));
      const meta = people.slice(0, 4).map(([who, list]) => `${who} ${list.map(([c, v]) => (v > 0 ? "+" : "−") + money(Math.abs(v), c)).join(" ")}`).join(" · ") + (people.length > 4 ? " …" : "");
      const t0 = parts.join(" · ");
      out.push({ kind: fmtBag(owe) && !fmtBag(owed) ? "deudaOut" : "deudaIn", rank: 7, chip: tx("Deudas"), title: t0.charAt(0).toUpperCase() + t0.slice(1), meta, go: { view: "deudas" } });
    }
  }

  // ---- lista del mes ----
  const monthTx = (transactions || []).filter((tr) => tr.month === nowMonth);
  if (monthTx.length) {
    const unc = monthTx.filter((tr) => !tr.catId).length;
    out.push({
      kind: "lista", rank: 8, chip: tx("Lista"),
      title: monthTx.length === 1 ? tx("1 movimiento sin aprobar") : tx("{n} movimientos sin aprobar", { n: monthTx.length }),
      meta: unc ? (unc === 1 ? tx("1 sin categorizar") : tx("{n} sin categorizar", { n: unc })) : mName(nowMonth, lang),
      go: { view: "lista", month: nowMonth },
    });
  }

  // ---- cotización del mes ----
  if (!(dolarByMonth && dolarByMonth[nowMonth] > 0)) {
    out.push({ kind: "cotiz", rank: 9, chip: tx("Cotización"), title: tx("Falta la cotización del dólar de {month}", { month: mName(nowMonth, lang) }), meta: tx("Usá “Actualizar hoy” en la planilla"), go: { view: "planilla", month: nowMonth } });
  }

  return out.sort((a, b) => a.rank - b.rank);
}

export function notificationBody(items) {
  const urgent = items.filter((i) => i.urgent);
  if (!urgent.length) return null;
  return urgent.slice(0, 4).map((i) => `${i.chip}: ${i.title}${i.meta ? ` (${i.meta})` : ""}`).join("\n") + (urgent.length > 4 ? `\n${tx("y {n} más", { n: urgent.length - 4 })}` : "");
}
