/* Assistant Commercial — application locale, hors-ligne, trois langues. */
const KEY = 'assistant-commercial.v2';
const DEFAULTS = {
  fr: "Bonjour [Nom du Client], c'est [Nom de la Boutique]. La facture [Numéro Facture] du [Date Facture] d'un montant de [Montant] reste à régler. Merci de votre confiance.",
  en: "Hello [Nom du Client], this is [Nom de la Boutique]. Invoice [Numéro Facture] dated [Date Facture] for [Montant] is still unpaid. Thank you.",
  ar: "مرحباً [Nom du Client]، هذه رسالة من [Nom de la Boutique]. الفاتورة [Numéro Facture] بتاريخ [Date Facture] بمبلغ [Montant] لا تزال غير مسددة. شكراً لكم.",
};
const COUNTRIES = [
  ['CI', "Côte d'Ivoire", 'FCFA'], ['SN', 'Sénégal', 'FCFA'], ['ML', 'Mali', 'FCFA'], ['BF', 'Burkina Faso', 'FCFA'],
  ['NE', 'Niger', 'FCFA'], ['TG', 'Togo', 'FCFA'], ['BJ', 'Bénin', 'FCFA'], ['GN', 'Guinée', 'GNF'],
  ['CM', 'Cameroun', 'FCFA'], ['GA', 'Gabon', 'FCFA'], ['CG', 'Congo', 'FCFA'], ['CD', 'RD Congo', 'FC'],
  ['TD', 'Tchad', 'FCFA'], ['CF', 'Centrafrique', 'FCFA'], ['MG', 'Madagascar', 'Ar'], ['MR', 'Mauritanie', 'UM'],
  ['MA', 'Maroc', 'DH'], ['DZ', 'Algérie', 'DA'], ['TN', 'Tunisie', 'DT'], ['FR', 'France', '€'],
  ['BE', 'Belgique', '€'], ['CH', 'Suisse', 'CHF'], ['CA', 'Canada', '$'], ['US', 'États-Unis', '$'],
  ['GB', 'Royaume-Uni', '£'], ['NG', 'Nigéria', '₦'], ['GH', 'Ghana', 'GH₵'], ['KE', 'Kenya', 'KSh'],
  ['ZA', 'Afrique du Sud', 'R'], ['IN', 'Inde', '₹'], ['CN', 'Chine', '¥'], ['AE', 'Émirats arabes unis', 'AED'],
  ['SA', 'Arabie saoudite', 'SAR'], ['BR', 'Brésil', 'R$'],
];
const COMPANY_FORMS = ['Entreprise individuelle', 'SARL', 'SARLU', 'SA', 'SAS', 'SASU', 'Coopérative', 'Association', 'Auto-entrepreneur', 'Autre'];
const countryOf = (code) => COUNTRIES.find((c) => c[0] === code) || COUNTRIES[0];
const countryName = (code) => countryOf(code)[1];
const currencyFor = (code) => countryOf(code)[2];
const countryOptions = (sel) => COUNTRIES.map((c) => `<option value="${c[0]}" ${c[0] === sel ? 'selected' : ''}>${c[1]} — ${c[2]}</option>`).join('');
const formOptions = (sel) => COMPANY_FORMS.map((f) => `<option value="${f}" ${f === sel ? 'selected' : ''}>${f}</option>`).join('');
const fresh = () => ({
  shop: '', products: [], parties: [], suppliers: [], sales: [], expenses: [], withdrawals: [], docs: [], debts: [], moves: [],
  seq: { DEV: 0, FAC: 0 },
  settings: { lang: 'fr', ads: false, reminder: { ...DEFAULTS }, country: 'CI', currency: 'FCFA', companyForm: '', city: '', district: '', address: '', vat: 18 },
  meta: { lastSync: null, updated: 0, rev: 0, mv: 0 },
});
let db = loadDB();
let tab = 'vendre';
let side = 'clients';
let period = 'mois';
let draft = null;
let adsClosed = false;
let docQuery = '';
let histQuery = '';
let histMethod = 'all';
let histPeriod = 'mois';

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
const money = (n) => fr(n) + ' ' + ((db.settings && db.settings.currency) || 'FCFA');
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
const vatOf = (d) => Math.round(((Number(d.total) || 0) * (Number(d.vat) || 0)) / 100);
const ttcOf = (d) => (Number(d.total) || 0) + vatOf(d);
const amountOf = (d) => (Number(d.vat) ? ttcOf(d) : Number(d.total) || 0);

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
  const view = { vendre, stock, clients, docs, bilans, hist, pending }[tab]();
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
    ...t.map((s) => `<div class="row"><div><div class="t">${T('sale')} ${money(s.total)}</div><div class="s">${esc(s.method)}${s.party ? ' · ' + esc(s.party) : ''}${s.product ? ' · ' + esc(s.product) + ' ×' + s.qty : ''}</div></div><div class="right">${creditOf(s) ? `<span class="tag warn">${T('remains')} ${money(creditOf(s))}</span>` : `<span class="tag ok">${T('paid')}</span>`}<br><button class="btn small whats" data-act="waSale" data-id="${s.id}">${T('receipt')}</button></div></div>`),
    ...db.expenses.filter((e) => e.date === todayISO()).map((e) => `<div class="row"><div><div class="t">${T('expense')} ${money(e.amount)}</div><div class="s">${esc(e.label)}${e.note ? ' · ' + esc(e.note) : ''} · ${esc(e.method)}</div></div></div>`),
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
    <div class="card" style="margin-top:16px"><h3 style="display:flex;justify-content:space-between;align-items:center;gap:8px">${T('today')}<button class="btn small out" data-act="hist">${T('history')}</button></h3>${list || `<p class="empty">${T('nothing')}</p>`}</div>`;
}

/* ---------------- Stock ---------------- */
function stock() {
  const p = [...db.products].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="kpis">
      <div class="kpi"><span>${T('stockValue')}</span><b>${money(stockValue())}</b></div>
      <div class="kpi"><span>${T('toRenew')}</span><b>${p.filter((x) => qtyOf(x) <= x.alert).length}</b></div>
    </div>
    <div class="card"><h3>${T('articles')}</h3>
      ${p.map((x) => { const q = qtyOf(x); return `<div class="row"><div><div class="t">${esc(x.name)}</div><div class="s">${T('buyPrice')} ${money(x.buy)} · ${T('sellPrice')} ${money(x.sell)} · ${T('margin')} ${money(x.sell - x.buy)}</div></div>    <div class="right">${q <= 0 ? `<span class="tag bad">${T('outOfStock')}</span>` : q <= x.alert ? `<span class="tag warn">${T('left')} ${q}</span>` : `<span class="tag">${q}</span>`}<br><button class="btn small out" data-act="editProduct" data-id="${x.id}">${T('edit')}</button><button class="btn small out" data-act="delProduct" data-id="${x.id}">${T('delete')}</button></div></div>`; }).join('') || `<p class="empty">${T('noArticles')}</p>`}
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
    <button class="btn out" data-act="exportContacts">${T('exportContacts')}</button>
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
      <div class="card"><h3>${T('clientList')}</h3>
        ${db.parties.map((p) => `<div class="row"><div><div class="t">${esc(p.name)}</div><div class="s">${[p.phone, p.address].filter(Boolean).map(esc).join(' · ') || '—'}</div></div><div class="right">
          <button class="btn small" data-act="clientDetail" data-id="${p.id}">${T('detail')}</button>
          <button class="btn small out" data-act="editClient" data-id="${p.id}">${T('edit')}</button>
          <button class="btn small out" data-act="delClient" data-id="${p.id}">${T('delete')}</button></div></div>`).join('') || `<p class="empty">${T('noClientsList')}</p>`}
      </div>
      <div class="card"><h3>${T('clientCard')}</h3>
        <label>${T('name')}</label><input id="cName" placeholder="Awa Traoré">
        <label>${T('phone')}</label><input id="cPhone" inputmode="tel" placeholder="+225 07 00 00 00 00">
        <label>${T('address')}</label><input id="cAddress" placeholder="Cocody, près de la pharmacie">
        <button class="btn" data-act="addParty">${T('saveClient')}</button>
        <p class="hint">${T('phoneHint')}</p>
      </div>` : `
      <div class="card"><h3>${T('supplierList')}</h3>
        ${db.suppliers.map((s) => `<div class="row"><div><div class="t">${esc(s.name)}</div><div class="s">${[s.phone, s.address].filter(Boolean).map(esc).join(' · ') || '—'}</div></div><div class="right">
          ${s.phone ? `<button class="btn small whats" data-act="waSup" data-name="${esc(s.name)}">${T('whatsapp')}</button>` : ''}
          <button class="btn small" data-act="supDetail" data-id="${s.id}">${T('detail')}</button>
          <button class="btn small out" data-act="editSupplier" data-id="${s.id}">${T('edit')}</button>
          <button class="btn small out" data-act="delSupplier" data-id="${s.id}">${T('delete')}</button>
        </div></div>`).join('') || `<p class="empty">${T('noSuppliers')}</p>`}
      </div>
      <button class="btn out" data-act="pending">${T('pendingPurchases')}</button>
      <div class="card"><h3>${T('supplierCard')}</h3>
        <label>${T('name')}</label><input id="sName" placeholder="Grossiste Adjamé">
        <label>${T('phone')}</label><input id="sPhone" inputmode="tel">
        <label>${T('address')}</label><input id="sAddress">
        <button class="btn" data-act="addSupplier">${T('saveSupplier')}</button>
      </div>
      <div class="card"><h3>${T('debts')}</h3>
        ${sup.map((d) => `<div class="row"><div><div class="t">${esc(d.supplier)}</div><div class="s">${dayFR(d.date)} · ${T('total')} ${money(d.amount)} · ${T('paid')} ${money(d.paid || 0)}</div></div><div class="right">
          ${d.delivered === false ? `<span class="tag warn">${T('notDelivered')}</span>` : ''}
          ${debtOf(d) ? `<span class="tag bad">${T('remains')} ${money(debtOf(d))}</span>` : `<span class="tag ok">${T('paid')}</span>`}<br>
          ${debtOf(d) ? `<button class="btn small" data-act="payDebt" data-id="${d.id}">${T('paySupplier')}</button>` : ''}
          ${d.delivered === false ? `<button class="btn small out" data-act="deliverDebt" data-id="${d.id}">${T('markDelivered')}</button>` : ''}
        </div></div>`).join('') || `<p class="empty">${T('noDebt')}</p>`}
      </div>
      <div class="card"><h3>${T('newPurchase')}</h3>
        <label>${T('supplier')}</label><input id="dSup" list="supNames" placeholder="Grossiste Adjamé"><datalist id="supNames">${db.suppliers.map((s) => `<option value="${esc(s.name)}"></option>`).join('')}</datalist>
        <label>${T('amount')}</label><input id="dAmt" inputmode="numeric" placeholder="0">
        <label>${T('alreadyPaid')}</label><input id="dPaid" inputmode="numeric" placeholder="0">
        <label>${T('articleOptional')}</label><select id="dPid"><option value="">${T('none')}</option>${db.products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <label>${T('qty')}</label><input id="dQty" inputmode="numeric" value="1">
        <label style="display:flex;gap:10px;align-items:center;margin-top:14px"><input type="checkbox" id="dRecv" checked style="width:auto"><span>${T('received')}</span></label>
        <button class="btn" data-act="addPurchase">${T('saveDebt')}</button>
      </div>`}`;
}

/* ---------------- Documents ---------------- */
function filterDocs(q) {
  const term = String(q || '').trim().toLowerCase();
  const list = [...db.docs].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!term) return list;
  return list.filter((d) => [d.number, d.party, d.clientPhone, d.clientAddress, d.date, dayFR(d.date), d.kind === 'DEV' ? T('quote') : T('invoice'), String(d.total), money(d.total), money(amountOf(d))].join(' ').toLowerCase().includes(term));
}
function docsList(list) {
  return list.map((d) => `<div class="row"><div><div class="t">${esc(d.number)}</div>        <div class="s">${d.kind === 'DEV' ? T('quote') : T('invoice')} · ${dayFR(d.date)} · ${esc(d.party || '—')} · ${money(amountOf(d))}</div></div><div class="right">
        <button class="btn small" data-act="print" data-id="${d.id}">${T('print')}</button>
        <button class="btn small whats" data-act="waDoc" data-id="${d.id}">${T('whatsapp')}</button>
        <button class="btn small pdf" data-act="waPdf" data-id="${d.id}">${T('pdf')}</button>
        <button class="btn small out" data-act="dlPdf" data-id="${d.id}">${T('download')}</button>
        <button class="btn small out" data-act="duplicate" data-id="${d.id}">${T('duplicate')}</button>
        <button class="btn small mail" data-act="mailDoc" data-id="${d.id}">${T('email')}</button>
        ${d.kind === 'DEV' ? `<button class="btn small out" data-act="toFacture" data-id="${d.id}">${T('toInvoice')}</button>` : ''}
      </div></div>`).join('') || `<p class="empty">${T('noDocs')}</p>`;
}
function docs() {
  return `<div class="kpis">
      <div class="kpi"><span>${T('quotes')}</span><b>${db.docs.filter((d) => d.kind === 'DEV').length}</b></div>
      <div class="kpi"><span>${T('invoices')}</span><b>${db.docs.filter((d) => d.kind === 'FAC').length}</b></div>
    </div>
    <button class="btn" data-act="newDoc">＋ ${T('newQuote')}</button>
    <div class="card" style="margin-top:16px"><h3>${T('myDocs')}</h3>
      <input id="docSearch" type="search" placeholder="${T('searchDocs')}" value="${esc(docQuery)}" autocomplete="off">
      <div id="docList">${docsList(filterDocs(docQuery))}</div>
    </div>`;
}
/* ---------------- Historique des ventes ---------------- */
function histSales() {
  const term = String(histQuery || '').trim().toLowerCase();
  return db.sales.filter((s) => inPeriod(s.date, histPeriod))
    .filter((s) => histMethod === 'all' || s.method === histMethod)
    .filter((s) => !term || [s.party, s.product, s.method, s.date, dayFR(s.date), String(s.total), money(s.total)].join(' ').toLowerCase().includes(term))
    .sort((a, b) => (a.date === b.date ? (b.u || 0) - (a.u || 0) : a.date < b.date ? 1 : -1));
}
function histSummary(list) {
  const ca = list.reduce((a, s) => a + (Number(s.total) || 0), 0);
  const cash = list.reduce((a, s) => a + paidOf(s), 0);
  return `<div class="kpi"><span>${T('saleCount')}</span><b>${list.length}</b></div>
      <div class="kpi"><span>${T('revenue')}</span><b>${money(ca)}</b></div>
      <div class="kpi"><span>${T('collected')}</span><b>${money(cash)}</b></div>
      <div class="kpi"><span>${T('remains')}</span><b>${money(Math.max(0, ca - cash))}</b></div>`;
}
function histRows(list) {
  return list.map((s) => `<div class="row"><div><div class="t">${money(s.total)}${s.party ? ' · ' + esc(s.party) : ''}</div><div class="s">${dayFR(s.date)} · ${esc(s.method)}${s.product ? ' · ' + esc(s.product) + ' ×' + s.qty : ''}</div></div><div class="right">
      ${creditOf(s) ? `<span class="tag warn">${T('remains')} ${money(creditOf(s))}</span>` : `<span class="tag ok">${T('paid')}</span>`}<br>
      <button class="btn small whats" data-act="waSale" data-id="${s.id}">${T('receipt')}</button>
      <button class="btn small pdf" data-act="receiptPdf" data-id="${s.id}">${T('pdf')}</button>
    </div></div>`).join('') || `<p class="empty">${T('noSalesFound')}</p>`;
}
function hist() {
  const list = histSales();
  const chip = (p, label) => `<button class="btn ${histPeriod === p ? '' : 'out'}" data-act="histPeriod" data-p="${p}">${label}</button>`;
  const methods = [...new Set(db.sales.map((s) => s.method).filter(Boolean))];
  return `<button class="btn out" data-act="back">← ${T('back')}</button>
    <h2 style="margin-top:12px">${T('history')}</h2>
    <button class="btn out" data-act="exportCsv">${T('exportCsv')}</button>
    <div class="card"><h3>${T('period')}</h3><div class="big">${chip('jour', T('today'))}${chip('mois', T('thisMonth'))}${chip('annee', T('thisYear'))}${chip('tout', T('all'))}</div></div>
    <div class="card">
      <input id="histSearch" type="search" placeholder="${T('searchSales')}" value="${esc(histQuery)}" autocomplete="off">
      <label>${T('method')}</label>
      <select id="histMethod"><option value="all">${T('allMethods')}</option>${methods.map((m) => `<option value="${esc(m)}" ${m === histMethod ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
    </div>
    <div class="kpis" id="histSum">${histSummary(list)}</div>
    <div class="card" id="histList">${histRows(list)}</div>`;
}
function docForm() {
  const rows = draft.lines.map((l, i) => `<div class="line-row">
    <input data-l="label" data-i="${i}" placeholder="${T('line')}" value="${esc(l.label)}">
    <input data-l="qty" data-i="${i}" inputmode="numeric" value="${esc(l.qty)}">
    <input data-l="price" data-i="${i}" inputmode="numeric" value="${esc(l.price)}">
    <button data-act="delLine" data-i="${i}">✕</button></div>`).join('');
  const total = draft.lines.reduce((a, l) => a + (+l.qty || 0) * (+l.price || 0), 0);
  const rate = Math.max(0, Number(draft.vat) || 0);
  const vat = Math.round((total * rate) / 100);
  return `<div class="modal"><div class="sheet">
    <h2>${T('newQuote')}</h2>
    <label>${T('client')}</label><input id="dParty" value="${esc(draft.party)}">
    <label>${T('clientPhone')}</label><input id="dPhone" inputmode="tel" value="${esc(draft.phone || '')}">
    <label>${T('clientAddress')}</label><input id="dAddress" value="${esc(draft.address || '')}">
    <div id="lines">${rows}</div>
    <button class="btn out" data-act="addLine">＋ ${T('addLine')}</button>
    <label>${T('vat')}</label><input id="dVat" inputmode="numeric" value="${esc(rate)}">
    <div class="row" style="margin-top:10px"><div class="t">${T('ht')}</div><div class="t">${money(total)}</div></div>
    ${rate ? `<div class="row"><div class="t">${T('vatShort')} ${rate} %</div><div class="t">${money(vat)}</div></div>` : ''}
    <div class="row"><div class="t">${T('ttc')}</div><div class="t">${money(total + vat)}</div></div>
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
    </div><button class="btn out" data-act="hist">${T('history')}</button></div>
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
function payDebtModal(id) {
  const d = db.debts.find((x) => x.id === id);
  if (!d) return;
  const m = modal(`<h2>${esc(d.supplier)}</h2><p class="hint">${T('remains')} ${money(debtOf(d))}</p>
    <label>${T('payReceived')}</label><input id="pdAmt" inputmode="numeric" value="${debtOf(d)}">
    <button class="btn" id="pdOk">${T('savePayment')}</button><button class="btn out" id="pdNo">${T('cancel')}</button><p class="err" id="pdErr"></p>`);
  m.querySelector('#pdNo').onclick = () => m.remove();
  m.querySelector('#pdOk').onclick = () => {
    const v = Math.round(+m.querySelector('#pdAmt').value || 0);
    if (v <= 0) { m.querySelector('#pdErr').textContent = T('errorAmount'); return; }
    d.paid = Math.min(d.amount, (Number(d.paid) || 0) + v); d.u = Date.now();
    saveDB(); m.remove(); render();
  };
}
function productModal(id) {
  const p = db.products.find((x) => x.id === id);
  if (!p) return;
  const q = qtyOf(p);
  const m = modal(`<h2>${T('editArticle')}</h2>
    <label>${T('name')}</label><input id="epName" value="${esc(p.name)}">
    <label>${T('buyPrice')}</label><input id="epBuy" inputmode="numeric" value="${esc(p.buy)}">
    <label>${T('sellPrice')}</label><input id="epSell" inputmode="numeric" value="${esc(p.sell)}">
    <label>${T('qty')}</label><input id="epQty" inputmode="numeric" value="${esc(q)}">
    <label>${T('alertAt')}</label><input id="epAlert" inputmode="numeric" value="${esc(p.alert)}">
    <button class="btn" id="epOk">${T('saveChanges')}</button><button class="btn out" id="epNo">${T('cancel')}</button><p class="err" id="epErr"></p>`);
  m.querySelector('#epNo').onclick = () => m.remove();
  m.querySelector('#epOk').onclick = () => {
    const name = m.querySelector('#epName').value.trim();
    if (!name) { m.querySelector('#epErr').textContent = T('badBusiness'); return; }
    const newQty = Math.max(0, Math.round(+m.querySelector('#epQty').value || 0));
    p.name = name;
    p.buy = Math.round(+m.querySelector('#epBuy').value || 0);
    p.sell = Math.round(+m.querySelector('#epSell').value || 0);
    p.alert = Math.round(+m.querySelector('#epAlert').value || 0);
    p.u = Date.now();
    if (newQty !== q) db.moves.push({ id: uid(), pid: p.id, delta: newQty - q, u: Date.now() });
    saveDB(); m.remove(); render();
  };
}
function clientModal(id) {
  const p = db.parties.find((x) => x.id === id);
  if (!p) return;
  const m = modal(`<h2>${T('editClient')}</h2>
    <label>${T('name')}</label><input id="ecName" value="${esc(p.name)}">
    <label>${T('phone')}</label><input id="ecPhone" inputmode="tel" value="${esc(p.phone || '')}">
    <label>${T('address')}</label><input id="ecAddress" value="${esc(p.address || '')}">
    <button class="btn" id="ecOk">${T('saveChanges')}</button><button class="btn out" id="ecNo">${T('cancel')}</button><p class="err" id="ecErr"></p>`);
  m.querySelector('#ecNo').onclick = () => m.remove();
  m.querySelector('#ecOk').onclick = () => {
    const name = m.querySelector('#ecName').value.trim();
    if (!name) { m.querySelector('#ecErr').textContent = T('badBusiness'); return; }
    const old = p.name;
    p.name = name; p.phone = m.querySelector('#ecPhone').value.trim(); p.address = m.querySelector('#ecAddress').value.trim(); p.u = Date.now();
    if (name !== old) { db.sales.forEach((s) => { if (s.party === old) s.party = name; }); db.docs.forEach((d) => { if (d.party === old) d.party = name; }); }
    saveDB(); m.remove(); render();
  };
}
function supplierModal(id) {
  const s = db.suppliers.find((x) => x.id === id);
  if (!s) return;
  const m = modal(`<h2>${T('editSupplier')}</h2>
    <label>${T('name')}</label><input id="esName" value="${esc(s.name)}">
    <label>${T('phone')}</label><input id="esPhone" inputmode="tel" value="${esc(s.phone || '')}">
    <label>${T('address')}</label><input id="esAddress" value="${esc(s.address || '')}">
    <button class="btn" id="esOk">${T('saveChanges')}</button><button class="btn out" id="esNo">${T('cancel')}</button><p class="err" id="esErr"></p>`);
  m.querySelector('#esNo').onclick = () => m.remove();
  m.querySelector('#esOk').onclick = () => {
    const name = m.querySelector('#esName').value.trim();
    if (!name) { m.querySelector('#esErr').textContent = T('badBusiness'); return; }
    const old = s.name;
    s.name = name; s.phone = m.querySelector('#esPhone').value.trim(); s.address = m.querySelector('#esAddress').value.trim(); s.u = Date.now();
    if (name !== old) db.debts.forEach((d) => { if (d.supplier === old) d.supplier = name; });
    saveDB(); m.remove(); render();
  };
}
function clientDetail(id) {
  const p = db.parties.find((x) => x.id === id);
  if (!p) return;
  const list = db.sales.filter((s) => (s.party || '—') === p.name).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = list.reduce((a, s) => a + (Number(s.total) || 0), 0);
  const paid = list.reduce((a, s) => a + paidOf(s), 0);
  const rest = list.reduce((a, s) => a + creditOf(s), 0);
  const m = modal(`<h2>${esc(p.name)}</h2>
    <p class="hint">${[p.phone, p.address].filter(Boolean).map(esc).join(' · ') || '—'}</p>
    <div class="kpis">
      <div class="kpi"><span>${T('revenue')}</span><b>${money(total)}</b></div>
      <div class="kpi"><span>${T('collected')}</span><b>${money(paid)}</b></div>
      <div class="kpi"><span>${T('remains')}</span><b>${money(rest)}</b></div>
    </div>
    <div class="card">${list.map((s) => `<div class="row"><div><div class="t">${dayFR(s.date)} · ${money(s.total)}</div><div class="s">${esc(s.method)}${s.product ? ' · ' + esc(s.product) + ' ×' + s.qty : ''}</div></div><div class="right">${creditOf(s) ? `<span class="tag warn">${T('remains')} ${money(creditOf(s))}</span>` : `<span class="tag ok">${T('paid')}</span>`}</div></div>`).join('') || `<p class="empty">${T('nothing')}</p>`}</div>
    <button class="btn out" id="cdNo">${T('close')}</button>`);
  m.querySelector('#cdNo').onclick = () => m.remove();
}
function pendingRows() {
  return db.debts.filter((d) => d.delivered === false).sort((a, b) => (a.date < b.date ? 1 : -1));
}
function pendingText(name) {
  const rows = pendingRows().filter((d) => d.supplier === name);
  const sum = rows.reduce((a, d) => a + debtOf(d), 0);
  return [`${db.shop || T('app')}`, T('pendingPurchases'), ...rows.map((d) => `${dayFR(d.date)} · ${T('total')} ${money(d.amount)} · ${T('remains')} ${money(debtOf(d))}`), `${T('remains')} : ${money(sum)}`, T('thanks')].join('\n');
}
function printPending() {
  const list = pendingRows();
  const names = [...new Set(list.map((d) => d.supplier))];
  const total = list.reduce((a, d) => a + debtOf(d), 0);
  const s = db.settings || {};
  const place = [s.address, s.district, s.city, countryName(s.country || 'CI')].filter(Boolean).join(' · ');
  const supLine = (n) => { const sup = db.suppliers.find((x) => x.name === n) || {}; return [sup.phone, sup.address].filter(Boolean).map(esc).join(' · '); };
  const area = document.getElementById('printArea');
  area.className = 'a4';
  area.innerHTML = `${s.logo ? `<img class="docLogo" src="${esc(s.logo)}" alt="">` : ''}<h2>${esc(db.shop || T('app'))}</h2>
    ${place ? `<div class="small">${esc(place)}</div>` : ''}
    <hr>
    <div class="small">${T('pendingPurchases')} · ${dayFR(todayISO())}</div>
    ${names.map((n) => `<div style="margin-top:6mm"><b>${esc(n)}</b>${supLine(n) ? `<div class="small">${supLine(n)}</div>` : ''}
      <table><thead><tr><th>${T('dueDate')}</th><th>${T('total')}</th><th>${T('paid')}</th><th>${T('remains')}</th></tr></thead><tbody>
      ${list.filter((d) => d.supplier === n).map((d) => `<tr><td>${dayFR(d.date)}</td><td>${money(d.amount)}</td><td>${money(d.paid || 0)}</td><td>${money(debtOf(d))}</td></tr>`).join('')}
      </tbody></table></div>`).join('')}
    <div class="tot"><span>${T('remains')}</span><span>${money(total)}</span></div>
    <p class="small">${T('thanks')}</p>`;
  window.print();
}
function pending() {
  const list = pendingRows();
  const total = list.reduce((a, d) => a + debtOf(d), 0);
  const names = [...new Set(list.map((d) => d.supplier))];
  return `<button class="btn out" data-act="back">← ${T('back')}</button>
    <h2 style="margin-top:12px">${T('pendingPurchases')}</h2>
    <div class="kpis"><div class="kpi"><span>${T('suppliers')}</span><b>${list.length}</b></div><div class="kpi"><span>${T('remains')}</span><b>${money(total)}</b></div></div>
    <button class="btn" data-act="printPending">${T('printList')}</button>
    ${names.map((n) => {
      const rows = list.filter((d) => d.supplier === n);
      const sup = db.suppliers.find((x) => x.name === n) || {};
      const sum = rows.reduce((a, d) => a + debtOf(d), 0);
      return `<div class="card" style="margin-top:14px"><h3>${esc(n)}</h3>
        <div class="hint">${[sup.phone, sup.address].filter(Boolean).map(esc).join(' · ') || '—'}</div>
        ${rows.map((d) => `<div class="row"><div><div class="t">${dayFR(d.date)} · ${money(d.amount)}</div><div class="s">${T('paid')} ${money(d.paid || 0)} · ${T('remains')} ${money(debtOf(d))}</div></div></div>`).join('')}
        <div class="row"><div class="t">${T('remains')}</div><div class="t">${money(sum)}</div></div>
        ${sup.phone ? `<button class="btn small whats" data-act="waPending" data-name="${esc(n)}">${T('sendToSupplier')}</button>` : ''}
      </div>`;
    }).join('') || `<p class="empty">${T('noPending')}</p>`}`;
}
function supplierDetail(id) {
  const s = db.suppliers.find((x) => x.id === id);
  if (!s) return;
  const list = db.debts.filter((d) => d.supplier === s.name).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = list.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const paid = list.reduce((a, d) => a + (Number(d.paid) || 0), 0);
  const rest = list.reduce((a, d) => a + debtOf(d), 0);
  const m = modal(`<h2>${esc(s.name)}</h2>
    <p class="hint">${[s.phone, s.address].filter(Boolean).map(esc).join(' · ') || '—'}</p>
    <div class="kpis">
      <div class="kpi"><span>${T('totalPurchases')}</span><b>${money(total)}</b></div>
      <div class="kpi"><span>${T('paid')}</span><b>${money(paid)}</b></div>
      <div class="kpi"><span>${T('remains')}</span><b>${money(rest)}</b></div>
    </div>
    <div class="card">${list.map((d) => `<div class="row"><div><div class="t">${dayFR(d.date)} · ${money(d.amount)}</div><div class="s">${T('paid')} ${money(d.paid || 0)} · ${T('remains')} ${money(debtOf(d))}</div></div><div class="right">${d.delivered === false ? `<span class="tag warn">${T('notDelivered')}</span>` : `<span class="tag ok">${T('received')}</span>`}</div></div>`).join('') || `<p class="empty">${T('noPurchases')}</p>`}</div>
    <button class="btn out" id="sdNo">${T('close')}</button>`);
  m.querySelector('#sdNo').onclick = () => m.remove();
}
function exportContacts() {
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [[T('type'), T('name'), T('phone'), T('address'), T('due')]];
  db.parties.forEach((p) => rows.push([T('clients'), p.name, p.phone || '', p.address || '', db.sales.filter((s) => (s.party || '—') === p.name).reduce((a, s) => a + creditOf(s), 0)]));
  db.suppliers.forEach((s) => rows.push([T('suppliers'), s.name, s.phone || '', s.address || '', db.debts.filter((d) => d.supplier === s.name).reduce((a, d) => a + debtOf(d), 0)]));
  const csv = '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `contacts-${todayISO()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 6000);
}
function exportCsv() {
  const list = histSales();
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [[T('dueDate'), T('client'), T('article'), T('quantity'), T('total'), T('paid'), T('remains'), T('method')]];
  list.forEach((s) => rows.push([dayFR(s.date), s.party || '', s.product || '', s.product ? s.qty : '', s.total, paidOf(s), creditOf(s), s.method || '']));
  const csv = '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `ventes-${histPeriod}-${todayISO()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 6000);
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
    const sale = { id: sid, date: todayISO(), total, paid: credit ? 0 : total, method: d.querySelector('#sMethod').value, party, pid: pid || '', product, qty: product ? qty : 0, cost, u: now };
    db.sales.push(sale);
    if (pid) db.moves.push({ id: 'mv-' + sid, pid, delta: -qty, u: now });
    if (party && !db.parties.some((x) => x.name.toLowerCase() === party.toLowerCase())) db.parties.push({ id: uid(), name: party, phone: '', u: now });
    saveDB(); d.remove(); render(); saleDone(sale);
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
function receiptText(s) {
  const lines = [`${db.shop || T('app')}`, `${T('dueDate')} : ${dayFR(s.date)}`];
  if (s.product) lines.push(`${s.product} × ${s.qty}`);
  lines.push(`${T('total')} : ${money(s.total)}`);
  if (creditOf(s) > 0) lines.push(`${T('paid')} : ${money(paidOf(s))} · ${T('remains')} : ${money(creditOf(s))}`);
  lines.push(`${T('method')} : ${s.method}`);
  lines.push(T('thanks'));
  return lines.filter(Boolean).join('\n');
}
function waSale(id) {
  const s = db.sales.find((x) => x.id === id);
  if (!s) return;
  const phone = (db.parties.find((p) => p.name === s.party) || {}).phone;
  waOpen(phone, receiptText(s));
}
async function receiptPdf(s) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: [80, 140] });
  const st = db.settings || {};
  let y = 10;
  if (st.logo) {
    const dim = await imgSize(st.logo);
    const w = 20;
    const h = Math.min(16, w * dim.h / dim.w);
    try { pdf.addImage(st.logo, st.logo.indexOf('image/png') === 0 ? 'PNG' : 'JPEG', (80 - w) / 2, y, w, h); y += h + 3; } catch {}
  }
  pdf.setTextColor(20, 83, 45);
  pdf.setFontSize(12);
  pdf.splitTextToSize(db.shop || T('app'), 66).forEach((line) => { pdf.text(line, 40, y, { align: 'center' }); y += 5; });
  pdf.setTextColor(30, 30, 30);
  pdf.setFontSize(9);
  pdf.text(dayFR(s.date), 40, y, { align: 'center' }); y += 5;
  if (s.party) { pdf.text(String(s.party).slice(0, 34), 40, y, { align: 'center' }); y += 5; }
  y += 1; pdf.line(7, y, 73, y); y += 6;
  pdf.setFontSize(10);
  if (s.product) { pdf.text(`${String(s.product).slice(0, 26)} × ${s.qty}`, 7, y); y += 5; }
  pdf.setFontSize(13);
  pdf.text(`${T('total')} : ${money(s.total)}`, 73, y, { align: 'right' }); y += 7;
  pdf.setFontSize(9);
  if (creditOf(s) > 0) {
    pdf.text(`${T('paid')} : ${money(paidOf(s))}`, 7, y); y += 4.5;
    pdf.text(`${T('remains')} : ${money(creditOf(s))}`, 7, y); y += 4.5;
  }
  pdf.text(`${T('method')} : ${s.method || '—'}`, 7, y); y += 6;
  pdf.line(7, y, 73, y); y += 6;
  pdf.setFontSize(8); pdf.setTextColor(90, 90, 90);
  pdf.text(T('thanks'), 40, y, { align: 'center' });
  return pdf.output('blob');
}
async function shareReceiptPDF(id) {
  const s = db.sales.find((x) => x.id === id);
  if (!s) return;
  try {
    const blob = await receiptPdf(s);
    const who = (s.party || '').normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    const file = new File([blob], `Recu-${s.date || todayISO()}${who ? '-' + who : ''}.pdf`, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: T('receipt'), text: `${db.shop || ''} · ${money(s.total)}` });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
    alert(T('pdfSaved'));
    waSale(s.id);
  } catch { alert(T('pdfFail')); }
}
function saleDone(sale) {
  const m = modal(`<h2>${T('saleSaved')}</h2>
    <p class="hint">${money(sale.total)}${sale.product ? ' · ' + esc(sale.product) + ' ×' + sale.qty : ''}${sale.party ? ' · ' + esc(sale.party) : ''}</p>
    <button class="btn whats" id="rdWa">${T('sendReceipt')}</button>
    <button class="btn pdf" id="rdPdf">${T('receiptPdf')}</button>
    <button class="btn out" id="rdNo">${T('close')}</button>`);
  m.querySelector('#rdWa').onclick = () => { m.remove(); waSale(sale.id); };
  m.querySelector('#rdPdf').onclick = () => { m.remove(); shareReceiptPDF(sale.id); };
  m.querySelector('#rdNo').onclick = () => m.remove();
}
function waOpen(phone, text) {
  const clean = (phone || '').replace(/[^\d+]/g, '').replace('+', '');
  window.open(clean ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

/* ---------------- impression ---------------- */
function docHTML(d) {
  const lines = d.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${esc(l.qty)}</td><td>${money(+l.price)}</td><td>${money((+l.qty || 1) * +l.price)}</td></tr>`).join('');
  const s = db.settings || {};
  const place = [s.address, s.district, s.city, countryName(s.country || 'CI')].filter(Boolean).join(' · ');
  const contact = [me && me.phone, me && me.email].filter(Boolean).map((x) => esc(x)).join(' · ');
  return `${s.logo ? `<img class="docLogo" src="${esc(s.logo)}" alt="">` : ''}<h2>${db.shop || 'Assistant Commercial'}</h2>
    ${s.companyForm ? `<div class="small">${esc(s.companyForm)}</div>` : ''}
    ${place ? `<div class="small">${esc(place)}</div>` : ''}
    ${contact ? `<div class="small">${contact}</div>` : ''}
    <hr>
    <div class="small">${d.kind === 'DEV' ? T('quote') : T('invoice')} ${esc(d.number)} · ${dayFR(d.date)}</div>
    <div class="small">${T('client')} : ${esc(d.party || '—')}</div>
    ${d.clientPhone ? `<div class="small">${T('phone')} : ${esc(d.clientPhone)}</div>` : ''}
    ${d.clientAddress ? `<div class="small">${T('address')} : ${esc(d.clientAddress)}</div>` : ''}
    <table><thead><tr><th>${T('line')}</th><th>${T('quantity')}</th><th>${T('sellPrice')}</th><th>${T('total')}</th></tr></thead><tbody>${lines}</tbody></table>
    <div class="tot"><span>${T('ht')}</span><span>${money(d.total)}</span></div>
    ${d.vat ? `<div class="tot"><span>${T('vatShort')} ${d.vat} %</span><span>${money(vatOf(d))}</span></div>` : ''}
    <div class="tot"><span>${T('ttc')}</span><span>${money(amountOf(d))}</span></div>
    <p class="small">${T('thanks')}</p>`;
}
function printFormat(id, format) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  const area = document.getElementById('printArea');
  area.className = format === 'ticket' ? 'ticket' : 'a4';
  area.innerHTML = docHTML(d);
  window.print();
}
function imgSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width || 1, h: img.height || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = src;
  });
}
async function docPdf(d) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const s = db.settings || {};
  const place = [s.address, s.district, s.city, countryName(s.country || 'CI')].filter(Boolean).join(' · ');
  const contact = [me && me.phone, me && me.email].filter(Boolean).join(' · ');
  let y = 15;
  if (s.logo) {
    const dim = await imgSize(s.logo);
    const w = 30;
    const h = Math.min(24, w * dim.h / dim.w);
    try { pdf.addImage(s.logo, s.logo.indexOf('image/png') === 0 ? 'PNG' : 'JPEG', 14, y, w, h); y += h + 4; } catch {}
  }
  pdf.setTextColor(20, 83, 45);
  pdf.setFontSize(17);
  pdf.text(db.shop || 'Assistant Commercial', 14, y);
  y += 6;
  pdf.setTextColor(40, 40, 40);
  pdf.setFontSize(9);
  [s.companyForm, place, contact].filter(Boolean).forEach((line) => { pdf.text(String(line), 14, y); y += 4.5; });
  y += 3;
  pdf.setFontSize(11);
  pdf.setTextColor(20, 20, 20);
  pdf.text(`${d.kind === 'DEV' ? T('quote') : T('invoice')} ${d.number} · ${dayFR(d.date)}`, 14, y);
  y += 6;
  pdf.setFontSize(10);
  pdf.text(`${T('client')} : ${d.party || '—'}`, 14, y);
  y += 5;
  if (d.clientPhone) { pdf.text(`${T('phone')} : ${d.clientPhone}`, 14, y); y += 4.5; }
  if (d.clientAddress) { pdf.text(`${T('address')} : ${d.clientAddress}`, 14, y); y += 4.5; }
  y += 3;
  pdf.setFontSize(9);
  pdf.text(T('line'), 14, y);
  pdf.text(T('quantity'), 118, y);
  pdf.text(T('sellPrice'), 138, y);
  pdf.text(T('total'), 196, y, { align: 'right' });
  y += 3;
  pdf.line(14, y, 196, y);
  y += 5;
  for (const l of d.lines) {
    if (y > 268) { pdf.addPage(); y = 16; }
    pdf.text(String(l.label).slice(0, 62), 14, y);
    pdf.text(String(l.qty), 118, y);
    pdf.text(money(+l.price), 138, y);
    pdf.text(money((+l.qty || 1) * +l.price), 196, y, { align: 'right' });
    y += 5.5;
  }
  y += 1;
  pdf.line(14, y, 196, y);
  y += 7;
  pdf.setFontSize(11);
  pdf.text(`${T('ht')} : ${money(d.total)}`, 196, y, { align: 'right' });
  y += 6;
  if (d.vat) { pdf.text(`${T('vatShort')} ${d.vat} % : ${money(vatOf(d))}`, 196, y, { align: 'right' }); y += 6; }
  pdf.setFontSize(13);
  pdf.text(`${T('ttc')} : ${money(amountOf(d))}`, 196, y, { align: 'right' });
  y += 10;
  pdf.setFontSize(8);
  pdf.setTextColor(90, 90, 90);
  pdf.text(T('thanks'), 14, y);
  return pdf.output('blob');
}
async function docFile(d) {
  const blob = await docPdf(d);
  return new File([blob], d.number + '.pdf', { type: 'application/pdf' });
}
async function shareDocPDF(id) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  try {
    const file = await docFile(d);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: d.number, text: `${db.shop || ''} · ${d.number} · ${money(amountOf(d))}` });
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
    alert(T('pdfSaved'));
    waOpen((db.parties.find((p) => p.name === d.party) || {}).phone, `${d.kind === 'DEV' ? T('quote') : T('invoice')} ${d.number} · ${dayFR(d.date)} · ${money(amountOf(d))} — ${db.shop || ''}`);
  } catch { alert(T('pdfFail')); }
}
async function downloadDocPDF(id) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  try {
    const url = URL.createObjectURL(await docPdf(d));
    const a = document.createElement('a');
    a.href = url; a.download = d.number + '.pdf'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
    alert(T('pdfSaved'));
  } catch { alert(T('pdfFail')); }
}
async function emailDocPDF(id) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  const subject = `${d.kind === 'DEV' ? T('quote') : T('invoice')} ${d.number}`;
  const body = `${db.shop || ''}\n${subject} · ${dayFR(d.date)}\n${T('client')} : ${d.party || '—'}\n${T('ttc')} : ${money(amountOf(d))}`;
  try {
    const file = await docFile(d);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: d.number, text: body });
      return;
    }
  } catch {}
  location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function previewDoc(id) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  const m = modal(`<h2>${T('preview')}</h2>
    <div class="docPreview">${docHTML(d)}</div>
    <button class="btn" id="pvA4">${T('printA4')}</button>
    <button class="btn out" id="pvTk">${T('printTicket')}</button>
    <button class="btn out" id="pvNo">${T('close')}</button>`);
  m.querySelector('#pvA4').onclick = () => { m.remove(); printFormat(id, 'a4'); };
  m.querySelector('#pvTk').onclick = () => { m.remove(); printFormat(id, 'ticket'); };
  m.querySelector('#pvNo').onclick = () => m.remove();
}

/* ---------------- délégation ---------------- */
document.addEventListener('click', async (e) => {
  const nav = e.target.closest('#nav button');
  if (nav) {
    if (nav.dataset.act === 'openSettings') { settingsModal(); return; }
    tab = nav.dataset.tab; draft = null; render(); return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'sale') saleModal();
  if (act === 'hist') { tab = 'hist'; render(); }
  if (act === 'histPeriod') { histPeriod = b.dataset.p; render(); }
  if (act === 'back') { tab = 'vendre'; render(); }
  if (act === 'side') { side = b.dataset.s; render(); }
  if (act === 'period') { period = b.dataset.p; render(); }
  if (act === 'closeAds') { adsClosed = true; render(); }
  if (act === 'expense') {
    const d = modal(`<h2>${T('expense')}</h2><label>${T('amount')}</label><input id="eAmt" inputmode="numeric">
      <label>${T('reason')}</label><select id="eLabel"><option>Transport</option><option>Loyer</option><option>Électricité</option><option>Salaire</option><option>Marchandise</option><option>Autre</option></select>
      <label>${T('method')}</label><select id="eMethod"><option>Espèces</option><option>Orange Money</option><option>Wave</option><option>MTN</option><option>Moov</option><option>Banque</option></select>
      <label>${T('note')}</label><input id="eNote" placeholder="${T('noteHint')}">
      <button class="btn" id="eOk">${T('saveExpense')}</button><button class="btn out" id="eNo">${T('cancel')}</button><p class="err" id="eErr"></p>`);
    d.querySelector('#eNo').onclick = () => d.remove();
    d.querySelector('#eOk').onclick = () => {
      const amount = Math.round(+d.querySelector('#eAmt').value || 0);
      if (!amount) { d.querySelector('#eErr').textContent = T('errorAmount'); return; }
      db.expenses.push({ id: uid(), date: todayISO(), amount, label: d.querySelector('#eLabel').value, note: d.querySelector('#eNote').value.trim(), method: d.querySelector('#eMethod').value, u: Date.now() });
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
    const address = document.getElementById('cAddress').value.trim();
    const found = db.parties.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (found) { found.phone = phone; found.address = address; found.u = Date.now(); } else db.parties.push({ id: uid(), name, phone, address, u: Date.now() });
    saveDB(); render();
  }
  if (act === 'addSupplier') {
    const name = document.getElementById('sName').value.trim();
    if (!name) return;
    const phone = document.getElementById('sPhone').value.trim();
    const address = document.getElementById('sAddress').value.trim();
    const found = db.suppliers.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (found) { found.phone = phone; found.address = address; found.u = Date.now(); } else db.suppliers.push({ id: uid(), name, phone, address, u: Date.now() });
    saveDB(); render();
  }
  if (act === 'waSup') {
    const s = db.suppliers.find((x) => x.name === b.dataset.name) || {};
    waOpen(s.phone, '');
  }
  if (act === 'editProduct') productModal(b.dataset.id);
  if (act === 'editClient') clientModal(b.dataset.id);
  if (act === 'delClient') {
    const p = db.parties.find((x) => x.id === b.dataset.id);
    if (!p || !confirm(T('confirmDeleteClient'))) return;
    db.parties = db.parties.filter((x) => x.id !== p.id);
    saveDB(); render();
  }
  if (act === 'editSupplier') supplierModal(b.dataset.id);
  if (act === 'supDetail') supplierDetail(b.dataset.id);
  if (act === 'clientDetail') clientDetail(b.dataset.id);
  if (act === 'pending') { tab = 'pending'; render(); }
  if (act === 'printPending') printPending();
  if (act === 'waPending') {
    const s = db.suppliers.find((x) => x.name === b.dataset.name) || {};
    waOpen(s.phone, pendingText(b.dataset.name));
  }
  if (act === 'exportContacts') exportContacts();
  if (act === 'delSupplier') {
    const s = db.suppliers.find((x) => x.id === b.dataset.id);
    if (!s || !confirm(T('confirmDeleteSupplier'))) return;
    db.suppliers = db.suppliers.filter((x) => x.id !== s.id);
    saveDB(); render();
  }
  if (act === 'exportCsv') exportCsv();
  if (act === 'delProduct') {
    const p = db.products.find((x) => x.id === b.dataset.id);
    if (!p) return;
    if (!confirm(T('confirmDelete'))) return;
    db.products = db.products.filter((x) => x.id !== p.id);
    db.moves = (db.moves || []).filter((m) => m.pid !== p.id);
    saveDB(); render();
  }
  if (act === 'addPurchase') {
    const supplier = document.getElementById('dSup').value.trim();
    const amount = Math.round(+document.getElementById('dAmt').value || 0);
    const paid = Math.max(0, Math.min(amount, Math.round(+document.getElementById('dPaid').value || 0)));
    const pid = document.getElementById('dPid').value;
    const qty = Math.max(0, Math.round(+document.getElementById('dQty').value || 0));
    const receivedIn = document.getElementById('dRecv').checked;
    if (!supplier || !amount) return;
    if (!db.suppliers.some((s) => s.name.toLowerCase() === supplier.toLowerCase())) db.suppliers.push({ id: uid(), name: supplier, phone: '', address: '', u: Date.now() });
    const id = uid();
    const now = Date.now();
    db.debts.push({ id, date: todayISO(), supplier, amount, paid, delivered: receivedIn, stocked: receivedIn && !!pid, pid: pid || '', qty: pid ? qty : 0, u: now });
    if (receivedIn && pid && qty > 0) db.moves.push({ id: 'mv-' + id, pid, delta: qty, u: now });
    saveDB(); render();
  }
  if (act === 'payDebt') payDebtModal(b.dataset.id);
  if (act === 'deliverDebt') {
    const d = db.debts.find((x) => x.id === b.dataset.id);
    if (d && d.delivered === false) {
      d.delivered = true; d.u = Date.now();
      if (d.pid && Number(d.qty) > 0 && !d.stocked) {
        db.moves.push({ id: 'mv-' + d.id, pid: d.pid, delta: Number(d.qty), u: Date.now() });
        d.stocked = true;
      }
      saveDB(); render();
    }
  }
  if (act === 'pay') payModal(b.dataset.name);
  if (act === 'wa') {
    const name = b.dataset.name;
    waOpen((db.parties.find((p) => p.name === name) || {}).phone, reminderText(name));
  }
  if (act === 'newDoc') { draft = { party: '', phone: '', address: '', vat: db.settings.vat || 0, lines: [{ label: '', qty: 1, price: 0 }] }; render(); }
  if (act === 'addLine') { syncDraft(); draft.lines.push({ label: '', qty: 1, price: 0 }); render(); }
  if (act === 'delLine') { syncDraft(); draft.lines.splice(+b.dataset.i, 1); if (!draft.lines.length) draft.lines.push({ label: '', qty: 1, price: 0 }); render(); }
  if (act === 'closeDoc') { draft = null; render(); }
  if (act === 'saveDoc') {
    syncDraft();
    const lines = draft.lines.filter((l) => String(l.label).trim() && +l.price > 0)
      .map((l) => ({ label: String(l.label).trim(), qty: +l.qty || 1, price: +l.price }));
    if (!lines.length) return;
    const total = Math.round(lines.reduce((a, l) => a + l.qty * l.price, 0));
    const rate = Math.max(0, Number(draft.vat) || 0);
    db.docs.push({ id: uid(), kind: 'DEV', number: num('DEV'), date: todayISO(), party: draft.party.trim(), clientPhone: (draft.phone || '').trim(), clientAddress: (draft.address || '').trim(), vat: rate, lines, total, status: 'devis', u: Date.now() });
    draft = null; saveDB(); tab = 'docs'; render();
  }
  if (act === 'toFacture') {
    const d = db.docs.find((x) => x.id === b.dataset.id);
    if (d && d.kind === 'DEV') { d.kind = 'FAC'; d.number = num('FAC'); d.u = Date.now(); saveDB(); render(); }
  }
  if (act === 'print') previewDoc(b.dataset.id);
  if (act === 'waPdf') shareDocPDF(b.dataset.id);
  if (act === 'waSale') waSale(b.dataset.id);
  if (act === 'receiptPdf') shareReceiptPDF(b.dataset.id);
  if (act === 'duplicate') {
    const src = db.docs.find((x) => x.id === b.dataset.id);
    if (src) {
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid();
      copy.number = num(copy.kind);
      copy.date = todayISO();
      copy.u = Date.now();
      db.docs.push(copy);
      saveDB(); render();
    }
  }
  if (act === 'waDoc') {
    const d = db.docs.find((x) => x.id === b.dataset.id);
    if (d) waOpen((db.parties.find((p) => p.name === d.party) || {}).phone, `${d.kind === 'DEV' ? T('quote') : T('invoice')} ${d.number} · ${dayFR(d.date)} · ${money(d.total)} — ${db.shop || ''}`);
  }
  if (act === 'mailDoc') emailDocPDF(b.dataset.id);
  if (act === 'dlPdf') downloadDocPDF(b.dataset.id);
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
  const ph = document.getElementById('dPhone');
  if (ph) draft.phone = ph.value;
  const ad = document.getElementById('dAddress');
  if (ad) draft.address = ad.value;
  const vt = document.getElementById('dVat');
  if (vt) draft.vat = Math.max(0, +vt.value || 0);
}

/* ---------------- réglages ---------------- */
function readLogo(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 320;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => cb(null);
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function settingsModal() {
  let logoDraft = db.settings.logo || '';
  const d = modal(`<h2>${T('settings')}</h2>
    <label>${T('shopName')}</label><input id="setShop" value="${esc(db.shop)}">
    <label>${T('companyForm')}</label><select id="setForm">${formOptions(db.settings.companyForm || '')}</select>
    <label>${T('country')}</label><select id="setCountry">${countryOptions(db.settings.country || 'CI')}</select>
    <label>${T('city')}</label><input id="setCity" value="${esc(db.settings.city || '')}">
    <label>${T('district')}</label><input id="setDistrict" value="${esc(db.settings.district || '')}">
    <label>${T('address')}</label><input id="setAddress" value="${esc(db.settings.address || '')}">
    <label>${T('vat')}</label><input id="setVat" inputmode="numeric" value="${esc(db.settings.vat == null ? 18 : db.settings.vat)}">
    <p class="hint">${T('vatHint')}</p>
    <p class="hint">${T('currency')} : <b id="setCur">${esc(db.settings.currency || currencyFor(db.settings.country || 'CI'))}</b> — ${T('currencyAuto')}</p>
    <label>${T('logo')}</label>
    <input type="file" id="setLogo" accept="image/*">
    <div id="logoPrev" style="margin-top:8px">${logoDraft ? `<img src="${esc(logoDraft)}" class="logoPrev" alt="">` : ''}</div>
    <button class="btn out" id="logoDel">${T('logoRemove')}</button>
    <p class="hint">${T('logoHint')}</p>
    <label>${T('language')}</label>
    <select id="setLang">${LANGS.map((l) => `<option value="${l.id}" ${l.id === lang() ? 'selected' : ''}>${l.id === 'ar' ? 'العربية' : l.label}</option>`).join('')}</select>
    <label>${T('reminderText')}</label><textarea id="setRem" rows="4">${esc((db.settings.reminder || DEFAULTS)[lang()])}</textarea>
    <label style="display:flex;gap:10px;align-items:center;margin-top:12px"><input type="checkbox" id="setAds" ${db.settings.ads ? 'checked' : ''} style="width:auto"><span>${T('ads')}</span></label>
    ${accountHTML()}
    ${me ? `<h3 style="margin-top:16px">${T('changePassword')}</h3>
      <label>${T('currentPassword')}</label><input id="pwCur" type="password" autocomplete="current-password">
      <label>${T('newPassword')}</label><input id="pwNew" type="password" autocomplete="new-password">
      <label>${T('confirmPassword')}</label><input id="pwNew2" type="password" autocomplete="new-password">
      <button class="btn out" id="pwOk">${T('savePassword')}</button>
      <p class="hint" id="pwMsg"></p>` : ''}
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
  const pwOk = d.querySelector('#pwOk');
  if (pwOk) pwOk.onclick = async () => {
    const msg = d.querySelector('#pwMsg');
    const cur = d.querySelector('#pwCur').value;
    const p1 = d.querySelector('#pwNew').value;
    const p2 = d.querySelector('#pwNew2').value;
    if (p1.length < 8) { msg.textContent = T('badPass'); return; }
    if (p1 !== p2) { msg.textContent = T('passMismatch'); return; }
    const r = await api('/api/password', 'POST', { current: cur, password: p1 });
    if (!r.ok) { msg.textContent = r.data && r.data.error === 'current' ? T('badCurrent') : T('badPass'); return; }
    d.querySelector('#pwCur').value = ''; d.querySelector('#pwNew').value = ''; d.querySelector('#pwNew2').value = '';
    msg.textContent = T('pwDone');
  };
  d.querySelector('#setExport').onclick = exportDB;
  d.querySelector('#setImport').onclick = importDB;
  const setCountry = d.querySelector('#setCountry');
  const setCur = d.querySelector('#setCur');
  setCountry.onchange = () => { setCur.textContent = currencyFor(setCountry.value); };
  const logoPrev = d.querySelector('#logoPrev');
  d.querySelector('#setLogo').onchange = () => {
    const f = d.querySelector('#setLogo').files[0];
    if (!f) return;
    readLogo(f, (url) => { if (url) { logoDraft = url; logoPrev.innerHTML = `<img src="${esc(url)}" class="logoPrev" alt="">`; } });
  };
  d.querySelector('#logoDel').onclick = () => { logoDraft = ''; logoPrev.innerHTML = ''; };
  d.querySelector('#setOk').onclick = () => {
    db.shop = d.querySelector('#setShop').value.trim();
    const l = d.querySelector('#setLang').value;
    db.settings.reminder[db.settings.lang] = d.querySelector('#setRem').value;
    db.settings.lang = l;
    db.settings.ads = d.querySelector('#setAds').checked;
    db.settings.companyForm = d.querySelector('#setForm').value;
    db.settings.country = setCountry.value;
    db.settings.currency = currencyFor(setCountry.value);
    db.settings.city = d.querySelector('#setCity').value.trim();
    db.settings.district = d.querySelector('#setDistrict').value.trim();
    db.settings.address = d.querySelector('#setAddress').value.trim();
    db.settings.vat = Math.max(0, Math.round(+d.querySelector('#setVat').value || 0));
    db.settings.logo = logoDraft;
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
async function login(identifier, password) {
  const r = await api('/api/login', 'POST', { login: identifier, password });
  if (!r.ok) return (r.data && r.data.error) || 'server';
  me = r.data.user;
  await pullNow(true);
  render();
  return null;
}
async function logout() {
  clearTimeout(syncTimer);
  if (me) await pushNow();
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
    <h3 style="margin-top:16px">${T('signIn')}</h3>
    <label>${T('loginId')}</label><input id="acLoginId" type="text" autocomplete="username">
    <label>${T('password')}</label><input id="acLoginPass" type="password" autocomplete="current-password">
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
    const identifier = d.querySelector('#acLoginId').value.trim();
    const pass = d.querySelector('#acLoginPass').value;
    if (!identifier || !pass) { err.textContent = T('badCredentials'); return; }
    const e = await login(identifier, pass);
    if (e) { err.textContent = T('badCredentials'); return; }
    d.remove(); render();
  };
  const forgot = d.querySelector('#acForgot');
  if (forgot) forgot.onclick = () => forgotModal(values().email || d.querySelector('#acLoginId').value.trim());
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
const LANG_KEY = 'assistant-commercial.langChosen';
let gateMode = 'signup';
function askShop() {
  if (db.shop) return;
  const d = modal(`<h2>${T('welcomeTitle')}</h2><p>${T('welcomeAsk')}</p><input id="wShop" placeholder="Chez Awa"><button class="btn" id="wOk">${T('start')}</button>`);
  d.querySelector('#wOk').onclick = () => {
    const v = d.querySelector('#wShop').value.trim();
    if (!v) return;
    db.shop = v; saveDB(); d.remove(); render();
  };
}
function closeGate() { const g = document.getElementById('gate'); if (g) g.remove(); }
function afterGate() { closeGate(); askShop(); render(); }
function showLangGate() {
  closeGate();
  const g = document.createElement('div');
  g.id = 'gate';
  g.className = 'gate';
  g.innerHTML = `<div class="wrap">
    <h1>${T('app')}</h1>
    <p class="hint">${T('chooseLang')}</p>
    <button class="btn lang" data-lang="fr">Français</button>
    <button class="btn out lang" data-lang="en">English</button>
    <button class="btn out lang" data-lang="ar" dir="rtl">العربية</button>
    <p class="hint">${T('chooseLangHint')}</p></div>`;
  document.body.appendChild(g);
  g.querySelectorAll('[data-lang]').forEach((b) => {
    b.onclick = () => {
      db.settings.lang = b.dataset.lang;
      saveDB(false);
      applyLang();
      localStorage.setItem(LANG_KEY, b.dataset.lang);
      render();
      showAuthGate();
    };
  });
}
function showAuthGate() {
  closeGate();
  const g = document.createElement('div');
  g.id = 'gate';
  g.className = 'gate';
  g.innerHTML = `<div class="wrap">
    <h1>${T('app')}</h1>
    <p class="hint">${T('gateHint')}</p>
    <div class="seg"><button id="gSignup"></button><button id="gLogin"></button></div>
    <div class="card" id="gForm"></div>
    <p class="hint">${T('gateRequired')}</p></div>`;
  document.body.appendChild(g);
  const tabs = { signup: g.querySelector('#gSignup'), login: g.querySelector('#gLogin') };
  const form = g.querySelector('#gForm');
  const setMode = (m) => {
    gateMode = m;
    tabs.signup.textContent = T('createAccount');
    tabs.login.textContent = T('signIn');
    tabs.signup.classList.toggle('on', m === 'signup');
    tabs.login.classList.toggle('on', m === 'login');
    drawForm();
  };
  function drawForm() {
    form.innerHTML = gateMode === 'signup'
      ? `<label>${T('email')}</label><input id="gEmail" type="email" autocomplete="email">
         <label>${T('phoneNumber')}</label><input id="gPhone" type="tel" autocomplete="tel">
         <label>${T('password')}</label><input id="gPass" type="password" autocomplete="new-password">
         <label>${T('business')}</label>
         <label>${T('companyForm')}</label><select id="gCompany">${formOptions('')}</select>
         <label>${T('country')}</label><select id="gCountry">${countryOptions(db.settings.country || 'CI')}</select>
         <p class="hint">${T('currency')} : <b id="gCur">${currencyFor(db.settings.country || 'CI')}</b></p>
         <label>${T('city')}</label><input id="gCity" autocomplete="address-level2">
         <label>${T('district')}</label><input id="gDistrict">
         <label>${T('address')}</label><input id="gAddress" autocomplete="street-address">
         <button class="btn" id="gGo">${T('createAccount')}</button><p class="err" id="gErr"></p>`
      : `<label>${T('loginId')}</label><input id="gLoginId" type="text" autocomplete="username" placeholder="awa@exemple.com / +225 07 00 00 00 00">
         <label>${T('password')}</label><input id="gPass" type="password" autocomplete="current-password">
         <button class="btn" id="gGo">${T('signIn')}</button><p class="err" id="gErr"></p>`;
    const go = form.querySelector('#gGo');
    if (gateMode === 'signup') {
      const csel = form.querySelector('#gCountry');
      csel.onchange = () => { form.querySelector('#gCur').textContent = currencyFor(csel.value); };
    }
    go.onclick = async () => {
      const err = form.querySelector('#gErr');
      const pass = form.querySelector('#gPass').value;
      err.textContent = '';
      if (gateMode === 'signup') {
        const email = form.querySelector('#gEmail').value.trim();
        const phone = form.querySelector('#gPhone').value.trim();
        const country = form.querySelector('#gCountry').value;
        const companyForm = form.querySelector('#gCompany').value;
        const city = form.querySelector('#gCity').value.trim();
        const district = form.querySelector('#gDistrict').value.trim();
        const address = form.querySelector('#gAddress').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { err.textContent = T('badEmail'); return; }
        if (phone.replace(/\D/g, '').length < 8) { err.textContent = T('badPhone'); return; }
        if (pass.length < 8) { err.textContent = T('badPass'); return; }
        if (!city || !companyForm) { err.textContent = T('badBusiness'); return; }
        db.settings.country = country;
        db.settings.currency = currencyFor(country);
        db.settings.companyForm = companyForm;
        db.settings.city = city;
        db.settings.district = district;
        db.settings.address = address;
        saveDB(false);
        go.disabled = true;
        const e = await signup(email, phone, pass);
        if (e) { go.disabled = false; err.textContent = e === 'exists' ? T('emailTaken') : e === 'phone_taken' ? T('phoneTaken') : e === 'server' ? T('gateOffline') : T('badCredentials'); return; }
      } else {
        const identifier = form.querySelector('#gLoginId').value.trim();
        if (!identifier || !pass) { err.textContent = T('badCredentials'); return; }
        go.disabled = true;
        const e = await login(identifier, pass);
        if (e) { go.disabled = false; err.textContent = e === 'server' ? T('gateOffline') : T('badCredentials'); return; }
      }
      afterGate();
    };
  }
  tabs.signup.onclick = () => setMode('signup');
  tabs.login.onclick = () => setMode('login');
  setMode(gateMode);
}
document.addEventListener('input', (e) => {
  if (e.target.id === 'docSearch') {
    docQuery = e.target.value;
    const box = document.getElementById('docList');
    if (box) box.innerHTML = docsList(filterDocs(docQuery));
  }
  if (e.target.id === 'histSearch') {
    histQuery = e.target.value;
    const list = histSales();
    const box = document.getElementById('histList');
    if (box) box.innerHTML = histRows(list);
    const sum = document.getElementById('histSum');
    if (sum) sum.innerHTML = histSummary(list);
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'histMethod') { histMethod = e.target.value; render(); }
  if (e.target.id === 'dParty') {
    const p = db.parties.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
    if (p) {
      const ph = document.getElementById('dPhone');
      const ad = document.getElementById('dAddress');
      if (ph && !ph.value && p.phone) ph.value = p.phone;
      if (ad && !ad.value && p.address) ad.value = p.address;
    }
  }
});
window.addEventListener('online', () => { render(); syncTick(); });
window.addEventListener('offline', render);
window.addEventListener('focus', syncTick);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncTick(); });
setInterval(syncTick, 20000);
render();
const resetToken = new URLSearchParams(location.search).get('reset');
(async () => {
  await bootAccount();
  if (resetToken) { resetModal(resetToken); return; }
  if (!localStorage.getItem(LANG_KEY)) { showLangGate(); return; }
  if (!me) { gateMode = db.shop ? 'login' : 'signup'; showAuthGate(); return; }
  askShop();
})();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
