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
  shop: '', products: [], parties: [], suppliers: [], sales: [], expenses: [], withdrawals: [], docs: [], debts: [], moves: [], mailLog: [], log: [], tomb: [],
  seq: { DEV: 0, FAC: 0 },
  settings: { lang: 'fr', ads: false, reminder: { ...DEFAULTS }, invReminder: {}, invRemindDays: 7, autoRemind: false, autoRemindDay: '', autoRemindInfo: null, country: 'CI', currency: 'FCFA', companyForm: '', city: '', district: '', address: '', vat: 18, remindDays: 30 },
  meta: { lastSync: null, updated: 0, rev: 0, mv: 0 },
});
/* Garde-fou de taille : le serveur refuse au-delà de 2 Mo (worker.js). Prévenir
   bien avant, sinon les sauvegardes échouent en silence. */
const MAX_STATE = 1800000;
/* Les champs que le serveur ne montre jamais à un vendeur : prix d'achat,
   coûts, montants de dépenses, de dettes et du journal. Même liste dans
   worker.js (SECRET_FIELDS) : elle sert à vider le cache local du vendeur. */
const SECRET_FIELDS = {
  products: ['buy'],
  sales: ['cost'],
  docs: ['cost'],
  expenses: ['amount'],
  withdrawals: ['amount'],
  debts: ['amount', 'paid', 'pays'],
};
/* Le journal d'activité est borné : il ne doit pas peser dans la limite de 2 Mo. */
const LOG_MAX = 300;
const stateBytes = () => { try { return JSON.stringify(db).length; } catch { return 0; } };
let db = loadDB();
let tab = 'vendre';
let side = 'clients';
let period = 'mois';
let draft = null;
/* Publicité (Google AdSense). Rien ne s'affiche tant que ce bloc est vide : la
   case « Publicité » des Réglages montre alors un aperçu en pointillés pour
   juger de la place. Pour passer aux vraies annonces, coller l'identifiant
   d'éditeur (ca-pub-…) et les deux identifiants d'emplacement créés dans
   AdSense. Sans identifiant, aucune requête ne part vers Google. */
const ADS = { client: '', top: '', bottom: '' };

/* Consentement aux cookies publicitaires. « yes » seulement après un clic sur
   Accepter : sans choix, ou après un refus, aucune annonce n'est chargée. */
const CONSENT_KEY = 'assistant-commercial.cookies';
const SELLER_KEY = 'assistant-commercial.seller';
function consentChoice() {
  try {
    return localStorage.getItem(CONSENT_KEY) || '';
  } catch {
    return '';
  }
}
function setConsent(v) {
  try {
    localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* Navigation privée sans stockage : le refus vaut pour la session. */
  }
  const bar = document.getElementById('cookieBar');
  if (bar) bar.hidden = true;
  if (v === 'yes') render();
}
/* La bande n'apparaît que si des annonces sont réellement configurées : sans
   service tiers, il n'y a rien à demander. */
function showCookieBar() {
  const bar = document.getElementById('cookieBar');
  if (!bar) return;
  const needed = Boolean(ADS.client) && !consentChoice();
  bar.hidden = !needed;
  if (!needed) return;
  bar.querySelector('#cookieText').textContent = T('cookieText');
  bar.querySelector('#cookieYes').textContent = T('cookieYes');
  bar.querySelector('#cookieNo').textContent = T('cookieNo');
  bar.querySelector('#cookieYes').onclick = () => setConsent('yes');
  bar.querySelector('#cookieNo').onclick = () => setConsent('no');
}
function lastSeller() {
  try {
    return localStorage.getItem(SELLER_KEY) || '';
  } catch {
    return '';
  }
}
/* Les numéros Wave et Orange Money du commerçant, repris dans les relances et
   la demande de paiement. Renvoie '' si aucun n'est renseigné. */
function payNumbersLine() {
  const s = db.settings || {};
  const parts = [];
  if (s.wave) parts.push(`Wave : ${s.wave}`);
  if (s.om) parts.push(`Orange Money : ${s.om}`);
  return parts.join(' · ');
}
let docQuery = '';
let histQuery = '';
let histMethod = 'all';
let histPeriod = 'mois';
/* L'historique s'affiche par paliers : les totaux, les filtres et l'export
   continuent de porter sur la liste complète (histSales), pas sur les lignes visibles. */
const HIST_PAGE = 50;
let histShown = HIST_PAGE;
/* Version du cache, lue dans version.json (fichier généré par scripts/cache.js). */
let appVersion = '';

function loadDB() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw);
    const base = fresh();
    const out = Object.assign(base, parsed, { settings: Object.assign(base.settings, parsed.settings || {}) });
    migrate(out);
    try { out.meta.tooBig = JSON.stringify(out).length > MAX_STATE; } catch {}
    return out;
  } catch { return fresh(); }
}
/* Le stock est fabriqué à partir d'entrées de mouvement, pour que deux téléphones puissent vendre sans se perdre. */
function migrate(d) {
  d.meta = d.meta || {};
  d.moves = Array.isArray(d.moves) ? d.moves : [];
  d.log = Array.isArray(d.log) ? d.log.filter(Boolean).slice(-LOG_MAX) : [];
  /* Pierres tombales : un enregistrement supprimé sur un téléphone ne doit pas
     revenir lors de la fusion avec un autre téléphone. Conservées 90 jours. */
  d.tomb = Array.isArray(d.tomb) ? d.tomb.filter((t) => t && t.id && Date.now() - (t.u || 0) < 90 * 86400000) : [];
  if (!d.meta.mv) {
    for (const p of d.products || []) if (!d.moves.some((m) => m.pid === p.id)) d.moves.push({ id: 'mv-' + p.id, pid: p.id, delta: Number(p.qty) || 0, u: 1 });
    d.meta.mv = 1;
  }
}
/* Supprime définitivement un enregistrement, localement et après fusion. */
function delRecord(kind, id) {
  db[kind] = (db[kind] || []).filter((x) => x.id !== id);
  db.tomb = Array.isArray(db.tomb) ? db.tomb : [];
  if (!db.tomb.some((t) => t.id === id)) db.tomb.push({ id, k: kind, u: Date.now() });
}
/* Des modifications locales ne sont pas encore confirmées par le serveur.
   Sans ce drapeau, un envoi raté laissait l'application en erreur définitive :
   la synchronisation périodique ne faisait plus que tirer l'état distant. */
let dirty = false;
function saveDB(toucher = true) {
  /* Un vendeur ne doit rien garder de sensible sur son téléphone, même si son
     cache date d'avant le masquage serveur. */
  purgeSecrets();
  if (toucher) { db.meta.updated = Date.now(); dirty = true; }
  try {
    const text = JSON.stringify(db);
    db.meta.tooBig = text.length > MAX_STATE;
    localStorage.setItem(KEY, text);
  } catch {}
  if (toucher) queueSync();
}
const T = (k) => (I18N[db.settings.lang] || I18N.fr)[k] || I18N.fr[k] || k;
const uid = () => Math.random().toString(36).slice(2, 10);
/* Date du calendrier local : en UTC, une vente saisie après minuit (fuseau à l'est
   de Greenwich) serait classée la veille. */
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
/* Même conversion que todayISO, mais pour un horodatage : la date d'un
   versement doit suivre le calendrier local, sinon un paiement du soir tombe
   la veille en UTC. */
const isoOf = (ts) => {
  const d = new Date(Number(ts) || 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
/* Le séparateur de milliers reste insécable : avec une espace normale, l'affichage
   en arabe (RTL) coupe « 5 » et « 000 » en deux blocs et inverse leur ordre. */
const fr = (n) => Math.round(n || 0).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, '\u00a0');
const money = (n) => fr(n) + ' ' + ((db.settings && db.settings.currency) || 'FCFA');
const sizeWarning = () => (db.meta && db.meta.tooBig
  ? `<div class="card warnCard"><b>${T('tooBigTitle')}</b><p class="hint">${T('tooBigHint')}</p><p class="hint">${Math.round(stateBytes() / 1000)} Ko / 2 000 Ko</p></div>`
  : '');
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
/* Un coût à 0 n'est pas une information : on le traite comme un coût inconnu
   pour que le bénéfice affiché ne soit pas pris pour exact. */
const costKnownOf = (cost) => Number(cost) > 0;
const debtOf = (d) => Math.max(0, d.amount - d.paid);
const payMode = (d) => ((Number(d.paid) || 0) <= 0 ? T('onCredit') : debtOf(d) <= 0 ? T('cashPaid') : T('partial'));
const totalDebt = () => db.debts.reduce((a, d) => a + debtOf(d), 0);
const qtyOf = (p) => (db.moves || []).filter((m) => m.pid === p.id).reduce((a, m) => a + (Number(m.delta) || 0), 0);
const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date((iso || todayISO()) + 'T00:00:00').getTime()) / 86400000));
const remindDays = () => Math.max(1, Math.round(Number(db.settings.remindDays) || 30));
function lateByParty() {
  const m = new Map();
  db.sales.filter((s) => creditOf(s) > 0 && daysSince(s.date) >= remindDays()).forEach((s) => {
    const k = s.party || '—';
    const cur = m.get(k) || { name: k, sum: 0, days: 0, since: s.date };
    cur.sum += creditOf(s);
    cur.days = Math.max(cur.days, daysSince(s.date));
    if (s.date < cur.since) cur.since = s.date;
    m.set(k, cur);
  });
  return [...m.values()].sort((a, b) => b.days - a.days);
}
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
/* Factures émises mais pas encore réglées, hors celles déjà transformées en
   vente : sinon le même argent serait réclamé deux fois au client. */
const unpaidInvoices = (list) => (list || db.docs || [])
  .filter((d) => d.kind === 'FAC' && !d.paidDate && !d.saleId);
const invoiceDue = (list) => unpaidInvoices(list).reduce((a, d) => a + amountOf(d), 0);

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
  /* Logo de la boutique s'il a été chargé dans Réglages ; sinon le logo de
     l'application. L'en-tête a toujours une image, jamais un cadre vide. */
  const brand = document.getElementById('shopLogo');
  if (brand) {
    const logo = db.settings && db.settings.logo;
    /* logo-header.png est un recadrage sur le dessin du logo, préchargé par le
       service worker : lisible à 48 px et disponible hors ligne. */
    brand.innerHTML = logo ? `<img src="${esc(logo)}" alt="">` : '<img src="icons/logo-header.png" alt="">';
  }
  updatePill();
  document.querySelectorAll('#nav button').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === tab);
    const k = b.querySelector('[data-k]');
    if (k) k.textContent = T(k.dataset.k);
  });
  const view = { vendre, stock, clients, docs, bilans, hist, pending }[tab]();
  const ads = adsHTML();
  /* La bande fixe du bas recouvre le contenu : on réserve sa hauteur, et
     seulement sur l'écran qui la porte. */
  document.body.classList.toggle('adsOn', Boolean(tab === 'vendre' && ads.bottom));
  document.getElementById('app').innerHTML = sizeWarning() + (tab === 'vendre' ? ads.top : '') + view + (tab === 'vendre' ? ads.bottom : '');
  if (draft) document.getElementById('app').insertAdjacentHTML('beforeend', docForm());
  linkLabels(document.getElementById('app'));
  fillAds();
  showCookieBar();
}

/* ---------------- publicité (désactivée par défaut) ---------------- */
/* Sans identifiant d'éditeur il n'y a rien à montrer : ni cadre, ni fausse
   annonce, ni espace réservé. Les deux emplacements n'existent que lorsque de
   vraies annonces sont configurées ET activées dans les réglages. */
function adsHTML() {
  if (!ADS.client || !db.settings.ads || !navigator.onLine) return { top: '', bottom: '' };
  /* Pas d'annonce sans consentement explicite. */
  if (consentChoice() !== 'yes') return { top: '', bottom: '' };
  const unit = (slot) =>
    `<ins class="adsbygoogle" style="display:block;min-height:90px" data-ad-client="${esc(ADS.client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  return {
    top: `<div class="adsTop">${unit(ADS.top)}</div>`,
    bottom: `<div class="adsBottom">${unit(ADS.bottom)}</div>`,
  };
}

/* Le script AdSense ne se charge qu'une fois, et seulement si des annonces sont
   réellement configurées : pas de requête vers Google pour rien. */
function loadAdSense() {
  if (document.querySelector('script[src*="adsbygoogle.js"]')) return;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADS.client)}`;
  document.head.appendChild(s);
}

/* Un seul push remplit tous les emplacements affichés : pousser une fois par
   emplacement fait lever à AdSense « all ins already have ads ». On ne pousse
   donc que s'il reste un emplacement neuf (un rendu recrée les nœuds). */
function fillAds() {
  if (!ADS.client || !db.settings.ads) return;
  const empty = [...document.querySelectorAll('#app ins.adsbygoogle')].some(
    (el) => !el.dataset.adStatus && !el.dataset.adsbygoogleStatus,
  );
  if (!empty) return;
  loadAdSense();
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    /* Un bloqueur de publicité fait échouer ce push : la page doit vivre. */
  }
}

/* ---------------- Vendre ---------------- */
function vendre() {
  const t = db.sales.filter((s) => s.date === todayISO());
  const ca = t.reduce((a, s) => a + s.total, 0);
  const list = [
    ...t.map((s) => `<div class="row"><div><div class="t">${T('sale')} ${money(s.total)}</div><div class="s">${esc(methodLabel(s.method))}${s.party ? ' · ' + esc(s.party) : ''}${s.by ? ' · ' + esc(s.by) : ''}${s.product ? ' · ' + esc(s.product) + ' ×' + s.qty : ''}</div></div><div class="right">${s.delivered === false ? `<span class="tag warn">${T('saleNotDelivered')}</span> ` : ''}${creditOf(s) ? `<span class="tag warn">${T('remains')} ${money(creditOf(s))}</span>` : `<span class="tag ok">${T('paid')}</span>`}<br><button class="btn small whats" data-act="waSale" data-id="${s.id}">${T('receipt')}</button><button class="btn small out" data-act="editSale" data-id="${s.id}">${T('edit')}</button></div></div>`),
    ...(isStaff() ? [] : db.expenses.filter((e) => e.date === todayISO())).map((e) => `<div class="row"><div><div class="t">${T('expense')} ${money(e.amount)}</div><div class="s">${esc(e.label)}${e.note ? ' · ' + esc(e.note) : ''} · ${esc(methodLabel(e.method))}</div></div><div class="right">${e.delivered === false ? `<span class="tag warn">${T('saleNotDelivered')}</span><button class="btn small out" data-act="deliverExpense" data-id="${e.id}">${T('markSaleDelivered')}</button>` : ''}<button class="btn small out" data-act="editExpense" data-id="${e.id}">${T('edit')}</button></div></div>`),
    ...(isStaff() ? [] : db.withdrawals.filter((w) => w.date === todayISO())).map((w) => `<div class="row"><div><div class="t">${T('withdraw')} ${money(w.amount)}</div><div class="s">${T('withdraw')}</div></div></div>`),
  ].join('');
  const forgotten = forgottenInvoices();
  return `<div class="kpis">
      <div class="kpi"><span>${T('salesToday')}</span><b>${money(ca)}</b></div>
      <div class="kpi"><span>${T('cashOut')}</span><b>${money(totalDue() + invoiceDue())}</b></div>
    </div>
    ${forgotten.length ? `<div class="card" style="border-color:#f3d08a;background:#fffaeb">
      <h3>${T('forgottenTitle')}</h3>
      <p class="hint" style="margin:0 0 8px">${T('forgottenHint')}</p>
      ${forgotten.slice(0, 5).map((d) => `<div class="row"><div class="t">${esc(d.number)} · ${esc(d.party || '—')}</div><div class="t">${money(amountOf(d))}</div></div>`).join('')}
      ${forgotten.length > 5 ? `<p class="hint">+ ${forgotten.length - 5}</p>` : ''}
      <button class="btn" data-act="bulkRemind">${T('bulkRemind')} (${forgotten.length})</button>
    </div>` : ''}
    ${autoMailNote()}
    <div class="big">
      <button class="btn" data-act="sale">＋ ${T('sell')}</button>
      ${isStaff() ? '' : `<button class="btn out" data-act="expense">− ${T('expense')}</button>`}
    </div>
    ${isStaff() ? '' : `<button class="btn out" data-act="withdraw">${T('withdraw')}</button>`}
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
      ${p.map((x) => { const q = qtyOf(x); return `<div class="row"><div><div class="t">${esc(x.name)} ${!isStaff() && !costKnownOf(x.buy) ? `<span class="tag warn">${T('buyZero')}</span>` : ''}</div><div class="s">${isStaff() ? `${T('sellPrice')} ${money(x.sell)}` : `${T('buyPrice')} ${money(x.buy)} · ${T('sellPrice')} ${money(x.sell)} · ${T('margin')} ${money(x.sell - x.buy)}`}</div></div>    <div class="right">${q <= 0 ? `<span class="tag bad">${T('outOfStock')}</span>` : q <= x.alert ? `<span class="tag warn">${T('left')} ${q}</span>` : `<span class="tag">${q}</span>`}<br><button class="btn small out" data-act="editProduct" data-id="${x.id}">${T('edit')}</button>      ${canDeleteItems() ? `<button class="btn small out" data-act="delProduct" data-id="${x.id}">${T('delete')}</button>` : ''}</div></div>`; }).join('') || `<p class="empty">${T('noArticles')}</p>`}
    </div>
    <div class="card"><h3>${T('addArticle')}</h3>
      <label>${T('name')}</label><input id="pName" placeholder="Savon">
      ${isStaff() ? '' : `<label>${T('buyPrice')}</label><input id="pBuy" inputmode="numeric" placeholder="0">`}
      <label>${T('sellPrice')}</label><input id="pSell" inputmode="numeric" placeholder="0">
      <label>${T('qty')}</label><input id="pQty" inputmode="numeric" value="0">
      <label>${T('alertAt')}</label><input id="pAlert" inputmode="numeric" value="3">
      <button class="btn" data-act="addProduct">${T('saveArticle')}</button>
    </div>`;
}

/* ---------------- Clients / Fournisseurs ---------------- */
function supplierSummary() {
  const names = [...new Set([...db.suppliers.map((s) => s.name), ...db.debts.map((d) => d.supplier)].filter(Boolean))];
  return names.map((name) => {
    const s = db.suppliers.find((x) => x.name === name) || { name, phone: '', address: '' };
    const list = db.debts.filter((d) => d.supplier === name);
    const total = list.reduce((a, d) => a + (Number(d.amount) || 0), 0);
    const paid = list.reduce((a, d) => a + (Number(d.paid) || 0), 0);
    const rest = list.reduce((a, d) => a + debtOf(d), 0);
    const pend = list.filter((d) => d.delivered === false);
    const last = list.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return { s, list, total, paid, rest, pend, last };
  });
}
function clients() {
  const due = db.sales.filter((s) => creditOf(s) > 0);
  const names = [...new Set(due.map((s) => s.party || '—'))];
  const sums = supplierSummary();
  const owedTo = sums.filter((x) => x.rest > 0).sort((a, b) => b.rest - a.rest);
  const toReceive = sums.filter((x) => x.pend.length).sort((a, b) => (a.last && b.last ? (a.last.date < b.last.date ? -1 : 1) : 0));
  const uptodate = sums.filter((x) => x.list.length && !x.rest && !x.pend.length);
  const supTotal = sums.reduce((a, x) => a + x.total, 0);
  const supRest = sums.reduce((a, x) => a + x.rest, 0);
  const exps = pendingExpenses();
  return `<div class="kpis">
      <div class="kpi"><span>${T('cashOut')}</span><b>${money(totalDue() + invoiceDue())}</b></div>
      ${isStaff() ? '' : `<div class="kpi"><span>${T('debts')}</span><b>${money(totalDebt())}</b></div>`}
    </div>
    <div class="seg">
      <button class="${side === 'clients' ? 'on' : ''}" data-act="side" data-s="clients">${T('clients')}</button>
      <button class="${side === 'suppliers' ? 'on' : ''}" data-act="side" data-s="suppliers">${T('suppliers')}</button>
    </div>
    ${isStaff() ? '' : `<button class="btn out" data-act="exportContacts">${T('exportContacts')}</button>`}
    ${side === 'clients' ? `
      ${unpaidInvoices().length ? `<div class="card"><h3>${T('unpaidInvoices')}</h3>
        ${remindQueue().length ? `<button class="btn out" data-act="bulkRemind">${T('bulkRemind')} (${remindQueue().length})</button>` : ''}
        ${unpaidInvoices().map((d) => `<div class="row"><div><div class="t">${esc(d.number)} · ${money(amountOf(d))}</div><div class="s">${esc(d.party || '—')} · ${dayFR(d.date)} · ${d.remindedAt && daysSince(d.remindedAt) < 7 ? `<span class="tag warn">${remindLabel(d)}</span>` : remindLabel(d)}</div></div><div class="right">
          <button class="btn small" data-act="toggleInvoicePaid" data-id="${d.id}">${T('paidIt')}</button>
          <button class="btn small whats" data-act="waDocRemind" data-id="${d.id}">${T('remind')}</button></div></div>`).join('')}
      </div>` : ''}
      <div class="card"><h3>${T('owed')}</h3>
        ${names.map((n) => {
          const list = due.filter((s) => (s.party || '—') === n);
          const sum = list.reduce((a, s) => a + creditOf(s), 0);
          return `<div class="row"><div><div class="t">${esc(n)}</div><div class="s">${money(sum)} · ${list.length}</div></div><div class="right">
            <button class="btn small" data-act="pay" data-name="${esc(n)}">${T('paidIt')}</button>
            <button class="btn small whats" data-act="wa" data-name="${esc(n)}">${T('whatsapp')}</button></div></div>`;
        }).join('') || `<p class="empty">${T('noClients')}</p>`}
      </div>
      <div class="card"><h3>${T('lateClients')}</h3>
        <p class="hint">${T('overDays')} ${remindDays()} ${T('days')}</p>
        ${lateByParty().map((x) => `<div class="row"><div><div class="t">${esc(x.name)}</div><div class="s">${money(x.sum)} · ${T('since')} ${dayFR(x.since)}</div></div><div class="right"><span class="tag bad">${x.days} ${T('days')}</span><br><button class="btn small whats" data-act="wa" data-name="${esc(x.name)}">${T('remind')}</button></div></div>`).join('') || `<p class="empty">${T('noLate')}</p>`}
      </div>
      <div class="card"><h3>${T('clientList')}</h3>
        ${db.parties.map((p) => `<div class="row"><div><div class="t">${esc(p.name)}</div><div class="s">${[p.phone, p.address].filter(Boolean).map(esc).join(' · ') || '—'}</div></div><div class="right">
          <button class="btn small" data-act="clientDetail" data-id="${p.id}">${T('detail')}</button>
          <button class="btn small out" data-act="editClient" data-id="${p.id}">${T('edit')}</button>
          <button class="btn small out" data-act="delClient" data-id="${p.id}">${T('delete')}</button></div></div>`).join('') || `<p class="empty">${T('noClientsList')}</p>`}
      </div>
` : `
      <div class="kpis">
        ${isStaff() ? '' : `<div class="kpi"><span>${T('totalPurchases')}</span><b>${money(supTotal)}</b></div>
        <div class="kpi"><span>${T('debts')}</span><b>${money(supRest)}</b></div>`}
        <div class="kpi"><span>${T('notDelivered')}</span><b>${pendingRows().length + exps.length}</b></div>
      </div>
      ${isStaff() ? `<p class="hint">${T('amountsHidden')}</p>` : ''}
      <div class="card"><h3>${T('debts')}</h3>
        ${owedTo.map((x) => `<div class="row"><div><div class="t">${esc(x.s.name)}</div><div class="s">${isStaff() ? (x.pend.length ? `${x.pend.length} ${T('notDelivered').toLowerCase()}` : T('amountsHidden')) : `${T('totalPurchases')} ${money(x.total)} · ${T('paid')} ${money(x.paid)}${x.pend.length ? ` · ${x.pend.length} ${T('notDelivered').toLowerCase()}` : ''}`}</div></div><div class="right">
          ${isStaff() ? '' : `<span class="tag bad">${T('remains')} ${money(x.rest)}</span><br>`}
          ${x.s.id && !isStaff() ? `<button class="btn small" data-act="supDetail" data-id="${x.s.id}">${T('paySupplier')}</button>` : ''}
          ${x.s.phone ? `<button class="btn small whats" data-act="waSup" data-name="${esc(x.s.name)}">${T('whatsapp')}</button>` : ''}
        </div></div>`).join('') || `<p class="empty">${T('noSupDebt')}</p>`}
      </div>
      <div class="card"><h3>${T('goodsToReceive')}</h3>
        ${toReceive.map((x) => `<div class="row"><div><div class="t">${esc(x.s.name)}</div><div class="s">${x.pend.map((d) => `${dayFR(d.date)}${isStaff() ? '' : ` · ${money(d.amount)}`}`).join('<br>')}</div></div><div class="right">
          ${x.pend.map((d) => `<button class="btn small out" data-act="deliverDebt" data-id="${d.id}">${T('markDelivered')}</button>`).join(' ')}
          ${x.s.phone && !isStaff() ? `<br><button class="btn small whats" data-act="waPending" data-name="${esc(x.s.name)}">${T('remind')}</button>` : ''}
        </div></div>`).join('')}
        ${exps.map((e) => `<div class="row"><div><div class="t">${esc(e.label)}</div><div class="s">${dayFR(e.date)}${isStaff() ? '' : ` · ${money(e.amount)}`}${e.note ? ' · ' + esc(e.note) : ''}</div></div><div class="right">${daysSince(e.date) >= 7 ? `<span class="tag bad">${daysSince(e.date)} ${T('days')}</span> ` : ''}<button class="btn small out" data-act="deliverExpense" data-id="${e.id}">${T('markSaleDelivered')}</button></div></div>`).join('')}
        ${toReceive.length || exps.length ? '' : `<p class="empty">${T('noGoodsToReceive')}</p>`}
        ${isStaff() ? '' : `<button class="btn out" data-act="printPending">${T('printList')}</button>`}
      </div>
      <div class="card"><h3>${T('suppliersUpToDate')}</h3>
        ${uptodate.map((x) => `<div class="row"><div><div class="t">${esc(x.s.name)}</div><div class="s">${x.last ? `${dayFR(x.last.date)}${isStaff() ? '' : ` · ${money(x.total)}`}` : ''}</div></div><div class="right"><span class="tag ok">${T('paid')}</span> ${x.s.id ? `<button class="btn small" data-act="supDetail" data-id="${x.s.id}">${T('detail')}</button>` : ''}</div></div>`).join('') || `<p class="empty">${T('noUpToDate')}</p>`}
      </div>
      <div class="card"><h3>${T('supplierList')}</h3>
        ${db.suppliers.map((s) => `<div class="row"><div><div class="t">${esc(s.name)}</div><div class="s">${[s.phone, s.address].filter(Boolean).map(esc).join(' · ') || '—'}</div></div><div class="right">
          ${s.phone ? `<button class="btn small whats" data-act="waSup" data-name="${esc(s.name)}">${T('whatsapp')}</button>` : ''}
          <button class="btn small" data-act="supDetail" data-id="${s.id}">${T('detail')}</button>
          <button class="btn small out" data-act="editSupplier" data-id="${s.id}">${T('edit')}</button>
          <button class="btn small out" data-act="delSupplier" data-id="${s.id}">${T('delete')}</button>
        </div></div>`).join('') || `<p class="empty">${T('noSuppliers')}</p>`}
        ${isStaff() ? '' : `<button class="btn out" data-act="exportContacts">${T('exportContacts')}</button>`}
      </div>
`}`;
}

/* ---------------- Documents ---------------- */
function filterDocs(q) {
  const term = String(q || '').trim().toLowerCase();
  const list = [...db.docs].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!term) return list;
  return list.filter((d) => [d.number, d.party, d.clientPhone, d.clientAddress, d.date, dayFR(d.date), d.kind === 'DEV' ? T('quote') : T('invoice'), String(d.total), money(d.total), money(amountOf(d))].join(' ').toLowerCase().includes(term));
}
function docsList(list) {
  return list.map((d) => `<div class="row"><div><div class="t">${esc(d.number)} ${d.kind === 'FAC' ? (d.paidDate ? `<span class="tag ok">${T('invoicePaid')}</span>` : `<span class="tag warn">${T('invoiceUnpaid')}</span>`) : ''}</div>        <div class="s">${d.kind === 'DEV' ? T('quote') : T('invoice')} · ${dayFR(d.date)} · ${esc(d.party || '—')} · ${money(amountOf(d))}${d.paidDate ? ' · ' + T('invoicePaidOn') + ' ' + dayFR(d.paidDate) : ''}${d.saleId ? ' · ' + T('invoiceLinked') : ''}${d.kind === 'FAC' && !d.paidDate ? ' · ' + remindLabel(d) : ''}</div></div><div class="right">
        ${d.kind === 'FAC' ? `<button class="btn small out" data-act="toggleInvoicePaid" data-id="${d.id}">${d.paidDate ? T('markUnpaid') : T('markPaid')}</button>` : ''}
        ${d.kind === 'FAC' && !d.paidDate ? `<button class="btn small whats" data-act="waDocRemind" data-id="${d.id}">${T('remind')}</button>` : ''}
        ${d.kind === 'FAC' && !d.saleId ? `<button class="btn small" data-act="factureToSale" data-id="${d.id}">${T('createSale')}</button>` : ''}
        <button class="btn small" data-act="print" data-id="${d.id}">${T('print')}</button>
        <button class="btn small whats" data-act="waPdf" data-id="${d.id}">${T('sendWhatsApp')}</button>
        <button class="btn small out" data-act="dlPdf" data-id="${d.id}">${T('download')}</button>
        ${d.kind === 'DEV' ? `<button class="btn small out" data-act="toFacture" data-id="${d.id}">${T('toInvoice')}</button>` : ''}
        <button class="btn small out" data-act="editDoc" data-id="${d.id}">${T('edit')}</button>
        <button class="btn small out" data-act="delDoc" data-id="${d.id}">${T('delete')}</button>
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
      <p class="hint">${T('pdfDesktopHint')}</p>
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
  return list.map((s) => `<div class="row"><div><div class="t">${money(s.total)}${s.party ? ' · ' + esc(s.party) : ''}</div><div class="s">${dayFR(s.date)} · ${esc(methodLabel(s.method))}${s.product ? ' · ' + esc(s.product) + ' ×' + s.qty : ''}</div></div><div class="right">
      ${s.delivered === false ? `<span class="tag warn">${T('saleNotDelivered')}</span> ` : ''}${creditOf(s) ? `<span class="tag warn">${T('remains')} ${money(creditOf(s))}</span>` : `<span class="tag ok">${T('paid')}</span>`}<br>
      ${s.delivered === false ? `<button class="btn small out" data-act="deliverSale" data-id="${s.id}">${T('markSaleDelivered')}</button>` : ''}
      <button class="btn small whats" data-act="waSale" data-id="${s.id}">${T('receipt')}</button>
      <button class="btn small pdf" data-act="receiptPdf" data-id="${s.id}">${T('pdf')}</button>
      <button class="btn small out" data-act="editSale" data-id="${s.id}">${T('edit')}</button>
    </div></div>`).join('') || `<p class="empty">${T('noSalesFound')}</p>`;
}
function histListHTML(list, shown) {
  const n = Math.min(shown, list.length);
  const more = n < list.length ? `<button class="btn out" data-act="histMore">${T('showMore')} · ${n} / ${list.length}</button>` : '';
  return histRows(list.slice(0, n)) + `<div id="histMoreWrap">${more}</div>`;
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
      <select id="histMethod"><option value="all">${T('allMethods')}</option>${methods.map((m) => `<option value="${esc(m)}" ${m === histMethod ? 'selected' : ''}>${esc(methodLabel(m))}</option>`).join('')}</select>
    </div>
    <div class="kpis" id="histSum">${histSummary(list)}</div>
    <div class="card" id="histList">${histListHTML(list, histShown)}</div>`;
}
function docForm() {
  const editing = !!draft.id;
  const rows = draft.lines.map((l, i) => `<div class="line-row">
    <input data-l="label" data-i="${i}" placeholder="${T('line')}" value="${esc(l.label)}">
    <input data-l="qty" data-i="${i}" inputmode="numeric" value="${esc(l.qty)}">
    <input data-l="price" data-i="${i}" inputmode="numeric" value="${esc(l.price)}">
    <button data-act="delLine" data-i="${i}">✕</button></div>`).join('');
  const total = draft.lines.reduce((a, l) => a + (+l.qty || 0) * (+l.price || 0), 0);
  const rate = Math.max(0, Number(draft.vat) || 0);
  const vat = Math.round((total * rate) / 100);
  return `<div class="modal"><div class="sheet">
    <h2>${editing ? T('editDoc') : T('newQuote')}</h2>
    <label>${T('client')}</label><input id="dParty" value="${esc(draft.party)}">
    <label>${T('clientPhone')}</label><input id="dPhone" inputmode="tel" value="${esc(draft.phone || '')}">
    <label>${T('clientEmail')}</label><input id="dEmail" type="email" value="${esc(draft.email || '')}">
    <label>${T('clientAddress')}</label><input id="dAddress" value="${esc(draft.address || '')}">
    <div id="lines">${rows}</div>
    <button class="btn out" data-act="addLine">＋ ${T('addLine')}</button>
    <label>${T('vat')}</label><input id="dVat" inputmode="numeric" value="${esc(rate)}">
    <label>${T('docCost')}</label><input id="dCost" inputmode="numeric" value="${esc(Number(draft.cost) || 0)}">
    <p class="hint">${T('docCostHint')}</p>
    <div class="row" style="margin-top:10px"><div class="t">${T('ht')}</div><div class="t">${money(total)}</div></div>
    ${rate ? `<div class="row"><div class="t">${T('vatShort')} ${rate} %</div><div class="t">${money(vat)}</div></div>` : ''}
    <div class="row"><div class="t">${T('ttc')}</div><div class="t">${money(total + vat)}</div></div>
    <button class="btn" data-act="saveDoc">${editing ? T('saveChanges') : T('saveQuote')}</button>
    <button class="btn out" data-act="closeDoc">${T('cancel')}</button>
    ${editing ? `<button class="btn out" data-act="delDoc" data-id="${draft.id}" style="color:#b91c1c;border-color:#b91c1c">${T('deleteDoc')}</button>` : ''}
  </div></div>`;
}

/* ---------------- Bilans ---------------- */
/* Tous les chiffres d'une période au même endroit : c'est cette fonction que
   les tests vérifient, plutôt que le HTML qui l'affiche. */
function figures(p, monthKey) {
  /* Le rapport mensuel peut demander un mois précis : on remplace alors la
     période par une comparaison AAAA-MM, sans toucher au reste du calcul. */
  const inP = monthKey ? (date) => String(date || '').slice(0, 7) === monthKey : (date) => inPeriod(date, p);
  const sales = db.sales.filter((s) => inP(s.date));
  const exp = db.expenses.filter((e) => inP(e.date));
  /* Une facture ne devient un revenu qu'une fois payée, et compte à la date du
     règlement : une facture de septembre réglée en octobre entre dans octobre. */
  /* Une facture transformée en vente compte déjà par la vente : on l'écarte
     pour ne pas compter deux fois le même chiffre d'affaires. */
  const invoices = (db.docs || []).filter((d) => d.kind === 'FAC' && d.paidDate && !d.saleId && inP(d.paidDate));
  const inv = invoices.reduce((a, d) => a + amountOf(d), 0);
  const invDue = unpaidInvoices().filter((d) => inP(d.date)).reduce((a, d) => a + amountOf(d), 0);
  const sold = sales.reduce((a, s) => a + s.total, 0);
  const ca = sold + inv;
  /* Trésorerie : acompte des ventes de la période + versements reçus pendant
     la période, y compris sur une vente plus ancienne. Un client qui règle en
     novembre une vente d'octobre fait bien entrer de l'argent en novembre. */
  const cash = db.sales.reduce((a, s) => {
    let got = inP(s.date) ? Number(s.paid) || 0 : 0;
    (s.pays || []).forEach((x) => { if (x.u && inP(isoOf(x.u))) got += Number(x.amount) || 0; });
    return a + Math.min(got, paidOf(s));
  }, 0) + inv;
  const dep = exp.reduce((a, e) => a + e.amount, 0);
  /* L'achat de marchandise est déjà dans le coût des articles vendus : le
     retirer du bénéfice évite de compter deux fois le même achat. Il reste
     affiché à part, et dans les dépenses, pour que la sortie d'argent soit vue. */
  const purchases = exp.filter((e) => e.label === 'Marchandise').reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const cogs = sales.reduce((a, s) => a + (s.cost || 0), 0);
  const profit = ca - cogs - (dep - purchases);
  /* Sans prix d'achat connu, le bénéfice est surestimé : on le dit clairement. */
  const unknownCost = sales.filter((s) => (Number(s.total) || 0) > 0 && !s.costKnown);
  /* Reste dû par les clients sur les ventes de la période : une seule ligne au
     bilan, sinon « Argent non encore encaissé » et « Argent dehors » répètent
     le même montant quand on regarde toute l'histoire. */
  const due = sales.reduce((a, s) => a + creditOf(s), 0);
  const wd = db.withdrawals.filter((w) => inP(w.date)).reduce((a, w) => a + w.amount, 0);
  return { sales, exp, invoices, inv, invDue, sold, ca, cash, dep, purchases, cogs, profit, unknownCost, due, wd };
}
/* Journal des relances : une ligne par envoi tenté, réussi ou non. Borné pour
   que l'état ne grossisse pas indéfiniment. */
const MAIL_LOG_MAX = 300;
function logRemind(entry) {
  db.mailLog = Array.isArray(db.mailLog) ? db.mailLog : [];
  db.mailLog.push({ id: uid(), at: Date.now(), ok: false, ...entry });
  if (db.mailLog.length > MAIL_LOG_MAX) db.mailLog = db.mailLog.slice(-MAIL_LOG_MAX);
}
/* Ce que l'envoi automatique a fait aujourd'hui, sans mentir sur un échec. */
function autoMailNote() {
  const s = db.settings || {};
  if (!s.autoRemind) return '';
  if (mailReady === false) return `<p class="hint"><b>${T('mailMissing')}</b> — ${T('autoRemindNoKey')}</p>`;
  const info = s.autoRemindInfo;
  if (!info || info.date !== todayISO()) return '';
  const txt = info.sent
    ? T('autoRemindDone').replace('[n]', info.sent)
    : T('autoRemindFail');
  return `<p class="hint">${txt}</p>`;
}
/* Filtres du journal : canal, résultat, période. Ils s'appliquent aussi à
   l'export et au renvoi groupé, pour rester cohérents avec ce qu'on voit. */
/* Les filtres survivent au rechargement : on revient sur le journal tel qu'on
   l'avait laissé. Valeurs inconnues ignorées. */
const LOG_FILTERS_KEY = KEY + '.logFilters';
const LOG_FILTERS = { channel: ['all', 'email', 'wa'], result: ['all', 'ok', 'fail'], period: ['mois', 'tout'] };
function readLogFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_FILTERS_KEY) || '{}');
    const pick = (k) => (LOG_FILTERS[k].includes(raw[k]) ? raw[k] : LOG_FILTERS[k][0]);
    return { channel: pick('channel'), result: pick('result'), period: pick('period') };
  } catch { return { channel: 'all', result: 'all', period: 'tout' }; }
}
const savedLogFilters = readLogFilters();
let logChannel = savedLogFilters.channel;
let logResult = savedLogFilters.result;
let logPeriod = savedLogFilters.period;
function saveLogFilters() {
  try { localStorage.setItem(LOG_FILTERS_KEY, JSON.stringify({ channel: logChannel, result: logResult, period: logPeriod })); } catch {}
}
function filteredLog() {
  return (db.mailLog || []).filter((e) => {
    if (logChannel !== 'all' && e.channel !== logChannel) return false;
    if (logResult === 'ok' && !e.ok) return false;
    if (logResult === 'fail' && e.ok) return false;
    if (logPeriod !== 'tout' && !inPeriod(isoOf(new Date(e.at || Date.now())), logPeriod)) return false;
    return true;
  });
}
/* Une facture ne compte qu'une fois, même si elle a échoué plusieurs fois, et
   une facture réglée entre-temps n'a plus rien à réclamer. */
function failedLogList() {
  const seen = new Set();
  return filteredLog().filter((e) => !e.ok && e.docId && !seen.has(e.docId) && seen.add(e.docId)
    && db.docs.some((x) => x.id === e.docId && !x.paidDate));
}
function logFilterBar() {
  const seg = (arr, cur, k) => `<div class="seg">${arr.map(([v, label]) => `<button class="${cur === v ? 'on' : ''}" data-act="logFilter" data-k="${k}" data-v="${v}">${label}</button>`).join('')}</div>`;
  return seg([['all', T('all')], ['email', T('channelEmail')], ['wa', T('channelWhatsapp')]], logChannel, 'channel')
    + seg([['all', T('all')], ['ok', T('statusOk')], ['fail', T('statusFail')]], logResult, 'result')
    + seg([['mois', T('thisMonth')], ['tout', T('all')]], logPeriod, 'period');
}
/* Journal des relances, la plus récente en haut. Une relance échouée peut être
   renvoyée d'un clic : la nouvelle tentative s'ajoute au journal. */
function remindJournal() {
  if (!(db.mailLog || []).length) return '';
  const log = filteredLog().slice(-15).reverse();
  const fails = failedLogList().length;
  return `<div class="card"><h3>${T('remindLog')}</h3>
    ${logFilterBar()}
    ${fails ? `<button class="btn" data-act="retryFailed">${T('retryFailed')} (${fails})</button>` : ''}
    ${log.length ? '' : `<p class="empty">${T('logEmpty')}</p>`}
    ${log.map((e) => {
      const when = e.at ? `${dayFR(isoOf(new Date(e.at)))} ${clock(e.at)}` : '';
      return `<div class="row"><div><div class="t">${esc(e.number || '—')} · ${esc(e.party || '—')}</div>
        <div class="s">${when} · ${e.channel === 'email' ? T('channelEmail') : T('channelWhatsapp')}${e.to ? ' · ' + esc(e.to) : ''}</div></div>
        <div class="right">${e.ok ? `<span class="tag ok">${money(e.amount || 0)}</span>` : `<span class="tag bad">${T('sendFailed')}</span>`}<br><button class="btn small out" data-act="resendRemind" data-log="${e.id}">${T('resend')}</button></div></div>`;
    }).join('')}
    ${log.length ? `<button class="btn out" data-act="exportLog">${T('exportLog')}</button>` : ''}
  </div>`;
}
/* Renvoi groupé des échecs affichés, une fois par facture. Seuls les e-mails
   peuvent échouer : une relance WhatsApp n'est journalisée que si elle part. */
async function retryFailedReminders() {
  const items = failedLogList().map((e) => ({ e, d: db.docs.find((x) => x.id === e.docId) })).filter((x) => x.d);
  if (!items.length) { alert(T('retryNone')); return; }
  let ok = 0, fail = 0;
  const mails = items.filter((x) => x.e.channel === 'email');
  const payload = [];
  for (const { d } of mails) {
    const to = String(d.clientEmail || '').trim();
    if (!isEmail(to)) {
      fail += 1;
      logRemind({ docId: d.id, number: d.number, party: d.party || '', amount: amountOf(d), channel: 'email', to, ok: false });
      continue;
    }
    const item = { id: d.id, to, subject: `${T('invoice')} ${d.number}`, text: invoiceReminderText(d) };
    try {
      const file = await docFile(d);
      item.pdf = await fileToBase64(file);
      item.filename = file.name;
    } catch {}
    payload.push(item);
  }
  if (payload.length) {
    const r = await api('/api/remind', 'POST', { list: payload });
    const sent = new Set((r.ok && r.data && Array.isArray(r.data.sent) ? r.data.sent : []).map(String));
    payload.forEach((item) => {
      const d = db.docs.find((x) => x.id === item.id);
      if (!d) return;
      const done = sent.has(String(item.id));
      if (done) { d.remindedAt = todayISO(); d.u = Date.now(); ok += 1; } else fail += 1;
      logRemind({ docId: d.id, number: d.number, party: d.party || '', amount: amountOf(d), channel: 'email', to: item.to, ok: done });
    });
  }
  saveDB(); render();
  alert(T('retrySummary').replace('[ok]', ok).replace('[fail]', fail));
}
/* Export du journal en CSV : séparateur point-virgule et BOM, pour qu'Excel en
   français ouvre le fichier sans déformer les accents. */
function mailLogCSV() {
  const head = [T('logDate'), T('logTime'), T('invoice'), T('client'), T('amount'), T('channel'), T('recipient'), T('result')];
  const rows = filteredLog().map((e) => {
    const dt = new Date(e.at || Date.now());
    return [
      isoOf(dt), dt.toLocaleTimeString(lang() === 'ar' ? 'ar' : lang() === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }),
      e.number || '', e.party || '', String(e.amount || 0),
      e.channel === 'email' ? T('channelEmail') : T('channelWhatsapp'),
      e.to || '', e.ok ? T('statusOk') : T('statusFail'),
    ];
  });
  return [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
/* Le nom du fichier dit ce qu'il contient : canal, résultat et période. */
function logExportName() {
  const parts = ['relances'];
  if (logChannel !== 'all') parts.push(logChannel === 'email' ? 'email' : 'whatsapp');
  if (logResult !== 'all') parts.push(logResult === 'ok' ? 'reussis' : 'echecs');
  parts.push(logPeriod === 'mois' ? todayISO().slice(0, 7) : 'tout');
  return `${parts.join('-')}.csv`;
}
function downloadMailLog() {
  try {
    const blob = new Blob(['\ufeff' + mailLogCSV()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = logExportName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
  } catch { alert(T('exportFail')); }
}
/* Renvoyer une relance du journal, réussie ou non : la facture est retrouvée
   par son identifiant, le message et la pièce jointe sont reconstruits, puis
   une trace est ajoutée. */
async function resendReminder(logId) {
  const e = (db.mailLog || []).find((x) => x.id === logId);
  if (!e) return;
  const d = db.docs.find((x) => x.id === e.docId);
  if (!d) { alert(T('resendDocGone')); return; }
  /* Une facture réglée entre-temps ne doit plus être réclamée. */
  if (d.paidDate) { alert(T('resendPaid')); return; }
  if (e.channel !== 'email') {
    const phone = d.clientPhone || (db.parties.find((p) => p.name === d.party) || {}).phone || '';
    if (!waOpen(phone, invoiceReminderText(d))) return;
    d.remindedAt = todayISO();
    d.u = Date.now();
    logRemind({ docId: d.id, number: d.number, party: d.party || '', amount: amountOf(d), channel: 'wa', to: phone, ok: true });
    saveDB(); render();
    return;
  }
  const to = String(d.clientEmail || '').trim();
  if (!isEmail(to)) { alert(T('resendNoEmail')); return; }
  const item = { id: d.id, to, subject: `${T('invoice')} ${d.number}`, text: invoiceReminderText(d) };
  try {
    const file = await docFile(d);
    item.pdf = await fileToBase64(file);
    item.filename = file.name;
  } catch {}
  const r = await api('/api/remind', 'POST', { list: [item] });
  const sent = r.ok && r.data && Array.isArray(r.data.sent) ? r.data.sent.map(String) : [];
  const ok = sent.includes(String(d.id));
  logRemind({ docId: d.id, number: d.number, party: d.party || '', amount: amountOf(d), channel: 'email', to, ok });
  if (ok) { d.remindedAt = todayISO(); d.u = Date.now(); }
  saveDB(); render();
  alert(ok ? T('resendDone') : T('resendFail'));
}
function bilans() {
  const { ca, cash, dep, purchases, cogs, profit, unknownCost, invoices, inv, invDue, due, wd } = figures(period);
  const rm = remindStats(period);
  const chip = (p, label) => `<button class="btn ${period === p ? '' : 'out'}" data-act="period" data-p="${p}">${label}</button>`;
  return `<div class="card"><h3>${T('period')}</h3><div class="big">
      ${chip('jour', T('today'))}${chip('mois', T('thisMonth'))}${chip('annee', T('thisYear'))}${chip('tout', T('all'))}
    </div><button class="btn out" data-act="hist">${T('history')}</button>${isStaff() ? '' : `<button class="btn out" data-act="report">${T('monthlyReport')}</button><button class="btn out" data-act="journal">${T('journal')}</button>`}</div>
    <div class="kpis">
      <div class="kpi"><span>${T('revenue')}</span><b>${money(ca)}</b></div>
      <div class="kpi"><span>${T('collected')}</span><b>${money(cash)}</b></div>
      ${isStaff() ? '' : `<div class="kpi"><span>${T('expenses')}</span><b>${money(dep)}</b></div>`}
      ${isStaff() ? '' : `<div class="kpi"><span>${unknownCost.length ? T('profitEstimated') : T('profit')}</span><b>${money(profit)}</b></div>`}
    </div>
    ${!isStaff() && unknownCost.length ? `<div class="card" style="border-color:#f3d08a;background:#fffaeb"><p class="hint" style="margin:0">${T('profitUnknownHint')} <b>${unknownCost.length}</b> ${T('salesNoCost')}</p><button class="btn out" data-act="hist">${T('fixSalesCost')}</button></div>` : ''}
    <div class="card">
      ${isStaff() ? '' : `<div class="row"><div class="t">${T('cogs')}</div><div class="t">${money(cogs)}</div></div>`}
      ${isStaff() ? '' : `<div class="row"><div class="t">${T('goodsPurchases')}</div><div class="t">${money(purchases)}</div></div>`}
      <div class="row"><div class="t">${T('invoicesInRevenue')}</div><div class="t">${money(inv)}</div></div>
      <div class="row"><div class="t">${T('uncollected')}</div><div class="t">${money(due + invDue)}</div></div>
      ${isStaff() ? '' : `<div class="row"><div class="t">${T('stockValue')}</div><div class="t">${money(stockValue())}</div></div>`}
      ${isStaff() ? '' : `<div class="row"><div class="t">${T('withdrawals')}</div><div class="t">${money(wd)}</div></div>`}
      ${isStaff() ? '' : `<div class="row"><div class="t">${T('debts')}</div><div class="t">${money(totalDebt())}</div></div>`}
    </div>
    ${rm.count ? `<div class="card">
      <h3>${T('remindStats')}</h3>
      <div class="row"><div class="t">${T('remindedCount')}</div><div class="t">${rm.count} · ${money(rm.amount)}</div></div>
      <div class="row"><div class="t">${T('paidAfterRemind')}</div><div class="t">${rm.paid} · ${money(rm.paidAmount)}${rm.amount ? ` (${rm.rate} %)` : ''}</div></div>
      <div class="row"><div class="t">${T('stillUnpaid')}</div><div class="t">${rm.unpaid} · ${money(rm.unpaidAmount)}</div></div>
      <p class="hint">${T('remindStatsHint')}</p>
    </div>` : ''}
    ${remindJournal()}
    ${isStaff() ? '' : `<p class="hint">${T('profitHint')}</p>`}
    ${invoices.length ? `<p class="hint">${T('invoiceNoCostHint')}</p>` : ''}`;
}

/* ---------------- journal d'activité ---------------- */
/* Les actions sont enregistrées avec leur auteur. Le patron peut filtrer par
   vendeur ; un vendeur ne voit pas ce journal (le serveur vide aussi les
   montants qu'il contient). */
const ACT_LABEL = {
  sale: 'jSale', saleEdit: 'jSaleEdit', expense: 'jExpense', expenseEdit: 'jExpenseEdit',
  withdraw: 'jWithdraw', product: 'jProduct', productEdit: 'jProductEdit', productDel: 'jProductDel',
  purchase: 'jPurchase', pay: 'jPay',
};
/* Export CSV du journal, dans l'ordre et le filtre affichés à l'écran. */
function journalCSV(list) {
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const head = [T('logDate'), T('logTime'), T('colSeller'), T('colAction'), T('colDetail'), T('amount')];
  const rows = list.map((e) => {
    const dt = new Date(Number(e.at) || Date.now());
    return [
      isoOf(dt),
      dt.toLocaleTimeString(lang() === 'ar' ? 'ar' : lang() === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }),
      e.by || T('owner'),
      T(ACT_LABEL[e.act] || e.act),
      e.label || '',
      Number(e.amount) > 0 ? e.amount : '',
    ];
  });
  return '\ufeff' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}
function downloadJournal(list) {
  try {
    const url = URL.createObjectURL(new Blob([journalCSV(list)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-${todayISO()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
  } catch { alert(T('exportFail')); }
}
/* Résumé par auteur pour un mois : sert de section au rapport PDF. */
function journalSummary(monthKey) {
  const rows = new Map();
  for (const e of db.log || []) {
    if (!e || !e.at || isoOf(e.at).slice(0, 7) !== monthKey) continue;
    const name = e.by || T('owner');
    const cur = rows.get(name) || { name, n: 0, sales: 0, salesAmount: 0, expenses: 0, expensesAmount: 0 };
    cur.n += 1;
    if (e.act === 'sale') { cur.sales += 1; cur.salesAmount += Number(e.amount) || 0; }
    if (e.act === 'expense') { cur.expenses += 1; cur.expensesAmount += Number(e.amount) || 0; }
    rows.set(name, cur);
  }
  return [...rows.values()].sort((a, b) => b.n - a.n);
}
function journalModal() {
  if (isStaff()) return;
  let who = 'all';
  const d = modal(`<div class="sheetHead"><h2>${T('journal')}</h2><button type="button" class="sheetClose" id="jClose" aria-label="${T('close')}">✕</button></div>
    <p class="hint">${T('journalHint')}</p><div class="big" id="jWho"></div>
    <button class="btn out" id="jCsv">${T('journalCsv')}</button><div id="jList"></div>`);
  d.querySelector('#jClose').onclick = () => d.remove();
  d.querySelector('#jCsv').onclick = () => {
    const all = (db.log || []).slice().sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    downloadJournal(all.filter((e) => who === 'all' || (e.by || '') === who));
  };
  const paint = () => {
    const all = (db.log || []).slice().sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    const names = [...new Set(all.map((e) => e.by || ''))];
    d.querySelector('#jWho').innerHTML = `<button class="btn small ${who === 'all' ? '' : 'out'}" data-who="all">${T('all')}</button>`
      + names.map((n) => `<button class="btn small ${who === n ? '' : 'out'}" data-who="${esc(n)}">${esc(n || T('owner'))}</button>`).join('');
    const list = all.filter((e) => who === 'all' || (e.by || '') === who).slice(0, 100);
    d.querySelector('#jList').innerHTML = list.map((e) => `<div class="row"><div><div class="t">${esc(T(ACT_LABEL[e.act] || e.act))}${Number(e.amount) > 0 ? ' · ' + money(e.amount) : ''}</div><div class="s">${dayFR(isoOf(e.at))} · ${esc(clock(e.at))}${e.label ? ' · ' + esc(e.label) : ''}</div></div><div class="right"><span class="tag">${esc(e.by || T('owner'))}</span></div></div>`).join('')
      || `<p class="empty">${T('noJournal')}</p>`;
    d.querySelectorAll('[data-who]').forEach((b) => { b.onclick = () => { who = b.dataset.who; paint(); }; });
  };
  paint();
}

/* ---------------- rapport mensuel ---------------- */
/* Les mois qui ont quelque chose à raconter : ventes, dépenses, prélèvements,
   factures. Les douze derniers au plus, du plus récent au plus ancien. */
function monthsWithData() {
  const set = new Set([todayISO().slice(0, 7)]);
  [...db.sales, ...db.expenses, ...db.withdrawals].forEach((x) => { if (x.date) set.add(String(x.date).slice(0, 7)); });
  (db.docs || []).forEach((d) => { const dt = d.paidDate || d.date; if (dt) set.add(String(dt).slice(0, 7)); });
  return [...set].filter((k) => /^\d{4}-\d{2}$/.test(k)).sort().reverse().slice(0, 24);
}
const monthLabel = (key) => {
  const d = new Date(key + '-01T00:00:00');
  if (isNaN(d.getTime())) return key;
  const txt = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};
function reportModal() {
  const months = monthsWithData();
  const m = modal(`<h2>${T('monthlyReport')}</h2><p class="hint">${T('monthlyReportHint')}</p>
    <label>${T('month')}</label><select id="rpMonth">${months.map((k) => `<option value="${k}" ${k === todayISO().slice(0, 7) ? 'selected' : ''}>${esc(monthLabel(k))}</option>`).join('')}</select>
    <button class="btn" id="rpOk">${T('downloadPdf')}</button>
    <button class="btn out" id="rpNo">${T('cancel')}</button>`);
  m.querySelector('#rpNo').onclick = () => m.remove();
  m.querySelector('#rpOk').onclick = () => { const k = m.querySelector('#rpMonth').value; m.remove(); downloadReport(k); };
}
async function reportPdf(monthKey) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const f = figures('mois', monthKey);
  const st = db.settings || {};
  const pm = (n) => money(n).replace(/[\u202f\u00a0]/g, ' ');
  const place = [st.address, st.district, st.city, countryName(st.country || 'CI')].filter(Boolean).join(' · ');
  pdf.setFillColor(20, 83, 45);
  pdf.rect(10, 10, 190, 7, 'F');
  pdf.setTextColor(17, 17, 17);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(24);
  pdf.text(T('monthlyReport'), 14, 34);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(12);
  pdf.text(monthLabel(monthKey), 14, 42);
  pdf.setFontSize(10);
  pdf.text(db.shop || T('app'), 14, 48);
  if (place) { pdf.setFontSize(8.5); pdf.setTextColor(90, 90, 90); pdf.text(place, 14, 53); pdf.setTextColor(17, 17, 17); }
  let y = 66;
  const row = (label, value, bold) => {
    if (y > 268) { pdf.addPage(); y = 24; }
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(bold ? 12 : 10.5);
    pdf.text(String(label), 14, y);
    pdf.text(String(value), 196, y, { align: 'right' });
    pdf.setDrawColor(228, 228, 228); pdf.setLineWidth(0.2);
    pdf.line(14, y + 2.5, 196, y + 2.5);
    y += bold ? 9 : 7.5;
  };
  const section = (title) => {
    if (y > 250) { pdf.addPage(); y = 24; }
    y += 5;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(20, 83, 45);
    pdf.text(String(title).toUpperCase(), 14, y);
    pdf.setTextColor(17, 17, 17);
    y += 7;
  };
  section(T('reportActivity'));
  row(T('revenue'), pm(f.ca), true);
  row(T('saleCount'), String(f.sales.length));
  row(T('invoicesPaid'), `${f.invoices.length} · ${pm(f.inv)}`);
  row(T('collected'), pm(f.cash));
  row(T('expenses'), pm(f.dep));
  row(T('goodsPurchases'), pm(f.purchases));
  row(f.unknownCost.length ? T('profitEstimated') : T('profit'), pm(f.profit), true);
  const rm = remindStats('mois', monthKey);
  if (rm.count) {
    section(T('remindStats'));
    row(T('remindedCount'), `${rm.count} · ${pm(rm.amount)}`);
    row(T('paidAfterRemind'), `${rm.paid} · ${pm(rm.paidAmount)}${rm.amount ? ` (${rm.rate} %)` : ''}`, true);
    row(T('stillUnpaid'), `${rm.unpaid} · ${pm(rm.unpaidAmount)}`);
  }
  const journalRows = journalSummary(monthKey);
  if (journalRows.length) {
    section(T('journal'));
    journalRows.forEach((s) => {
      row(`${s.name} (${s.n} ${T('actions')})`, `${s.sales} ${T('jSale')} · ${pm(s.salesAmount)}`);
      if (s.expenses) row(`  ${T('expenses')}`, `${s.expenses} · ${pm(s.expensesAmount)}`);
    });
  }
  section(T('reportSituation'));
  row(T('uncollected'), pm(f.due));
  row(T('debts'), pm(totalDebt()));
  row(T('stockValue'), pm(stockValue()));
  row(T('withdrawals'), pm(f.wd));
  const byLabel = {};
  f.exp.forEach((e) => { byLabel[e.label] = (byLabel[e.label] || 0) + (Number(e.amount) || 0); });
  const labels = Object.entries(byLabel).sort((a, b) => b[1] - a[1]);
  if (labels.length) { section(T('reportExpenses')); labels.forEach(([k, v]) => row(k, pm(v))); }
  /* Les factures du mois, une par ligne : c'est la pièce que le commerce
     retrouve dans son classeur, avec son état de règlement. */
  const monthDocs = (db.docs || []).filter((d) => d.kind === 'FAC' && String(d.date || '').slice(0, 7) === monthKey)
    .sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1));
  if (monthDocs.length) {
    section(T('reportInvoices'));
    monthDocs.forEach((d) => {
      const who = `${d.number || '—'} · ${d.party || '—'}`;
      row(who.slice(0, 62), `${pm(amountOf(d))} · ${d.paidDate ? T('invoicePaid') : T('invoiceUnpaid')}`);
    });
    row(T('invoicesPaid'), pm(monthDocs.filter((d) => d.paidDate).reduce((a, d) => a + amountOf(d), 0)), true);
    row(T('unpaidInvoices'), pm(monthDocs.filter((d) => !d.paidDate).reduce((a, d) => a + amountOf(d), 0)), true);
  }
  const byClient = {};
  f.sales.forEach((s) => { const c = creditOf(s); if (c > 0) { const k = s.party || '—'; byClient[k] = (byClient[k] || 0) + c; } });
  const tops = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (tops.length) { section(T('reportLate')); tops.forEach(([k, v]) => row(k, pm(v))); }
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
  pdf.text(`${T('generatedOn')} ${dayFR(todayISO())} · ${db.shop || T('app')}`, 14, 287);
  return pdf.output('blob');
}
async function downloadReport(monthKey) {
  try {
    const blob = await reportPdf(monthKey);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rapport-${monthKey}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
    alert(T('pdfSaved'));
  } catch { alert(T('pdfFail')); }
}

/* ---------------- modales ---------------- */
/* Un lecteur d'écran a besoin de savoir quel libellé décrit quel champ : on relie
   chaque <label> au premier champ qui le suit, partout dans l'application. */
function linkLabels(root) {
  (root || document).querySelectorAll('label').forEach((label) => {
    if (label.htmlFor) return;
    let el = label.nextElementSibling;
    while (el && !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) el = el.nextElementSibling;
    if (el && el.id) label.htmlFor = el.id;
  });
}
/* L'écran de connexion couvre l'application : le contenu dessous ne doit plus être
   atteignable au clavier ni annoncé par un lecteur d'écran. */
function setBackgroundInert(on) {
  ['header', 'main', '#nav', '#printArea'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.inert = on;
    if (on) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
  });
}
function modal(html) {
  const d = document.createElement('div');
  d.className = 'modal';
  d.innerHTML = `<div class="sheet">${html}</div>`;
  d.addEventListener('click', (e) => { if (e.target === d) d.remove(); });
  document.body.appendChild(d);
  linkLabels(d);
  return d;
}
function payDebtModal(id) {
  const d = db.debts.find((x) => x.id === id);
  if (!d) return;
  const pays = Array.isArray(d.pays) ? d.pays : [];
  const m = modal(`<h2>${esc(d.supplier)}</h2><p class="hint">${T('remains')} ${money(debtOf(d))}</p>
    ${pays.length ? `<h3>${T('payments')}</h3>${pays.map((p) => `<div class="row"><div class="t">${money(p.amount)}</div><div class="right"><button class="btn small out" data-delpay="${p.id}">${T('delete')}</button></div></div>`).join('')}` : ''}
    <label>${T('payReceived')}</label><input id="pdAmt" inputmode="numeric" value="${debtOf(d)}">
    <button class="btn" id="pdOk">${T('savePayment')}</button><button class="btn out" id="pdNo">${T('cancel')}</button><p class="err" id="pdErr"></p>`);
  m.querySelector('#pdNo').onclick = () => m.remove();
  m.querySelectorAll('[data-delpay]').forEach((btn) => {
    btn.onclick = () => {
      if (!confirm(T('confirmDeletePayment'))) return;
      const p = (d.pays || []).find((x) => x.id === btn.dataset.delpay);
      d.pays = (d.pays || []).filter((x) => x.id !== btn.dataset.delpay);
      d.paid = Math.max(0, (Number(d.paid) || 0) - (Number(p && p.amount) || 0));
      d.u = Date.now(); saveDB(); m.remove(); render(); payDebtModal(id);
    };
  });
  m.querySelector('#pdOk').onclick = () => {
    const v = Math.round(+m.querySelector('#pdAmt').value || 0);
    if (v <= 0) { m.querySelector('#pdErr').textContent = T('errorAmount'); return; }
    d.pays = Array.isArray(d.pays) ? d.pays : [];
    d.pays.push({ id: uid(), amount: v, u: Date.now() });
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
    ${isStaff() ? '' : `<label>${T('buyPrice')}</label><input id="epBuy" inputmode="numeric" value="${esc(p.buy)}">`}
    <label>${T('sellPrice')}</label><input id="epSell" inputmode="numeric" value="${esc(p.sell)}" ${canEditPrices() ? '' : 'disabled'}>
    <label>${T('qty')}</label><input id="epQty" inputmode="numeric" value="${esc(q)}">
    <label>${T('alertAt')}</label><input id="epAlert" inputmode="numeric" value="${esc(p.alert)}">
    <button class="btn" id="epOk">${T('saveChanges')}</button><button class="btn out" id="epNo">${T('cancel')}</button><p class="err" id="epErr"></p>`);
  m.querySelector('#epNo').onclick = () => m.remove();
  m.querySelector('#epOk').onclick = () => {
    const name = m.querySelector('#epName').value.trim();
    if (!name) { m.querySelector('#epErr').textContent = T('badBusiness'); return; }
    const newQty = Math.max(0, Math.round(+m.querySelector('#epQty').value || 0));
    p.name = name;
    /* Un vendeur ne voit pas le prix d'achat : on garde celui déjà enregistré. */
    p.buy = isStaff() ? Math.max(0, Number(p.buy) || 0) : Math.round(+m.querySelector('#epBuy').value || 0);
    /* Prix de vente verrouillé pour un vendeur qui n'a pas ce droit. */
    p.sell = canEditPrices() ? Math.round(+m.querySelector('#epSell').value || 0) : Math.max(0, Number(p.sell) || 0);
    p.alert = Math.round(+m.querySelector('#epAlert').value || 0);
    p.u = Date.now();
    if (newQty !== q) db.moves.push({ id: uid(), pid: p.id, delta: newQty - q, u: Date.now() });
    logAct('productEdit', name, 0);
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
    <div class="card">${list.map((s) => `<div class="row"><div><div class="t">${dayFR(s.date)} · ${money(s.total)}</div><div class="s">${esc(methodLabel(s.method))}${s.product ? ' · ' + esc(s.product) + ' ×' + s.qty : ''}</div></div><div class="right">${creditOf(s) ? `<span class="tag warn">${T('remains')} ${money(creditOf(s))}</span>` : `<span class="tag ok">${T('paid')}</span>`}</div></div>`).join('') || `<p class="empty">${T('nothing')}</p>`}</div>
    <button class="btn" id="cdPrint">${T('printSheet')}</button>
    <button class="btn out" id="cdNo">${T('close')}</button>`);
  m.querySelector('#cdNo').onclick = () => m.remove();
  m.querySelector('#cdPrint').onclick = () => { m.remove(); printClient(id); };
}
function printClient(id) {
  const p = db.parties.find((x) => x.id === id);
  if (!p) return;
  const list = db.sales.filter((s) => (s.party || '—') === p.name).sort((a, b) => (a.date < b.date ? 1 : -1));
  const docs = db.docs.filter((d) => d.party === p.name).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = list.reduce((a, s) => a + (Number(s.total) || 0), 0);
  const paid = list.reduce((a, s) => a + paidOf(s), 0);
  const rest = list.reduce((a, s) => a + creditOf(s), 0);
  const st = db.settings || {};
  const place = [st.address, st.district, st.city, countryName(st.country || 'CI')].filter(Boolean).join(' · ');
  const area = document.getElementById('printArea');
  area.className = 'a4';
  area.innerHTML = `${st.logo ? `<img class="docLogo" src="${esc(st.logo)}" alt="">` : ''}<h2>${esc(db.shop || T('app'))}</h2>
    ${place ? `<div class="small">${esc(place)}</div>` : ''}
    <hr>
    <div class="small">${T('clientCard')} · ${dayFR(todayISO())}</div>
    <h2 style="margin:3mm 0 1mm">${esc(p.name)}</h2>
    <div class="small">${[p.phone, p.address].filter(Boolean).map(esc).join(' · ') || '—'}</div>
    <div class="tot"><span>${T('revenue')}</span><span>${money(total)}</span></div>
    <div class="tot"><span>${T('collected')}</span><span>${money(paid)}</span></div>
    <div class="tot"><span>${T('remains')}</span><span>${money(rest)}</span></div>
    <table><thead><tr><th>${T('dueDate')}</th><th>${T('article')}</th><th>${T('total')}</th><th>${T('paid')}</th><th>${T('remains')}</th></tr></thead><tbody>
      ${list.map((s) => `<tr><td>${dayFR(s.date)}</td><td>${esc(s.product || '—')}${s.product ? ' ×' + s.qty : ''}</td><td>${money(s.total)}</td><td>${money(paidOf(s))}</td><td>${money(creditOf(s))}</td></tr>`).join('') || `<tr><td colspan="5">${T('nothing')}</td></tr>`}
    </tbody></table>
    ${docs.length ? `<h3 style="margin:4mm 0 1mm">${T('documents')}</h3><table><thead><tr><th>${T('dueDate')}</th><th>${T('line')}</th><th>${T('total')}</th></tr></thead><tbody>${docs.map((d) => `<tr><td>${dayFR(d.date)}</td><td>${d.kind === 'DEV' ? T('quote') : T('invoice')} ${esc(d.number)}</td><td>${money(amountOf(d))}</td></tr>`).join('')}</tbody></table>` : ''}
    <p class="small">${T('thanks')}</p>`;
  window.print();
}
function pendingRows() {
  return db.debts.filter((d) => d.delivered === false).sort((a, b) => (a.date < b.date ? 1 : -1));
}
function pendingExpenses() {
  return db.expenses.filter((e) => e.delivered === false).sort((a, b) => (a.date < b.date ? 1 : -1));
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
  const exps = pendingExpenses();
  const total = list.reduce((a, d) => a + debtOf(d), 0) + exps.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const names = [...new Set(list.map((d) => d.supplier))];
  return `<button class="btn out" data-act="back">← ${T('back')}</button>
    <h2 style="margin-top:12px">${T('pendingPurchases')}</h2>
    <div class="kpis"><div class="kpi"><span>${T('pendingPurchases')}</span><b>${list.length + exps.length}</b></div><div class="kpi"><span>${T('totalPending')}</span><b>${money(total)}</b></div></div>
    <button class="btn" data-act="printPending">${T('printList')}</button>
    ${pendingExpenses().length ? `<div class="card" style="margin-top:14px"><h3>${T('pendingGoods')}</h3>
      ${pendingExpenses().map((e) => `<div class="row"><div><div class="t">${dayFR(e.date)} · ${money(e.amount)}</div><div class="s">${esc(e.label)}${e.note ? ' · ' + esc(e.note) : ''} · ${esc(methodLabel(e.method))}</div></div><div class="right">${daysSince(e.date) >= 7 ? `<span class="tag bad">${daysSince(e.date)} ${T('days')}</span> ` : ''}<button class="btn small out" data-act="deliverExpense" data-id="${e.id}">${T('markSaleDelivered')}</button></div></div>`).join('')}
    </div>` : ''}
    ${names.map((n) => {
      const rows = list.filter((d) => d.supplier === n);
      const sup = db.suppliers.find((x) => x.name === n) || {};
      const sum = rows.reduce((a, d) => a + debtOf(d), 0);
      return `<div class="card" style="margin-top:14px"><h3>${esc(n)}</h3>
        <div class="hint">${[sup.phone, sup.address].filter(Boolean).map(esc).join(' · ') || '—'}</div>
        ${rows.map((d) => `<div class="row"><div><div class="t">${dayFR(d.date)} · ${money(d.amount)}</div><div class="s">${T('paid')} ${money(d.paid || 0)} · ${T('remains')} ${money(debtOf(d))}</div></div><div class="right">${daysSince(d.date) >= 7 ? `<span class="tag bad">${daysSince(d.date)} ${T('days')}</span> ` : ''}<button class="btn small out" data-act="deliverDebt" data-id="${d.id}">${T('markSaleDelivered')}</button></div></div>`).join('')}
        <div class="row"><div class="t">${T('remains')}</div><div class="t">${money(sum)}</div></div>
        ${sup.phone ? `<button class="btn small whats" data-act="waPending" data-name="${esc(n)}">${T('sendToSupplier')}</button>` : ''}
      </div>`;
    }).join('') || `<p class="empty">${T('noPending')}</p>`}`;
}
function supplierDetail(id) {
  /* Un vendeur n'a pas à voir les montants fournisseurs : la fiche montre les
     livraisons et les dates, pas l'argent. */
  const s = db.suppliers.find((x) => x.id === id);
  if (!s) return;
  const hide = isStaff();
  const list = db.debts.filter((d) => d.supplier === s.name).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = list.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const paid = list.reduce((a, d) => a + (Number(d.paid) || 0), 0);
  const rest = list.reduce((a, d) => a + debtOf(d), 0);
  const m = modal(`<h2>${esc(s.name)}</h2>
    <p class="hint">${[s.phone, s.address].filter(Boolean).map(esc).join(' · ') || '—'}</p>
    ${hide ? `<p class="hint">${T('amountsHidden')}</p>` : `<div class="kpis">
      <div class="kpi"><span>${T('totalPurchases')}</span><b>${money(total)}</b></div>
      <div class="kpi"><span>${T('paid')}</span><b>${money(paid)}</b></div>
      <div class="kpi"><span>${T('remains')}</span><b>${money(rest)}</b></div>
    </div>`}
    <div class="card">${list.map((d) => `<div class="row"><div><div class="t">${dayFR(d.date)}${hide ? '' : ` · ${money(d.amount)}`}</div><div class="s">${hide ? payMode(d) : `${T('paid')} ${money(d.paid || 0)} · ${T('remains')} ${money(debtOf(d))}`}</div></div><div class="right"><span class="tag">${payMode(d)}</span> ${d.delivered === false ? `<span class="tag warn">${T('notDelivered')}</span>` : `<span class="tag ok">${T('received')}</span>`}${debtOf(d) && !hide ? ` <button class="btn small" data-pay="${d.id}">${T('paySupplier')}</button>` : ''} ${hide ? '' : `<button class="btn small out" data-act="delDebt" data-id="${d.id}">${T('delete')}</button>`}</div></div>`).join('') || `<p class="empty">${T('noPurchases')}</p>`}</div>
    ${hide ? '' : `<button class="btn" id="sdPrint">${T('printSheet')}</button>`}
    <button class="btn out" id="sdNo">${T('close')}</button>`);
  m.querySelector('#sdNo').onclick = () => m.remove();
  const sdPrint = m.querySelector('#sdPrint');
  if (sdPrint) sdPrint.onclick = () => { m.remove(); printSupplier(id); };
  m.querySelectorAll('[data-pay]').forEach((b) => { b.onclick = () => { m.remove(); payDebtModal(b.dataset.pay); }; });
}
function printSupplier(id) {
  if (isStaff()) return;
  const s = db.suppliers.find((x) => x.id === id);
  if (!s) return;
  const list = db.debts.filter((d) => d.supplier === s.name).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = list.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const paid = list.reduce((a, d) => a + (Number(d.paid) || 0), 0);
  const rest = list.reduce((a, d) => a + debtOf(d), 0);
  const payments = [];
  list.forEach((d) => { if (Array.isArray(d.pays)) d.pays.forEach((p) => payments.push({ date: new Date(p.u || Date.now()).toISOString().slice(0, 10), amount: p.amount, ref: d.date })); });
  const st = db.settings || {};
  const place = [st.address, st.district, st.city, countryName(st.country || 'CI')].filter(Boolean).join(' · ');
  const area = document.getElementById('printArea');
  area.className = 'a4';
  area.innerHTML = `${st.logo ? `<img class="docLogo" src="${esc(st.logo)}" alt="">` : ''}<h2>${esc(db.shop || T('app'))}</h2>
    ${place ? `<div class="small">${esc(place)}</div>` : ''}
    <hr>
    <div class="small">${T('supplierCard')} · ${dayFR(todayISO())}</div>
    <h2 style="margin:3mm 0 1mm">${esc(s.name)}</h2>
    <div class="small">${[s.phone, s.address].filter(Boolean).map(esc).join(' · ') || '—'}</div>
    <div class="tot"><span>${T('totalPurchases')}</span><span>${money(total)}</span></div>
    <div class="tot"><span>${T('paid')}</span><span>${money(paid)}</span></div>
    <div class="tot"><span>${T('remains')}</span><span>${money(rest)}</span></div>
    <table><thead><tr><th>${T('dueDate')}</th><th>${T('type')}</th><th>${T('total')}</th><th>${T('paid')}</th><th>${T('remains')}</th><th>${T('received')}</th></tr></thead><tbody>
      ${list.map((d) => `<tr><td>${dayFR(d.date)}</td><td>${payMode(d)}</td><td>${money(d.amount)}</td><td>${money(d.paid || 0)}</td><td>${money(debtOf(d))}</td><td>${d.delivered === false ? T('notDelivered') : T('received')}</td></tr>`).join('') || `<tr><td colspan="6">${T('noPurchases')}</td></tr>`}
    </tbody></table>
    ${payments.length ? `<h3 style="margin:4mm 0 1mm">${T('payments')}</h3><table><thead><tr><th>${T('dueDate')}</th><th>${T('amount')}</th><th>${T('line')}</th></tr></thead><tbody>${payments.map((p) => `<tr><td>${dayFR(p.date)}</td><td>${money(p.amount)}</td><td>${T('newPurchase')} ${dayFR(p.ref)}</td></tr>`).join('')}</tbody></table>` : ''}
    <p class="small">${T('thanks')}</p>`;
  window.print();
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
const METHODS = ['Espèces', 'Orange Money', 'Wave', 'MTN', 'Moov', 'Banque'];
/* Les moyens de paiement sont enregistrés en français ; seul l'affichage est traduit
   (les noms de services restent inchangés dans toutes les langues). */
const METHOD_NAME = { 'Espèces': 'methodCash', 'Banque': 'methodBank' };
const methodLabel = (m) => (m && METHOD_NAME[m] ? T(METHOD_NAME[m]) : m || '');
const methodOptions = (sel) => [...new Set([...METHODS, ...(sel ? [sel] : [])])]
  .map((m) => `<option value="${esc(m)}" ${m === sel ? 'selected' : ''}>${esc(methodLabel(m))}</option>`).join('');
function saleModal(saleId) {
  const src = saleId ? db.sales.find((x) => x.id === saleId) : null;
  const known = src ? db.parties.find((p) => p.name === src.party) || {} : {};
  const pays = src && Array.isArray(src.pays) ? src.pays : [];
  const d = modal(`<div class="sheetHead"><h2>${src ? T('editSale') : T('sell')}</h2><button type="button" class="sheetClose" id="sClose" aria-label="${T('close')}">✕</button></div>
    <label>${T('amount')}</label><input id="sAmount" inputmode="numeric" placeholder="0" value="${src ? esc(src.total) : ''}">
    <label>${T('method')}</label><select id="sMethod">${methodOptions(src ? src.method : 'Espèces')}</select>
    <label>${T('seller')}</label><input id="sBy" list="sByList" maxlength="40" value="${esc(src ? src.by || '' : lastSeller())}">
    <datalist id="sByList">${[...new Set(db.sales.map((s) => (s.by || '').trim()).filter(Boolean))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <label>${T('product')}</label><select id="sProduct"><option value="">${T('none')}</option>${db.products.map((p) => `<option value="${p.id}" ${src && src.pid === p.id ? 'selected' : ''}>${esc(p.name)} (${qtyOf(p) + (src && src.pid === p.id ? src.qty : 0)})</option>`).join('')}</select>
    <p class="hint" id="sCostWarn" style="display:none;color:#b45309;font-weight:600">${T('costZeroWarn')}</p>
    <label>${T('qtySold')}</label><input id="sQty" inputmode="numeric" value="${src && src.product ? esc(src.qty) : 1}">
    <div id="sCostBox" style="display:${isStaff() || (src && src.product) ? 'none' : 'block'}">
      <label>${T('costOptional')}</label><input id="sCost" inputmode="numeric" placeholder="0" value="${src && !src.product && src.cost ? esc(src.cost) : ''}">
      <p class="hint">${T('costHint')}</p>
    </div>
    <label>${T('client')}</label><input id="sParty" value="${src ? esc(src.party) : ''}">
    <label>${T('clientPhone')}</label><input id="sPhone" inputmode="tel" placeholder="+225 07 00 00 00 00" value="${esc(known.phone || '')}">
    <label>${T('clientAddress')}</label><input id="sAddress" placeholder="Cocody, près de la pharmacie" value="${esc(known.address || '')}">
    <label style="display:flex;gap:10px;align-items:center;margin-top:14px"><input type="checkbox" id="sCredit" style="width:auto" ${src && creditOf(src) > 0 ? 'checked' : ''}><span>${T('creditLater')}</span></label>
    <div id="sDepBox" style="display:${src && creditOf(src) > 0 ? 'block' : 'none'}">
      <label>${T('deposit')}</label><input id="sDeposit" inputmode="numeric" placeholder="0" value="${src ? esc(Math.min(Number(src.paid) || 0, Number(src.total) || 0)) : ''}">
      <p class="hint">${T('depositHint')}</p>
    </div>
    <label style="display:flex;gap:10px;align-items:center;margin-top:10px"><input type="checkbox" id="sDeliv" ${src ? (src.delivered === false ? '' : 'checked') : 'checked'} style="width:auto"><span>${T('deliveredGoods')}</span></label>
    ${pays.length ? `<h3 style="margin-top:16px">${T('payments')}</h3>
      ${pays.map((p) => `<div class="row"><div class="t">${money(p.amount)}</div><div class="right"><button class="btn small out" data-delpay="${p.id}">${T('delete')}</button></div></div>`).join('')}` : ''}
    <div class="sheetFoot"><p class="err" id="sErr"></p>
    <button class="btn" id="sOk">${src ? T('saveChanges') : T('saveSale')}</button>
    <button class="btn out" id="sNo">${T('cancel')}</button>${src && !isStaff() ? `<button class="btn out" id="sDel" style="color:#b91c1c;border-color:#b91c1c">${T('deleteSale')}</button>` : ''}</div>`);
  d.querySelector('#sNo').onclick = () => d.remove();
  d.querySelector('#sClose').onclick = () => d.remove();
  const prodSel = d.querySelector('#sProduct');
  const costBox = d.querySelector('#sCostBox');
  const costWarn = d.querySelector('#sCostWarn');
  /* Un article acheté à 0 rend le bénéfice faux : on le dit avant d'enregistrer. */
  const warnZeroCost = () => {
    const p = db.products.find((x) => x.id === prodSel.value);
    costWarn.style.display = !isStaff() && p && !costKnownOf(p.buy) ? 'block' : 'none';
  };
  prodSel.onchange = () => { costBox.style.display = prodSel.value ? 'none' : 'block'; warnZeroCost(); };
  warnZeroCost();
  const creditBox = d.querySelector('#sCredit');
  const depBox = d.querySelector('#sDepBox');
  const depInput = d.querySelector('#sDeposit');
  /* Passer une vente déjà réglée en « à crédit » doit la rouvrir : l'acompte
     repart de 0 au lieu de valoir le total encaissé. */
  creditBox.onchange = () => {
    const totalNow = Math.round(+d.querySelector('#sAmount').value || 0);
    if (creditBox.checked && totalNow > 0 && Number(depInput.value) >= totalNow) depInput.value = '0';
    depBox.style.display = creditBox.checked ? 'block' : 'none';
  };
  d.querySelectorAll('[data-delpay]').forEach((b) => {
    b.onclick = () => {
      if (!confirm(T('confirmDeletePayment'))) return;
      src.pays = (src.pays || []).filter((p) => p.id !== b.dataset.delpay);
      src.u = Date.now(); saveDB(); d.remove(); render(); saleModal(saleId);
    };
  });
  const del = d.querySelector('#sDel');
  if (del) del.onclick = () => {
    if (!confirm(T('confirmDeleteSale'))) return;
    /* Une vente née d'une facture : la supprimer libère la facture, sinon elle
       resterait liée à une vente inexistante et sortirait du CA sans raison. */
    const linked = src.docId && db.docs.find((x) => x.id === src.docId && x.saleId === src.id);
    if (linked) { linked.saleId = ''; linked.u = Date.now(); }
    delRecord('sales', src.id);
    delRecord('moves', 'mv-' + src.id);
    saveDB(); d.remove(); render();
  };
  d.querySelector('#sOk').onclick = () => {
    let total = Math.round(+d.querySelector('#sAmount').value || 0);
    const qty = Math.max(1, Math.round(+d.querySelector('#sQty').value || 1));
    const pid = prodSel.value;
    const credit = d.querySelector('#sCredit').checked;
    const party = d.querySelector('#sParty').value.trim();
    if (total <= 0 && !pid) { d.querySelector('#sErr').textContent = T('errorAmount'); return; }
    if (credit && !party) { d.querySelector('#sErr').textContent = T('errorCredit'); return; }
    let product = null, cost = 0;
    if (pid) {
      const p = db.products.find((x) => x.id === pid);
      if (p) {
        const back = src && src.pid === pid ? src.qty : 0;
        const q = qtyOf(p) + back;
        if (q < qty) { d.querySelector('#sErr').textContent = T('errorStock') + ' ' + q + '.'; return; }
        product = p.name; cost = qty * p.buy;
        if (!total) total = qty * p.sell;
      }
    } else {
      /* Sans prix d'achat à l'écran, on garde le coût déjà connu de la vente. */
      cost = isStaff() ? Math.max(0, Number(src && src.cost) || 0) : Math.max(0, Math.round(+d.querySelector('#sCost').value || 0));
    }
    const costKnown = costKnownOf(cost);
    /* L'acompte saisi à la vente est ce que le client paie tout de suite ; le
       reste devient une dette, et les versements suivants s'ajoutent à part. */
    const depRaw = d.querySelector('#sDeposit').value.trim();
    const deposit = credit ? Math.max(0, Math.round(+depRaw || 0)) : total;
    if (credit && deposit > Math.max(0, total - (src ? paysOf(src) : 0))) {
      d.querySelector('#sErr').textContent = T('errorOverpay'); return;
    }
    const now = Date.now();
    const sid = src ? src.id : uid();
    const sale = src || { id: sid, date: todayISO(), paid: 0 };
    sale.total = total;
    sale.method = d.querySelector('#sMethod').value;
    /* Qui a vendu : un simple nom, retenu sur cet appareil pour ne pas le
       retaper à chaque vente. Vide = vente non attribuée. */
    sale.by = String(d.querySelector('#sBy').value || '').trim().slice(0, 40);
    try {
      if (sale.by) localStorage.setItem(SELLER_KEY, sale.by);
    } catch {
      /* sans stockage, le nom n'est simplement pas retenu */
    }
    sale.party = party;
    sale.pid = pid || '';
    sale.product = product;
    sale.qty = product ? qty : 0;
    sale.cost = cost;
    sale.costKnown = costKnown;
    sale.delivered = d.querySelector('#sDeliv').checked;
    sale.u = now;
    sale.paid = deposit;
    if (!src) db.sales.push(sale);
    if (pid) {
      const move = (db.moves || []).find((m) => m.id === 'mv-' + sid);
      if (move) { move.pid = pid; move.delta = -qty; move.u = now; } else db.moves.push({ id: 'mv-' + sid, pid, delta: -qty, u: now });
    } else if ((db.moves || []).some((m) => m.id === 'mv-' + sid)) {
      delRecord('moves', 'mv-' + sid);
    }
    if (party) {
      const phone = d.querySelector('#sPhone').value.trim();
      const address = d.querySelector('#sAddress').value.trim();
      const found = db.parties.find((x) => x.name.toLowerCase() === party.toLowerCase());
      if (found) {
        if (phone) found.phone = phone;
        if (address) found.address = address;
        found.u = now;
      } else {
        db.parties.push({ id: uid(), name: party, phone, address, u: now });
      }
    }
    logAct(src ? 'saleEdit' : 'sale', [sale.product, party].filter(Boolean).join(' · ') || T('sale'), total);
    saveDB(); d.remove(); render(); if (!src) saleDone(sale);
  };
}
const EXPENSE_LABELS = ['Transport', 'Loyer', 'Électricité', 'Salaire', 'Marchandise', 'Autre'];
function expenseModal(id) {
  /* Les dépenses et les achats fournisseurs sont réservés au patron : ce qui
     entre dans la boutique, ce qui en sort et à quel prix. */
  if (isStaff()) return;
  const src = id ? db.expenses.find((x) => x.id === id) : null;
  const labels = [...new Set([...EXPENSE_LABELS, ...(src && !EXPENSE_LABELS.includes(src.label) ? [src.label] : [])])];
  const linked = src ? db.debts.find((x) => x.expenseId === src.id) : null;
  const d = modal(`<h2>${src ? T('editExpense') : T('expense')}</h2>
    <label>${T('amount')}</label><input id="eAmt" inputmode="numeric" value="${src ? esc(src.amount) : ''}">
    <label>${T('reason')}</label><select id="eLabel">${labels.map((l) => `<option ${src && src.label === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <label>${T('method')}</label><select id="eMethod">${methodOptions(src ? src.method : 'Espèces')}</select>
    <label>${T('note')}</label><input id="eNote" placeholder="${T('noteHint')}" value="${src ? esc(src.note || '') : ''}">
    <div id="eDelivBox" style="display:none">
      ${src ? '' : `<label>${T('supplier')}</label><input id="eSup" placeholder="Grossiste Adjamé">
      <label>${T('phone')}</label><input id="eSupPhone" inputmode="tel" placeholder="+225 07 00 00 00 00">
      <label>${T('address')}</label><input id="eSupAddress" placeholder="Adjamé, marché">
      <label>${T('method')}</label><select id="eMode"><option value="cash">${T('cashPaid')}</option><option value="partial">${T('partial')}</option><option value="credit">${T('onCredit')}</option></select>
      <div id="ePaidBox" style="display:none"><label>${T('alreadyPaid')}</label><input id="ePaid" inputmode="numeric" placeholder="0"></div>`}
      <label style="display:flex;gap:10px;align-items:center;margin-top:14px"><input type="checkbox" id="eDeliv" ${src && src.delivered === false ? '' : 'checked'} style="width:auto"><span>${T('deliveredGoods')}</span></label>
      <p class="hint">${src ? T('supplierLockedHint') : T('delivHint')}</p>
    </div>
    <button class="btn" id="eOk">${src ? T('saveChanges') : T('saveExpense')}</button>
    <button class="btn out" id="eNo">${T('cancel')}</button>${src ? `<button class="btn out" id="eDel" style="color:#b91c1c;border-color:#b91c1c">${T('deleteExpense')}</button>` : ''}<p class="err" id="eErr"></p>`);
  d.querySelector('#eNo').onclick = () => d.remove();
  const eLabel = d.querySelector('#eLabel');
  const eBox = d.querySelector('#eDelivBox');
  const syncDeliv = () => { eBox.style.display = eLabel.value === 'Marchandise' ? 'block' : 'none'; };
  eLabel.onchange = syncDeliv;
  syncDeliv();
  const eMode = d.querySelector('#eMode');
  if (eMode) {
    const ePaidBox = d.querySelector('#ePaidBox');
    const syncMode = () => { ePaidBox.style.display = eMode.value === 'partial' ? 'block' : 'none'; };
    eMode.onchange = syncMode;
    syncMode();
  }
  const del = d.querySelector('#eDel');
  if (del) del.onclick = () => {
    if (!confirm(linked && (Number(linked.paid) || 0) > 0 ? T('confirmDeleteExpensePaid') : T('confirmDeleteExpense'))) return;
    delRecord('expenses', src.id);
    if (linked) delRecord('debts', linked.id);
    saveDB(); d.remove(); render();
  };
  d.querySelector('#eOk').onclick = () => {
    const amount = Math.round(+d.querySelector('#eAmt').value || 0);
    if (!amount) { d.querySelector('#eErr').textContent = T('errorAmount'); return; }
    const label = eLabel.value;
    const note = d.querySelector('#eNote').value.trim();
    const method = d.querySelector('#eMethod').value;
    const delivered = label === 'Marchandise' ? d.querySelector('#eDeliv').checked : undefined;
    if (src) {
      /* Une dette déjà payée ne peut pas disparaître sous prétexte qu'on change
         la catégorie : on refuse, sinon l'argent versé au fournisseur se perd. */
      if (linked && label !== 'Marchandise' && (Number(linked.paid) || 0) > 0) {
        d.querySelector('#eErr').textContent = T('errorLinkedPaid');
        return;
      }
      src.amount = amount; src.label = label; src.note = note; src.method = method;
      if (label === 'Marchandise') src.delivered = delivered; else delete src.delivered;
      src.u = Date.now();
      if (linked && label !== 'Marchandise') {
        /* Sans cette suppression, la dette fournisseur survivrait à l'achat. */
        delRecord('debts', linked.id);
      } else if (linked) {
        linked.amount = amount;
        linked.paid = Math.min(Number(linked.paid) || 0, amount);
        linked.delivered = delivered;
        linked.u = Date.now();
      }
      logAct('expenseEdit', label, amount);
      saveDB(); d.remove(); render(); return;
    }
    const supplier = label === 'Marchandise' ? d.querySelector('#eSup').value.trim() : '';
    if (label === 'Marchandise' && !supplier) { d.querySelector('#eErr').textContent = T('errorSupplier'); return; }
    const exId = uid();
    let paid = amount;
    if (label === 'Marchandise') {
      const mode = d.querySelector('#eMode').value;
      if (mode === 'credit') paid = 0;
      if (mode === 'partial') paid = Math.max(0, Math.min(amount, Math.round(+d.querySelector('#ePaid').value || 0)));
    }
    db.expenses.push({ id: exId, date: todayISO(), amount, label, note, method, supplier, delivered: supplier ? undefined : delivered, u: Date.now() });
    if (supplier) {
      const found = db.suppliers.find((s) => s.name.toLowerCase() === supplier.toLowerCase());
      const phone = d.querySelector('#eSupPhone').value.trim();
      const address = d.querySelector('#eSupAddress').value.trim();
      if (found) { if (phone) found.phone = phone; if (address) found.address = address; found.u = Date.now(); } else db.suppliers.push({ id: uid(), name: supplier, phone, address, u: Date.now() });
      db.debts.push({ id: 'exd-' + exId, date: todayISO(), supplier, amount, paid, delivered, expenseId: exId, u: Date.now() });
    }
    logAct('expense', supplier || label, amount);
    saveDB(); d.remove(); render();
  };
}
function payModal(name) {
  const list = db.sales.filter((s) => (s.party || '—') === name && creditOf(s) > 0);
  const sum = list.reduce((a, s) => a + creditOf(s), 0);
  const nums = payNumbersLine();
  const phone = String((db.parties.find((p) => p.name === name) || {}).phone || '').trim();
  const d = modal(`<h2>${esc(name)}</h2><p>${T('owes')} ${money(sum)}</p>
    <label>${T('payReceived')}</label><input id="payAmt" inputmode="numeric" value="${sum}">
    ${nums ? `<p class="hint">${T('payByMobile')} : ${esc(nums)}</p>` : ''}
    <button class="btn" id="payOk">${T('savePayment')}</button>
    ${nums && phone ? `<button class="btn small whats" id="payWa">${T('requestPayment')}</button>` : ''}
    <button class="btn out" id="payNo">${T('cancel')}</button><p class="err" id="payErr"></p>`);
  const wa = d.querySelector('#payWa');
  if (wa) {
    wa.onclick = () => {
      const amount = Math.round(+d.querySelector('#payAmt').value || 0) || sum;
      waOpen(phone, `${name} : ${money(amount)} — ${db.shop || T('shop')}\n${T('payByMobile')} : ${nums}`);
    };
  }
  d.querySelector('#payNo').onclick = () => d.remove();
  d.querySelector('#payOk').onclick = () => {
    let amount = Math.round(+d.querySelector('#payAmt').value || 0);
    if (amount <= 0) { d.querySelector('#payErr').textContent = T('errorAmount'); return; }
    /* Le surplus n'a nulle part où aller : le refuser vaut mieux que le perdre. */
    if (amount > sum) { d.querySelector('#payErr').textContent = T('errorOverpay'); return; }
    const received = amount;
    for (const s of list) { if (!amount) break; const take = Math.min(amount, creditOf(s)); s.pays = s.pays || []; s.pays.push({ id: uid(), amount: take, u: Date.now() }); amount -= take; }
    logAct('pay', name, received);
    saveDB(); d.remove(); render();
  };
}
/* Objet vente dérivé d'une facture. Une facture déjà payée produit une vente
   soldée à la date du règlement ; sinon la vente part en crédit client le jour
   même. Le coût vient de la facture : 0 signifie « inconnu », pas « gratuit »,
   d'où le bénéfice affiché comme estimé. */
function saleFromInvoice(d, method) {
  const total = amountOf(d);
  const cost = Math.max(0, Number(d.cost) || 0);
  return {
    id: uid(), date: d.paidDate || todayISO(), total, paid: d.paidDate ? total : 0,
    method: method || '', party: d.party || '', pid: '', product: '', qty: 0,
    cost, costKnown: cost > 0, delivered: true, docId: d.id, u: Date.now(),
  };
}
/* Relance groupée : une facture à la fois, dans l'ordre des plus anciennes.
   Un seul onglet WhatsApp s'ouvre par clic, et chaque ligne se coche au fur et
   à mesure, ce qui évite de relancer deux fois le même client par erreur. */
function bulkRemindModal() {
  const list = remindQueue();
  const m = modal(`<h2>${T('bulkRemind')}</h2>
    <p class="hint">${T('bulkRemindHint').replace('[n]', remindDelay())}</p>
    ${list.length ? `<div id="brList">${list.map((d) => `<div class="row" data-br="${d.id}"><div>
      <div class="t">${esc(d.number)} · ${money(amountOf(d))}</div>
      <div class="s">${esc(d.party || '—')} · ${dayFR(d.date)} · ${remindLabel(d)}</div></div>
      <div class="right"><button class="btn small whats" data-brgo="${d.id}">${T('remind')}</button></div></div>`).join('')}</div>`
      : `<p class="empty">${T('bulkRemindNone')}</p>`}
    <button class="btn out" id="brClose">${T('close')}</button>`);
  m.querySelector('#brClose').onclick = () => m.remove();
  m.querySelectorAll('[data-brgo]').forEach((btn) => {
    btn.onclick = () => {
      const d = db.docs.find((x) => x.id === btn.dataset.brgo);
      if (!d) return;
      const phone = d.clientPhone || (db.parties.find((p) => p.name === d.party) || {}).phone || '';
      if (!waOpen(phone, invoiceReminderText(d))) return;
      d.remindedAt = todayISO();
      d.u = Date.now();
      logRemind({ docId: d.id, number: d.number, party: d.party || '', amount: amountOf(d), channel: 'wa', to: phone, ok: true });
      const row = m.querySelector(`[data-br="${d.id}"]`);
      if (row) row.innerHTML = `<div><div class="t">${esc(d.number)} · ${money(amountOf(d))}</div>
        <div class="s">${esc(d.party || '—')} · ${remindLabel(d)}</div></div>
        <div class="right"><span class="tag ok">✓</span></div>`;
      saveDB(); render();
    };
  });
}
/* Le moyen de paiement n'est jamais deviné : le commerce le choisit, comme dans
   le formulaire de vente ordinaire. */
function factureSaleModal(id) {
  const d = db.docs.find((x) => x.id === id);
  if (!d || d.kind !== 'FAC' || d.saleId) return;
  const total = amountOf(d);
  if (!total) return;
  const m = modal(`<h2>${T('createSale')}</h2>
    <p>${esc(d.number || '')} · ${money(total)}</p>
    <label>${T('method')}</label><select id="fsMethod">${methodOptions('Espèces')}</select>
    <p class="hint">${d.paidDate ? T('fsPaidHint') : T('fsUnpaidHint')}</p>
    <button class="btn" id="fsOk">${T('createSale')}</button>
    <button class="btn out" id="fsNo">${T('cancel')}</button>`);
  m.querySelector('#fsNo').onclick = () => m.remove();
  m.querySelector('#fsOk').onclick = () => {
    const sale = saleFromInvoice(d, m.querySelector('#fsMethod').value);
    db.sales.push(sale);
    d.saleId = sale.id;
    d.u = Date.now();
    m.remove(); saveDB(); tab = 'docs'; render();
  };
}
/* Relance d'une facture impayée. Texte fixe et courtois : on rappelle la
   facture sans reproche et on laisse une porte de sortie (paiement déjà fait,
   question à poser). Le commerce le relit dans WhatsApp avant l'envoi. */
const INV_REMIND = {
  fr: `Bonjour [Nom du Client],\n\nJ'espère que vous allez bien.\nSauf erreur de notre part, la facture [Numéro Facture] du [Date Facture], d'un montant de [Montant], reste à régler.\n\nMerci de bien vouloir procéder au règlement. Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\nNous restons à votre disposition pour toute question.\n\nBien cordialement,\n[Nom de la Boutique]`,
  en: `Hello [Nom du Client],\n\nI hope you are well.\nUnless we are mistaken, invoice [Numéro Facture] dated [Date Facture], for [Montant], is still unpaid.\n\nPlease let us know once the payment is made. If you have already paid, please disregard this message.\n\nWe remain available for any question.\n\nKind regards,\n[Nom de la Boutique]`,
  ar: `مرحباً [Nom du Client]،\n\nنأمل أن تكون بخير.\nإن لم نكن مخطئين، فإن الفاتورة [Numéro Facture] بتاريخ [Date Facture] بمبلغ [Montant] لا تزال غير مسددة.\n\nنرجو التكرم بتسديدها. إذا كان الدفع قد تم، يرجى تجاهل هذه الرسالة.\n\nنبقى رهن إشارتكم لأي استفسار.\n\nمع خالص التحية،\n[Nom de la Boutique]`,
};
/* Le commerce peut réécrire ce texte dans Réglages : la version enregistrée
   pour la langue courante l'emporte, un texte vide revient au modèle par défaut. */
const invReminderTpl = () => ((db.settings.invReminder || {})[lang()] || '').trim() || INV_REMIND[lang()] || INV_REMIND.fr;
function invoiceReminderText(d) {
  const shop = db.shop || T('shop');
  const phone = String((db.settings && db.settings.phone) || (me && me.phone) || '').trim();
  const tpl = invReminderTpl();
  const nums = payNumbersLine();
  const text = tpl.replaceAll('[Nom du Client]', d.party || T('client'))
    .replaceAll('[Nom de la Boutique]', phone ? `${shop}\n${phone}` : shop)
    .replaceAll('[Numéro Facture]', d.number || '—')
    .replaceAll('[Date Facture]', dayFR(d.date))
    .replaceAll('[Montant]', money(amountOf(d)));
  /* Le client qui reçoit une relance doit savoir comment payer sans appeler. */
  return nums ? `${text}\n${T('payByMobile')} : ${nums}` : text;
}
/* Âge de la dernière relance, en clair : « relancé il y a 3 jours ». Sert à
   éviter deux rappels dans la même semaine et à repérer les factures qu'on a
   oublié de relancer. */
function remindLabel(d) {
  if (!d || !d.remindedAt) return T('neverReminded');
  const n = daysSince(d.remindedAt);
  if (!(n > 0)) return T('remindedToday');
  if (n === 1) return T('remindedYesterday');
  return T('remindedTpl').replace('[n]', n);
}
/* Factures à relancer : jamais relancées, ou dont la dernière relance a plus
   d'une semaine. C'est la file de la relance groupée. */
/* Délai de relance des factures, réglable : entre deux rappels d'une même
   facture, et avant le premier rappel d'une facture fraîche. */
const remindDelay = () => Math.max(1, Math.round(Number(db.settings.invRemindDays) || 7));
function remindQueue() {
  return unpaidInvoices()
    .filter((d) => daysSince(d.date) >= remindDelay()
      && (!d.remindedAt || daysSince(d.remindedAt) >= remindDelay()))
    .sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1));
}
/* Factures oubliées : impayées depuis plus d'une semaine et sans relance
   récente. L'alerte tombe dès qu'elles sont relancées, payées ou converties. */
const forgottenInvoices = () => remindQueue();
/* Factures qui partent par e-mail à l'ouverture : en retard selon le délai
   choisi, pas relancées récemment, et dont le client a une adresse e-mail. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/* Même règle que le serveur : une adresse qu'il refuserait ne doit pas être
   comptée dans la file automatique. */
const isEmail = (v) => { const t = String(v || '').trim(); return t.length <= 190 && EMAIL_RE.test(t); };
function autoRemindList() {
  const delay = remindDelay();
  return unpaidInvoices().filter((d) => isEmail(d.clientEmail)
    && daysSince(d.date) >= delay && (!d.remindedAt || daysSince(d.remindedAt) >= delay));
}
/* Relance automatique : une fois par jour, à l'ouverture, et seulement si le
   commerce l'a activée. Le serveur seul peut envoyer un e-mail ; son refus ou
   une coupure laissent les factures intactes plutôt que de les marquer à tort. */
let autoRemindBusy = false;
/* L'envoi d'e-mails dépend d'une clé secrète du serveur : le client ne peut pas
   la voir, il demande donc au serveur s'il sait envoyer. null = pas encore su. */
let mailReady = null;
const mailFlagHTML = () => (mailReady === false
  ? `<p class="hint"><span class="tag bad">${T('mailMissing')}</span> ${T('mailMissingHint')}</p>` : '');
async function loadMailStatus() {
  const r = await api('/api/mail');
  mailReady = r.ok && r.data ? !!r.data.mail : null;
  /* Les réglages ouverts se mettent à jour sur place : rouvrir la fenêtre
     effacerait ce que le commerce est en train de saisir. */
  const box = document.getElementById('acMailFlag');
  if (box) box.innerHTML = mailFlagHTML();
  render();
}
async function autoRemind() {
  const s = db.settings || {};
  if (!s.autoRemind || !me || !navigator.onLine || autoRemindBusy) return;
  if (s.autoRemindDay === todayISO()) return;
  const list = autoRemindList();
  if (!list.length) { s.autoRemindDay = todayISO(); saveDB(false); return; }
  autoRemindBusy = true;
  /* La facture part en pièce jointe : le client n'a pas à la redemander. Si le
     PDF ne se génère pas, le rappel part quand même, en texte seul. */
  const payload = [];
  for (const d of list) {
    const item = {
      id: d.id, to: String(d.clientEmail).trim(),
      subject: `${T('invoice')} ${d.number}`, text: invoiceReminderText(d),
    };
    try {
      const file = await docFile(d);
      item.pdf = await fileToBase64(file);
      item.filename = file.name;
    } catch {}
    payload.push(item);
  }
  const r = await api('/api/remind', 'POST', { list: payload });
  autoRemindBusy = false;
  if (!r.ok) return;
  const sent = r.data && Array.isArray(r.data.sent) ? r.data.sent : [];
  const okIds = new Set(sent.map(String));
  list.forEach((d) => logRemind({
    docId: d.id, number: d.number, party: d.party || '', amount: amountOf(d),
    channel: 'email', to: String(d.clientEmail).trim(), ok: okIds.has(d.id),
  }));
  sent.forEach((id) => {
    const d = db.docs.find((x) => x.id === id);
    if (d) { d.remindedAt = todayISO(); d.u = Date.now(); }
  });
  s.autoRemindDay = todayISO();
  s.autoRemindInfo = { date: todayISO(), sent: sent.length };
  saveDB();
  render();
}
/* Bilan des relances d'une période. Une facture relancée peut être réglée
   ensuite (paidDate) ou par sa vente quand elle a été convertie. */
function remindStats(p, monthKey) {
  /* Le rapport mensuel passe un mois AAAA-MM, comme figures(). */
  const inP = monthKey ? (date) => String(date || '').slice(0, 7) === monthKey : (date) => inPeriod(date, p);
  const paidDateOf = (d) => {
    if (d.paidDate) return d.paidDate;
    if (!d.saleId) return '';
    const s = db.sales.find((x) => x.id === d.saleId);
    return s && creditOf(s) <= 0 ? s.date : '';
  };
  const list = (db.docs || []).filter((d) => d.kind === 'FAC' && d.remindedAt && inP(d.remindedAt));
  const paid = list.filter((d) => { const on = paidDateOf(d); return on && on >= d.remindedAt; });
  /* Un règlement antérieur à la relance n'est ni « payé après relance » ni
     « encore impayé » : les deux lignes ne s'additionnent pas forcément. */
  const still = list.filter((d) => !paidDateOf(d));
  const sum = (arr) => arr.reduce((a, d) => a + amountOf(d), 0);
  const amount = sum(list);
  const paidAmount = sum(paid);
  return {
    count: list.length, amount,
    paid: paid.length, paidAmount,
    unpaid: still.length, unpaidAmount: sum(still),
    rate: amount ? Math.round((paidAmount / amount) * 100) : 0,
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
/* Renvoie faux quand le navigateur bloque la fenêtre : rien n'est parti, donc
   la facture ne doit pas être marquée relancée. */
function waOpen(phone, text) {
  const clean = (phone || '').replace(/[^\d+]/g, '').replace('+', '');
  return !!window.open(clean ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

/* ---------------- impression ---------------- */
function docHTML(d, format) {
  const s = db.settings || {};
  const place = [s.address, s.district, s.city, countryName(s.country || 'CI')].filter(Boolean).join(' · ');
  const contact = [me && me.phone, me && me.email].filter(Boolean).map((x) => esc(x)).join(' · ');
  const title = d.kind === 'DEV' ? T('quote') : T('invoice');
  const rate = Math.max(0, Number(d.vat) || 0);
  const lines = d.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${esc(l.qty)}</td><td>${money(+l.price)}</td><td>${money((+l.qty || 1) * +l.price)}</td></tr>`).join('');
  if (format === 'ticket') {
    return `${s.logo ? `<img class="docLogo" src="${esc(s.logo)}" alt="">` : ''}<h2>${db.shop || T('app')}</h2>
      <div class="small">${title} ${esc(d.number)} · ${dayFR(d.date)}</div>
      <div class="small">${T('client')} : ${esc(d.party || '—')}</div>
      ${d.clientPhone ? `<div class="small">${T('phone')} : ${esc(d.clientPhone)}</div>` : ''}
      <table><thead><tr><th>${T('line')}</th><th>${T('quantity')}</th><th>${T('sellPrice')}</th><th>${T('total')}</th></tr></thead><tbody>${lines}</tbody></table>
      <div class="tot"><span>${T('ht')}</span><span>${money(d.total)}</span></div>
      ${rate ? `<div class="tot"><span>${T('vatShort')} ${rate} %</span><span>${money(vatOf(d))}</span></div>` : ''}
      <div class="tot"><span>${T('ttc')}</span><span>${money(amountOf(d))}</span></div>
      <p class="small">${T('thanks')}</p>`;
  }
  return `<div class="docSheet">
    <div class="docBar"></div>
    <div class="docHead">
      <div class="docTitleWrap">
        <div class="docTitle">${title}</div>
        <div class="docNumber">N° ${esc(d.number)}</div>
      </div>
      <div class="docMeta">
        <div>${T('docNo')} : ${esc(d.number)}</div>
        <div>${T('docDate')} : ${dayFR(d.date)}</div>
      </div>
    </div>
    <div class="docBoxes">
      <div class="docBox">${s.logo ? `<img class="docLogo" src="${esc(s.logo)}" alt="">` : ''}<b>${esc(db.shop || T('app'))}</b>
        ${s.companyForm ? `<div>${esc(s.companyForm)}</div>` : ''}
        ${place ? `<div>${esc(place)}</div>` : ''}
        ${contact ? `<div>${esc(contact)}</div>` : ''}
      </div>
      <div class="docBox"><b>${T('client')}</b>
        <div>${esc(d.party || '—')}</div>
        ${d.clientPhone ? `<div>${esc(d.clientPhone)}</div>` : ''}
        ${d.clientEmail ? `<div>${esc(d.clientEmail)}</div>` : ''}
        ${d.clientAddress ? `<div>${esc(d.clientAddress)}</div>` : ''}
      </div>
    </div>
    <table class="docTable"><thead><tr><th>${T('line')}</th><th>${T('quantity')}</th><th>${T('unitPriceHT')}</th><th>${T('ht')}</th></tr></thead><tbody>${lines}</tbody></table>
    <div class="docTotals">
      ${rate ? `<div>${T('vatShort')} (${rate} %) : ${money(vatOf(d))}</div>` : ''}
      <div>${T('ttc')} : ${money(amountOf(d))}</div>
    </div>
    <div class="docNotes">
      <div>${T('docNote1')}</div>
      <div>${T('docNote2')}</div>
    </div>
    <div class="docBar docBarBottom"></div>
  </div>`;
}
function printFormat(id, format) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  const area = document.getElementById('printArea');
  area.className = format === 'ticket' ? 'ticket' : 'a4';
  area.innerHTML = docHTML(d, format);
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
  const title = (d.kind === 'DEV' ? T('quote') : T('invoice')).toUpperCase();
  const rate = Math.max(0, Number(d.vat) || 0);
  const pm = (n) => money(n).replace(/[\u202f\u00a0]/g, ' ');
  const bar = (yy) => { pdf.setFillColor(17, 17, 17); pdf.rect(10, yy, 190, 5, 'F'); };
  bar(10);
  pdf.setTextColor(17, 17, 17);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(30);
  pdf.text(title, 14, 33);
  pdf.setFontSize(16);
  pdf.text(`N° ${d.number}`, 14, 44);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`${T('docNo')} : ${d.number}`, 196, 26, { align: 'right' });
  pdf.text(`${T('docDate')} : ${dayFR(d.date)}`, 196, 31, { align: 'right' });
  const boxTop = 58; const boxH = 34; const boxW = 88;
  pdf.setDrawColor(17, 17, 17); pdf.setLineWidth(0.4);
  pdf.roundedRect(12, boxTop, boxW, boxH, 3, 3);
  pdf.roundedRect(110, boxTop, boxW, boxH, 3, 3);
  let y = boxTop + 7;
  if (s.logo) {
    const dim = await imgSize(s.logo);
    const w = 18; const h = Math.min(11, w * dim.h / dim.w);
    try { pdf.addImage(s.logo, s.logo.indexOf('image/png') === 0 ? 'PNG' : 'JPEG', 16, y - 4, w, h); y += h + 1; } catch {}
  }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
  pdf.text(pdf.splitTextToSize(db.shop || T('app'), boxW - 10), 16, y); y += 5;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
  [s.companyForm, place, contact].filter(Boolean).forEach((line) => {
    pdf.splitTextToSize(String(line), boxW - 10).forEach((t) => { pdf.text(t, 16, y); y += 4; });
  });
  let cy = boxTop + 9;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
  pdf.text(T('client'), 114, cy); cy += 6;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
  [d.party || '—', d.clientPhone, d.clientEmail, d.clientAddress].filter(Boolean).forEach((line) => {
    pdf.splitTextToSize(String(line), boxW - 10).forEach((t) => { pdf.text(t, 114, cy); cy += 4.4; });
  });
  const cols = [92, 22, 36, 32];
  const x0 = 14;
  const xs = [x0, x0 + cols[0], x0 + cols[0] + cols[1], x0 + cols[0] + cols[1] + cols[2]];
  const drawHead = (yy) => {
    const hh = 9;
    pdf.setDrawColor(17, 17, 17); pdf.setLineWidth(0.4);
    pdf.rect(x0, yy, 182, hh);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    [T('line'), T('quantity'), T('unitPriceHT'), T('ht')].forEach((t, i) => {
      if (i > 0) pdf.line(xs[i], yy, xs[i], yy + hh);
      const tx = i >= 2 ? xs[i] + cols[i] - 3 : xs[i] + 3;
      pdf.text(String(t), tx, yy + 6, { align: i >= 2 ? 'right' : 'left' });
    });
    return yy + hh;
  };
  y = drawHead(boxTop + boxH + 12);
  for (const l of d.lines) {
    const label = pdf.splitTextToSize(String(l.label || ''), cols[0] - 6);
    const height = Math.max(10, label.length * 4.5 + 5);
    if (y + height > 248) { pdf.addPage(); y = drawHead(18); }
    pdf.rect(x0, y, 182, height);
    for (let i = 1; i < 4; i += 1) pdf.line(xs[i], y, xs[i], y + height);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    pdf.text(label, xs[0] + 3, y + 6);
    pdf.text(String(l.qty), xs[1] + cols[1] / 2, y + 6, { align: 'center' });
    pdf.text(pm(+l.price), xs[2] + cols[2] - 3, y + 6, { align: 'right' });
    pdf.text(pm((+l.qty || 1) * +l.price), xs[3] + cols[3] - 3, y + 6, { align: 'right' });
    y += height;
  }
  let ty = y + 10;
  const tw = 84; const th = rate ? 24 : 18;
  if (ty + th > 255) { pdf.addPage(); ty = 30; }
  pdf.setDrawColor(17, 17, 17); pdf.setLineWidth(0.4);
  pdf.roundedRect(196 - tw, ty, tw, th, 3, 3);
  let py = ty + 8;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
  if (rate) { pdf.text(`${T('vatShort')} (${rate} %) : ${pm(vatOf(d))}`, 191, py, { align: 'right' }); py += 7; }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11.5);
  pdf.text(`${T('ttc')} : ${pm(amountOf(d))}`, 191, py + 1, { align: 'right' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(90, 90, 90);
  pdf.text(pdf.splitTextToSize(T('docNote1'), 80), 14, 272);
  pdf.text(pdf.splitTextToSize(T('docNote2'), 80), 196, 272, { align: 'right' });
  bar(288);
  return pdf.output('blob');
}
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(bin);
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
    const to = (d.clientEmail || '').trim();
    if (isEmail(to)) {
      const r = await api('/api/send-doc', 'POST', { to, subject, text: body, filename: file.name, pdf: await fileToBase64(file) });
      if (r.ok && r.data && r.data.mail) { alert(T('mailSent')); return; }
      if (r.ok && r.data && r.data.error === 'limit') { alert(T('mailLimit')); return; }
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: d.number, text: body });
      return;
    }
    location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  } catch {}
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
  if (act === 'editSale') saleModal(b.dataset.id);
  if (act === 'editExpense') expenseModal(b.dataset.id);
  if (act === 'hist') { tab = 'hist'; histShown = HIST_PAGE; render(); }
  if (act === 'histPeriod') { histPeriod = b.dataset.p; histShown = HIST_PAGE; render(); }
  if (act === 'histMore') {
    const list = histSales();
    const start = Math.min(histShown, list.length);
    if (start < list.length) {
      histShown = Math.min(start + HIST_PAGE, list.length);
      const wrap = document.getElementById('histMoreWrap');
      if (wrap) {
        wrap.insertAdjacentHTML('beforebegin', histRows(list.slice(start, histShown)));
        wrap.innerHTML = histShown < list.length ? `<button class="btn out" data-act="histMore">${T('showMore')} · ${histShown} / ${list.length}</button>` : '';
      }
    }
  }
  if (act === 'back') { tab = 'vendre'; render(); }
  if (act === 'side') { side = b.dataset.s; render(); }
  if (act === 'period') { period = b.dataset.p; render(); }
  if (act === 'expense') expenseModal();
  if (act === 'withdraw') {
    if (isStaff()) return;
    const d = modal(`<h2>${T('withdraw')}</h2><p class="hint">${T('profitHint')}</p>
      <label>${T('amount')}</label><input id="wAmt" inputmode="numeric">
      <button class="btn" id="wOk">${T('saveWithdraw')}</button><button class="btn out" id="wNo">${T('cancel')}</button><p class="err" id="wErr"></p>`);
    d.querySelector('#wNo').onclick = () => d.remove();
    d.querySelector('#wOk').onclick = () => {
      const amount = Math.round(+d.querySelector('#wAmt').value || 0);
      if (!amount) { d.querySelector('#wErr').textContent = T('errorAmount'); return; }
      db.withdrawals.push({ id: uid(), date: todayISO(), amount, u: Date.now() });
      logAct('withdraw', T('withdraw'), amount);
      saveDB(); d.remove(); render();
    };
  }
  if (act === 'addProduct') {
    const name = document.getElementById('pName').value.trim();
    if (!name) return;
    const id = uid();
    const qty = Math.round(+document.getElementById('pQty').value || 0);
    const now = Date.now();
    /* Sans champ prix d'achat (vendeur), l'article part à 0 : le patron le
       complètera, et le bénéfice reste marqué « estimé » en attendant. */
    const buyField = document.getElementById('pBuy');
    db.products.push({ id, name, buy: buyField ? Math.round(+buyField.value || 0) : 0, sell: Math.round(+document.getElementById('pSell').value || 0), qty, alert: Math.round(+document.getElementById('pAlert').value || 0), u: now });
    db.moves.push({ id: 'mv-' + id, pid: id, delta: qty, u: now });
    logAct('product', name, 0);
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
    if (!canDeleteItems()) { alert(T('permDenied')); return; }
    if (!confirm(T('confirmDelete'))) return;
    db.products = db.products.filter((x) => x.id !== p.id);
    db.moves = (db.moves || []).filter((m) => m.pid !== p.id);
    logAct('productDel', p.name, 0);
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
    logAct('purchase', supplier, amount);
    saveDB(); render();
  }
  if (act === 'payDebt') payDebtModal(b.dataset.id);
  if (act === 'delDebt') {
    const dbt = db.debts.find((x) => x.id === b.dataset.id);
    if (!dbt || !confirm(dbt.expenseId ? T('confirmDeletePurchaseExpense') : T('confirmDeletePurchase'))) return;
    delRecord('debts', dbt.id);
    (db.moves || []).filter((m) => m.id === 'mv-' + dbt.id).forEach((m) => delRecord('moves', m.id));
    if (dbt.expenseId) delRecord('expenses', dbt.expenseId);
    const openModal = document.querySelector('.modal');
    if (openModal) openModal.remove();
    saveDB(); render();
  }
  if (act === 'deliverDebt') {
    const d = db.debts.find((x) => x.id === b.dataset.id);
    if (d && d.delivered === false) {
      d.delivered = true; d.u = Date.now();
      if (d.pid && Number(d.qty) > 0 && !d.stocked) {
        db.moves.push({ id: 'mv-' + d.id, pid: d.pid, delta: Number(d.qty), u: Date.now() });
        d.stocked = true;
      }
      if (d.expenseId) { const e = db.expenses.find((x) => x.id === d.expenseId); if (e) e.delivered = true; }
      saveDB(); render();
    }
  }
  if (act === 'pay') payModal(b.dataset.name);
  if (act === 'wa') {
    const name = b.dataset.name;
    waOpen((db.parties.find((p) => p.name === name) || {}).phone, reminderText(name));
  }
  if (act === 'newDoc') { draft = { party: '', phone: '', email: '', address: '', vat: db.settings.vat || 0, cost: 0, lines: [{ label: '', qty: 1, price: 0 }] }; render(); }
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
    const fields = { party: draft.party.trim(), clientPhone: (draft.phone || '').trim(), clientEmail: (draft.email || '').trim().toLowerCase(), clientAddress: (draft.address || '').trim(), vat: rate, cost: Math.max(0, Math.round(+draft.cost || 0)), lines, total, u: Date.now() };
    const edited = draft.id ? db.docs.find((x) => x.id === draft.id) : null;
    if (edited) Object.assign(edited, fields);
    else db.docs.push({ id: uid(), kind: 'DEV', number: num('DEV'), date: todayISO(), status: 'devis', ...fields });
    draft = null; saveDB(); tab = 'docs'; render();
  }
  if (act === 'editDoc') {
    const doc = db.docs.find((x) => x.id === b.dataset.id);
    if (!doc) return;
    draft = { id: doc.id, kind: doc.kind, party: doc.party || '', phone: doc.clientPhone || '', email: doc.clientEmail || '', address: doc.clientAddress || '', vat: doc.vat || 0, cost: doc.cost || 0, lines: (doc.lines || [{ label: '', qty: 1, price: 0 }]).map((l) => ({ ...l })) };
    tab = 'docs'; render();
  }
  if (act === 'delDoc') {
    const doc = db.docs.find((x) => x.id === b.dataset.id);
    if (!doc || !confirm(T('confirmDeleteDoc'))) return;
    /* La facture emportait sa vente : la laisser seule fausserait le CA et le
       bénéfice, avec une vente sans justificatif ni transfert de stock. */
    if (doc.saleId) {
      delRecord('sales', doc.saleId);
      delRecord('moves', 'mv-' + doc.saleId);
    }
    delRecord('docs', doc.id);
    draft = null; saveDB(); tab = 'docs'; render();
  }
  if (act === 'toFacture') {
    const d = db.docs.find((x) => x.id === b.dataset.id);
    if (d && d.kind === 'DEV') { d.kind = 'FAC'; d.number = num('FAC'); d.paidDate = ''; d.u = Date.now(); saveDB(); render(); }
  }
  /* Une facture ne compte dans le chiffre d'affaires qu'une fois marquée payée,
     et à la date du règlement. Le bouton permet de revenir en arrière. */
  if (act === 'toggleInvoicePaid') {
    const d = db.docs.find((x) => x.id === b.dataset.id);
    if (d && d.kind === 'FAC') {
      d.paidDate = d.paidDate ? '' : todayISO();
      d.u = Date.now();
      saveDB(); tab = 'docs'; render();
    }
  }
  /* Facture → vente : la vente devient la seule source du chiffre d'affaires,
     ce qui supprime le risque de compter la facture deux fois. Une facture déjà
     payée produit une vente soldée à sa date de règlement ; sinon la vente part
     en crédit client à la date du jour. */
  if (act === 'factureToSale') factureSaleModal(b.dataset.id);
  if (act === 'report') reportModal();
  if (act === 'journal') journalModal();
  if (act === 'print') previewDoc(b.dataset.id);
  if (act === 'waPdf') shareDocPDF(b.dataset.id);
  if (act === 'waSale') waSale(b.dataset.id);
  if (act === 'receiptPdf') shareReceiptPDF(b.dataset.id);
  if (act === 'deliverSale') {
    const s = db.sales.find((x) => x.id === b.dataset.id);
    if (s) { s.delivered = true; s.u = Date.now(); saveDB(); render(); }
  }
  if (act === 'deliverExpense') {
    const e = db.expenses.find((x) => x.id === b.dataset.id);
    if (e) { e.delivered = true; e.u = Date.now(); saveDB(); render(); }
  }
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
  /* Relance d'une facture impayée : message courtois qui rappelle la facture. */
  if (act === 'bulkRemind') bulkRemindModal();
  if (act === 'exportLog') downloadMailLog();
  if (act === 'resendRemind') resendReminder(b.dataset.log);
  if (act === 'retryFailed') retryFailedReminders();
  if (act === 'logFilter') {
    const v = b.dataset.v;
    if (b.dataset.k === 'channel') logChannel = v;
    else if (b.dataset.k === 'result') logResult = v;
    else logPeriod = v;
    saveLogFilters();
    render();
  }
  if (act === 'waDocRemind') {
    const d = db.docs.find((x) => x.id === b.dataset.id);
    if (!d) return;
    /* Relancer deux fois la même semaine agace un client qui a peut-être déjà
       payé : on prévient, sans interdire. */
    if (d.remindedAt && daysSince(d.remindedAt) < remindDelay() && !confirm(T('confirmRemindAgain').replace('[n]', remindDelay()))) return;
    const phone = d.clientPhone || (db.parties.find((p) => p.name === d.party) || {}).phone || '';
    if (!waOpen(phone, invoiceReminderText(d))) return;
    d.remindedAt = todayISO();
    d.u = Date.now();
    logRemind({ docId: d.id, number: d.number, party: d.party || '', amount: amountOf(d), channel: 'wa', to: phone, ok: true });
    saveDB(); tab = 'docs'; render();
  }
  if (act === 'mailDoc') emailDocPDF(b.dataset.id);
  if (act === 'dlPdf') downloadDocPDF(b.dataset.id);
  if (act === 'openSettings') settingsModal();
  if (act === 'addEmail') {
    const box = document.getElementById('acAddEmail');
    const email = (box ? box.value : '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { alert(T('badEmail')); return; }
    api('/api/email', 'POST', { email }).then((r) => {
      if (!r.ok) { alert(r.data && r.data.error === 'exists' ? T('emailTaken') : T('badEmail')); return; }
      me = r.data.user;
      alert(T('emailAdded'));
      render();
    });
  }
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
  const em = document.getElementById('dEmail');
  if (em) draft.email = em.value;
  const vt = document.getElementById('dVat');
  if (vt) draft.vat = Math.max(0, +vt.value || 0);
  const dc = document.getElementById('dCost');
  if (dc) draft.cost = Math.max(0, +dc.value || 0);
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
/* ---------------- Versions enregistrées ---------------- */
/* Le serveur garde les dix derniers états : une mauvaise manipulation ou une
   synchronisation malheureuse reste réparable, sans dépendre d'un export. */
async function versionsModal() {
  const d = modal(`<div class="sheetHead"><h2>${T('versions')}</h2><button type="button" class="sheetClose" id="vClose" aria-label="${T('close')}">✕</button></div>
    <div id="vList"><p class="hint">…</p></div>`);
  d.querySelector('#vClose').onclick = () => d.remove();
  const list = d.querySelector('#vList');
  const locale = lang() === 'ar' ? 'ar' : lang() === 'en' ? 'en-GB' : 'fr-FR';
  const r = await api('/api/data/history');
  if (!r.ok) { list.innerHTML = `<p class="err">${T('syncPending')}</p>`; return; }
  const versions = (r.data && r.data.versions) || [];
  if (!versions.length) { list.innerHTML = `<p class="hint">${T('noVersions')}</p>`; return; }
  list.innerHTML = versions
    .map((v) => `<div class="row"><div><div class="t">${new Date(v.saved).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</div><div class="s">${T('version')} ${esc(v.rev)} · ${Math.round((Number(v.bytes) || 0) / 1024)} Ko</div></div><div class="right"><button class="btn small" data-v="${esc(v.id)}">${T('restore')}</button></div></div>`)
    .join('');
  list.querySelectorAll('button[data-v]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm(T('confirmRestore'))) return;
      b.disabled = true;
      const res = await api('/api/data/restore', 'POST', { id: Number(b.dataset.v) });
      if (!res.ok) {
        b.disabled = false;
        list.insertAdjacentHTML('afterbegin', `<p class="err">${T('syncPending')}</p>`);
        return;
      }
      d.remove();
      await pullNow(true);
      render();
    };
  });
}

/* ---------------- équipe (comptes vendeurs) ---------------- */
/* Le patron crée un code à 6 caractères ; le vendeur crée son propre compte,
   saisit le code, et travaille ensuite sur les données de la boutique. */
async function loadTeam(box) {
  if (!box) return;
  const r = await api('/api/staff');
  if (!r.ok) {
    box.innerHTML = `<p class="hint">${T('syncPending')}</p>`;
    return;
  }
  const data = r.data || {};
  if (data.role === 'staff') {
    const owner = data.owner || {};
    box.innerHTML = `<p class="hint">${T('teamStaffOf')} <b>${esc(owner.email || owner.phone || '—')}</b></p>
      <p class="hint">${T('teamStaffNote')}</p>
      <button class="btn out" id="teamLeave">${T('teamLeave')}</button>`;
    box.querySelector('#teamLeave').onclick = async () => {
      if (!confirm(T('teamLeaveConfirm'))) return;
      const res = await api('/api/staff/leave', 'POST', {});
      if (!res.ok) { alert(T('syncPending')); return; }
      location.reload();
    };
    return;
  }
  const staff = data.staff || [];
  const invites = data.invites || [];
  box.innerHTML = `<p class="hint">${T('teamHint')}</p>
    <button class="btn" id="teamNew">${T('teamInvite')}</button>
    <div id="teamCode"></div>
    ${staff.length ? `<h3 style="margin-top:14px">${T('teamSellers')}</h3><p class="hint">${T('permHint')}</p>${staff.map((s) => `<div class="row"><div><div class="t">${esc(s.email || s.phone || '—')}</div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" data-perm="del" data-id="${esc(s.id)}" ${!s.perms || s.perms.del ? 'checked' : ''} style="width:auto"><span>${T('permDelete')}</span></label>
      <label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" data-perm="price" data-id="${esc(s.id)}" ${!s.perms || s.perms.price ? 'checked' : ''} style="width:auto"><span>${T('permPrice')}</span></label></div>
      <div class="right"><button class="btn small out" data-rm="${esc(s.id)}">${T('teamRemove')}</button></div></div>`).join('')}` : ''}
    ${invites.length ? `<p class="hint">${T('teamPending')} : ${invites.map((i) => esc(i.code)).join(' · ')}</p>` : ''}
    <h3 style="margin-top:16px">${T('teamJoin')}</h3>
    <p class="hint">${T('teamJoinHint')}</p>
    <input id="teamCodeIn" maxlength="6" autocapitalize="characters" style="text-transform:uppercase">
    <button class="btn out" id="teamJoinBtn">${T('teamJoinBtn')}</button>`;
  box.querySelector('#teamNew').onclick = async () => {
    const res = await api('/api/staff/invite', 'POST', {});
    if (!res.ok) { alert(T('syncPending')); return; }
    box.querySelector('#teamCode').innerHTML = `<p class="tag ok" style="font-size:18px;letter-spacing:.15em">${esc(res.data.code)}</p>
      <p class="hint">${T('teamCodeHint')}</p>`;
  };
  box.querySelectorAll('[data-perm]').forEach((c) => {
    c.onchange = async () => {
      const id = c.dataset.id;
      const del = box.querySelector(`[data-perm="del"][data-id="${id}"]`).checked;
      const price = box.querySelector(`[data-perm="price"][data-id="${id}"]`).checked;
      const res = await api('/api/staff/perms', 'POST', { id, del, price });
      if (!res.ok) { c.checked = !c.checked; alert(T('syncPending')); }
    };
  });
  box.querySelectorAll('[data-rm]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm(T('teamRemoveConfirm'))) return;
      const res = await api('/api/staff/remove', 'POST', { id: b.dataset.rm });
      if (!res.ok) { alert(T('syncPending')); return; }
      loadTeam(box);
    };
  });
  box.querySelector('#teamJoinBtn').onclick = async () => {
    const code = box.querySelector('#teamCodeIn').value.trim().toUpperCase();
    /* Rejoindre masque les données déjà saisies : on prévient avant, pas après. */
    if (!code || !confirm(T('teamJoinWarn'))) return;
    const res = await api('/api/staff/join', 'POST', { code });
    if (res.status === 429) { alert(T('teamJoinSlow')); return; }
    if (!res.ok) { alert(T('teamJoinError')); return; }
    location.reload();
  };
}

function settingsModal() {
  if (mailReady === null) loadMailStatus();
  let logoDraft = db.settings.logo || '';
  const d = modal(`<div class="sheetHead"><h2>${T('settings')}</h2></div>
    <details data-owner><summary>${T('secShop')}</summary>
    <label>${T('shopName')}</label><input id="setShop" value="${esc(db.shop)}">
    <label>${T('companyForm')}</label><select id="setForm">${formOptions(db.settings.companyForm || '')}</select>
    <label>${T('country')}</label><select id="setCountry">${countryOptions(db.settings.country || 'CI')}</select>
    <p class="hint">${T('currency')} : <b id="setCur">${esc(db.settings.currency || currencyFor(db.settings.country || 'CI'))}</b> — ${T('currencyAuto')}</p>
    <label>${T('city')}</label><input id="setCity" value="${esc(db.settings.city || '')}">
    <label>${T('district')}</label><input id="setDistrict" value="${esc(db.settings.district || '')}">
    <label>${T('address')}</label><input id="setAddress" value="${esc(db.settings.address || '')}">
    </details>
    <details><summary>${T('secSales')}</summary>
    <label>${T('vat')}</label><input id="setVat" inputmode="numeric" value="${esc(db.settings.vat == null ? 18 : db.settings.vat)}">
    <p class="hint">${T('vatHint')}</p>
    <label>${T('remindDays')}</label><input id="setRemindDays" inputmode="numeric" value="${esc(db.settings.remindDays == null ? 30 : db.settings.remindDays)}">
    <p class="hint">${T('remindHint')}</p>
    <label>${T('waveNumber')}</label><input id="setWave" inputmode="tel" placeholder="+225 01 00 00 00 00" value="${esc(db.settings.wave || '')}">
    <label>${T('omNumber')}</label><input id="setOm" inputmode="tel" placeholder="+225 07 00 00 00 00" value="${esc(db.settings.om || '')}">
    <p class="hint">${T('payNumbersHint')}</p>
    </details>
    <details data-owner><summary>${T('secLook')}</summary>
    <label>${T('logo')}</label>
    <input type="file" id="setLogo" accept="image/*">
    <div id="logoPrev" style="margin-top:8px">${logoDraft ? `<img src="${esc(logoDraft)}" class="logoPrev" alt="">` : ''}</div>
    <button class="btn out" id="logoDel">${T('logoRemove')}</button>
    <p class="hint">${T('logoHint')}</p>
    <label>${T('language')}</label>
    <select id="setLang">${LANGS.map((l) => `<option value="${l.id}" ${l.id === lang() ? 'selected' : ''}>${l.id === 'ar' ? 'العربية' : l.label}</option>`).join('')}</select>
    <label>${T('reminderText')}</label><textarea id="setRem" rows="4">${esc((db.settings.reminder || DEFAULTS)[lang()])}</textarea>
    <label>${T('invReminderText')}</label><textarea id="setInvRem" rows="6">${esc(invReminderTpl())}</textarea>
    <p class="hint">${T('invReminderHint')}</p>
    <button class="btn out" id="setInvRemReset">${T('invReminderReset')}</button>
    <label>${T('remindDelay')}</label><input id="setRemDays" inputmode="numeric" value="${remindDelay()}">
    <p class="hint">${T('remindDelayHint')}</p>
    <label style="display:flex;gap:10px;align-items:center;margin-top:12px"><input type="checkbox" id="setAutoRemind" ${db.settings.autoRemind ? 'checked' : ''} style="width:auto"><span>${T('autoRemind')}</span></label>
    <p class="hint">${T('autoRemindHint')}</p>
    <div id="acMailFlag">${mailFlagHTML()}</div>
    <button class="btn out" id="setMailTest">${T('testMail')}</button>
    <p class="hint" id="mailTestMsg"></p>
    <p class="hint">${T('smsUnavailable')}</p>
    ${ADS.client ? `<label style="display:flex;gap:10px;align-items:center;margin-top:12px"><input type="checkbox" id="setAds" ${db.settings.ads ? 'checked' : ''} style="width:auto"><span>${T('ads')}</span></label>` : ''}
    </details>
    <details><summary>${T('secPrivacy')}</summary>
    <p class="hint">${T('cookieCurrent')} : <b id="ckState">—</b></p>
    <button class="btn small" id="ckYes">${T('cookieYes')}</button>
    <button class="btn small out" id="ckNo">${T('cookieNo')}</button>
    </details>
    <details><summary>${T('secTeam')}</summary>
    <div id="teamBox"><p class="hint">…</p></div>
    </details>
    <details><summary>${T('secAccount')}</summary>
    ${accountHTML()}
    ${me ? `<h3 style="margin-top:16px">${T('changePassword')}</h3>
      <label>${T('currentPassword')}</label><input id="pwCur" type="password" autocomplete="current-password">
      <label>${T('newPassword')}</label><input id="pwNew" type="password" autocomplete="new-password">
      <label>${T('confirmPassword')}</label><input id="pwNew2" type="password" autocomplete="new-password">
      <button class="btn out" id="pwOk">${T('savePassword')}</button>
      <p class="hint" id="pwMsg"></p>` : ''}
    </details>
    <details><summary>${T('legalInfo')}</summary>
    <p class="hint">${T('legalInfoHint')}</p>
    <label>${T('legalName')}</label><input id="lgName" value="${esc((db.settings.legal || {}).name || '')}">
    <label>${T('legalAddress')}</label><input id="lgAddress" value="${esc((db.settings.legal || {}).address || '')}">
    <label>${T('legalRccm')}</label><input id="lgRccm" value="${esc((db.settings.legal || {}).rccm || '')}">
    <label>${T('legalTax')}</label><input id="lgTax" value="${esc((db.settings.legal || {}).taxId || '')}">
    <label>${T('legalContact')}</label><input id="lgContact" value="${esc((db.settings.legal || {}).contact || '')}">
    <label>${T('legalPublisher')}</label><input id="lgPublisher" value="${esc((db.settings.legal || {}).publisher || '')}">
    </details>
    <details data-owner><summary>${T('secBackup')}</summary>
    <button class="btn out" id="setExport">${T('exportData')}</button>
    <button class="btn out" id="setImport">${T('importData')}</button>
    <button class="btn out" id="setHistory">${T('versions')}</button>
    <p class="hint">${T('backupHint')}</p>
    <button class="btn out" id="setShare">${T('share')}</button>
    <button class="btn out" id="setInstall">${T('install')}</button>
    <button class="btn out" id="setLegal">${T('legalMentions')}</button>
    <button class="btn out" id="setTerms">${T('legalTerms')}</button>
    <p class="hint" id="setVersion">${T('version')} ${esc(appVersion || '—')}</p>
    </details>
    <div class="sheetFoot compact">
      <button class="btn" id="setOk">${T('save')}</button>
      <button class="btn out" id="setNo">${T('close')}</button>
    </div>`);
  d.querySelector('#setNo').onclick = () => d.remove();
  wireAccount(d);
  /* Un vendeur ne peut pas toucher aux réglages de la boutique : on grise les
     sections du patron plutôt que de les retirer, pour ne rien casser à
     l'enregistrement des autres réglages. */
  if (isStaff()) {
    d.querySelectorAll('details[data-owner]').forEach((el) => {
      el.open = false;
      el.style.opacity = '.55';
      el.querySelectorAll('input,select,textarea,button').forEach((f) => { f.disabled = true; });
      const s = el.querySelector('summary');
      if (s) s.textContent = `${s.textContent} — ${T('teamOwnerOnly')}`;
    });
  }
  loadTeam(d.querySelector('#teamBox'));
  const ckState = d.querySelector('#ckState');
  if (ckState) {
    const ck = consentChoice();
    ckState.textContent = ck === 'yes' ? T('cookieSetYes') : ck === 'no' ? T('cookieSetNo') : T('cookieNotSet');
  }
  const ckYes = d.querySelector('#ckYes');
  const ckNo = d.querySelector('#ckNo');
  if (ckYes) ckYes.onclick = () => { setConsent('yes'); d.remove(); settingsModal(); };
  if (ckNo) ckNo.onclick = () => { setConsent('no'); d.remove(); settingsModal(); };
  d.querySelector('#setHistory').onclick = () => { d.remove(); versionsModal(); };
  d.querySelector('#setShare').onclick = () => { d.remove(); shareModal(); };
  d.querySelector('#setInstall').onclick = () => { d.remove(); installModal(); };
  d.querySelector('#setLegal').onclick = () => { d.remove(); legalModal('legal'); };
  d.querySelector('#setTerms').onclick = () => { d.remove(); legalModal('terms'); };
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
  d.querySelector('#setInvRemReset').onclick = () => { d.querySelector('#setInvRem').value = INV_REMIND[lang()] || INV_REMIND.fr; };
  /* Preuve immédiate que la clé fonctionne, sans attendre une facture en retard. */
  d.querySelector('#setMailTest').onclick = async () => {
    const btn = d.querySelector('#setMailTest');
    const msg = d.querySelector('#mailTestMsg');
    btn.disabled = true; msg.textContent = T('mailTestWait');
    const r = await api('/api/test-mail', 'POST', {});
    btn.disabled = false;
    const ok = r.ok && r.data && r.data.mail;
    msg.textContent = ok ? T('mailTestOk') : T('mailTestFail');
    if (ok) {
      mailReady = true;
      const box = d.querySelector('#acMailFlag');
      if (box) box.innerHTML = mailFlagHTML();
    }
  };
  d.querySelector('#setOk').onclick = () => {
    db.shop = d.querySelector('#setShop').value.trim();
    const l = d.querySelector('#setLang').value;
    db.settings.reminder[db.settings.lang] = d.querySelector('#setRem').value;
    db.settings.invReminder = db.settings.invReminder || {};
    db.settings.invReminder[db.settings.lang] = d.querySelector('#setInvRem').value.trim();
    db.settings.invRemindDays = Math.max(1, Math.round(+d.querySelector('#setRemDays').value || 7));
    db.settings.autoRemind = d.querySelector('#setAutoRemind').checked;
    db.settings.lang = l;
    db.settings.ads = ADS.client ? d.querySelector('#setAds').checked : false;
    db.settings.wave = d.querySelector('#setWave').value.trim();
    db.settings.om = d.querySelector('#setOm').value.trim();
    db.settings.companyForm = d.querySelector('#setForm').value;
    db.settings.country = setCountry.value;
    db.settings.currency = currencyFor(setCountry.value);
    db.settings.city = d.querySelector('#setCity').value.trim();
    db.settings.district = d.querySelector('#setDistrict').value.trim();
    db.settings.address = d.querySelector('#setAddress').value.trim();
    db.settings.vat = Math.max(0, Math.round(+d.querySelector('#setVat').value || 0));
    db.settings.remindDays = Math.min(365, Math.max(1, Math.round(+d.querySelector('#setRemindDays').value || 30)));
    db.settings.logo = logoDraft;
    db.settings.legal = {
      name: d.querySelector('#lgName').value.trim(),
      address: d.querySelector('#lgAddress').value.trim(),
      rccm: d.querySelector('#lgRccm').value.trim(),
      taxId: d.querySelector('#lgTax').value.trim(),
      contact: d.querySelector('#lgContact').value.trim(),
      publisher: d.querySelector('#lgPublisher').value.trim(),
    };
    saveDB(); d.remove(); render();
  };
}
function legalBody(kind) {
  const st = db.settings || {};
  const lg = st.legal || {};
  const country = countryName(st.country || 'CI');
  const place = lg.address || [st.address, st.district, st.city, country].filter(Boolean).join(' · ');
  const name = lg.name || db.shop || T('app');
  const form = lg.form || st.companyForm || '';
  const contact = lg.contact || [me && me.phone, me && me.email].filter(Boolean).join(' · ');
  const ph = (v) => (v ? esc(v) : `<span class="todo">${T('toComplete')}</span>`);
  const note = lang() !== 'fr' ? `<p class="hint" dir="${lang() === 'ar' ? 'rtl' : 'ltr'}">${T('legalFrenchOnly')}</p>` : '';
  const date = dayFR(todayISO());
  const mentions = `<h2>Mentions légales</h2>${note}
    <p class="hint">${T('legalUpdated')} ${date}</p>
    <h3>Éditeur de l'application</h3>
    <p>${ph(name)}${form ? ', ' + esc(form) : ''} — ${ph(place)}.</p>
    <p>Immatriculation : ${ph(lg.rccm)} · Identifiant fiscal : ${ph(lg.taxId)}</p>
    <p>Contact : ${ph(contact)} · Responsable de la publication : ${ph(lg.publisher)}</p>
    <h3>Application</h3>
    <p>Assistant Commercial est une application de gestion pour les commerçants, boutiquiers, grossistes et revendeurs : ventes, dépenses, stock, suivi des clients et des fournisseurs, devis, factures, bilans et documents imprimables. Elle fonctionne dans un navigateur, peut être installée sur un téléphone et se synchronise entre appareils lorsqu'un compte est utilisé.</p>
    <h3>Hébergement</h3>
    <p>Application et base de données hébergées par Freebuff Sites, sur l'infrastructure de Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis. Base de données : Cloudflare D1. L'envoi d'e-mails, lorsqu'il est activé, utilise le service Resend.</p>
    <h3>Propriété intellectuelle</h3>
    <p>L'application, son nom, ses textes et son icône sont la propriété de ${ph(name)}. Toute reproduction ou revente sans autorisation écrite est interdite. Les données saisies par un utilisateur lui appartiennent.</p>
    <h3>Responsabilité</h3>
    <p>L'application est un outil de gestion. Elle ne remplace ni un comptable, ni un conseil fiscal ou juridique. ${ph(name)} ne peut pas être tenue responsable d'une décision prise à partir des chiffres affichés, ni d'une perte de données due à un appareil perdu, cassé, réinitialisé, ou à la suppression du compte sans sauvegarde préalable.</p>
    <h3>Disponibilité</h3>
    <p>L'application est fournie en l'état, sans garantie d'absence d'interruption ou d'erreur. Ces mentions peuvent être modifiées ; la date de mise à jour figure en haut de la page.</p>
    <h3>Droit applicable</h3>
    <p>Droit ${esc(lg.country || country)}. En cas de litige, et à défaut d'accord amiable, les tribunaux de ${ph(lg.city || st.city)} sont compétents.</p>`;
  const privacy = `<h2>Politique de confidentialité</h2>
    <h3>Quelles données sont enregistrées</h3>
    <ul>
      <li><b>Compte :</b> adresse e-mail et/ou numéro de téléphone, mot de passe (stocké uniquement sous forme hachée, jamais lisible), langue choisie.</li>
      <li><b>Activité :</b> nom de la boutique, coordonnées professionnelles, ventes, dépenses, articles et stock, clients et fournisseurs (nom, téléphone, adresse), devis et factures, paiements et dettes, bilans.</li>
      <li><b>Technique :</b> jeton de session dans un cookie, historique de synchronisation conservé 90 jours.</li>
    </ul>
    <h3>Pourquoi ces données</h3>
    <p>Uniquement pour faire fonctionner l'application : afficher vos chiffres, synchroniser vos appareils, éditer et envoyer vos documents, sécuriser votre compte et permettre la récupération du mot de passe. Aucune donnée d'activité n'est revendue, ni utilisée pour de la publicité.</p>
    <h3>Où elles sont conservées</h3>
    <p>D'abord sur votre appareil, dans le stockage du navigateur, pour fonctionner sans réseau. Ensuite, lorsque vous êtes connecté, sur les serveurs de l'hébergement (Cloudflare D1), pour retrouver vos données sur vos autres appareils.</p>
    <h3>Qui peut les voir</h3>
    <p>Vous, et les personnes qui utilisent votre compte. L'éditeur n'accède pas au contenu de vos ventes, sauf si vous le demandez pour un dépannage. Les prestataires techniques (hébergement, base de données, envoi d'e-mails) traitent les données pour le compte de l'éditeur et ne les utilisent pas à d'autres fins.</p>
    <h3>Combien de temps</h3>
    <p>Tant que le compte existe. L'historique technique de synchronisation est conservé 90 jours puis purgé automatiquement. La suppression du compte efface les données du serveur ; elle est définitive.</p>
    <h3>Cookies et mesure d'audience</h3>
    <p>Un seul cookie est nécessaire : le cookie de session, qui garde votre connexion ouverte. Il est protégé et n'est pas lisible par un script de la page. Aucune publicité n'est affichée et aucune mesure d'audience n'est utilisée actuellement. Si la publicité est activée plus tard, un bandeau de consentement sera proposé et cette politique sera mise à jour.</p>
    <h3>Vos droits</h3>
    <p>Vous pouvez accéder à vos données, les exporter depuis Réglages → Sauvegarde, les corriger dans l'application et demander la suppression du compte et des données. Pour toute demande : ${ph(contact)}.</p>
    <h3>Sécurité</h3>
    <p>Connexion chiffrée (HTTPS), mots de passe hachés, accès aux données limité au compte connecté, limitation des tentatives de connexion et des demandes de réinitialisation. Aucune clé secrète n'est placée dans le navigateur.</p>`;
  const terms = `<h2>Conditions d'utilisation</h2>${note}
    <p class="hint">${T('legalUpdated')} ${date}</p>
    <h3>1. Objet</h3>
    <p>Ces conditions encadrent l'utilisation d'Assistant Commercial, application de gestion destinée aux commerçants : ventes, dépenses, stock, clients et fournisseurs, devis, factures, bilans et documents. En créant un compte ou en utilisant l'application, vous acceptez ces conditions.</p>
    <h3>2. Compte</h3>
    <p>Le compte est personnel. Vous vous engagez à donner des informations exactes, à garder votre mot de passe confidentiel et à nous signaler tout usage non autorisé. Un compte est nécessaire pour sauvegarder les données sur le serveur et les retrouver sur un autre appareil.</p>
    <h3>3. Usage autorisé</h3>
    <p>L'application est fournie pour un usage professionnel licite. Il est interdit de tenter d'accéder au compte d'une autre personne, de perturber le service, d'extraire ou de revendre l'application, ou d'y enregistrer des contenus illicites.</p>
    <h3>4. Vos données</h3>
    <p>Les données que vous saisissez vous appartiennent. Vous êtes responsable de leur exactitude et de leur légalité, notamment des mentions portées sur vos devis et factures et du taux de TVA appliqué. Exportez régulièrement vos données depuis Réglages → Sauvegarde.</p>
    <h3>5. Disponibilité</h3>
    <p>L'application fonctionne hors connexion et se synchronise lorsque le réseau revient. Le service est fourni au mieux, sans garantie d'absence d'interruption, de maintenance ou d'erreur. Certaines fonctions dépendent du téléphone, du navigateur ou de la connexion.</p>
    <h3>6. Propriété</h3>
    <p>L'application, son nom et ses éléments restent la propriété de ${ph(name)}. Vous bénéficiez d'un droit d'usage personnel et professionnel, sans droit de copie, de revente ni de modification.</p>
    <h3>7. Responsabilité</h3>
    <p>L'application est un outil de gestion et ne remplace ni un comptable, ni un conseil fiscal ou juridique. ${ph(name)} ne peut être tenue responsable des décisions prises à partir des chiffres affichés, ni des pertes de données dues à un appareil perdu, cassé ou réinitialisé, ou à la suppression du compte sans sauvegarde.</p>
    <h3>8. Fin d'utilisation</h3>
    <p>Vous pouvez cesser d'utiliser l'application et demander la suppression de votre compte à tout moment. La suppression est définitive. Les journaux techniques de synchronisation sont conservés 90 jours puis purgés.</p>
    <h3>9. Modification des conditions</h3>
    <p>Ces conditions peuvent évoluer. La version en vigueur est celle publiée dans l'application, avec sa date de mise à jour.</p>
    <h3>10. Droit applicable</h3>
    <p>Droit ${esc(lg.country || country)}. En cas de litige, et à défaut d'accord amiable, les tribunaux de ${ph(lg.city || st.city)} sont compétents.</p>`;
  return kind === 'terms' ? terms : mentions + privacy;
}
function printLegal(kind) {
  const area = document.getElementById('printArea');
  area.className = 'a4 legalP';
  area.innerHTML = `<div class="small">${esc(db.shop || T('app'))} · ${dayFR(todayISO())}</div>${legalBody(kind)}`;
  window.print();
}
function legalModal(kind) {
  const d = modal(`<div class="legal" dir="auto">${legalBody(kind)}
    <button class="btn" id="lgPdf">PDF</button>
    <button class="btn out" id="lgNo">${T('close')}</button></div>`);
  d.querySelector('#lgNo').onclick = () => d.remove();
  d.querySelector('#lgPdf').onclick = () => { d.remove(); printLegal(kind); };
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
const ARRAYS = ['products', 'parties', 'suppliers', 'sales', 'expenses', 'withdrawals', 'docs', 'debts', 'moves', 'mailLog', 'log'];
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
  out.tomb = unionArray(local.tomb, remote.tomb);
  const dead = new Set(out.tomb.map((t) => t.id));
  ARRAYS.forEach((k) => { out[k] = (out[k] || []).filter((x) => !dead.has(x.id)); });
  out.seq = { DEV: Math.max(local.seq?.DEV || 0, remote.seq?.DEV || 0), FAC: Math.max(local.seq?.FAC || 0, remote.seq?.FAC || 0) };
  out.meta = { lastSync: Date.now(), updated: Math.max(local.meta.updated || 0, remote.meta.updated || 0), rev: Math.max(local.meta.rev || 0, remote.meta.rev || 0), mv: 1 };
  ensureMoves(out);
  renumberDocs(out);
  /* Le journal fusionné reste borné : deux téléphones ne doivent pas le faire
     grossir sans fin. Les entrées les plus récentes sont gardées. */
  out.log = (out.log || []).slice().sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0)).slice(-LOG_MAX);
  return out;
}

/* ---------------- compte et synchronisation ---------------- */
let me = null;
/* Un vendeur rattaché à une boutique travaille sur les données de son patron :
   les réglages de la boutique et la sauvegarde complète restent au patron. */
function isStaff() {
  return Boolean(me && me.id && me.ownerId);
}
/* Rien de sensible ne reste dans le stockage local d'un vendeur : un appareil
   qui a synchronisé avant le masquage serveur garderait sinon les prix d'achat
   et les montants. On les vide à chaque écriture locale ; le serveur les
   rétablit depuis l'état du patron quand le vendeur enregistre. */
function purgeSecrets() {
  if (!isStaff()) return false;
  let changed = false;
  for (const [key, fields] of Object.entries(SECRET_FIELDS)) {
    for (const item of db[key] || []) {
      if (!item || typeof item !== 'object') continue;
      for (const field of fields) {
        if (field in item && item[field] !== null) { item[field] = null; changed = true; }
      }
    }
  }
  /* Journal : un vendeur garde les montants de ses propres actions (il les
     connaît) ; ceux du patron et des autres vendeurs restent vides. */
  for (const e of db.log || []) {
    if (!e || typeof e !== 'object') continue;
    if (e.byId && me && e.byId === me.id) continue;
    if (e.amount !== null) { e.amount = null; changed = true; }
  }
  return changed;
}
/* Droits réglés par le patron. Sans information (hors ligne, ancienne
   version), on laisse faire comme avant. */
function myPerms() {
  const p = me && me.perms;
  return { del: !p || p.del !== false, price: !p || p.price !== false };
}
const canDeleteItems = () => !isStaff() || myPerms().del;
const canEditPrices = () => !isStaff() || myPerms().price;
/* Journal d'activité : qui a vendu, dépensé, acheté ou modifié quoi. Il est
   fusionné entre les appareils et seul le patron le consulte. */
function actorName() {
  return me && me.id ? String(me.email || me.phone || '').trim() : lastSeller();
}
function logAct(act, label, amount) {
  db.log = Array.isArray(db.log) ? db.log : [];
  db.log.push({
    id: uid(), at: Date.now(), act,
    by: actorName(), byId: me && me.id ? me.id : '',
    label: String(label || '').slice(0, 60),
    amount: Math.max(0, Math.round(Number(amount) || 0)),
    u: Date.now(),
  });
  if (db.log.length > LOG_MAX) db.log = db.log.slice(-LOG_MAX);
}
let syncState = 'idle';
let syncTimer = null;
let syncingNow = false;
const clock = (ts) => (ts ? new Date(ts).toLocaleTimeString(lang() === 'ar' ? 'ar' : lang() === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');

function updatePill() {
  const pill = document.getElementById('netState');
  if (!pill) return;
  const synced = { synced: T('synced'), syncing: T('syncing'), pending: T('syncPending'), error: T('syncPending'), toobig: T('syncTooBig'), auth: T('sessionExpired') }[syncState] || T('synced');
  pill.textContent = !navigator.onLine ? T('offline') : me ? synced : T('notSignedIn');
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
/* Identité connue du dernier passage. Sans elle, ouvrir l'application hors
   ligne afficherait l'écran de connexion alors que la boutique est en local.
   Ce n'est qu'un souvenir d'affichage : la session reste le cookie HttpOnly,
   et un vrai refus du serveur (401) efface ce souvenir. */
function storedMe() {
  try { return JSON.parse(localStorage.getItem(KEY + '.me') || 'null'); } catch { return null; }
}
function rememberMe(user) {
  try {
    if (user) localStorage.setItem(KEY + '.me', JSON.stringify({ id: user.id, email: user.email || null, phone: user.phone || null, role: user.role || 'owner', ownerId: user.ownerId || null, perms: user.perms || null }));
    else localStorage.removeItem(KEY + '.me');
  } catch {}
}
async function refreshMe() {
  const r = await api('/api/me');
  if (r.ok && r.data) {
    me = r.data.user;
    rememberMe(me);
    return me;
  }
  if (r.status === 401) {
    me = null;
    rememberMe(null);
    return me;
  }
  /* Réseau indisponible : on garde l'identité connue, la synchro reprendra. */
  me = storedMe();
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
    dirty = false;
    saveDB(false);
    render();
    markSync('synced');
  } catch { markSync('error'); }
}
async function pushNow() {
  if (!me) return;
  if (syncingNow) { clearTimeout(syncTimer); syncTimer = setTimeout(pushNow, 1500); return; }
  syncingNow = true;
  try {
    if (stateBytes() > MAX_STATE) {
      if (!db.meta.tooBig) { db.meta.tooBig = true; saveDB(false); render(); }
      markSync('toobig');
      return;
    }
    if (db.meta.tooBig) { db.meta.tooBig = false; saveDB(false); render(); }
    markSync('syncing');
    const r = await api('/api/data', 'PUT', { json: JSON.stringify(db), updated: db.meta.updated, rev: db.meta.rev || 0 });
    if (!r.ok) {
      const detail = String((r.data && (r.data.detail || r.data.error)) || '');
      if (r.status === 413 || /volumineux/i.test(detail)) {
        db.meta.tooBig = true; saveDB(false); render(); markSync('toobig');
        return;
      }
      /* Session expirée : ce n'est pas un problème de réseau, il faut se reconnecter. */
      if (r.status === 401) { markSync('auth'); return; }
      /* Droit retiré par le patron : la modification locale est annulée et
         l'application repart de l'état du serveur. */
      if (r.status === 403 && r.data && r.data.error === 'perm') {
        markSync('error');
        alert(T('permDenied'));
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => pullNow(true), 400);
        return;
      }
      markSync(navigator.onLine ? 'error' : 'pending');
      return;
    }
    if (r.data && r.data.saved === false && r.data.json) {
      const merged = mergeStates(db, JSON.parse(r.data.json));
      db = merged;
      db.meta.rev = r.data.rev || db.meta.rev || 0;
      db.meta.lastSync = Date.now();
      saveDB(false); render();
      /* La fusion locale n'est pas encore sur le serveur : ne pas afficher
         « sauvegardé » avant que le renvoi ait réussi. */
      markSync('pending');
      clearTimeout(syncTimer); syncTimer = setTimeout(pushNow, 400);
      return;
    }
    db.meta.rev = (r.data && r.data.rev) || db.meta.rev || 0;
    db.meta.lastSync = Date.now();
    dirty = false;
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
  if (dirty || syncState === 'pending') await pushNow();
  else await pullNow(false);
}
async function signup(mode, identifier, password) {
  const body = { mode, password };
  if (mode === 'email') body.email = identifier; else body.phone = identifier;
  const r = await api('/api/signup', 'POST', body);
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
  dirty = false;
  rememberMe(null);
  markSync('idle');
}
async function bootAccount() {
  await refreshMe();
  /* Même sans réseau, un vendeur ne garde pas d'anciennes valeurs sensibles
     dans le stockage de son téléphone. */
  if (purgeSecrets()) saveDB(false);
  if (me) await pullNow();
  updatePill();
}
function accountHTML() {
  if (me) {
    return `<div class="row"><div><div class="t">${esc(me.email || me.phone || '')}</div><div class="s">${me.email && me.phone ? esc(me.phone) : (me.email ? T('byEmail') : T('byPhone'))}</div></div><div class="right"><span class="tag ok">${T('cloudOn')}</span></div></div>
      <p class="hint">${T('lastSaved')} ${clock(db.meta.lastSync)}</p>
      <button class="btn out" data-act="syncNow">${T('syncNow')}</button>
      <button class="btn out" data-act="logout">${T('signOut')}</button>
      <p class="hint">${T('multiPhoneHint')}</p>
      ${me.email ? '' : `<h3 style="margin-top:16px">${T('addEmail')}</h3>
      <p class="hint">${T('addEmailHint')}</p>
      <label>${T('email')}</label><input id="acAddEmail" type="email" autocomplete="email" placeholder="awa@exemple.com">
      <button class="btn out" data-act="addEmail">${T('addEmail')}</button>`}`;
  }
  return `<div class="seg" id="acType"><button type="button" id="acModeEmail" class="on">${T('byEmail')}</button><button type="button" id="acModePhone">${T('byPhone')}</button></div>
    <label id="acIdLabel">${T('email')}</label><input id="acIdent" type="email" autocomplete="email" placeholder="awa@exemple.com">
    <label>${T('password')}</label><input id="acPass" type="password" autocomplete="new-password">
    <button class="btn" id="acSignup">${T('createAccount')}</button>
    <h3 style="margin-top:16px">${T('signIn')}</h3>
    <label>${T('loginId')}</label><input id="acLoginId" type="text" autocomplete="username">
    <label>${T('password')}</label><input id="acLoginPass" type="password" autocomplete="current-password">
    <button class="btn out" id="acLogin">${T('signIn')}</button>
    <button class="btn out" id="acForgot">${T('forgot')}</button>
    <p class="hint">${T('accountHint')}</p><p class="err" id="acErr"></p>`;
}
function wireAccount(d) {
  const btn = d.querySelector('#acSignup');
  if (!btn) return;
  const err = d.querySelector('#acErr');
  const identInput = d.querySelector('#acIdent');
  const identLabel = d.querySelector('#acIdLabel');
  let mode = 'email';
  const pickMode = (m) => {
    mode = m;
    d.querySelector('#acModeEmail').classList.toggle('on', m === 'email');
    d.querySelector('#acModePhone').classList.toggle('on', m === 'phone');
    identInput.type = m === 'email' ? 'email' : 'tel';
    identInput.autocomplete = m === 'email' ? 'email' : 'tel';
    identInput.placeholder = m === 'email' ? 'awa@exemple.com' : '+225 07 00 00 00 00';
    identLabel.textContent = m === 'email' ? T('email') : T('phoneNumber');
  };
  d.querySelector('#acModeEmail').onclick = () => pickMode('email');
  d.querySelector('#acModePhone').onclick = () => pickMode('phone');
  const values = () => ({ ident: identInput.value.trim(), pass: d.querySelector('#acPass').value, mode });
  btn.onclick = async () => {
    err.textContent = '';
    const { ident, pass, mode: m } = values();
    if (m === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(ident)) { err.textContent = T('badEmail'); return; }
    } else if (ident.replace(/\D/g, '').length < 8) { err.textContent = T('badPhone'); return; }
    if (pass.length < 8) { err.textContent = T('badPass'); return; }
    const e = await signup(m, ident, pass);
    if (e) { err.textContent = e === 'exists' ? T('emailTaken') : e === 'phone_taken' ? T('phoneTaken') : e === 'phone' ? T('badPhone') : e === 'identifier' ? T('badCredentials') : T('badCredentials'); return; }
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
  if (forgot) forgot.onclick = () => forgotModal((values().mode === 'email' ? values().ident : '') || d.querySelector('#acLoginId').value.trim());
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
let signupMode = 'email';
function askShop() {
  if (db.shop) return;
  const d = modal(`<h2>${T('welcomeTitle')}</h2><p>${T('welcomeAsk')}</p><input id="wShop" placeholder="Chez Awa"><button class="btn" id="wOk">${T('start')}</button>`);
  d.querySelector('#wOk').onclick = () => {
    const v = d.querySelector('#wShop').value.trim();
    if (!v) return;
    db.shop = v; saveDB(); d.remove(); render();
  };
}
function closeGate() { const g = document.getElementById('gate'); if (g) g.remove(); setBackgroundInert(false); }
function afterGate() { closeGate(); askShop(); render(); loadMailStatus(); autoRemind(); }
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
  setBackgroundInert(true);
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
  setBackgroundInert(true);
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
      ? `<div class="seg" id="gIdentType"><button type="button" data-m="email" class="on">${T('byEmail')}</button><button type="button" data-m="phone">${T('byPhone')}</button></div>
         <label id="gIdentLabel">${T('email')}</label><input id="gIdent" type="email" autocomplete="email">
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
      const typeBox = form.querySelector('#gIdentType');
      const identInput = form.querySelector('#gIdent');
      const identLabel = form.querySelector('#gIdentLabel');
      const pick = (m) => {
        signupMode = m;
        typeBox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
        identInput.type = m === 'email' ? 'email' : 'tel';
        identInput.autocomplete = m === 'email' ? 'email' : 'tel';
        identInput.placeholder = m === 'email' ? 'awa@exemple.com' : '+225 07 00 00 00 00';
        identLabel.textContent = m === 'email' ? T('email') : T('phoneNumber');
      };
      typeBox.querySelectorAll('button').forEach((b) => { b.onclick = () => pick(b.dataset.m); });
      pick(signupMode);
    }
    go.onclick = async () => {
      const err = form.querySelector('#gErr');
      const pass = form.querySelector('#gPass').value;
      err.textContent = '';
      if (gateMode === 'signup') {
        const ident = form.querySelector('#gIdent').value.trim();
        const country = form.querySelector('#gCountry').value;
        const companyForm = form.querySelector('#gCompany').value;
        const city = form.querySelector('#gCity').value.trim();
        const district = form.querySelector('#gDistrict').value.trim();
        const address = form.querySelector('#gAddress').value.trim();
        if (signupMode === 'email') {
          if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(ident)) { err.textContent = T('badEmail'); return; }
        } else if (ident.replace(/\D/g, '').length < 8) { err.textContent = T('badPhone'); return; }
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
        const e = await signup(signupMode, ident, pass);
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
    histShown = HIST_PAGE;
    const list = histSales();
    const box = document.getElementById('histList');
    if (box) box.innerHTML = histListHTML(list, histShown);
    const sum = document.getElementById('histSum');
    if (sum) sum.innerHTML = histSummary(list);
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'histMethod') { histMethod = e.target.value; histShown = HIST_PAGE; render(); }
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
/* ---------------- Service worker ---------------- */
/* La nouvelle version est proposée, jamais imposée : remplacer le code pendant
   une saisie peut vider un formulaire en cours. */
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  /* En développement, le cache masque chaque modification : on le désactive,
     sauf demande explicite (?sw=1) pour tester une mise à jour. */
  if (local && !new URLSearchParams(location.search).has('sw')) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    return;
  }
  const hadController = !!navigator.serviceWorker.controller;
  const proposer = (worker) => {
    if (!worker || document.getElementById('swUpdate')) return;
    const box = document.createElement('div');
    box.id = 'swUpdate';
    box.className = 'swUpdate';
    box.innerHTML = `<span>${esc(T('newVersion'))}</span><button class="btn small" id="swReload">${esc(T('reload'))}</button>`;
    document.body.appendChild(box);
    box.querySelector('#swReload').addEventListener('click', () => worker.postMessage('skip-waiting'));
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    /* Recharger seulement si un contrôleur existait déjà : au premier
       enregistrement, clients.claim() déclenche aussi cet événement. */
    if (hadController) location.reload();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      if (reg.waiting && hadController) proposer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) proposer(w);
        });
      });
    })
    .catch(() => {});
}

/* Sous test (node --test), seul le code ci-dessus est chargé : pas de rendu, pas
   de réseau, pas de service worker. */
if (!globalThis.__AC_TEST__) {
  setInterval(syncTick, 20000);
  render();
  const resetToken = new URLSearchParams(location.search).get('reset');
  (async () => {
    await bootAccount();
    if (resetToken) { resetModal(resetToken); return; }
    if (!localStorage.getItem(LANG_KEY)) { showLangGate(); return; }
    if (!me) { gateMode = db.shop ? 'login' : 'signup'; showAuthGate(); return; }
    askShop();
    loadMailStatus();
    autoRemind();
  })();
  fetch('version.json', { cache: 'no-store' })
    .then((r) => r.json())
    .then((v) => { appVersion = v && v.version ? String(v.version) : ''; })
    .catch(() => {});
  setupServiceWorker();
}
