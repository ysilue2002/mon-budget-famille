/* Assistant Commercial — application locale, hors-ligne, trois langues. */
const KEY = 'assistant-commercial.v2';
const DEFAULTS = {
  fr: "Bonjour [Nom du Client], c'est [Nom de la Boutique]. La facture [Numéro Facture] du [Date Facture] d'un montant de [Montant] reste à régler. Merci de votre confiance.",
  en: "Hello [Nom du Client], this is [Nom de la Boutique]. Invoice [Numéro Facture] dated [Date Facture] for [Montant] is still unpaid. Thank you.",
  ar: "مرحباً [Nom du Client]، هذه رسالة من [Nom de la Boutique]. الفاتورة [Numéro Facture] بتاريخ [Date Facture] بمبلغ [Montant] لا تزال غير مسددة. شكراً لكم.",
};
const fresh = () => ({
  shop: '', products: [], parties: [], suppliers: [], sales: [], expenses: [], withdrawals: [], docs: [], debts: [], moves: [],
  seq: { DEV: 0, FAC: 0 },
  settings: { lang: 'fr', ads: false, reminder: { ...DEFAULTS } },
  meta: { lastSync: null, updated: 0, rev: 0, mv: 0 },
});
let db = loadDB();
let tab = 'vendre';
let side = 'clients';
let period = 'mois';
let draft = null;
let adsClosed = false;

function loadDB() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw);
    const base = fresh();
    const out = Object.assign(base, parsed, { settings: Object.assign(base.settings, parsed.settings || {}) });
    migrate(out);
    return out;
  } catch { return fresh(); }
}
/* Le stock est fabriqué à partir d'entrées de mouvement, pour que deux téléphones puissent vendre sans se perdre. */
function migrate(d) {
  d.meta = d.meta || {};
  d.moves = Array.isArray(d.moves) ? d.moves : [];
  if (!d.meta.mv) {
    for (const p of d.products || []) if (!d.moves.some((m) => m.pid === p.id)) d.moves.push({ id: 'mv-' + p.id, pid: p.id, delta: Number(p.qty) || 0, u: 1 });
    d.meta.mv = 1;
  }
}
function saveDB(toucher = true) {
  if (toucher) db.meta.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  if (toucher) queueSync();
}
const T = (k) => (I18N[db.settings.lang] || I18N.fr)[k] || I18N.fr[k] || k;
const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fr = (n) => Math.round(n || 0).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
const money = (n) => fr(n) + ' FCFA';
const dayFR = (iso) => (iso || '').split('-').reverse().join('/');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inPeriod = (date, p) => {
  if (p === 'jour') return date === todayISO();
  if (p === 'mois') return date.slice(0, 7) === todayISO().slice(0, 7);
  if (p === 'annee') return date.slice(0, 4) === todayISO().slice(0, 4);
  return true;
};
const paysOf = (s) => (s.pays || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
const creditOf = (s) => Math.max(0, s.total - (Number(s.paid) || 0) - paysOf(s));
const paidOf = (s) => Math.min(Number(s.total) || 0, (Number(s.paid) || 0) + paysOf(s));
const totalDue = () => db.sales.reduce((a, s) => a + creditOf(s), 0);
const debtOf = (d) => Math.max(0, d.amount - d.paid);
const totalDebt = () => db.debts.reduce((a, d) => a + debtOf(d), 0);
const qtyOf = (p) => (db.moves || []).filter((m) => m.pid === p.id).reduce((a, m) => a + (Number(m.delta) || 0), 0);
const stockValue = () => db.products.reduce((a, p) => a + qtyOf(p) * p.buy, 0);
const num = (kind) => {
  const y = new Date().getFullYear();
  db.seq[kind] = (db.seq[kind] || 0) + 1;
  return kind + '-' + y + '-' + String(db.seq[kind]).padStart(3, '0');
};
const lang = () => db.settings.lang || 'fr';

/* ---------------- rendu ---------------- */
function applyLang() {
  document.documentElement.lang = lang();
  document.documentElement.dir = lang() === 'ar' ? 'rtl' : 'ltr';
  document.title = T('app');
}
function render() {
  applyLang();
  document.getElementById('appName').textContent = T('app');
  document.getElementById('shopName').textContent = db.shop || T('shop');
  updatePill();
  document.querySelectorAll('#nav button').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === tab);
    const k = b.querySelector('[data-k]');
    if (k) k.textContent = T(k.dataset.k);
  });
  const view = { vendre, stock, clients, docs, bilans }[tab]();
  const ads = adsHTML();
  document.getElementById('app').innerHTML = (tab === 'vendre' ? ads.top : '') + view + (tab === 'vendre' ? ads.bottom : '');
  if (draft) document.getElementById('app').insertAdjacentHTML('beforeend', docForm());
}

/* ---------------- publicité (désactivée par défaut) ---------------- */
function adsHTML() {
  const on = db.settings.ads && navigator.onLine;
  if (!on) return { top: '', bottom: '' };
  return {
    top: `<div class="adsTop">${T('adsSlot')} · ${T('ads')}</div>`,
    bottom: adsClosed ? '' : `<div class="adsBottom"><button data-act="closeAds">✕</button>${T('adsSlot')}</div>`,
  };
}

/* ---------------- Vendre ---------------- */
function vendre() {
  const t = db.sales.filter((s) => s.date === todayISO());
  const ca = t.reduce((a, s) => a + s.total, 0);
  const list = [
    ...t.map((s) => `<div class="row"><div><div class="t">${T('sale')} ${money(s.total)}</div><div class="s">${esc(s.method)}${s.party ? ' · ' + esc(s.party) : ''}${s.product ? ' · ' + esc(s.product) + ' ×' + s.qty : ''}</div></div><div class="right">${creditOf(s) ? `<span class="tag warn">${T('remains')} ${money(creditOf(s))}</span>` : `<span class="tag ok">${T('paid')}</span>`}</div></div>`),
    ...db.expenses.filter((e) => e.date === todayISO()).map((e) => `<div class="row"><div><div class="t">${T('expense')} ${money(e.amount)}</div><div class="s">${esc(e.label)} · ${esc(e.method)}</div></div></div>`),
    ...db.withdrawals.filter((w) => w.date === todayISO()).map((w) => `<div class="row"><div><div class="t">${T('withdraw')} ${money(w.amount)}</div><div class="s">${T('withdraw')}</div></div></div>`),
  ].join('');
  return `<div class="kpis">
      <div class="kpi"><span>${T('salesToday')}</span><b>${money(ca)}</b></div>
      <div class="kpi"><span>${T('cashOut')}</span><b>${money(totalDue())}</b></div>
    </div>
    <div class="big">
      <button class="btn" data-act="sale">＋ ${T('sell')}</button>
      <button class="btn out" data-act="expense">− ${T('expense')}</button>
    </div>
    <button class="btn out" data-act="withdraw">${T('withdraw')}</button>
    <div class="card" style="margin-top:16px"><h3>${T('today')}</h3>${list || `<p class="empty">${T('nothing')}</p>`}</div>`;
}

/* ---------------- Stock ---------------- */
function stock() {
  const p = [...db.products].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="kpis">
      <div class="kpi"><span>${T('stockValue')}</span><b>${money(stockValue())}</b></div>
      <div class="kpi"><span>${T('toRenew')}</span><b>${p.filter((x) => qtyOf(x) <= x.alert).length}</b></div>
    </div>
    <div class="card"><h3>${T('articles')}</h3>
      ${p.map((x) => { const q = qtyOf(x); return `<div class="row"><div><div class="t">${esc(x.name)}</div><div class="s">${T('buyPrice')} ${money(x.buy)} · ${T('sellPrice')} ${money(x.sell)} · ${T('margin')} ${money(x.sell - x.buy)}</div></div><div class="right">${q <= 0 ? `<span class="tag bad">${T('outOfStock')}</span>` : q <= x.alert ? `<span class="tag warn">${T('left')} ${q}</span>` : `<span class="tag">${q}</span>`}</div></div>`; }).join('') || `<p class="empty">${T('noArticles')}</p>`}
    </div>
    <div class="card"><h3>${T('addArticle')}</h3>
      <label>${T('name')}</label><input id="pName" placeholder="Savon">
      <label>${T('buyPrice')}</label><input id="pBuy" inputmode="numeric" placeholder="0">
      <label>${T('sellPrice')}</label><input id="pSell" inputmode="numeric" placeholder="0">
      <label>${T('qty')}</label><input id="pQty" inputmode="numeric" value="0">
      <label>${T('alertAt')}</label><input id="pAlert" inputmode="numeric" value="3">
      <button class="btn" data-act="addProduct">${T('saveArticle')}</button>
    </div>`;
}

/* ---------------- Clients / Fournisseurs ---------------- */
function clients() {
  const due = db.sales.filter((s) => creditOf(s) > 0);
  const names = [...new Set(due.map((s) => s.party || '—'))];
  const sup = db.debts.filter((d) => debtOf(d) > 0);
  return `<div class="kpis">
      <div class="kpi"><span>${T('cashOut')}</span><b>${money(totalDue())}</b></div>
      <div class="kpi"><span>${T('debts')}</span><b>${money(totalDebt())}</b></div>
    </div>
    <div class="seg">
      <button class="${side === 'clients' ? 'on' : ''}" data-act="side" data-s="clients">${T('clients')}</button>
      <button class="${side === 'suppliers' ? 'on' : ''}" data-act="side" data-s="suppliers">${T('suppliers')}</button>
    </div>
    ${side === 'clients' ? `
      <div class="card"><h3>${T('owed')}</h3>
        ${names.map((n) => {
          const list = due.filter((s) => (s.party || '—') === n);
          const sum = list.reduce((a, s) => a + creditOf(s), 0);
          return `<div class="row"><div><div class="t">${esc(n)}</div><div class="s">${money(sum)} · ${list.length}</div></div><div class="right">
            <button class="btn small" data-act="pay" data-name="${esc(n)}">${T('paidIt')}</button>
            <button class="btn small whats" data-act="wa" data-name="${esc(n)}">${T('whatsapp')}</button></div></div>`;
        }).join('') || `<p class="empty">${T('noClients')}</p>`}
      </div>
      <div class="card"><h3>${T('clientCard')}</h3>
        <label>${T('name')}</label><input id="cName" placeholder="Awa Traoré">
        <label>${T('phone')}</label><input id="cPhone" inputmode="tel" placeholder="+225 07 00 00 00 00">
        <button class="btn" data-act="addParty">${T('saveClient')}</button>
        <p class="hint">${T('phoneHint')}</p>
      </div>` : `
      <div class="card"><h3>${T('debts')}</h3>
        ${sup.map((d) => `<div class="row"><div><div class="t">${esc(d.supplier)}</div><div class="s">${dayFR(d.date)} · ${money(debtOf(d))}</div></div><div class="right">
          <button class="btn small" data-act="payDebt" data-id="${d.id}">${T('debtPaid')}</button></div></div>`).join('') || `<p class="empty">${T('noDebt')}</p>`}
      </div>
      <div class="card"><h3>${T('newDebt')}</h3>
        <label>${T('supplier')}</label><input id="dSup" placeholder="Grossiste Adjamé">
        <label>${T('amount')}</label><input id="dAmt" inputmode="numeric" placeholder="0">
        <button class="btn" data-act="addDebt">${T('saveDebt')}</button>
      </div>`}`;
}

/* ---------------- Documents ---------------- */
function docs() {
  const list = [...db.docs].sort((a, b) => (a.date < b.date ? 1 : -1));
  return `<div class="kpis">
      <div class="kpi"><span>${T('quotes')}</span><b>${db.docs.filter((d) => d.kind === 'DEV').length}</b></div>
      <div class="kpi"><span>${T('invoices')}</span><b>${db.docs.filter((d) => d.kind === 'FAC').length}</b></div>
    </div>
    <button class="btn" data-act="newDoc">＋ ${T('newQuote')}</button>
    <div class="card" style="margin-top:16px"><h3>${T('myDocs')}</h3>
      ${list.map((d) => `<div class="row"><div><div class="t">${esc(d.number)}</div><div class="s">${d.kind === 'DEV' ? T('quote') : T('invoice')} · ${dayFR(d.date)} · ${esc(d.party || '—')} · ${money(d.total)}</div></div><div class="right">
        <button class="btn small" data-act="print" data-id="${d.id}">${T('print')}</button>
        <button class="btn small whats" data-act="waDoc" data-id="${d.id}">${T('whatsapp')}</button>
        <button class="btn small mail" data-act="mailDoc" data-id="${d.id}">${T('email')}</button>
        ${d.kind === 'DEV' ? `<button class="btn small out" data-act="toFacture" data-id="${d.id}">${T('toInvoice')}</button>` : ''}
      </div></div>`).join('') || `<p class="empty">${T('noDocs')}</p>`}
    </div>`;
}
function docForm() {
  const rows = draft.lines.map((l, i) => `<div class="line-row">
    <input data-l="label" data-i="${i}" placeholder="${T('line')}" value="${esc(l.label)}">
    <input data-l="qty" data-i="${i}" inputmode="numeric" value="${esc(l.qty)}">
    <input data-l="price" data-i="${i}" inputmode="numeric" value="${esc(l.price)}">
    <button data-act="delLine" data-i="${i}">✕</button></div>`).join('');
  const total = draft.lines.reduce((a, l) => a + (+l.qty || 0) * (+l.price || 0), 0);
  return `<div class="modal"><div class="sheet">
    <h2>${T('newQuote')}</h2>
    <label>${T('client')}</label><input id="dParty" value="${esc(draft.party)}">
    <div id="lines">${rows}</div>
    <button class="btn out" data-act="addLine">＋ ${T('addLine')}</button>
    <div class="row" style="margin-top:10px"><div class="t">${T('total')}</div><div class="t">${money(total)}</div></div>
    <button class="btn" data-act="saveDoc">${T('saveQuote')}</button>
    <button class="btn out" data-act="closeDoc">${T('cancel')}</button>
  </div></div>`;
}

/* ---------------- Bilans ---------------- */
function bilans() {
  const sales = db.sales.filter((s) => inPeriod(s.date, period));
  const exp = db.expenses.filter((e) => inPeriod(e.date, period));
  const ca = sales.reduce((a, s) => a + s.total, 0);
  const cash = sales.reduce((a, s) => a + paidOf(s), 0);
  const dep = exp.reduce((a, e) => a + e.amount, 0);
  const cogs = sales.reduce((a, s) => a + (s.cost || 0), 0);
  const profit = ca - cogs - dep;
  const wd = db.withdrawals.filter((w) => inPeriod(w.date, period)).reduce((a, w) => a + w.amount, 0);
  const chip = (p, label) => `<button class="btn ${period === p ? '' : 'out'}" data-act="period" data-p="${p}">${label}</button>`;
  return `<div class="card"><h3>${T('period')}</h3><div class="big">
      ${chip('jour', T('today'))}${chip('mois', T('thisMonth'))}${chip('annee', T('thisYear'))}${chip('tout', T('all'))}
    </div></div>
    <div class="kpis">
      <div class="kpi"><span>${T('revenue')}</span><b>${money(ca)}</b></div>
      <div class="kpi"><span>${T('collected')}</span><b>${money(cash)}</b></div>
      <div class="kpi"><span>${T('expenses')}</span><b>${money(dep)}</b></div>
      <div class="kpi"><span>${T('profit')}</span><b>${money(profit)}</b></div>
    </div>
    <div class="card">
      <div class="row"><div class="t">${T('cashOut')}</div><div class="t">${money(totalDue())}</div></div>
      <div class="row"><div class="t">${T('stockValue')}</div><div class="t">${money(stockValue())}</div></div>
      <div class="row"><div class="t">${T('withdrawals')}</div><div class="t">${money(wd)}</div></div>
      <div class="row"><div class="t">${T('debts')}</div><div class="t">${money(totalDebt())}</div></div>
    </div>
    <p class="hint">${T('profitHint')}</p>`;
}

/* ---------------- modales ---------------- */
function modal(html) {
  const d = document.createElement('div');
  d.className = 'modal';
  d.innerHTML = `<div class="sheet">${html}</div>`;
  d.addEventListener('click', (e) => { if (e.target === d) d.remove(); });
  document.body.appendChild(d);
  return d;
}
function saleModal() {
  const d = modal(`<h2>${T('sell')}</h2>
    <label>${T('amount')}</label><input id="sAmount" inputmode="numeric" placeholder="0">
    <label>${T('method')}</label><select id="sMethod"><option>Espèces</option><option>Orange Money</option><option>Wave</option><option>MTN</option><option>Moov</option><option>Banque</option></select>
    <label>${T('product')}</label><select id="sProduct"><option value="">${T('none')}</option>${db.products.map((p) => `<option value="${p.id}">${esc(p.name)} (${qtyOf(p)})</option>`).join('')}</select>
    <label>${T('qty')}</label><input id="sQty" inputmode="numeric" value="1">
    <label>${T('client')}</label><input id="sParty">
    <label style="display:flex;gap:10px;align-items:center;margin-top:14px"><input type="checkbox" id="sCredit" style="width:auto"><span>${T('creditLater')}</span></label>
    <button class="btn" id="sOk">${T('saveSale')}</button>
    <button class="btn out" id="sNo">${T('cancel')}</button><p class="err" id="sErr"></p>`);
  d.querySelector('#sNo').onclick = () => d.remove();
  d.querySelector('#sOk').onclick = () => {
    let total = Math.round(+d.querySelector('#sAmount').value || 0);
    const qty = Math.max(1, Math.round(+d.querySelector('#sQty').value || 1));
    const pid = d.querySelector('#sProduct').value;
    const credit = d.querySelector('#sCredit').checked;
    const party = d.querySelector('#sParty').value.trim();
    if (total <= 0 && !pid) { d.querySelector('#sErr').textContent = T('errorAmount'); return; }
    if (credit && !party) { d.querySelector('#sErr').textContent = T('errorCredit'); return; }
    let product = null, cost = 0;
    if (pid) {
      const p = db.products.find((x) => x.id === pid);
      if (p) {
        const q = qtyOf(p);
        if (q < qty) { d.querySelector('#sErr').textContent = T('errorStock') + ' ' + q + '.'; return; }
        product = p.name; cost = qty * p.buy;
        if (!total) total = qty * p.sell;
      }
    }
    const sid = uid();
    const now = Date.now();
    db.sales.push({ id: sid, date: todayISO(), total, paid: credit ? 0 : total, method: d.querySelector('#sMethod').value, party, pid: pid || '', product, qty: product ? qty : 0, cost, u: now });
    if (pid) db.moves.push({ id: 'mv-' + sid, pid, delta: -qty, u: now });
    if (party && !db.parties.some((x) => x.name.toLowerCase() === party.toLowerCase())) db.parties.push({ id: uid(), name: party, phone: '', u: now });
    saveDB(); d.remove(); render();
  };
}
function payModal(name) {
  const list = db.sales.filter((s) => (s.party || '—') === name && creditOf(s) > 0);
  const sum = list.reduce((a, s) => a + creditOf(s), 0);
  const d = modal(`<h2>${esc(name)}</h2><p>${T('owes')} ${money(sum)}</p>
    <label>${T('payReceived')}</label><input id="payAmt" inputmode="numeric" value="${sum}">
    <button class="btn" id="payOk">${T('savePayment')}</button>
    <button class="btn out" id="payNo">${T('cancel')}</button><p class="err" id="payErr"></p>`);
  d.querySelector('#payNo').onclick = () => d.remove();
  d.querySelector('#payOk').onclick = () => {
    let amount = Math.round(+d.querySelector('#payAmt').value || 0);
    if (amount <= 0) { d.querySelector('#payErr').textContent = T('errorAmount'); return; }
    for (const s of list) { if (!amount) break; const take = Math.min(amount, creditOf(s)); s.pays = s.pays || []; s.pays.push({ id: uid(), amount: take, u: Date.now() }); amount -= take; }
    saveDB(); d.remove(); render();
  };
}
function reminderText(name) {
  const list = db.sales.filter((s) => (s.party || '—') === name && creditOf(s) > 0);
  const sum = list.reduce((a, s) => a + creditOf(s), 0);
  const first = list[list.length - 1] || { date: todayISO() };
  const doc = db.docs.find((x) => x.party === name) || { number: '—', date: first.date };
  const tpl = (db.settings.reminder && db.settings.reminder[lang()]) || DEFAULTS.fr;
  return tpl.replaceAll('[Nom du Client]', name)
    .replaceAll('[Nom de la Boutique]', db.shop || T('shop'))
    .replaceAll('[Numéro Facture]', doc.number)
    .replaceAll('[Date Facture]', dayFR(doc.date))
    .replaceAll('[Montant]', money(sum));
}
function waOpen(phone, text) {
  const clean = (phone || '').replace(/[^\d+]/g, '').replace('+', '');
  window.open(clean ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

/* ---------------- impression ---------------- */
function printDoc(id, format) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  const area = document.getElementById('printArea');
  const lines = d.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${esc(l.qty)}</td><td>${money(+l.price)}</td><td>${money((+l.qty || 1) * +l.price)}</td></tr>`).join('');
  area.className = format === 'ticket' ? 'ticket' : 'a4';
  area.innerHTML = `<h2>${db.shop || 'Assistant Commercial'}</h2>
    <div class="small">${d.kind === 'DEV' ? T('quote') : T('invoice')} ${esc(d.number)} · ${dayFR(d.date)}</div>
    <div class="small">${T('client')} : ${esc(d.party || '—')}</div>
    <table><thead><tr><th>${T('line')}</th><th>${T('qty')}</th><th>${T('sellPrice')}</th><th>${T('total')}</th></tr></thead><tbody>${lines}</tbody></table>
    <div class="tot"><span>${T('total')}</span><span>${money(d.total)}</span></div>
    <p class="small">${T('thanks')}</p>`;
  window.print();
}

/* ---------------- délégation ---------------- */
document.addEventListener('click', async (e) => {
  const nav = e.target.closest('#nav button');
  if (nav) { tab = nav.dataset.tab; draft = null; render(); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'sale') saleModal();
  if (act === 'side') { side = b.dataset.s; render(); }
  if (act === 'period') { period = b.dataset.p; render(); }
  if (act === 'closeAds') { adsClosed = true; render(); }
  if (act === 'expense') {
    const d = modal(`<h2>${T('expense')}</h2><label>${T('amount')}</label><input id="eAmt" inputmode="numeric">
      <label>${T('reason')}</label><select id="eLabel"><option>Transport</option><option>Loyer</option><option>Électricité</option><option>Salaire</option><option>Marchandise</option><option>Autre</option></select>
      <label>${T('method')}</label><select id="eMethod"><option>Espèces</option><option>Orange Money</option><option>Wave</option><option>MTN</option><option>Moov</option><option>Banque</option></select>
      <button class="btn" id="eOk">${T('saveExpense')}</button><button class="btn out" id="eNo">${T('cancel')}</button><p class="err" id="eErr"></p>`);
    d.querySelector('#eNo').onclick = () => d.remove();
    d.querySelector('#eOk').onclick = () => {
      const amount = Math.round(+d.querySelector('#eAmt').value || 0);
      if (!amount) { d.querySelector('#eErr').textContent = T('errorAmount'); return; }
      db.expenses.push({ id: uid(), date: todayISO(), amount, label: d.querySelector('#eLabel').value, method: d.querySelector('#eMethod').value, u: Date.now() });
      saveDB(); d.remove(); render();
    };
  }
  if (act === 'withdraw') {
    const d = modal(`<h2>${T('withdraw')}</h2><p class="hint">${T('profitHint')}</p>
      <label>${T('amount')}</label><input id="wAmt" inputmode="numeric">
      <button class="btn" id="wOk">${T('saveWithdraw')}</button><button class="btn out" id="wNo">${T('cancel')}</button><p class="err" id="wErr"></p>`);
    d.querySelector('#wNo').onclick = () => d.remove();
    d.querySelector('#wOk').onclick = () => {
      const amount = Math.round(+d.querySelector('#wAmt').value || 0);
      if (!amount) { d.querySelector('#wErr').textContent = T('errorAmount'); return; }
      db.withdrawals.push({ id: uid(), date: todayISO(), amount, u: Date.now() });
      saveDB(); d.remove(); render();
    };
  }
  if (act === 'addProduct') {
    const name = document.getElementById('pName').value.trim();
    if (!name) return;
    const id = uid();
    const qty = Math.round(+document.getElementById('pQty').value || 0);
    const now = Date.now();
    db.products.push({ id, name, buy: Math.round(+document.getElementById('pBuy').value || 0), sell: Math.round(+document.getElementById('pSell').value || 0), qty, alert: Math.round(+document.getElementById('pAlert').value || 0), u: now });
    db.moves.push({ id: 'mv-' + id, pid: id, delta: qty, u: now });
    saveDB(); render();
  }
  if (act === 'addParty') {
    const name = document.getElementById('cName').value.trim();
    if (!name) return;
    const phone = document.getElementById('cPhone').value.trim();
    const found = db.parties.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) { found.phone = phone; found.u = Date.now(); } else db.parties.push({ id: uid(), name, phone, u: Date.now() });
    saveDB(); render();
  }
  if (act === 'addDebt') {
    const supplier = document.getElementById('dSup').value.trim();
    const amount = Math.round(+document.getElementById('dAmt').value || 0);
    if (!supplier || !amount) return;
    if (!db.suppliers.some((s) => s.name.toLowerCase() === supplier.toLowerCase())) db.suppliers.push({ id: uid(), name: supplier, phone: '', u: Date.now() });
    db.debts.push({ id: uid(), date: todayISO(), supplier, amount, paid: 0, u: Date.now() });
    saveDB(); render();
  }
  if (act === 'payDebt') {
    const d = db.debts.find((x) => x.id === b.dataset.id);
    if (d) { d.paid = d.amount; d.u = Date.now(); saveDB(); render(); }
  }
  if (act === 'pay') payModal(b.dataset.name);
  if (act === 'wa') {
    const name = b.dataset.name;
    waOpen((db.parties.find((p) => p.name === name) || {}).phone, reminderText(name));
  }
  if (act === 'newDoc') { draft = { party: '', lines: [{ label: '', qty: 1, price: 0 }] }; render(); }
  if (act === 'addLine') { syncDraft(); draft.lines.push({ label: '', qty: 1, price: 0 }); render(); }
  if (act === 'delLine') { syncDraft(); draft.lines.splice(+b.dataset.i, 1); if (!draft.lines.length) draft.lines.push({ label: '', qty: 1, price: 0 }); render(); }
  if (act === 'closeDoc') { draft = null; render(); }
  if (act === 'saveDoc') {
    syncDraft();
    const lines = draft.lines.filter((l) => String(l.label).trim() && +l.price > 0)
      .map((l) => ({ label: String(l.label).trim(), qty: +l.qty || 1, price: +l.price }));
    if (!lines.length) return;
    const total = lines.reduce((a, l) => a + l.qty * l.price, 0);
    db.docs.push({ id: uid(), kind: 'DEV', number: num('DEV'), date: todayISO(), party: draft.party.trim(), lines, total, status: 'devis', u: Date.now() });
    draft = null; saveDB(); tab = 'docs'; render();
  }
  if (act === 'toFacture') {
    const d = db.docs.find((x) => x.id === b.dataset.id);
    if (d && d.kind === 'DEV') { d.kind = 'FAC'; d.number = num('FAC'); d.u = Date.now(); saveDB(); render(); }
  }
  if (act === 'print') printDoc(b.dataset.id, 'a4');
  if (act === 'waDoc') {
    const d = db.docs.find((x) => x.id === b.dataset.id);
    if (d) waOpen((db.parties.find((p) => p.name === d.party) || {}).phone, `${d.kind === 'DEV' ? T('quote') : T('invoice')} ${d.number} · ${dayFR(d.date)} · ${money(d.total)} — ${db.shop || ''}`);
  }
  if (act === 'mailDoc') {
    const d = db.docs.find((x) => x.id === b.dataset.id);
    if (d) location.href = `mailto:?subject=${encodeURIComponent(`${d.kind} ${d.number}`)}&body=${encodeURIComponent(`${db.shop || ''}\n${d.kind} ${d.number} · ${dayFR(d.date)}\n${T('total')} : ${money(d.total)}`)}`;
  }
  if (act === 'openSettings') settingsModal();
  if (act === 'syncNow') pushNow();
  if (act === 'logout') {
    await logout();
    const m = document.querySelector('.modal');
    if (m) m.remove();
    render();
  }
  if (act === 'shareApp') shareModal();
});
function syncDraft() {
  if (!draft) return;
  document.querySelectorAll('#lines input').forEach((el) => {
    const i = +el.dataset.i, k = el.dataset.l;
    if (draft.lines[i]) draft.lines[i][k] = el.value;
  });
  const p = document.getElementById('dParty');
  if (p) draft.party = p.value;
}

/* ---------------- réglages ---------------- */
function settingsModal() {
  const d = modal(`<h2>${T('settings')}</h2>
    <label>${T('shopName')}</label><input id="setShop" value="${esc(db.shop)}">
    <label>${T('language')}</label>
    <select id="setLang">${LANGS.map((l) => `<option value="${l.id}" ${l.id === lang() ? 'selected' : ''}>${l.id === 'ar' ? 'العربية' : l.label}</option>`).join('')}</select>
    <label>${T('reminderText')}</label><textarea id="setRem" rows="4">${esc((db.settings.reminder || DEFAULTS)[lang()])}</textarea>
    <label style="display:flex;gap:10px;align-items:center;margin-top:12px"><input type="checkbox" id="setAds" ${db.settings.ads ? 'checked' : ''} style="width:auto"><span>${T('ads')}</span></label>
    ${accountHTML()}
    <button class="btn" id="setOk">${T('save')}</button>
    <button class="btn out" id="setShare">${T('share')}</button>
    <button class="btn out" id="setInstall">${T('install')}</button>
    <button class="btn out" id="setExport">${T('exportData')}</button>
    <button class="btn out" id="setImport">${T('importData')}</button>
    <p class="hint">${T('backupHint')}</p>
    <button class="btn out" id="setNo">${T('close')}</button>`);
  d.querySelector('#setNo').onclick = () => d.remove();
  wireAccount(d);
  d.querySelector('#setShare').onclick = () => { d.remove(); shareModal(); };
  d.querySelector('#setInstall').onclick = () => { d.remove(); installModal(); };
  d.querySelector('#setExport').onclick = exportDB;
  d.querySelector('#setImport').onclick = importDB;
  d.querySelector('#setOk').onclick = () => {
    db.shop = d.querySelector('#setShop').value.trim();
    const l = d.querySelector('#setLang').value;
    db.settings.reminder[db.settings.lang] = d.querySelector('#setRem').value;
    db.settings.lang = l;
    db.settings.ads = d.querySelector('#setAds').checked;
    saveDB(); d.remove(); render();
  };
}
function exportDB() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'assistant-commercial-' + todayISO() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function importDB() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = () => {
    const f = input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        const base = fresh();
        db = Object.assign(base, parsed, { settings: Object.assign(base.settings, parsed.settings || {}) });
        migrate(db);
        saveDB(); render();
      } catch { alert('Fichier illisible.'); }
    };
    r.readAsText(f);
  };
  input.click();
}
/* ---------------- installation sur le téléphone ---------------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
const installed = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
function installModal() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const steps = installed()
    ? `<p class="hint">${T('installDone')}</p>`
    : `<ol><li>${isIOS ? T('installIphone1') : T('installAndroid1')}</li><li>${isIOS ? T('installIphone2') : T('installAndroid2')}</li><li>${T('installOpen')}</li></ol>`;
  const d = modal(`<h2>${T('installTitle')}</h2>
    <p class="hint">${T('installHint')}</p>
    ${steps}
    ${installEvt && !installed() ? `<button class="btn" id="inNow">${T('installNow')}</button>` : ''}
    <button class="btn out" id="inClose">${T('close')}</button>`);
  d.querySelector('#inClose').onclick = () => d.remove();
  const now = d.querySelector('#inNow');
  if (now) now.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; d.remove(); };
}
function shareModal() {
  const url = location.origin + location.pathname;
  const d = modal(`<h2>${T('share')}</h2><p class="hint">${T('shareHint')}</p>
    <div class="qrbox" id="qrBox"></div>
    <p class="hint" style="text-align:center"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>
    <p class="hint" style="text-align:center">${T('qrHelp')}</p>
    <button class="btn" id="qrNative">${T('share')}</button>
    <button class="btn out" id="qrCopy">${T('copy')}</button>
    <button class="btn out" id="qrClose">${T('close')}</button>`);
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    d.querySelector('#qrBox').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
  } catch { d.querySelector('#qrBox').textContent = url; }
  d.querySelector('#qrClose').onclick = () => d.remove();
  d.querySelector('#qrNative').onclick = () => shareApp();
  d.querySelector('#qrCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(url); alert(T('copied')); } catch { alert(url); }
  };
}
async function shareApp() {
  const url = location.href.split('#')[0];
  const data = { title: T('app'), text: T('share'), url };
  if (navigator.share) { try { await navigator.share(data); return; } catch {} }
  try { await navigator.clipboard.writeText(url); alert(T('copied')); } catch { alert(url); }
}

/* ---------------- fusion des deux téléphones ---------------- */
const ARRAYS = ['products', 'parties', 'suppliers', 'sales', 'expenses', 'withdrawals', 'docs', 'debts', 'moves'];
const countRecords = (d) => ARRAYS.reduce((a, k) => a + (d[k] || []).length, 0);
function unionPays(a, b) {
  const m = new Map();
  [...(a || []), ...(b || [])].forEach((p) => { if (p && p.id) m.set(p.id, p); });
  return [...m.values()];
}
function unionArray(local, remote) {
  const map = new Map();
  (local || []).forEach((x) => { if (x && x.id) map.set(x.id, x); });
  (remote || []).forEach((x) => {
    if (!x || !x.id) return;
    const cur = map.get(x.id);
    if (!cur) { map.set(x.id, x); return; }
    const win = (x.u || 0) > (cur.u || 0) ? x : cur;
    const lose = win === x ? cur : x;
    map.set(x.id, { ...lose, ...win, pays: unionPays(cur.pays, x.pays), paid: Math.max(Number(cur.paid) || 0, Number(x.paid) || 0) });
  });
  return [...map.values()];
}
function ensureMoves(d) {
  d.moves = Array.isArray(d.moves) ? d.moves : [];
  for (const p of d.products || []) {
    if (!d.moves.some((m) => m.pid === p.id)) d.moves.push({ id: 'mv-' + p.id, pid: p.id, delta: 0, u: 1 });
  }
}
function renumberDocs(d) {
  const seen = new Set();
  const y = new Date().getFullYear();
  for (const doc of [...d.docs].sort((a, b) => (a.u || 0) - (b.u || 0))) {
    if (!doc.number || !seen.has(doc.number)) { seen.add(doc.number); continue; }
    d.seq[doc.kind] = (d.seq[doc.kind] || 0) + 1;
    doc.number = doc.kind + '-' + y + '-' + String(d.seq[doc.kind]).padStart(3, '0');
    doc.u = Date.now();
    seen.add(doc.number);
  }
}
function mergeStates(local, remote) {
  migrate(local); migrate(remote);
  const out = fresh();
  const localNewer = (local.meta.updated || 0) >= (remote.meta.updated || 0);
  out.shop = local.shop || remote.shop || '';
  out.settings = Object.assign(fresh().settings, (localNewer ? local.settings : remote.settings) || {});
  ARRAYS.forEach((k) => { out[k] = unionArray(local[k], remote[k]); });
  out.seq = { DEV: Math.max(local.seq?.DEV || 0, remote.seq?.DEV || 0), FAC: Math.max(local.seq?.FAC || 0, remote.seq?.FAC || 0) };
  out.meta = { lastSync: Date.now(), updated: Math.max(local.meta.updated || 0, remote.meta.updated || 0), rev: Math.max(local.meta.rev || 0, remote.meta.rev || 0), mv: 1 };
  ensureMoves(out);
  renumberDocs(out);
  return out;
}

/* ---------------- compte et synchronisation ---------------- */
let me = null;
let syncState = 'idle';
let syncTimer = null;
let syncingNow = false;
const clock = (ts) => (ts ? new Date(ts).toLocaleTimeString(lang() === 'ar' ? 'ar' : lang() === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');

function updatePill() {
  const pill = document.getElementById('netState');
  if (!pill) return;
  const synced = { synced: T('synced'), syncing: T('syncing'), pending: T('syncPending'), error: T('syncPending') }[syncState] || T('synced');
  pill.textContent = !navigator.onLine ? T('offline') : me ? synced : T('online');
  pill.classList.toggle('on', navigator.onLine && (!me || syncState === 'synced'));
  pill.title = me ? T('lastSaved') + ' ' + clock(db.meta.lastSync) : T('accountHint');
}
function markSync(s) { syncState = s; updatePill(); }

async function api(path, method = 'GET', body) {
  try {
    const r = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
}
async function refreshMe() {
  const r = await api('/api/me');
  me = r.ok && r.data ? r.data.user : null;
  return me;
}
function applyRemote(text, updated, rev) {
  try {
    const parsed = JSON.parse(text);
    const base = fresh();
    db = Object.assign(base, parsed, { settings: Object.assign(base.settings, parsed.settings || {}) });
    migrate(db);
    db.meta.updated = updated || Date.now();
    db.meta.rev = rev || 0;
    db.meta.lastSync = Date.now();
    saveDB(false);
    render();
    markSync('synced');
  } catch { markSync('error'); }
}
async function pushNow() {
  if (!me) return;
  if (syncingNow) { clearTimeout(syncTimer); syncTimer = setTimeout(pushNow, 1500); return; }
  syncingNow = true;
  markSync('syncing');
  try {
    const r = await api('/api/data', 'PUT', { json: JSON.stringify(db), updated: db.meta.updated, rev: db.meta.rev || 0 });
    if (!r.ok) { markSync(navigator.onLine ? 'error' : 'pending'); return; }
    if (r.data && r.data.saved === false && r.data.json) {
      const merged = mergeStates(db, JSON.parse(r.data.json));
      db = merged;
      db.meta.rev = r.data.rev || db.meta.rev || 0;
      db.meta.lastSync = Date.now();
      saveDB(false); render(); markSync('synced');
      clearTimeout(syncTimer); syncTimer = setTimeout(pushNow, 400);
      return;
    }
    db.meta.rev = (r.data && r.data.rev) || db.meta.rev || 0;
    db.meta.lastSync = Date.now();
    saveDB(false);
    markSync('synced');
  } finally { syncingNow = false; }
}
async function pullNow(force = false) {
  if (!me) return;
  if (syncingNow) return;
  syncingNow = true;
  try {
    const r = await api('/api/data');
    if (!r.ok || !r.data) { markSync('error'); return; }
    const remoteRev = r.data.rev || 0;
    if (r.data.json && force) { applyRemote(r.data.json, r.data.updated, remoteRev); return; }
    if (r.data.json && remoteRev > (db.meta.rev || 0)) {
      const remote = JSON.parse(r.data.json);
      const merged = mergeStates(db, remote);
      const extra = countRecords(merged) > countRecords(remote);
      db = merged;
      db.meta.rev = remoteRev;
      db.meta.lastSync = Date.now();
      saveDB(false); render(); markSync('synced');
      if (extra) { syncingNow = false; await pushNow(); }
      return;
    }
    if (!r.data.json && db.shop) { syncingNow = false; await pushNow(); return; }
    db.meta.rev = remoteRev; db.meta.lastSync = Date.now(); saveDB(false); markSync('synced');
  } finally { syncingNow = false; }
}
function queueSync() {
  if (!me) return;
  clearTimeout(syncTimer);
  markSync('pending');
  syncTimer = setTimeout(pushNow, 1200);
}
/* Un autre téléphone a pu enregistrer : on regarde le cloud régulièrement et dès que l'app revient à l'écran. */
async function syncTick() {
  if (!me || !navigator.onLine || syncingNow || document.visibilityState === 'hidden') return;
  if (syncState === 'pending') await pushNow();
  else await pullNow(false);
}
async function signup(email, phone, password) {
  const r = await api('/api/signup', 'POST', { email, phone, password });
  if (!r.ok) return (r.data && r.data.error) || 'server';
  me = r.data.user;
  markSync('syncing');
  await pushNow();
  return null;
}
async function login(email, password) {
  const r = await api('/api/login', 'POST', { email, password });
  if (!r.ok) return (r.data && r.data.error) || 'server';
  me = r.data.user;
  await pullNow(true);
  render();
  return null;
}
async function logout() {
  await api('/api/logout', 'POST', {});
  me = null;
  markSync('idle');
}
async function bootAccount() {
  await refreshMe();
  if (me) await pullNow();
  updatePill();
}
function accountHTML() {
  if (me) {
    return `<div class="card" style="margin-top:14px"><h3>${T('account')}</h3>
      <div class="row"><div><div class="t">${esc(me.email)}</div><div class="s">${esc(me.phone)}</div></div><div class="right"><span class="tag ok">${T('cloudOn')}</span></div></div>
      <p class="hint">${T('lastSaved')} ${clock(db.meta.lastSync)}</p>
      <button class="btn out" data-act="syncNow">${T('syncNow')}</button>
      <button class="btn out" data-act="logout">${T('signOut')}</button>
      <p class="hint">${T('multiPhoneHint')}</p></div>`;
  }
  return `<div class="card" style="margin-top:14px"><h3>${T('account')}</h3>
    <label>${T('email')}</label><input id="acEmail" type="email" autocomplete="email" placeholder="awa@exemple.com">
    <label>${T('phoneNumber')}</label><input id="acPhone" type="tel" autocomplete="tel" placeholder="+225 07 00 00 00 00">
    <label>${T('password')}</label><input id="acPass" type="password" autocomplete="new-password">
    <button class="btn" id="acSignup">${T('createAccount')}</button>
    <button class="btn out" id="acLogin">${T('signIn')}</button>
    <button class="btn out" id="acForgot">${T('forgot')}</button>
    <p class="hint">${T('accountHint')}</p><p class="err" id="acErr"></p></div>`;
}
function wireAccount(d) {
  const btn = d.querySelector('#acSignup');
  if (!btn) return;
  const err = d.querySelector('#acErr');
  const values = () => ({ email: d.querySelector('#acEmail').value.trim(), phone: d.querySelector('#acPhone').value.trim(), pass: d.querySelector('#acPass').value });
  btn.onclick = async () => {
    err.textContent = '';
    const { email, phone, pass } = values();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { err.textContent = T('badEmail'); return; }
    if (phone.replace(/\D/g, '').length < 8) { err.textContent = T('badPhone'); return; }
    if (pass.length < 8) { err.textContent = T('badPass'); return; }
    const e = await signup(email, phone, pass);
    if (e) { err.textContent = e === 'exists' ? T('emailTaken') : e === 'phone' ? T('badPhone') : T('badCredentials'); return; }
    d.remove(); render();
  };
  d.querySelector('#acLogin').onclick = async () => {
    err.textContent = '';
    const { email, pass } = values();
    if (!email || !pass) { err.textContent = T('badCredentials'); return; }
    const e = await login(email, pass);
    if (e) { err.textContent = T('badCredentials'); return; }
    d.remove(); render();
  };
  const forgot = d.querySelector('#acForgot');
  if (forgot) forgot.onclick = () => forgotModal(values().email);
}
function forgotModal(email = '') {
  const d = modal(`<h2>${T('forgotTitle')}</h2><p class="hint">${T('forgotHint')}</p>
    <label>${T('email')}</label><input id="fEmail" type="email" value="${esc(email)}">
    <button class="btn" id="fOk">${T('sendLink')}</button>
    <button class="btn out" id="fNo">${T('cancel')}</button><p class="hint" id="fMsg"></p>`);
  d.querySelector('#fNo').onclick = () => d.remove();
  d.querySelector('#fOk').onclick = async () => {
    const addr = d.querySelector('#fEmail').value.trim();
    const msg = d.querySelector('#fMsg');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(addr)) { msg.textContent = T('badEmail'); return; }
    d.querySelector('#fOk').disabled = true;
    const r = await api('/api/forgot', 'POST', { email: addr });
    d.querySelector('#fOk').disabled = false;
    msg.textContent = T('resetSent') + (r.ok && r.data && r.data.mail === false ? ' ' + T('mailNotReady') : '');
  };
}
function resetModal(token) {
  const d = modal(`<h2>${T('resetTitle')}</h2>
    <label>${T('newPassword')}</label><input id="rPass" type="password" autocomplete="new-password">
    <label>${T('confirmPassword')}</label><input id="rPass2" type="password" autocomplete="new-password">
    <button class="btn" id="rOk">${T('savePassword')}</button><p class="err" id="rErr"></p>`);
  d.querySelector('#rOk').onclick = async () => {
    const p1 = d.querySelector('#rPass').value;
    const p2 = d.querySelector('#rPass2').value;
    const err = d.querySelector('#rErr');
    if (p1.length < 8) { err.textContent = T('badPass'); return; }
    if (p1 !== p2) { err.textContent = T('passMismatch'); return; }
    const r = await api('/api/reset', 'POST', { token, password: p1 });
    if (!r.ok) { err.textContent = T('resetBad'); return; }
    d.remove();
    history.replaceState({}, '', location.origin + location.pathname);
    alert(T('resetDone'));
    settingsModal();
  };
}

/* ---------------- démarrage ---------------- */
if (!db.shop) {
  const d = modal(`<h2>${T('welcomeTitle')}</h2><p>${T('welcomeAsk')}</p><input id="wShop" placeholder="Chez Awa"><button class="btn" id="wOk">${T('start')}</button>`);
  d.querySelector('#wOk').onclick = () => {
    const v = d.querySelector('#wShop').value.trim();
    if (!v) return;
    db.shop = v; saveDB(); d.remove(); render();
  };
}
window.addEventListener('online', () => { render(); syncTick(); });
window.addEventListener('offline', render);
window.addEventListener('focus', syncTick);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncTick(); });
setInterval(syncTick, 20000);
render();
bootAccount();
const resetToken = new URLSearchParams(location.search).get('reset');
if (resetToken) resetModal(resetToken);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
