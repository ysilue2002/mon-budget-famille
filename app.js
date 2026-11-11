/* Assistant Commercial — application locale, hors-ligne, trois langues. */
const KEY = 'assistant-commercial.v2';
const DEFAULTS = {
  fr: "Bonjour [Nom du Client], c'est [Nom de la Boutique]. La facture [Numéro Facture] du [Date Facture] d'un montant de [Montant] reste à régler. Merci de votre confiance.",
  en: "Hello [Nom du Client], this is [Nom de la Boutique]. Invoice [Numéro Facture] dated [Date Facture] for [Montant] is still unpaid. Thank you.",
  ar: "مرحباً [Nom du Client]، هذه رسالة من [Nom de la Boutique]. الفاتورة [Numéro Facture] بتاريخ [Date Facture] بمبلغ [Montant] لا تزال غير مسددة. شكراً لكم.",
};
const fresh = () => ({
  shop: '', products: [], parties: [], suppliers: [], sales: [], expenses: [], withdrawals: [], docs: [], debts: [],
  seq: { DEV: 0, FAC: 0 },
  settings: { lang: 'fr', ads: false, reminder: { ...DEFAULTS } },
  meta: { lastSync: null },
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
    return Object.assign(base, parsed, { settings: Object.assign(base.settings, parsed.settings || {}) });
  } catch { return fresh(); }
}
function saveDB() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} }
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
const creditOf = (s) => Math.max(0, s.total - s.paid);
const totalDue = () => db.sales.reduce((a, s) => a + creditOf(s), 0);
const debtOf = (d) => Math.max(0, d.amount - d.paid);
const totalDebt = () => db.debts.reduce((a, d) => a + debtOf(d), 0);
const stockValue = () => db.products.reduce((a, p) => a + p.qty * p.buy, 0);
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
  const pill = document.getElementById('netState');
  pill.textContent = navigator.onLine ? T('online') : T('offline');
  pill.classList.toggle('on', navigator.onLine);
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
      <div class="kpi"><span>${T('toRenew')}</span><b>${p.filter((x) => x.qty <= x.alert).length}</b></div>
    </div>
    <div class="card"><h3>${T('articles')}</h3>
      ${p.map((x) => `<div class="row"><div><div class="t">${esc(x.name)}</div><div class="s">${T('buyPrice')} ${money(x.buy)} · ${T('sellPrice')} ${money(x.sell)} · ${T('margin')} ${money(x.sell - x.buy)}</div></div><div class="right">${x.qty <= 0 ? `<span class="tag bad">${T('outOfStock')}</span>` : x.qty <= x.alert ? `<span class="tag warn">${T('left')} ${x.qty}</span>` : `<span class="tag">${x.qty}</span>`}</div></div>`).join('') || `<p class="empty">${T('noArticles')}</p>`}
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
  const cash = sales.reduce((a, s) => a + s.paid, 0);
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
    <label>${T('product')}</label><select id="sProduct"><option value="">${T('none')}</option>${db.products.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.qty})</option>`).join('')}</select>
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
        if (p.qty < qty) { d.querySelector('#sErr').textContent = T('errorStock') + ' ' + p.qty + '.'; return; }
        p.qty -= qty; product = p.name; cost = qty * p.buy;
        if (!total) total = qty * p.sell;
      }
    }
    db.sales.push({ id: uid(), date: todayISO(), total, paid: credit ? 0 : total, method: d.querySelector('#sMethod').value, party, product, qty: product ? qty : 0, cost });
    if (party && !db.parties.some((x) => x.name.toLowerCase() === party.toLowerCase())) db.parties.push({ id: uid(), name: party, phone: '' });
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
    for (const s of list) { if (!amount) break; const take = Math.min(amount, creditOf(s)); s.paid += take; amount -= take; }
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
      db.expenses.push({ id: uid(), date: todayISO(), amount, label: d.querySelector('#eLabel').value, method: d.querySelector('#eMethod').value });
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
      db.withdrawals.push({ id: uid(), date: todayISO(), amount });
      saveDB(); d.remove(); render();
    };
  }
  if (act === 'addProduct') {
    const name = document.getElementById('pName').value.trim();
    if (!name) return;
    db.products.push({ id: uid(), name, buy: Math.round(+document.getElementById('pBuy').value || 0), sell: Math.round(+document.getElementById('pSell').value || 0), qty: Math.round(+document.getElementById('pQty').value || 0), alert: Math.round(+document.getElementById('pAlert').value || 0) });
    saveDB(); render();
  }
  if (act === 'addParty') {
    const name = document.getElementById('cName').value.trim();
    if (!name) return;
    const phone = document.getElementById('cPhone').value.trim();
    const found = db.parties.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) found.phone = phone; else db.parties.push({ id: uid(), name, phone });
    saveDB(); render();
  }
  if (act === 'addDebt') {
    const supplier = document.getElementById('dSup').value.trim();
    const amount = Math.round(+document.getElementById('dAmt').value || 0);
    if (!supplier || !amount) return;
    if (!db.suppliers.some((s) => s.name.toLowerCase() === supplier.toLowerCase())) db.suppliers.push({ id: uid(), name: supplier, phone: '' });
    db.debts.push({ id: uid(), date: todayISO(), supplier, amount, paid: 0 });
    saveDB(); render();
  }
  if (act === 'payDebt') {
    const d = db.debts.find((x) => x.id === b.dataset.id);
    if (d) { d.paid = d.amount; saveDB(); render(); }
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
    db.docs.push({ id: uid(), kind: 'DEV', number: num('DEV'), date: todayISO(), party: draft.party.trim(), lines, total, status: 'devis' });
    draft = null; saveDB(); tab = 'docs'; render();
  }
  if (act === 'toFacture') {
    const d = db.docs.find((x) => x.id === b.dataset.id);
    if (d && d.kind === 'DEV') { d.kind = 'FAC'; d.number = num('FAC'); saveDB(); render(); }
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
  if (act === 'shareApp') shareApp();
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
    <button class="btn" id="setOk">${T('save')}</button>
    <button class="btn out" id="setShare">${T('share')}</button>
    <button class="btn out" id="setExport">${T('exportData')}</button>
    <button class="btn out" id="setImport">${T('importData')}</button>
    <p class="hint">${T('backupHint')}</p>
    <button class="btn out" id="setNo">${T('close')}</button>`);
  d.querySelector('#setNo').onclick = () => d.remove();
  d.querySelector('#setShare').onclick = () => shareApp();
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
        saveDB(); render();
      } catch { alert('Fichier illisible.'); }
    };
    r.readAsText(f);
  };
  input.click();
}
async function shareApp() {
  const url = location.href.split('#')[0];
  const data = { title: T('app'), text: T('share'), url };
  if (navigator.share) { try { await navigator.share(data); return; } catch {} }
  try { await navigator.clipboard.writeText(url); alert(T('copied')); } catch { alert(url); }
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
window.addEventListener('online', render);
window.addEventListener('offline', render);
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
