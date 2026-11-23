/* Assistant Commercial — application locale, hors-ligne, trois langues. */
const KEY = 'assistant-commercial.v2';
const DEFAULTS = {
  fr: "Bonjour [Nom du Client], c'est [Nom de la Boutique]. La facture [Numéro Facture] du [Date Facture] d'un montant de [Montant] reste à régler. Merci de votre confiance.",
  en: "Hello [Nom du Client], this is [Nom de la Boutique]. Invoice [Numéro Facture] dated [Date Facture] for [Montant] is still unpaid. Thank you.",
  ar: "مرحباً [Nom du Client]، هذه رسالة من [Nom de la Boutique]. الفاتورة [Numéro Facture] بتاريخ [Date Facture] بمبلغ [Montant] لا تزال غير مسددة. شكراً لكم.",
};
/* [code, nom, monnaie, indicatif téléphonique] — l'indicatif sert à composer
   le lien WhatsApp de la boutique sans que le commerçant ait à le connaître. */
const COUNTRIES = [
  ['CI', "Côte d'Ivoire", 'FCFA', '225'], ['SN', 'Sénégal', 'FCFA', '221'], ['ML', 'Mali', 'FCFA', '223'], ['BF', 'Burkina Faso', 'FCFA', '226'],
  ['NE', 'Niger', 'FCFA', '227'], ['TG', 'Togo', 'FCFA', '228'], ['BJ', 'Bénin', 'FCFA', '229'], ['GN', 'Guinée', 'GNF', '224'],
  ['CM', 'Cameroun', 'FCFA', '237'], ['GA', 'Gabon', 'FCFA', '241'], ['CG', 'Congo', 'FCFA', '242'], ['CD', 'RD Congo', 'FC', '243'],
  ['TD', 'Tchad', 'FCFA', '235'], ['CF', 'Centrafrique', 'FCFA', '236'], ['MG', 'Madagascar', 'Ar', '261'], ['MR', 'Mauritanie', 'UM', '222'],
  ['MA', 'Maroc', 'DH', '212'], ['DZ', 'Algérie', 'DA', '213'], ['TN', 'Tunisie', 'DT', '216'], ['FR', 'France', '€', '33'],
  ['BE', 'Belgique', '€', '32'], ['CH', 'Suisse', 'CHF', '41'], ['CA', 'Canada', '$', '1'], ['US', 'États-Unis', '$', '1'],
  ['GB', 'Royaume-Uni', '£', '44'], ['NG', 'Nigéria', '₦', '234'], ['GH', 'Ghana', 'GH₵', '233'], ['KE', 'Kenya', 'KSh', '254'],
  ['ZA', 'Afrique du Sud', 'R', '27'], ['IN', 'Inde', '₹', '91'], ['CN', 'Chine', '¥', '86'], ['AE', 'Émirats arabes unis', 'AED', '971'],
  ['SA', 'Arabie saoudite', 'SAR', '966'], ['BR', 'Brésil', 'R$', '55'],
];
const COMPANY_FORMS = ['Entreprise individuelle', 'SARL', 'SARLU', 'SA', 'SAS', 'SASU', 'Coopérative', 'Association', 'Auto-entrepreneur', 'Autre'];
const countryOf = (code) => COUNTRIES.find((c) => c[0] === code) || COUNTRIES[0];
const countryName = (code) => countryOf(code)[1];
const currencyFor = (code) => countryOf(code)[2];
const dialOf = (code) => countryOf(code)[3] || '';
const countryOptions = (sel) => COUNTRIES.map((c) => `<option value="${c[0]}" ${c[0] === sel ? 'selected' : ''}>${c[1]} — ${c[2]}</option>`).join('');
const formOptions = (sel) => COMPANY_FORMS.map((f) => `<option value="${f}" ${f === sel ? 'selected' : ''}>${f}</option>`).join('');
const fresh = () => ({
  shop: '', products: [], parties: [], suppliers: [], sales: [], expenses: [], withdrawals: [], docs: [], debts: [], moves: [], mailLog: [], log: [], tomb: [],
  seq: { DEV: 0, FAC: 0 },
  settings: { lang: 'fr', ads: false, reminder: { ...DEFAULTS }, invReminder: {}, invRemindDays: 7, autoRemind: false, autoRemindDay: '', autoRemindInfo: null, country: 'CI', currency: 'FCFA', companyForm: '', city: '', district: '', address: '', vat: 18, remindDays: 30, inactiveDays: 30, autoRemindInactive: false },
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
/* Numéro WhatsApp de l'équipe, réglé dans /admin : sans lui, ni demande
   d'activation ni bouton de support. Aucun numéro n'est écrit dans le code. */
const SUPPORT = { wa: '' };
/* Un seul lien officiel, réglé dans /admin : celui qu'on partage, celui des
   QR et celui des e-mails. Vide : l'adresse du navigateur fait l'affaire. */
let OFFICIAL = '';

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
/* Filtre par vendeur : les ventes gardent le nom saisi à l'encaissement. */
let histSeller = 'all';
/* Comptes vendeurs de la boutique, pour rattacher une vente ancienne : celles
   saisies avant que l'application n'enregistre l'identifiant du compte. */
let sellerIds = [];
let sellerIdsAsked = false;
/* Nom saisi et nom de compte : casse et espaces ignorés. */
const normName = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
/* Le bandeau du patron : une vente, ou plusieurs. */
const looseSalesText = (n) => T(n === 1 ? 'unattachedSale' : 'unattachedSales').replace('{n}', String(n));
async function loadSellerIds() {
  if (isStaff() || sellerIdsAsked) return sellerIds;
  sellerIdsAsked = true;
  const r = await api('/api/staff');
  if (!r.ok || !r.data) { sellerIdsAsked = false; return sellerIds; }
  const staff = r.data.staff || [];
  sellerIds = staff
    .map((u) => ({ id: u.id, name: u.name || u.email || u.phone || '' }))
    .filter((u) => u.id && u.name);
  if (!isStaff()) autoAttachSales();
  if (sellerIds.length && tab === 'hist') render();
  return sellerIds;
}
function autoAttachSales() {
  if (isStaff() || !sellerIds.length) return 0;
  const byName = new Map(sellerIds.map((u) => [normName(u.name), u.id]));
  let n = 0;
  for (const s of db.sales || []) {
    if (!s || s.byId) continue;
    const id = byName.get(normName(s.by));
    if (!id) continue;
    s.byId = id;
    s.u = Date.now();
    n += 1;
  }
  if (n) saveDB();
  return n;
}
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
/* Clients qui n'ont plus rien acheté depuis un moment : une relance douce, à
   la main, qui ne coûte rien et ne part jamais toute seule. Le seuil se règle
   dans Réglages ; la relance n'existe que pour un client joignable, donc avec
   un numéro enregistré. */
const DEFAULTS_INACTIVE = 30;
const inactiveDays = () => Math.max(7, Math.round(Number(db.settings.inactiveDays) || DEFAULTS_INACTIVE));
function inactiveClients() {
  const last = new Map();
  db.sales.forEach((s) => {
    const name = String(s.party || '').trim();
    if (!name || name === '—') return;
    if (!last.has(name) || s.date > last.get(name)) last.set(name, s.date);
  });
  return [...last.entries()]
    .map(([name, date]) => ({
      name, date, days: daysSince(date),
      phone: String((db.parties.find((p) => p.name === name) || {}).phone || '').trim(),
    }))
    .filter((x) => x.days >= inactiveDays())
    .sort((a, b) => b.days - a.days)
    .slice(0, 40);
}
function inactiveText(x) {
  return T('inactiveMsg')
    .replace('[Client]', x.name)
    .replace('[Boutique]', db.shop || T('app'))
    .replace('[Jours]', x.days);
}
const stockValue = () => db.products.reduce((a, p) => a + qtyOf(p) * p.buy, 0);
const num = (kind) => {
  const y = new Date().getFullYear();
  db.seq[kind] = (db.seq[kind] || 0) + 1;
  return kind + '-' + y + '-' + String(db.seq[kind]).padStart(3, '0');
};
const lang = () => db.settings.lang || 'fr';
/* Le français arrive avec la page ; l'anglais et l'arabe sont chargés à la
   demande (22 et 21 Ko de moins à télécharger pour qui lit en français).
   Sans réseau au premier changement : on reste en français, rien ne casse. */
const i18nLoading = {};
function ensureLang(id) {
  const l = ['fr', 'en', 'ar'].includes(id) ? id : 'fr';
  if (I18N[l]) return Promise.resolve(l);
  if (!i18nLoading[l]) {
    i18nLoading[l] = new Promise((resolve) => {
      const min = document.querySelector('script[src$="i18n.min.js"]');
      const s = document.createElement('script');
      s.src = 'i18n-' + l + (min ? '.min.js' : '.js');
      s.onload = () => resolve(I18N[l] ? l : 'fr');
      s.onerror = () => { i18nLoading[l] = null; resolve('fr'); };
      document.head.appendChild(s);
    });
  }
  return i18nLoading[l];
}
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
const BIG_KEY = 'ac_bigtext';
const bigTextOn = () => { try { return localStorage.getItem(BIG_KEY) === '1'; } catch { return false; } };
function applyBigText() {
  document.body.classList.toggle('bigText', bigTextOn());
}
function render() {
  applyLang();
  applyBigText();
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
  document.getElementById('app').innerHTML = premiumWarning() + sizeWarning() + (tab === 'vendre' ? ads.top : '') + view + (tab === 'vendre' ? ads.bottom : '');
  const renew = document.querySelector('[data-premium-renew]');
  if (renew) renew.onclick = renewPremium;
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
  /* La publicité finance la version gratuite : un compte Premium n'en voit pas. */
  if (!ADS.client || !db.settings.ads || !navigator.onLine || isPremium()) return { top: '', bottom: '' };
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
    ${autoWaNote()}
    <div class="big">
      <button class="btn" data-act="sale">＋ ${T('sell')}</button>
      ${isStaff() ? '' : `<button class="btn out" data-act="expense">− ${T('expense')}</button>`}
    </div>
    ${isStaff() ? '' : `<button class="btn out" data-act="withdraw">${T('withdraw')}</button>`}
    <button class="btn out" data-act="pastSale">📅 ${T('pastSale')}</button>
    <button class="btn out" data-act="guide">❓ ${T('guideOpen')}</button>
    <div class="card" style="margin-top:16px"><h3 style="display:flex;justify-content:space-between;align-items:center;gap:8px">${T('today')}<button class="btn small out" data-act="hist">${T('history')}</button></h3>${list || `<p class="empty">${T('nothing')}</p>`}</div>`;
}

/* ---------------- Stock ---------------- */
function stock() {
  const p = [...db.products].sort((a, b) => a.name.localeCompare(b.name));
  /* La valeur du stock repose sur les prix d'achat : masquée au vendeur, qui
     verrait sinon un montant faux (achats inconnus de lui). */
  return `<div class="kpis">
      ${isStaff() ? '' : `<div class="kpi"><span>${T('stockValue')}</span><b>${money(stockValue())}</b></div>`}
      <div class="kpi"><span>${T('toRenew')}</span><b>${p.filter((x) => qtyOf(x) <= x.alert).length}</b></div>
    </div>
    <div class="card"><h3>${T('articles')}</h3>
      ${p.map((x) => { const q = qtyOf(x); return `<div class="row"><div><div class="t">${esc(x.name)} ${!isStaff() && !costKnownOf(x.buy) ? `<span class="tag warn">${T('buyZero')}</span>` : ''}</div><div class="s">${isStaff() ? `${T('sellPrice')} ${money(x.sell)}` : `${T('buyPrice')} ${money(x.buy)} · ${T('sellPrice')} ${money(x.sell)} · ${T('margin')} ${money(x.sell - x.buy)}`}</div></div>    <div class="right">${q <= 0 ? `<span class="tag bad">${T('outOfStock')}</span>` : q <= x.alert ? `<span class="tag warn">${T('left')} ${q}</span>` : `<span class="tag">${q}</span>`}<br><button class="btn small out" data-act="editProduct" data-id="${x.id}">${T('edit')}</button>      ${canDeleteItems() ? `<button class="btn small out" data-act="delProduct" data-id="${x.id}">${T('delete')}</button>` : ''}</div></div>`; }).join('') || `<p class="empty">${T('noArticles')}</p>`}
    </div>
    ${canEditPrices() ? `<div class="card"><h3>${T('addArticle')}</h3>
      <label>${T('name')}</label><input id="pName" placeholder="Savon">
      ${isStaff() ? '' : `<label>${T('buyPrice')}</label><input id="pBuy" inputmode="numeric" placeholder="0">`}
      <label>${T('sellPrice')}</label><input id="pSell" inputmode="numeric" placeholder="0">
      <label>${T('qty')}</label><input id="pQty" inputmode="numeric" value="0">
      <label>${T('alertAt')}</label><input id="pAlert" inputmode="numeric" value="3">
      <button class="btn" data-act="addProduct">${T('saveArticle')}</button>
    </div>` : `<p class="hint">${T('createLocked')}</p>`}`;
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
      <div class="card"><h3>${T('inactiveTitle')}</h3>
        <p class="hint">${T('inactiveHint')} ${inactiveDays()} ${T('days')}</p>
        ${inactiveClients().map((x) => `<div class="row"><div><div class="t">${esc(x.name)}</div><div class="s">${dayFR(x.date)} · ${x.days} ${T('days')}</div></div><div class="right">
          ${x.phone ? `<button class="btn small whats" data-act="waInactive" data-name="${esc(x.name)}">${T('remind')}</button>` : `<span class="tag">${x.days} ${T('days')}</span>`}</div></div>`).join('') || `<p class="empty">${T('noInactive')}</p>`}
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
/* Un vendeur ne voit dans l'historique que les ventes qu'il a enregistrées.
   Les ventes antérieures n'ont pas d'identifiant : on retombe sur le nom
   saisi à l'encaissement. */
function ownSaleOnly(s) {
  if (!isStaff() || !me) return true;
  if (s.byId) return s.byId === me.id;
  const name = String(s.by || '').trim();
  return !!name && (name === actorName() || name === lastSeller());
}
function histSales() {
  const term = String(histQuery || '').trim().toLowerCase();
  return db.sales.filter((s) => inPeriod(s.date, histPeriod))
    .filter(ownSaleOnly)
    .filter((s) => histMethod === 'all' || s.method === histMethod)
    .filter((s) => histSeller === 'all' || String(s.by || '').trim() === histSeller)
    .filter((s) => !term || [s.party, s.product, s.method, s.by, s.date, dayFR(s.date), String(s.total), money(s.total)].join(' ').toLowerCase().includes(term))
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
function assignButton(id, act) {
  if (isStaff() || !sellerIds.length) return '';
  return `<button class="btn small out" data-act="${act}" data-id="${id}">👤 ${esc(T('assign'))}</button>`;
}
function sellerPicker(onPick) {
  const d = modal(`<div class="sheetHead"><h2>${esc(T('assignTitle'))}</h2><button type="button" class="sheetClose" aria-label="${esc(T('close'))}">✕</button></div>
    ${sellerIds.map((u) => `<button class="btn out" data-pick="${esc(u.id)}">👤 ${esc(u.name)}</button>`).join('')}
    <button class="btn out" data-pick="none">${esc(T('assignNobody'))}</button>`);
  const close = d.querySelector('.sheetClose');
  if (close) close.onclick = () => d.remove();
  d.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pick]');
    if (!b) return;
    const pick = b.dataset.pick === 'none' ? '' : b.dataset.pick;
    d.remove();
    onPick(pick);
  });
}
function histRows(list) {
  return list.map((s) => `<div class="row"><div><div class="t">${money(s.total)}${s.party ? ' · ' + esc(s.party) : ''}</div>      <div class="s">${dayFR(s.date)} · ${esc(methodLabel(s.method))}${s.product ? ' · ' + esc(s.product) + ' ×' + s.qty : ''}${s.by ? ' · ' + esc(s.by) : ''}</div></div><div class="right">
      ${s.delivered === false ? `<span class="tag warn">${T('saleNotDelivered')}</span> ` : ''}${creditOf(s) ? `<span class="tag warn">${T('remains')} ${money(creditOf(s))}</span>` : `<span class="tag ok">${T('paid')}</span>`}<br>
      ${s.delivered === false ? `<button class="btn small out" data-act="deliverSale" data-id="${s.id}">${T('markSaleDelivered')}</button>` : ''}
      <button class="btn small whats" data-act="waSale" data-id="${s.id}">${T('receipt')}</button>
      <button class="btn small pdf" data-act="receiptPdf" data-id="${s.id}">${T('pdf')}</button>
      ${s.byId ? '' : assignButton(s.id, 'assignSale')}<button class="btn small out" data-act="editSale" data-id="${s.id}">${T('edit')}</button>
    </div></div>`).join('') || `<p class="empty">${T('noSalesFound')}</p>`;
}
function histListHTML(list, shown) {
  const n = Math.min(shown, list.length);
  const more = n < list.length ? `<button class="btn out" data-act="histMore">${T('showMore')} · ${n} / ${list.length}</button>` : '';
  return histRows(list.slice(0, n)) + `<div id="histMoreWrap">${more}</div>`;
}
function hist() {
  loadSellerIds();
  const loose = sellerIds.length ? db.sales.filter((s) => s && !s.byId).length : 0;
  const list = histSales();
  const chip = (p, label) => `<button class="btn ${histPeriod === p ? '' : 'out'}" data-act="histPeriod" data-p="${p}">${label}</button>`;
  const methods = [...new Set(db.sales.map((s) => s.method).filter(Boolean))];
  const sellers = [...new Set(db.sales.map((s) => String(s.by || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return `<button class="btn out" data-act="back">← ${T('back')}</button>
    <h2 style="margin-top:12px">${T('history')}</h2>
    <button class="btn out" data-act="exportCsv">${T('exportCsv')}</button>
    <div class="card"><h3>${T('period')}</h3><div class="big">${chip('jour', T('today'))}${chip('mois', T('thisMonth'))}${chip('annee', T('thisYear'))}${chip('tout', T('all'))}</div></div>
    <div class="card">
      <input id="histSearch" type="search" placeholder="${T('searchSales')}" value="${esc(histQuery)}" autocomplete="off">
      <label>${T('method')}</label>
      <select id="histMethod"><option value="all">${T('allMethods')}</option>${methods.map((m) => `<option value="${esc(m)}" ${m === histMethod ? 'selected' : ''}>${esc(methodLabel(m))}</option>`).join('')}</select>
      ${sellers.length ? `<label>${T('colSeller')}</label>
      <select id="histSeller"><option value="all">${T('allSellers')}</option>${sellers.map((n) => `<option value="${esc(n)}" ${n === histSeller ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
    </div>
    ${isStaff() ? `<p class="hint">${T('histMineHint')}</p>` : ''}
    ${loose ? `<p class="hint">${esc(looseSalesText(loose))}</p>` : ''}
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
/* Ce que la programmation a fait aujourd'hui, en une ligne : pas de promesse
   d'envoi, puisque WhatsApp demande toujours une touche du commerce. La liste
   reste joignable jusqu'à minuit, même si la fenêtre a été fermée trop tôt. */
function autoWaNote() {
  const s = db.settings || {};
  if (!s.autoRemind && !s.autoSupRemind) return '';
  if (s.autoRemindDay !== todayISO()) return '';
  const n = waRemindTargets().length;
  return `<p class="hint">${T('autoWaReady')}</p>`
    + (n ? `<button class="btn out" data-act="autoWaAgain">${T('autoWaOpen')} (${n})</button>` : '');
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
  return `<div class="card"><h3>${T('remindLog')}</h3>
    ${logFilterBar()}
    ${log.length ? '' : `<p class="empty">${T('logEmpty')}</p>`}
    ${log.map((e) => {
      const when = e.at ? `${dayFR(isoOf(new Date(e.at)))} ${clock(e.at)}` : '';
      return `<div class="row"><div><div class="t">${esc(e.number || '—')} · ${esc(e.party || '—')}</div>
        <div class="s">${when} · ${e.channel === 'email' ? T('channelEmail') : T('channelWhatsapp')}${e.to ? ' · ' + esc(e.to) : ''}</div></div>
        <div class="right">${e.ok ? `<span class="tag ok">${money(e.amount || 0)}</span>` : `<span class="tag bad">${T('sendFailed')}</span>`}${e.channel === 'wa' && e.docId ? `<br><button class="btn small out" data-act="resendRemind" data-log="${e.id}">${T('resend')}</button>` : ''}</div></div>`;
    }).join('')}
    ${log.length ? `<button class="btn out" data-act="exportLog">${T('exportLog')}</button>` : ''}
  </div>`;
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
/* Renvoyer une relance WhatsApp du journal : la facture est retrouvée par son
   identifiant, le message est reconstruit, puis une trace est ajoutée. */
async function resendReminder(logId) {
  const e = (db.mailLog || []).find((x) => x.id === logId);
  if (!e) return;
  const d = db.docs.find((x) => x.id === e.docId);
  if (!d) { alert(T('resendDocGone')); return; }
  /* Une facture réglée entre-temps ne doit plus être réclamée. */
  if (d.paidDate) { alert(T('resendPaid')); return; }
  const phone = d.clientPhone || (db.parties.find((p) => p.name === d.party) || {}).phone || '';
  if (!waOpen(phone, invoiceReminderText(d))) return;
  d.remindedAt = todayISO();
  d.u = Date.now();
  logRemind({ docId: d.id, number: d.number, party: d.party || '', amount: amountOf(d), channel: 'wa', to: phone, ok: true });
  saveDB(); render();
}
function bilans() {
  const { ca, cash, dep, purchases, cogs, profit, unknownCost, invoices, inv, invDue, due, wd } = figures(period);
  const rm = remindStats(period);
  const chip = (p, label) => `<button class="btn ${period === p ? '' : 'out'}" data-act="period" data-p="${p}">${label}</button>`;
  return `<div class="card"><h3>${T('period')}</h3><div class="big">
      ${chip('jour', T('today'))}${chip('mois', T('thisMonth'))}${chip('annee', T('thisYear'))}${chip('tout', T('all'))}
    </div><button class="btn out" data-act="hist">${T('history')}</button>${isStaff() ? '' : `<button class="btn out" data-act="report">${T('monthlyReport')}</button>`}<button class="btn out" data-act="journal">${T('journal')}</button></div>
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
  /* Le patron voit tout et filtre par vendeur ; un vendeur ne voit que ses
     propres actions, avec leurs montants (le serveur masque les autres). */
  const staff = isStaff();
  /* Un ancien nom est parfois une e-mail : on affiche le nom du compte. */
  const byName = (e) => {
    const id = e && e.byId ? String(e.byId) : '';
    const mine = me && me.id === id ? me.name : '';
    const seller = id ? (sellerIds.find((u) => u.id === id) || {}).name : '';
    const label = String(mine || seller || (e && e.by) || '').trim();
    return label && !label.includes('@') ? label : T('account');
  };
  const sorted = () => (db.log || [])
    .filter((e) => e && (!staff || (me && e.byId === me.id)))
    .slice().sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  let who = 'all';
  const d = modal(`<div class="sheetHead"><h2>${T('journal')}</h2><button type="button" class="sheetClose" id="jClose" aria-label="${T('close')}">✕</button></div>
    <p class="hint">${staff ? T('journalMineHint') : T('journalHint')}</p>${staff ? '' : '<div class="chips" id="jWho"></div>'}
    <button class="btn out" id="jCsv">${T('journalCsv')}</button><div id="jList"></div>`);
  d.querySelector('#jClose').onclick = () => d.remove();
  d.querySelector('#jCsv').onclick = () => {
    downloadJournal(sorted().filter((e) => who === 'all' || byName(e) === who));
  };
  const paint = () => {
    const all = sorted();
    const box = d.querySelector('#jWho');
    if (box) {
      const names = [...new Set(all.map(byName))];
      box.innerHTML = `<button class="btn small ${who === 'all' ? '' : 'out'}" data-who="all">${T('all')}</button>`
        + names.map((n) => `<button class="btn small ${who === n ? '' : 'out'}" data-who="${esc(n)}">${esc(n)}</button>`).join('');
      box.querySelectorAll('[data-who]').forEach((b) => { b.onclick = () => { who = b.dataset.who; paint(); }; });
    }
    const list = all.filter((e) => who === 'all' || byName(e) === who).slice(0, 100);
    d.querySelector('#jList').innerHTML = list.map((e) => `<div class="row"><div><div class="t">${esc(T(ACT_LABEL[e.act] || e.act))}${Number(e.amount) > 0 ? ' · ' + money(e.amount) : ''}</div><div class="s">${dayFR(isoOf(e.at))} · ${esc(clock(e.at))}${e.label ? ' · ' + esc(e.label) : ''}</div></div><div class="right">${e.byId ? '' : assignButton(e.id, 'assignLog')}<span class="tag">${esc(byName(e))}</span></div></div>`).join('')
      || `<p class="empty">${T('noJournal')}</p>`;
  };
  if (!staff) {
    loadSellerIds().then(() => { if (sellerIds.length) paint(); });
    d.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act="assignLog"]');
      if (!b) return;
      const entry = (db.log || []).find((x) => x.id === b.dataset.id);
      if (!entry) return;
      sellerPicker((id) => {
        entry.byId = id;
        if (id && !String(entry.by || '').trim()) {
          const u = sellerIds.find((x) => x.id === id);
          if (u) entry.by = u.name;
        }
        entry.u = Date.now();
        saveDB(); paint();
      });
    });
  }
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
    <button class="btn out" id="rpNo">${T('cancel')}</button>
    ${window.jspdf || arabicPdf() ? '' : `<p class="hint">${T('pdfFirstHint')}</p>`}`);
  m.querySelector('#rpNo').onclick = () => m.remove();
  m.querySelector('#rpOk').onclick = () => { const k = m.querySelector('#rpMonth').value; m.remove(); downloadReport(k); };
}
/* jsPDF ne sait pas écrire l'arabe : il n'a ni la police ni la liaison des
   lettres, et un PDF arabe sortirait en carrés. Plutôt qu'un document
   illisible, en arabe on imprime la feuille HTML : le téléphone dessine
   l'arabe correctement, puis on choisit « Enregistrer en PDF » dans la
   fenêtre d'impression. */
const arabicPdf = () => lang() === 'ar';
/* Une seule sortie pour toutes les feuilles (reçu, facture, rapport, fiche
   client, fiche fournisseur, mentions légales) : en français le navigateur
   fait un PDF correct, on imprime tout de suite ; en arabe le texte n'est
   juste que dessiné par le téléphone, on explique donc qu'il faut choisir
   « Enregistrer en PDF » après « Imprimer ». */
function printAreaNow() {
  if (!arabicPdf()) { window.print(); return; }
  const m = modal(`<h2>${T('pdfArabicTitle')}</h2><p class="hint">${T('pdfArabic')}</p>
    <button class="btn" id="psOk">${T('printNow')}</button>
    <button class="btn out" id="psNo">${T('cancel')}</button>`);
  m.querySelector('#psNo').onclick = () => m.remove();
  m.querySelector('#psOk').onclick = () => { m.remove(); window.print(); };
}
function printHtml(html, cls) {
  const area = document.getElementById('printArea');
  area.className = cls || 'a4';
  area.innerHTML = html;
  printAreaNow();
}
/* QR du reçu : le client scanne l'image et retrouve la boutique. Dessiné
   module par module dans le PDF (net à l'impression, aucune image à charger)
   et en SVG dans la feuille imprimée. */
const appUrl = () => (OFFICIAL ? OFFICIAL.replace(/\/+$/, '') + '/' : location.origin + location.pathname);
async function qrCode(text) {
  const QR = await loadQR();
  if (!QR) return null;
  try { const qr = QR(0, 'M'); qr.addData(text); qr.make(); return qr; } catch { return null; }
}
async function addQrPdf(pdf, text, x, y, size) {
  const qr = await qrCode(text);
  if (!qr) return false;
  const n = qr.getModuleCount();
  const cell = size / n;
  pdf.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) pdf.rect(x + c * cell, y + r * cell, cell, cell, 'F');
  return true;
}
/* Reçu d'une vente en HTML : même contenu que le PDF, mais écrit par le
   téléphone pour que l'arabe reste lisible. */
async function receiptHtml(s) {
  const st = db.settings || {};
  const qr = await qrCode(presentationUrl('doc'));
  const qrTag = qr ? `<div class="qrbox">${qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true })}</div>` : '';
  return `${st.logo ? `<img class="docLogo" src="${esc(st.logo)}" alt="">` : ''}
    <h2>${esc(db.shop || T('app'))}</h2>
    <div class="small">${dayFR(s.date)}</div>
    ${s.party ? `<div class="small">${esc(s.party)}</div>` : ''}
    <hr>
    ${s.product ? `<div>${esc(s.product)} × ${esc(s.qty)}</div>` : ''}
    <div class="tot"><span>${T('total')}</span><span>${money(s.total)}</span></div>
    ${creditOf(s) > 0 ? `<div class="small">${T('paid')} : ${money(paidOf(s))} · ${T('remains')} : ${money(creditOf(s))}</div>` : ''}
    <div class="small">${T('method')} : ${esc(s.method || '—')}</div>
    <hr>
    ${qrTag}
    <p class="small">${T('thanks')}</p>
    <p class="small">${T('madeWith')}</p>`;
}
/* Rapport mensuel en HTML : les mêmes lignes que le PDF, en tableau lisible
   dans les deux sens d'écriture. */
function reportHtml(monthKey) {
  const f = figures('mois', monthKey);
  const st = db.settings || {};
  const place = [st.address, st.district, st.city, countryName(st.country || 'CI')].filter(Boolean).join(' · ');
  const rows = [];
  const section = (title) => rows.push(`<tr class="sec"><td colspan="2"><b>${esc(title)}</b></td></tr>`);
  const row = (label, value, strong) => rows.push(`<tr><td>${strong ? `<b>${esc(label)}</b>` : esc(label)}</td><td class="num">${strong ? `<b>${esc(value)}</b>` : esc(value)}</td></tr>`);
  section(T('reportActivity'));
  row(T('revenue'), money(f.ca), true);
  row(T('saleCount'), String(f.sales.length));
  row(T('invoicesPaid'), `${f.invoices.length} · ${money(f.inv)}`);
  row(T('collected'), money(f.cash));
  row(T('expenses'), money(f.dep));
  row(T('goodsPurchases'), money(f.purchases));
  row(f.unknownCost.length ? T('profitEstimated') : T('profit'), money(f.profit), true);
  const rm = remindStats('mois', monthKey);
  if (rm.count) {
    section(T('remindStats'));
    row(T('remindedCount'), `${rm.count} · ${money(rm.amount)}`);
    row(T('paidAfterRemind'), `${rm.paid} · ${money(rm.paidAmount)}${rm.amount ? ` (${rm.rate} %)` : ''}`, true);
    row(T('stillUnpaid'), `${rm.unpaid} · ${money(rm.unpaidAmount)}`);
  }
  const journalRows = journalSummary(monthKey);
  if (journalRows.length) {
    section(T('journal'));
    journalRows.forEach((s) => {
      row(`${s.name} (${s.n} ${s.n === 1 ? T('actionOne') : T('actionMany')})`, `${s.sales} ${T('jSale')} · ${money(s.salesAmount)}`);
      if (s.expenses) row(T('expenses'), `${s.expenses} · ${money(s.expensesAmount)}`);
    });
  }
  section(T('reportSituation'));
  row(T('uncollected'), money(f.due));
  row(T('debts'), money(totalDebt()));
  row(T('stockValue'), money(stockValue()));
  row(T('withdrawals'), money(f.wd));
  const byLabel = {};
  f.exp.forEach((e) => { byLabel[e.label] = (byLabel[e.label] || 0) + (Number(e.amount) || 0); });
  const labels = Object.entries(byLabel).sort((a, b) => b[1] - a[1]);
  if (labels.length) { section(T('reportExpenses')); labels.forEach(([k, v]) => row(k, money(v))); }
  const monthDocs = (db.docs || []).filter((d) => d.kind === 'FAC' && String(d.date || '').slice(0, 7) === monthKey)
    .sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1));
  if (monthDocs.length) {
    section(T('reportInvoices'));
    monthDocs.forEach((d) => row(`${d.number || '—'} · ${d.party || '—'}`, `${money(amountOf(d))} · ${d.paidDate ? T('invoicePaid') : T('invoiceUnpaid')}`));
    row(T('invoicesPaid'), money(monthDocs.filter((d) => d.paidDate).reduce((a, d) => a + amountOf(d), 0)), true);
    row(T('unpaidInvoices'), money(monthDocs.filter((d) => !d.paidDate).reduce((a, d) => a + amountOf(d), 0)), true);
  }
  const byClient = {};
  f.sales.forEach((s) => { const c = creditOf(s); if (c > 0) { const k = s.party || '—'; byClient[k] = (byClient[k] || 0) + c; } });
  const tops = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (tops.length) { section(T('reportLate')); tops.forEach(([k, v]) => row(k, money(v))); }
  return `<h2>${esc(T('monthlyReport'))}</h2>
    <div class="small">${esc(monthLabel(monthKey))} · ${esc(db.shop || T('app'))}</div>
    ${place ? `<div class="small">${esc(place)}</div>` : ''}
    <table class="rep">${rows.join('')}</table>
    <p class="small">${T('generatedOn')} ${dayFR(todayISO())}</p>`;
}
async function reportPdf(monthKey) {
  if (arabicPdf()) { printHtml(reportHtml(monthKey)); return null; }
  const lib = await loadJsPDF();
  if (!lib) return alert(T('pdfNeedsNet'));
  const { jsPDF } = lib;
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
      row(`${s.name} (${s.n} ${s.n === 1 ? T('actionOne') : T('actionMany')})`, `${s.sales} ${T('jSale')} · ${pm(s.salesAmount)}`);
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
    if (!blob) return;
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
  printAreaNow();
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
  printAreaNow();
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
  printAreaNow();
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
/* Vente faite avant l'application. Elle compte à sa vraie date, ne touche pas
   au stock (les articles sont déjà sortis) et n'ouvre pas de dette : on ne sait
   pas si l'argent est rentré, donc elle est réputée encaissée. */
function pastSaleRecord(input) {
  const src = input || {};
  const total = Math.max(0, Math.round(Number(src.total) || 0));
  const date = String(src.date || '');
  const today = String(src.today || todayISO());
  if (total <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return null;
  const product = String(src.product || '').trim().slice(0, 60);
  return {
    id: src.id || uid(),
    date,
    total,
    paid: total,
    method: src.method || 'Espèces',
    product,
    qty: product ? Math.max(1, Math.round(Number(src.qty) || 1)) : 0,
    pid: '',
    cost: 0,
    costKnown: false,
    delivered: true,
    party: String(src.party || '').trim().slice(0, 60),
    by: String(src.by || '').trim().slice(0, 40),
    u: Date.now(),
  };
}
function pastSaleModal() {
  const today = todayISO();
  const d = modal(`<div class="sheetHead"><h2>${T('pastSale')}</h2><button type="button" class="sheetClose" id="pClose" aria-label="${T('close')}">✕</button></div>
    <p class="hint">${T('pastSaleHint')}</p>
    <label>${T('pastSaleDate')}</label><input id="pDate" type="date" value="${today}" max="${today}">
    <label>${T('product')}</label><input id="pProduct" maxlength="60" placeholder="Savon">
    <label>${T('amount')}</label><input id="pAmount" inputmode="numeric" placeholder="0">
    <div class="sheetFoot"><p class="err" id="pErr"></p>
      <button class="btn" id="pOk">${T('pastSaleSave')}</button>
      <button class="btn out" id="pNo">${T('cancel')}</button></div>`);
  const err = (m) => { d.querySelector('#pErr').textContent = m; };
  d.querySelector('#pNo').onclick = () => d.remove();
  d.querySelector('#pClose').onclick = () => d.remove();
  d.querySelector('#pOk').onclick = () => {
    const date = d.querySelector('#pDate').value;
    if (!date) { err(T('pastSaleDate')); return; }
    if (date > todayISO()) { err(T('pastSaleFuture')); return; }
    const sale = pastSaleRecord({ date, product: d.querySelector('#pProduct').value, total: d.querySelector('#pAmount').value });
    if (!sale) { err(T('errorAmount')); return; }
    db.sales.push(sale);
    logAct('sale', sale.product || T('sale'), sale.total);
    saveDB(); d.remove(); render();
    alert(`${T('pastSaleDone')} ${dayFR(sale.date)} · ${money(sale.total)}`);
  };
}
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
    /* L'identifiant du compte rend le filtre par vendeur fiable, même si le
       nom saisi change d'un appareil à l'autre. Corriger la vente d'un vendeur
       ne la lui vole pas : une attribution déjà enregistrée est conservée. */
    sale.byId = src && src.byId ? src.byId : (me && me.id ? me.id : '');
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
/* Relance programmée : le commerce choisit la fréquence, le jour et l'heure.
   WhatsApp ne part jamais seul (il faut une touche), donc à l'heure dite
   l'application prépare la liste et ouvre un message prêt par destinataire. */
function autoHourOf(s) {
  const h = Number((s || {}).autoRemindHour);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? Math.round(h) : 9;
}
const AUTO_HOURS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20];
const hoursList = () => [...new Set([...AUTO_HOURS, autoHourOf(db.settings)])].sort((a, b) => a - b);
const weekdayName = (n) => new Date(2024, 0, n).toLocaleDateString(lang(), { weekday: 'long' });
const localDay = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
/* Vrai quand l'heure choisie est passée, le bon jour, et que rien n'est encore
   parti aujourd'hui : l'ouverture de l'application est le seul déclencheur. */
function autoDue(now, st) {
  const s = st || db.settings || {};
  if (!s.autoRemind && !s.autoSupRemind) return false;
  const d = now || new Date();
  if (d.getHours() < autoHourOf(s)) return false;
  if ((s.autoRemindEvery || 'jour') === 'semaine') {
    const today = d.getDay() === 0 ? 7 : d.getDay();
    const wanted = Math.min(7, Math.max(1, Math.round(Number(s.autoRemindWeekday) || 1)));
    if (today !== wanted) return false;
  }
  return s.autoRemindDay !== localDay(d);
}
/* Message au fournisseur : WhatsApp est le seul canal, donc son numéro. Les
   fragments évitent les phrases à trous dans les trois langues. */
const SUP_REMIND = {
  fr: 'Bonjour [Nom du Fournisseur],\n\nIl reste [Montant] à payer.\n\n[Nom de la Boutique]',
  en: 'Hello [Nom du Fournisseur],\n\n[Montant] is still to be paid.\n\n[Nom de la Boutique]',
  ar: 'مرحبا [Nom du Fournisseur]،\n\nبقي [Montant] للدفع.\n\n[Nom de la Boutique]',
};
function supplierReminderText(item) {
  const tpl = SUP_REMIND[lang()] || SUP_REMIND.fr;
  return tpl.replaceAll('[Nom du Fournisseur]', item.name)
    .replaceAll('[Nom de la Boutique]', db.shop || T('shop'))
    .replaceAll('[Montant]', money(item.rest));
}
/* Ce qui reste dû à chaque fournisseur, avec son numéro : sans numéro, pas de
   relance possible, donc la ligne disparaît de la liste. */
function supplierDueItems(debts, suppliers) {
  const list = Array.isArray(debts) ? debts : [];
  const dir = Array.isArray(suppliers) ? suppliers : [];
  const by = new Map();
  list.forEach((x) => {
    const name = String((x && x.supplier) || '').trim();
    const rest = debtOf(x);
    if (!name || rest <= 0) return;
    by.set(name, (by.get(name) || 0) + rest);
  });
  return [...by.entries()].map(([name, rest]) => {
    const s = dir.find((x) => String((x && x.name) || '').toLowerCase() === name.toLowerCase()) || {};
    return { name, rest, phone: String(s.phone || '').trim() };
  }).filter((x) => x.phone);
}
/* La liste du jour : les factures en retard avec un numéro, et les fournisseurs
   à qui il reste quelque chose à payer, chacun avec le canal choisi. */
function waRemindTargets() {
  const s = db.settings || {};
  const out = [];
  if (s.autoRemind) {
    remindQueue().forEach((d) => {
      const p = db.parties.find((x) => x.name === d.party) || {};
      const phone = String(p.phone || d.clientPhone || '').trim();
      if (phone) out.push({ kind: 'client', id: d.id, name: d.party || T('client'), phone, text: invoiceReminderText(d), amount: amountOf(d) });
    });
  }
    if (s.autoSupRemind) supplierDueItems(db.debts, db.suppliers).forEach((x) => out.push({
    kind: 'supplier', id: 'sup:' + x.name, name: x.name, phone: x.phone,
    text: supplierReminderText(x), amount: x.rest,
  }));
  /* Les clients sans achat rejoignent la même liste programmée : un seul
     rendez-vous, une seule fenêtre, rien à preparer deux fois. */
  if (s.autoRemindInactive) inactiveClients().forEach((x) => {
    if (!x.phone) return;
    out.push({ kind: 'inactive', id: 'ina:' + x.name, name: x.name, phone: x.phone, text: inactiveText(x), amount: 0 });
  });
  return out;
}
/* Déclenchement à l'ouverture : on note le jour tout de suite (une seule
   préparation par jour), puis on montre la liste si elle n'est pas vide. */
function autoRemind() {
  const s = db.settings || {};
  /* Les relances programmées sont une fonction Premium. */
  if (!me || !isPremium() || !autoDue()) return;
  s.autoRemindDay = todayISO();
  const list = waRemindTargets();
  saveDB(false);
  /* L’accueil est redessiné avant la fenêtre : la liste du jour reste ainsi
     joignable d’un bouton, même après l’avoir fermée. */
  render();
  if (list.length) autoWaModal(list);
}
/* Les relances du jour, une ligne par destinataire : le numéro est rappelé pour
   qu'on sache à qui on écrit, et la ligne se coche dès que WhatsApp s'ouvre. */
function autoWaModal(list) {
  const m = modal(`<h2>${T('autoWaTitle')}</h2>
    <p class="hint">${T('autoWaHint')}</p>
    ${list.map((x) => `<div class="row"><div>
      <div class="t">${esc(x.name)}${x.amount ? ' · ' + money(x.amount) : ''}</div>
      <div class="s">${esc(x.phone)}</div></div>
      <div class="right"><button class="btn small whats" data-awgo="${esc(x.kind)}|${esc(x.id)}">${T('remind')}</button></div></div>`).join('')
      || `<p class="empty">${T('autoWaNone')}</p>`}
    <button class="btn out" id="awClose">${T('close')}</button>`);
  m.querySelector('#awClose').onclick = () => m.remove();
  m.querySelectorAll('[data-awgo]').forEach((btn) => {
    btn.onclick = () => {
      const item = list.find((x) => `${x.kind}|${x.id}` === btn.dataset.awgo);
      /* Fenêtre bloquée : rien n'est parti, donc rien ne se coche. */
      if (!item || !waOpen(item.phone, item.text)) return;
      if (item.kind === 'client') {
        const d = db.docs.find((x) => x.id === item.id);
        if (d) { d.remindedAt = todayISO(); d.u = Date.now(); }
        logRemind({ docId: item.id, number: (d && d.number) || '', party: item.name, amount: item.amount, channel: 'wa', to: item.phone, ok: true });
      } else {
        logRemind({ docId: '', number: '', party: item.name, amount: item.amount, channel: 'wa', to: item.phone, ok: true });
      }
      const row = btn.closest('.row');
      if (row) row.innerHTML = `<div><div class="t">${esc(item.name)}${item.amount ? ' · ' + money(item.amount) : ''}</div>
        <div class="s">${esc(item.phone)}</div></div><div class="right"><span class="tag ok">✓</span></div>`;
      saveDB(); render();
    };
  });
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
  /* Le reçu circule de téléphone en téléphone : un lien vers la présentation
     fait connaître l'application au commerçant voisin, sans rien demander. */
  lines.push(`${T('madeWith')} · ${presentationUrl('doc')}`);
  return lines.filter(Boolean).join('\n');
}
function waSale(id) {
  const s = db.sales.find((x) => x.id === id);
  if (!s) return;
  const phone = (db.parties.find((p) => p.name === s.party) || {}).phone;
  waOpen(phone, receiptText(s));
}
async function receiptPdf(s) {
  if (arabicPdf()) { printHtml(await receiptHtml(s), 'ticket'); return null; }
  const lib = await loadJsPDF();
  if (!lib) return alert(T('pdfNeedsNet'));
  const { jsPDF } = lib;
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
  /* QR de la boutique s'il tient sur la page : au premier usage hors ligne,
     le module QR peut manquer, le reçu part simplement sans lui. */
  if (y + 30 < 140) {
    const qrSize = 22;
    if (await addQrPdf(pdf, presentationUrl('doc'), (80 - qrSize) / 2, y, qrSize)) y += qrSize + 3;
  }
  pdf.setFontSize(7.5); pdf.setTextColor(90, 90, 90);
  pdf.text(T('madeWith'), 40, Math.min(y + 2, 133), { align: 'center' });
  pdf.setFontSize(8);
  pdf.text(T('thanks'), 40, Math.min(y + 7, 137.5), { align: 'center' });
  return pdf.output('blob');
}
async function shareReceiptPDF(id) {
  const s = db.sales.find((x) => x.id === id);
  if (!s) return;
  try {
    const blob = await receiptPdf(s);
    if (!blob) return;
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
    <button class="btn out" id="rdNo">${T('close')}</button>
    ${window.jspdf || arabicPdf() ? '' : `<p class="hint">${T('pdfFirstHint')}</p>`}`);
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
/* Une facture imprimée dit tout de suite si elle est réglée : le client n'a
   pas à demander, et le papier ne ment pas sur l'état du compte. */
function paidLine(d) {
  if (d.kind !== 'FAC') return '';
  return `<div class="docPaid ${d.paidDate ? 'ok' : 'warn'}">${d.paidDate ? `${T('invoicePaid')} · ${T('invoicePaidOn')} ${dayFR(d.paidDate)}` : T('invoiceUnpaid')}</div>`;
}
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
      ${paidLine(d)}
      <div class="docQr" data-qr="1"></div>
      <p class="small">${T('thanks')}</p>
      <p class="small madeWith">${T('madeWith')}</p>`;
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
    ${paidLine(d)}
    <div class="docNotes">
      <div>${T('docNote1')}</div>
      <div>${T('docNote2')}</div>
    </div>
    <div class="docQr" data-qr="1"></div>
    <div class="docMade"><span class="docQrShare" data-qr-share="1"></span><span>${T('madeWith')}</span></div>
    <div class="docBar docBarBottom"></div>
  </div>`;
}
/* Le QR est dessiné à part : sa génération est asynchrone, et la feuille doit
   rester utilisable même si le module QR manque (hors ligne). */
async function withQr(html, url) {
  let out = html;
  if (out.includes('data-qr="1"')) {
    const qr = await qrCode(url || appUrl());
    out = qr
      ? out.replace('<div class="docQr" data-qr="1"></div>', `<div class="docQr">${qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true })}</div>`)
      : out.replace('<div class="docQr" data-qr="1"></div>', '');
  }
  /* Petit QR de la marque : il ne remplace pas celui de la facture, il fait
     seulement connaître l'application au commerçant qui reçoit le papier. */
  if (out.includes('data-qr-share="1"')) {
    const qr = await qrCode(presentationUrl('doc'));
    out = qr
      ? out.replace('<span class="docQrShare" data-qr-share="1"></span>', `<span class="docQrShare">${qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true })}</span>`)
      : out.replace('<span class="docQrShare" data-qr-share="1"></span>', '');
  }
  return out;
}
/* Ce que le client verra derrière le QR : la facture telle qu'elle a été
   imprimée, dans la langue de la boutique. */
function docSnapshot(d) {
  const s = db.settings || {};
  const rate = Math.max(0, Number(d.vat) || 0);
  return {
    lang: lang(),
    rtl: lang() === 'ar',
    shop: db.shop || T('app'),
    place: [s.address, s.district, s.city, countryName(s.country || 'CI')].filter(Boolean).join(' · '),
    contact: [me && me.phone, me && me.email].filter(Boolean).join(' · '),
    title: d.kind === 'DEV' ? T('quote') : T('invoice'),
    number: d.number,
    kind: d.kind,
    date: dayFR(d.date),
    paid: !!(d.kind === 'FAC' && d.paidDate),
    paidOn: d.kind === 'FAC' && d.paidDate ? dayFR(d.paidDate) : '',
    /* Le client peut répondre à la boutique depuis la facture. Le numéro part
       sans mise en forme : le serveur ne garde de toute façon que les chiffres. */
    wa: String((db.settings && db.settings.wa) || (me && me.phone) || '').replace(/[^\d+]/g, '').replace('+', ''),
    waText: `${T('waShopText')} ${d.number}.`,
    client: { name: d.party || '', phone: d.clientPhone || '', email: d.clientEmail || '', address: d.clientAddress || '' },
    lines: (Array.isArray(d.lines) ? d.lines : []).map((l) => ({ label: l.label, qty: l.qty, price: money(+l.price), amount: money((+l.qty || 1) * +l.price) })),
    ht: money(d.total),
    vat: rate ? { label: `${T('vatShort')} ${rate} %`, value: money(vatOf(d)) } : null,
    ttc: money(amountOf(d)),
    notes: [T('docNote1'), T('docNote2')],
    labels: {
      client: T('client'), line: T('line'), qty: T('quantity'), price: T('unitPriceHT'), ht: T('ht'), total: T('ttc'),
      paid: T('invoicePaid'), unpaid: T('invoiceUnpaid'), paidOn: T('invoicePaidOn'), waShop: T('waShop'),
    },
  };
}
/* Une facture imprimée deux fois n'a pas besoin d'être republiée : on garde le
   lien tant que le contenu n'a pas bougé. Le cache est rangé par compte, pour
   qu'un vendeur qui change de boutique ne voie pas le lien de la précédente. */
const pubCache = new Map();
function contentKey(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16) + ':' + s.length;
}
const accountKey = () => String((me && (me.ownerId || me.id)) || 'anonyme');
/* Hors ligne, le lien ne peut pas être publié : le QR retombe sur l'adresse de
   la boutique, comme avant. */
async function docLink(d) {
  const snapshot = docSnapshot(d);
  /* Même logo que sur le papier : réduit à 180 px pour tenir dans la copie
     publiée, et montré seulement s'il reste une vraie image. */
  snapshot.logo = await logoForDoc();
  const json = JSON.stringify(snapshot);
  const key = accountKey() + '|' + d.number;
  const hit = pubCache.get(key);
  const hash = contentKey(json);
  if (hit && hit.hash === hash) return hit.url;
  try {
    const r = await api('/api/doc/publish', 'POST', { number: d.number, snapshot });
    if (r.ok && r.data && r.data.url) {
      const url = String(r.data.url);
      pubCache.set(key, { hash, url });
      return url;
    }
  } catch { /* réseau absent */ }
  /* Mieux vaut un lien un peu ancien que pas de lien du tout. */
  return hit ? hit.url : appUrl();
}
async function printFormat(id, format) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  const html = docHTML(d, format);
  printHtml(await withQr(html, await docLink(d)), format === 'ticket' ? 'ticket' : 'a4');
}
/* jsPDF pèse 366 Ko et ne sert qu'aux PDF : on le télécharge au premier usage,
   puis le service worker le garde pour les fois suivantes, même hors ligne. */
let qrLoad = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLoad) {
    qrLoad = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'qrcode.js';
      s.onload = () => res(window.qrcode || null);
      s.onerror = () => { qrLoad = null; res(null); };
      document.head.appendChild(s);
    });
  }
  return qrLoad;
}
let pdfLoad = null;
function loadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf);
  if (!pdfLoad) {
    pdfLoad = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'jspdf.umd.min.js';
      s.onload = () => res(window.jspdf || null);
      s.onerror = () => { pdfLoad = null; res(null); };
      document.head.appendChild(s);
    });
  }
  return pdfLoad;
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
  const link = await docLink(d);
  if (arabicPdf()) { printHtml(await withQr(docHTML(d), link)); return null; }
  const lib = await loadJsPDF();
  if (!lib) return alert(T('pdfNeedsNet'));
  const { jsPDF } = lib;
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
  /* QR de la boutique, sous les références du document. */
  await addQrPdf(pdf, link, 174, 35, 20);
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
  /* Le document est montré à d'autres commerçants : une ligne discrète et un
     petit QR vers la présentation suffisent à faire venir un voisin. */
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(90, 90, 90);
  pdf.text(T('madeWith'), 14, 284);
  await addQrPdf(pdf, presentationUrl('doc'), 180, 275, 10);
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
  if (!blob) return null;
  return new File([blob], d.number + '.pdf', { type: 'application/pdf' });
}
async function shareDocPDF(id) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  try {
    const file = await docFile(d);
    if (!file) return;
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
    const blob = await docPdf(d);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = d.number + '.pdf'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
    alert(T('pdfSaved'));
  } catch { alert(T('pdfFail')); }
}
async function previewDoc(id) {
  const d = db.docs.find((x) => x.id === id);
  if (!d) return;
  const html = docHTML(d);
  const m = modal(`<h2>${T('preview')}</h2>
    <div class="docPreview">${await withQr(html, await docLink(d))}</div>
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
  if (act === 'pastSale') pastSaleModal();
  if (act === 'guide') guideModal();
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
    if (!canEditPrices()) { alert(T('permDenied')); return; }
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
  if (act === 'waInactive') {
    const x = inactiveClients().find((c) => c.name === b.dataset.name);
    if (x) waOpen(x.phone, inactiveText(x));
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
      /* Le lien déjà envoyé au client doit dire la même chose que le papier. */
      docLink(d);
    }
  }
  /* Facture → vente : la vente devient la seule source du chiffre d'affaires,
     ce qui supprime le risque de compter la facture deux fois. Une facture déjà
     payée produit une vente soldée à sa date de règlement ; sinon la vente part
     en crédit client à la date du jour. */
  if (act === 'factureToSale') factureSaleModal(b.dataset.id);
  if (act === 'report') { if (!isPremium()) { alert(T('premiumReport')); return; } reportModal(); }
  if (act === 'journal') journalModal();
  if (act === 'print') previewDoc(b.dataset.id);
  if (act === 'waPdf') shareDocPDF(b.dataset.id);
  if (act === 'waSale') waSale(b.dataset.id);
  if (act === 'receiptPdf') shareReceiptPDF(b.dataset.id);
  if (act === 'assignSale') {
    if (isStaff()) return;
    const s = db.sales.find((x) => x.id === b.dataset.id);
    if (s) sellerPicker((id) => {
      s.byId = id;
      if (id && !String(s.by || '').trim()) {
        const u = sellerIds.find((x) => x.id === id);
        if (u) s.by = u.name;
      }
      s.u = Date.now();
      saveDB(); render();
    });
  }
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
  if (act === 'autoWaAgain') {
    const list = waRemindTargets();
    if (list.length) autoWaModal(list);
  }
  if (act === 'exportLog') downloadMailLog();
  if (act === 'resendRemind') resendReminder(b.dataset.log);
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
  if (act === 'saveName') {
    const box = document.getElementById('acName');
    const name = (box ? box.value : '').trim();
    if (name.length < 2) { alert(T('nameBad')); return; }
    api('/api/name', 'POST', { name }).then((r) => {
      if (!r.ok) { alert(T('nameBad')); return; }
      me = r.data.user;
      rememberMe(me);
      alert(T('nameSaved'));
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
/* Le logo des documents publics : 180 px suffisent pour l'écran, et la copie
   reste petite. Résultat gardé en mémoire, sinon chaque facture recalculerait
   l'image. Au-delà de 12 000 signes, la copie publiée serait trop lourde :
   mieux vaut aucun logo qu'une facture qui ne se publie pas. */
let logoDocCache = { src: '', out: '' };
function logoForDoc() {
  const src = (db.settings && db.settings.logo) || '';
  if (!src) return Promise.resolve('');
  if (logoDocCache.src === src) return Promise.resolve(logoDocCache.out);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const max = 180;
        const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((img.width || 1) * scale));
        c.height = Math.max(1, Math.round((img.height || 1) * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const out = c.toDataURL('image/jpeg', 0.7);
        const small = out.length <= 12000 ? out : '';
        logoDocCache = { src, out: small };
        resolve(small);
      } catch { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}
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
    <button class="btn" id="teamNew" ${isPremium() || staff.length < 1 ? '' : 'disabled'}>${T('teamInvite')}</button>
    ${isPremium() || staff.length < 1 ? '' : `<p class="hint">${T('premiumStaff')}</p>`}
    <div id="teamCode"></div>
    ${staff.length ? `<h3 style="margin-top:14px">${T('teamSellers')}</h3><p class="hint">${T('permHint')}</p>${staff.map((s) => `<div class="row"><div><div class="t">${esc(s.name || s.email || s.phone || '—')}</div>${s.name && (s.email || s.phone) ? `<div class="s">${esc(s.email || s.phone)}</div>` : ''}
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
    if (!res.ok) { alert(res.status === 403 && res.data && res.data.error === 'premium' ? T('premiumStaff') : T('syncPending')); return; }
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

/* ---------------- promotion ---------------- */
/* Le lien de l'application garde le canal d'où vient le visiteur (marché,
   flyer, radio) : au moment de créer son compte, il est noté une fois. */
const SRC_KEY = KEY + '.src';
function channel() {
  try { return String(localStorage.getItem(SRC_KEY) || '').replace(/[^a-z0-9-]/g, '').slice(0, 24); } catch { return ''; }
}
function rememberChannel() {
  try {
    const src = new URLSearchParams(location.search).get('src');
    if (src) localStorage.setItem(SRC_KEY, String(src).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24));
  } catch { /* stockage indisponible : pas de mesure, rien ne casse */ }
}
function presentationUrl(src) {
  /* Chaque langue a sa page, avec sa vignette : le lien partagé s'ouvre dans la
     langue de celui qui partage. */
  const page = lang() === 'fr' ? 'presentation' : 'presentation-' + (lang() === 'en' ? 'en' : 'ar');
  const u = new URL(page, location.href || location.origin + '/');
  const used = src || channel();
  if (used) u.searchParams.set('src', used);
  return u.href;
}
/* Canal d'un parrain : p- suivi du code, comme le serveur le compte. */
const refSrc = (code) => (code ? 'p-' + String(code).toLowerCase().replace(/[^a-z0-9]/g, '') : '');
const inviteUrl = (code) => presentationUrl(refSrc(code));
function openPresentation() { window.open(presentationUrl(), '_blank', 'noopener'); }
/* Un seul bouton : le téléphone propose WhatsApp, et le message est déjà écrit. */
function shareAppLink() {
  const url = presentationUrl();
  const text = T('shareAppText');
  if (navigator.share) { navigator.share({ title: T('app'), text, url }).catch(() => {}); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank');
}
function loadInstalls() {
  if (!me) return;
  api('/api/installs').then((r) => {
    const box = document.getElementById('installsBox');
    if (!box || !r.ok || !r.data || !Array.isArray(r.data.sources) || !r.data.sources.length) return;
    box.innerHTML = `<p class="hint">${T('installsLabel')} : ${r.data.sources.map((s) => `${esc(s.src)} ${Number(s.n) || 0}`).join(' · ')}</p>`;
  }).catch(() => {});
}

/* Parrainage : le code de la boutique et le nombre de commerçants venus par
   son lien. Le dernier résultat est gardé sur l'appareil pour rester lisible
   hors ligne ; un vendeur voit le code de la boutique, pas le sien. */
const refKey = () => KEY + '.ref.' + accountKey();
function cachedRef() {
  try { return JSON.parse(localStorage.getItem(refKey()) || 'null'); } catch { return null; }
}
function inviteShare(code) {
  const url = inviteUrl(code);
  const text = T('inviteText').replace('{code}', code);
  if (navigator.share) { navigator.share({ title: T('inviteTitle'), text, url }).catch(() => {}); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank');
}
function paintReferral(ref) {
  const box = document.getElementById('refBox');
  if (!box) return;
  if (!ref || !ref.code) { box.innerHTML = `<p class="hint">${T('inviteOffline')}</p>`; return; }
  box.innerHTML = `<p class="hint">${T('inviteCode')}</p>
    <div class="refCode">${esc(ref.code)}</div>
    <div class="refCount"><b>${Number(ref.count) || 0}</b><span>${T('inviteCountLabel')}</span></div>
    <button class="btn whats" id="refInvite">${T('inviteBtn')}</button>
    <div class="refQr" id="refQr"></div>
    <p class="hint" style="text-align:center">${T('inviteQrHint')}</p>
    <p class="hint" style="text-align:center">${T('inviteReward')}</p>`;
  box.querySelector('#refInvite').onclick = () => inviteShare(ref.code);
  /* Le même lien, en QR : le voisin scanne et arrive sur la présentation. */
  const qrBox = box.querySelector('#refQr');
  if (qrBox) {
    qrCode(inviteUrl(ref.code)).then((qr) => {
      if (qr) qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
    }).catch(() => {});
  }
}
function loadReferral() {
  if (!me) { paintReferral(null); return; }
  paintReferral(cachedRef());
  api('/api/referral').then((r) => {
    if (!r.ok || !r.data || !r.data.code) return;
    const ref = { code: String(r.data.code), count: Number(r.data.count) || 0 };
    try { localStorage.setItem(refKey(), JSON.stringify(ref)); } catch {}
    paintReferral(ref);
  }).catch(() => {});
}
function settingsModal() {
  let logoDraft = db.settings.logo || '';
  const d = modal(`<div class="sheetHead"><h2>${T('settings')}</h2></div>
    <div class="card">
    <div class="row"><div><div class="t">${isPremium() ? T('premiumActive') : T('premiumFreeTag')}</div>
      <div class="s">${isPremium() ? `${T('premiumUntilOn')} ${dayFR(premiumDate())}` : T('premiumPrice')}</div></div>
      <div class="right">${isPremium() ? '<span class="tag ok">Premium</span>' : `<span class="tag warn">${T('premium')}</span>`}</div></div>
    <button class="btn" id="premPay">${T('payBtn')}</button>
    ${isPremium()
      ? (SUPPORT.wa ? `<button class="btn whats" id="supGo">${T('supportTitle')}</button>` : `<p class="hint">${T('supportOff')}</p>`)
      : `<label>${T('premiumCode')}</label>
        <input id="premCode" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="ABCD2345">
        <button class="btn" id="premGo">${T('premiumCodeGo')}</button>
        <p class="hint">${T('premiumCodeHint')}</p>
        ${SUPPORT.wa ? `<button class="btn out" id="premAsk">${T('premiumGetCode')}</button>` : ''}`}
    </div>
    <label>${T('language')}</label>
    <select id="setLang">${LANGS.map((l) => `<option value="${l.id}" ${l.id === lang() ? 'selected' : ''}>${l.id === 'ar' ? 'العربية' : l.id === 'en' ? 'English' : 'Français'}</option>`).join('')}</select>
    <details data-owner><summary>${T('secShop')}</summary>
    <label>${T('shopName')}</label><input id="setShop" value="${esc(db.shop)}">
    <label>${T('companyForm')}</label><select id="setForm">${formOptions(db.settings.companyForm || '')}</select>
    <label>${T('country')}</label><select id="setCountry">${countryOptions(db.settings.country || 'CI')}</select>
    <p class="hint">${T('currency')} : <b id="setCur">${esc(db.settings.currency || currencyFor(db.settings.country || 'CI'))}</b> — ${T('currencyAuto')}</p>
    <label>${T('city')}</label><input id="setCity" value="${esc(db.settings.city || '')}">
    <label>${T('district')}</label><input id="setDistrict" value="${esc(db.settings.district || '')}">
    <label>${T('address')}</label><input id="setAddress" value="${esc(db.settings.address || '')}">
    <label>${T('shopWa')}</label><input id="setWa" inputmode="tel" value="${esc(db.settings.wa || '')}" placeholder="+${dialOf(db.settings.country || 'CI')} 00 00 00 00 00">
    <p class="hint">${T('shopWaHint')}</p>
    </details>
    <details><summary>${T('secSales')}</summary>
    <label>${T('vat')}</label><input id="setVat" inputmode="numeric" value="${esc(db.settings.vat == null ? 18 : db.settings.vat)}">
    <p class="hint">${T('vatHint')}</p>
    <label>${T('remindDays')}</label><input id="setRemindDays" inputmode="numeric" value="${esc(db.settings.remindDays == null ? 30 : db.settings.remindDays)}">
    <p class="hint">${T('remindHint')}</p>
    <label>${T('inactiveDays')}</label><input id="setInactive" inputmode="numeric" value="${esc(db.settings.inactiveDays == null ? 30 : db.settings.inactiveDays)}">
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
    ${isPremium() ? '' : `<p class="hint">${T('premiumLogo')}</p>`}
    <label>${T('reminderText')}</label><textarea id="setRem" rows="4">${esc((db.settings.reminder || DEFAULTS)[lang()])}</textarea>
    <label>${T('invReminderText')}</label><textarea id="setInvRem" rows="6">${esc(invReminderTpl())}</textarea>
    <p class="hint">${T('invReminderHint')}</p>
    <button class="btn out" id="setInvRemReset">${T('invReminderReset')}</button>
    <label>${T('remindDelay')}</label><input id="setRemDays" inputmode="numeric" value="${remindDelay()}">
    <p class="hint">${T('remindDelayHint')}</p>
    <label style="display:flex;gap:10px;align-items:center;margin-top:12px"><input type="checkbox" id="setAutoRemind" ${db.settings.autoRemind ? 'checked' : ''} style="width:auto"><span>${T('autoRemind')}</span></label>
    <p class="hint">${T('autoRemindHint')}</p>
    <label style="display:flex;gap:10px;align-items:center;margin-top:12px"><input type="checkbox" id="setAutoSupRemind" ${db.settings.autoSupRemind ? 'checked' : ''} style="width:auto"><span>${T('autoSupRemind')}</span></label>
    <p class="hint">${T('autoSupRemindHint')}</p>
    <label style="display:flex;gap:10px;align-items:center;margin-top:12px"><input type="checkbox" id="setAutoInactive" ${db.settings.autoRemindInactive ? 'checked' : ''} style="width:auto"><span>${T('autoInactive')}</span></label>
    <p class="hint">${T('autoInactiveHint')}</p>
    ${isPremium() ? '' : `<p class="hint">${T('premiumAuto')}</p>`}
    <label>${T('autoRemindEvery')}</label><select id="setArEvery"><option value="jour" ${(db.settings.autoRemindEvery || 'jour') === 'jour' ? 'selected' : ''}>${T('everyDay')}</option><option value="semaine" ${db.settings.autoRemindEvery === 'semaine' ? 'selected' : ''}>${T('everyWeek')}</option></select>
    <label>${T('autoRemindWeekday')}</label><select id="setArWeekday">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === (Math.round(Number(db.settings.autoRemindWeekday)) || 1) ? 'selected' : ''}>${weekdayName(n)}</option>`).join('')}</select>
    <label>${T('autoRemindHour')}</label><select id="setArHour">${hoursList().map((h) => `<option value="${h}" ${h === autoHourOf(db.settings) ? 'selected' : ''}>${h}:00</option>`).join('')}</select>
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
    <label style="display:flex;gap:10px;align-items:center;min-height:44px;cursor:pointer"><input type="checkbox" id="setBigText" ${bigTextOn() ? 'checked' : ''} style="width:24px;height:24px"><span>${T('bigText')}</span></label>
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
    <details><summary>${T('secPromo')}</summary>
    <button class="btn" id="setPresent">${T('presentApp')}</button>
    <button class="btn out" id="setShareApp">${T('shareApp')}</button>
    <button class="btn out" id="setA4">${T('a4Check')}</button>
    <p class="hint">${T('presentHint')}</p>
    <h3 style="margin-top:16px">${T('inviteTitle')}</h3>
    <p class="hint">${T('inviteHint')}</p>
    <div id="refBox"><p class="hint">…</p></div>
    <div id="installsBox"></div>
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
  const presentBtn = d.querySelector('#setPresent');
  if (presentBtn) presentBtn.onclick = openPresentation;
  const shareBtn = d.querySelector('#setShareApp');
  if (shareBtn) shareBtn.onclick = shareAppLink;
  /* Feuille A4 de contrôle : à ouvrir avant une impression en série. */
  const a4Btn = d.querySelector('#setA4');
  if (a4Btn) a4Btn.onclick = () => window.open('a4', '_blank', 'noopener');
  loadReferral();
  loadInstalls();
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
  /* Le code suffit : l'activation ne dépend plus d'un message à traiter à la
     main, et le serveur vérifie qu'il n'a jamais servi. */
  const premGo = d.querySelector('#premGo');
  if (premGo) premGo.onclick = async () => {
    const input = d.querySelector('#premCode');
    const code = String((input && input.value) || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(code)) { alert(T('premiumCodeBad')); return; }
    premGo.disabled = true;
    const r = await api('/api/premium/redeem', 'POST', { code });
    premGo.disabled = false;
    if (!r.ok) {
      alert(r.data && r.data.error === 'slow' ? T('tooManyTries')
        : r.data && r.data.error === 'expired' ? T('premiumCodeExpired')
          : r.data && r.data.error === 'owner' ? T('teamOwnerOnly')
            : T('premiumCodeBad'));
      return;
    }
    await refreshMe();
    d.remove(); render(); settingsModal();
    alert(`${T('premiumCodeOk')} ${dayFR(premiumDate())}`);
  };
  const premPay = d.querySelector('#premPay');
  if (premPay) premPay.onclick = () => { d.remove(); openPay(); };
  const premAsk = d.querySelector('#premAsk');
  if (premAsk) premAsk.onclick = () => {
    if (!SUPPORT.wa) { alert(T('supportOff')); return; }
    const account = (me && (me.email || me.phone || me.id)) || '';
    waOpen(SUPPORT.wa, T('premiumWaMsg').replace('[Boutique]', db.shop || T('app')).replace('[Compte]', account));
  };
  const supGo = d.querySelector('#supGo');
  if (supGo) supGo.onclick = () => {
    if (!SUPPORT.wa) { alert(T('supportOff')); return; }
    waOpen(SUPPORT.wa, T('supportMsg').replace('[Boutique]', db.shop || T('app')));
  };
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
  d.querySelector('#setHistory').onclick = () => {
    if (!isPremium()) { alert(T('premiumHistory')); return; }
    d.remove(); versionsModal();
  };
  /* Les cases du Premium restent visibles, mais grisées en gratuit : on voit
     ce qui existe sans pouvoir le changer. */
  if (!isPremium()) {
    ['#setAutoRemind', '#setAutoSupRemind', '#setAutoInactive', '#setArEvery', '#setArWeekday', '#setArHour', '#setLogo', '#logoDel'].forEach((sel) => {
      const el = d.querySelector(sel);
      if (el) el.disabled = true;
    });
  }
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
  setCountry.onchange = () => {
    setCur.textContent = currencyFor(setCountry.value);
    /* L'exemple de numéro suit le pays choisi. */
    const wa = d.querySelector('#setWa');
    if (wa) wa.placeholder = '+' + dialOf(setCountry.value) + ' 00 00 00 00 00';
  };
  const logoPrev = d.querySelector('#logoPrev');
  d.querySelector('#setLogo').onchange = () => {
    const f = d.querySelector('#setLogo').files[0];
    if (!f) return;
    readLogo(f, (url) => { if (url) { logoDraft = url; logoPrev.innerHTML = `<img src="${esc(url)}" class="logoPrev" alt="">`; } });
  };
  d.querySelector('#logoDel').onclick = () => { logoDraft = ''; logoPrev.innerHTML = ''; };
  d.querySelector('#setInvRemReset').onclick = () => { d.querySelector('#setInvRem').value = INV_REMIND[lang()] || INV_REMIND.fr; };
  /* Taille de texte : réglage de l'appareil, ouvert aussi aux vendeurs. */
  const bigCb = d.querySelector('#setBigText');
  if (bigCb) bigCb.onchange = () => {
    try { localStorage.setItem(BIG_KEY, bigCb.checked ? '1' : '0'); } catch {}
    applyBigText();
  };
  d.querySelector('#setOk').onclick = async () => {
    db.shop = d.querySelector('#setShop').value.trim();
    const l = d.querySelector('#setLang').value;
    /* Changer de langue télécharge son fichier avant de redessiner l'écran. */
    await ensureLang(l);
    db.settings.reminder[db.settings.lang] = d.querySelector('#setRem').value;
    db.settings.invReminder = db.settings.invReminder || {};
    db.settings.invReminder[db.settings.lang] = d.querySelector('#setInvRem').value.trim();
    db.settings.invRemindDays = Math.max(1, Math.round(+d.querySelector('#setRemDays').value || 7));
    db.settings.autoRemind = isPremium() && d.querySelector('#setAutoRemind').checked;
    db.settings.autoSupRemind = isPremium() && d.querySelector('#setAutoSupRemind').checked;
    db.settings.autoRemindInactive = isPremium() && d.querySelector('#setAutoInactive').checked;
    db.settings.autoRemindEvery = d.querySelector('#setArEvery').value;
    db.settings.autoRemindWeekday = Math.min(7, Math.max(1, Math.round(+d.querySelector('#setArWeekday').value || 1)));
    db.settings.autoRemindHour = autoHourOf({ autoRemindHour: d.querySelector('#setArHour').value });
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
    /* Un numéro écrit à la manière locale (07 00 00 00 00) reçoit l'indicatif
       du pays : le lien WhatsApp doit toujours être au format international. */
    let wa = d.querySelector('#setWa').value.trim().slice(0, 32);
    const dial = dialOf(db.settings.country || 'CI');
    if (dial && /^0\d/.test(wa.replace(/[\s.-]/g, ''))) {
      const local = wa.replace(/[\s.-]/g, '').slice(1);
      wa = '+' + dial + ' ' + local;
    }
    db.settings.wa = wa;
    db.settings.vat = Math.max(0, Math.round(+d.querySelector('#setVat').value || 0));
    db.settings.remindDays = Math.min(365, Math.max(1, Math.round(+d.querySelector('#setRemindDays').value || 30)));
    db.settings.inactiveDays = Math.min(365, Math.max(7, Math.round(+d.querySelector('#setInactive').value || 30)));
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
  printAreaNow();
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
async function shareModal() {
  const url = location.origin + location.pathname;
  const d = modal(`<h2>${T('share')}</h2><p class="hint">${T('shareHint')}</p>
    <div class="qrbox" id="qrBox"></div>
    <p class="hint" style="text-align:center"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>
    <p class="hint" style="text-align:center">${T('qrHelp')}</p>
    <button class="btn" id="qrNative">${T('share')}</button>
    <button class="btn out" id="qrCopy">${T('copy')}</button>
    <button class="btn out" id="qrClose">${T('close')}</button>`);
  const QR = await loadQR();
  const box = d.querySelector('#qrBox');
  try {
    const qr = QR(0, 'M');
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
  } catch { box.textContent = url; }
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
/* Premium : la date de fin vient du serveur. Un vendeur hérite de celle de la
   boutique ; sans date, le compte est gratuit. */
const isPremium = () => Boolean(me && Number(me.premiumUntil) > Date.now());
const premiumDate = () => (me && Number(me.premiumUntil) ? new Date(Number(me.premiumUntil)).toISOString().slice(0, 10) : '');
/* Fin du Premium : on prévient une semaine avant, jamais au dernier jour. Un
   rappel visible vaut mieux qu'une boutique qui découvre la coupure en
   perdant ses vendeurs et en voyant revenir les publicités. */
const premiumDaysLeft = () => {
  const left = Number(me && me.premiumUntil) - Date.now();
  return left > 0 ? Math.ceil(left / 86400000) : 0;
};
function premiumWarning() {
  if (isStaff() || !isPremium()) return '';
  const days = premiumDaysLeft();
  if (days > 7) return '';
  const when = days === 1 ? T('premiumEndsTomorrow') : T('premiumEndsIn').replace('{n}', String(days));
  return `<div class="card warnCard"><b>${esc(when)}</b><p class="hint">${T('premiumEndsHint')}</p>
    <button class="btn out" type="button" data-premium-renew>${T('premiumRenew')}</button></div>`;
}
function renewPremium() {
  openPay();
}

/* Paiement du Premium : Wave, Orange Money ou carte. Le serveur donne une
   référence pour les transferts ; la carte passe par Stripe quand les clés
   sont posées. Sans tarif réglé, on renvoie vers WhatsApp plutôt que
   d'afficher un prix inventé. */
const PAY = { priceMonth: 0, payWave: '', payOm: '', card: false };
let payMonths = 1;
async function openPay() {
  const wait = modal(`<div class="sheetHead"><h2>${T('payTitle')}</h2></div><p class="hint">${T('syncing')}</p>`);
  const r = await api('/api/premium/offer');
  if (r.ok && r.data) {
    PAY.priceMonth = Number(r.data.priceMonth) || 0;
    PAY.payWave = String(r.data.payWave || '');
    PAY.payOm = String(r.data.payOm || '');
    PAY.card = !!r.data.card;
  }
  wait.remove();
  payModal();
}
function payModal() {
  const price = Number(PAY.priceMonth) || 0;
  const amount = price * payMonths;
  const d = modal(`<div class="sheetHead"><h2>${T('payTitle')}</h2></div><div id="payBody"></div>`);
  const body = d.querySelector('#payBody');
  const waText = T('premiumWaMsg').replace('[Boutique]', db.shop || T('app')).replace('[Compte]', (me && (me.email || me.phone || me.id)) || '');
  if (!price) {
    body.innerHTML = `<p class="hint">${T('payNoPrice')}</p>
      ${SUPPORT.wa ? `<button class="btn whats" id="payWa">${T('premiumRenew')}</button>` : ''}
      <button class="btn out" id="payClose">${T('close')}</button>`;
    const wa = body.querySelector('#payWa');
    if (wa) wa.onclick = () => waOpen(SUPPORT.wa, waText);
    body.querySelector('#payClose').onclick = () => d.remove();
    return;
  }
  const methods = [];
  if (PAY.payWave) methods.push(['wave', T('payWave')]);
  if (PAY.payOm) methods.push(['om', T('payOm')]);
  if (PAY.card) methods.push(['card', T('payCard')]);
  body.innerHTML = `<div class="card">
      <div class="row"><div><div class="t">${T('payMonths')}</div><div class="s">${money(amount)}</div></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        ${[1, 3, 6, 12].map((n) => `<button class="btn ${n === payMonths ? '' : 'out'}" type="button" data-months="${n}" style="min-width:64px">${n}</button>`).join('')}
      </div>
      <p class="hint">${T('payTotal')} <b>${money(amount)}</b></p>
    </div>
    <div id="payStep"></div>`;
  body.querySelectorAll('[data-months]').forEach((b) => {
    b.onclick = () => { payMonths = Number(b.dataset.months) || 1; d.remove(); payModal(); };
  });
  const step = body.querySelector('#payStep');
  step.innerHTML = methods.length
    ? methods.map(([k, label]) => `<button class="btn" type="button" data-method="${k}" style="margin-top:8px">${label}</button>`).join('')
    : `<p class="hint">${T('payUnavailable')}</p>`;
  step.querySelectorAll('[data-method]').forEach((b) => {
    b.onclick = () => payGo(b.dataset.method, step);
  });
}
async function payGo(method, step) {
  step.innerHTML = `<p class="hint">${T('syncing')}</p>`;
  if (method === 'card') {
    const r = await api('/api/stripe/checkout', 'POST', { months: payMonths });
    if (r.ok && r.data && r.data.url) { window.location.href = r.data.url; return; }
    step.innerHTML = `<p class="hint">${T('payCardOff')}</p>`;
    return;
  }
  const r = await api('/api/premium/request', 'POST', { months: payMonths, method });
  if (!r.ok || !r.data) {
    step.innerHTML = `<p class="hint">${T('payUnavailable')}</p>`;
    return;
  }
  const p = r.data;
  const text = `${T('payTitle')} — ${p.months} mois · ${money(p.amount)} · ${T('payRef')} ${p.ref}`;
  step.innerHTML = `<div class="card">
    <div class="t">${T('payRef')} <b>${esc(p.ref)}</b></div>
    <p class="hint">${T('payHow').replace('{amount}', money(p.amount)).replace('{number}', esc(p.number))}</p>
    ${SUPPORT.wa ? `<a class="btn whats" href="https://wa.me/${SUPPORT.wa}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${T('payProof')}</a>` : ''}
    <p class="hint ok">${T('paySent')}</p>
  </div>`;
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
  if (me && Array.isArray(db.sales)) {
    const before = db.sales.length;
    db.sales = db.sales.filter((s) => s && s.byId === me.id);
    if (db.sales.length !== before) changed = true;
  }
  if (me && Array.isArray(db.log)) {
    const before = db.log.length;
    db.log = db.log.filter((e) => e && typeof e === 'object' && e.byId === me.id);
    if (db.log.length !== before) changed = true;
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
/* Nom lisible pour le journal : le nom choisi dans les réglages d'abord, puis
   la partie locale de l'e-mail (« awa.traore » → « Awa Traore »). */
function actorName() {
  if (!me || !me.id) return lastSeller();
  const named = String(me.name || '').trim();
  if (named) return named;
  const local = String(me.email || '').split('@')[0].replace(/[._+\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const pretty = local.replace(/(^|\s)(\p{L})/gu, (m, s, c) => s + c.toUpperCase());
  return pretty || String(me.phone || '').trim();
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
    if (user) localStorage.setItem(KEY + '.me', JSON.stringify({ id: user.id, email: user.email || null, phone: user.phone || null, name: user.name || null, role: user.role || 'owner', ownerId: user.ownerId || null, perms: user.perms || null, premiumUntil: Number(user.premiumUntil) || 0 }));
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
  const body = { mode, password, src: channel() };
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
      <label>${T('yourName')}</label><input id="acName" maxlength="40" value="${esc(me.name || '')}" placeholder="Awa">
      <button class="btn out" data-act="saveName">${T('saveName')}</button>
      <p class="hint">${T('yourNameHint')}</p>
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
/* Réinitialisation par code : l'e-mail envoie huit signes, ou l'assistance
   les donne par WhatsApp. Une seule fenêtre : demander, puis changer. */
function forgotModal(email = '') {
  const d = modal(`<h2>${T('forgotTitle')}</h2><p class="hint">${T('forgotHint')}</p>
    <label>${T('email')}</label><input id="fEmail" type="email" value="${esc(email)}" autocomplete="email">
    <button class="btn out" id="fOk">${T('sendCode')}</button>
    <p class="hint" id="fMsg"></p>
    <label>${T('resetCode')}</label><input id="fCode" type="text" autocapitalize="characters" autocomplete="one-time-code" spellcheck="false" placeholder="ABCD2345">
    <label>${T('newPassword')}</label><input id="fPass" type="password" autocomplete="new-password">
    <button class="btn" id="fApply">${T('applyCode')}</button>
    <button class="btn out" id="fNo">${T('cancel')}</button><p class="err" id="fErr"></p>`);
  const msg = d.querySelector('#fMsg');
  const err = d.querySelector('#fErr');
  d.querySelector('#fNo').onclick = () => d.remove();
  d.querySelector('#fOk').onclick = async () => {
    const addr = d.querySelector('#fEmail').value.trim();
    err.textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(addr)) { err.textContent = T('badEmail'); return; }
    d.querySelector('#fOk').disabled = true;
    const r = await api('/api/forgot', 'POST', { email: addr });
    d.querySelector('#fOk').disabled = false;
    msg.textContent = r.ok && r.data && r.data.mail === false ? T('resetNoMail') : T('resetCodeSent');
  };
  d.querySelector('#fApply').onclick = async () => {
    const code = d.querySelector('#fCode').value.trim();
    const pass = d.querySelector('#fPass').value;
    err.textContent = '';
    if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) { err.textContent = T('resetCodeBad'); return; }
    if (pass.length < 8) { err.textContent = T('badPass'); return; }
    d.querySelector('#fApply').disabled = true;
    const r = await api('/api/reset', 'POST', { code, password: pass });
    d.querySelector('#fApply').disabled = false;
    if (!r.ok) {
      err.textContent = r.data && r.data.error === 'slow' ? T('tooManyTries') : T('resetCodeBad');
      return;
    }
    d.remove();
    alert(T('resetCodeDone'));
    showAuthGate();
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

/* Mode d'emploi : six gestes, une phrase chacun. Il s'ouvre une fois quand la
   boutique reçoit son nom, puis reste joignable depuis l'accueil. */
const GUIDE_KEY = KEY + '.guideSeen';
function guideSeen() {
  try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return true; }
}
function guideModal() {
  const steps = [1, 2, 3, 4, 5, 6].map((n) => `<div class="t" style="margin-top:14px">${T('guide' + n)}</div>
    <p class="hint" style="margin:2px 0 0">${T('guide' + n + 'h')}</p>`).join('');
  const m = modal(`<h2>${T('guideTitle')}</h2>
    <p class="hint">${T('guideIntro')}</p>${steps}
    <div class="sheetFoot"><button class="btn" id="gdOk">${T('guideDone')}</button></div>`);
  m.querySelector('#gdOk').onclick = () => {
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch {}
    m.remove();
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
    if (!guideSeen()) guideModal();
  };
}
function closeGate() { const g = document.getElementById('gate'); if (g) g.remove(); setBackgroundInert(false); }
function afterGate() { closeGate(); askShop(); render(); autoRemind(); }
function showLangGate() {
  closeGate();
  applyBigText();
  const g = document.createElement('div');
  g.id = 'gate';
  g.className = 'gate';
  g.innerHTML = `<div class="wrap">
    <h1>${T('app')}</h1>
    <p class="hint">${T('chooseLang')}</p>
    <button class="btn lang" data-lang="fr">Français</button>
    <button class="btn out lang" data-lang="en">English</button>
    <button class="btn out lang" data-lang="ar" dir="rtl">العربية</button>
    <p class="hint">${T('chooseLangHint')}</p>
    <button class="btn out" id="langBig" aria-pressed="${bigTextOn()}">${bigTextOn() ? '✔ ' : ''}${esc(T('bigText'))}</button></div>`;
  const bigBtn = g.querySelector('#langBig');
  if (bigBtn) bigBtn.onclick = () => {
    try { localStorage.setItem(BIG_KEY, bigTextOn() ? '0' : '1'); } catch {}
    applyBigText();
    bigBtn.textContent = (bigTextOn() ? '✔ ' : '') + T('bigText');
    bigBtn.setAttribute('aria-pressed', String(bigTextOn()));
  };
  document.body.appendChild(g);
  setBackgroundInert(true);
  g.querySelectorAll('[data-lang]').forEach((b) => {
    b.onclick = async () => {
      await ensureLang(b.dataset.lang);
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
  applyBigText();
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
         <details><summary>${T('moreInfo')}</summary>
         <label>${T('district')}</label><input id="gDistrict">
         <label>${T('address')}</label><input id="gAddress" autocomplete="street-address">
         </details>
         <button class="btn" id="gGo">${T('createAccount')}</button><p class="err" id="gErr"></p>`
      : `<label>${T('loginId')}</label><input id="gLoginId" type="text" autocomplete="username" placeholder="awa@exemple.com / +225 07 00 00 00 00">
         <label>${T('password')}</label><input id="gPass" type="password" autocomplete="current-password">
         <button class="btn" id="gGo">${T('signIn')}</button>
         <button class="btn out" id="gForgot">${T('forgot')}</button>
         <p class="hint">${T('loginHint')}</p><p class="err" id="gErr"></p>`;
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
    } else {
      const fg = form.querySelector('#gForgot');
      if (fg) fg.onclick = () => forgotModal(form.querySelector('#gLoginId').value.trim());
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
        if (e) {
          go.disabled = false;
          /* Trois causes très différentes ne doivent pas donner le même message :
             un mot de passe faux, une panne de réseau, ou un blocage temporaire
             après trop d'essais (20 en 15 minutes). */
          err.textContent = e === 'server' ? T('gateOffline') : e === 'slow' ? T('tooManyTries') : T('badCredentials');
          return;
        }
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
  if (e.target.id === 'histSeller') { histSeller = e.target.value; histShown = HIST_PAGE; render(); }
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

/* Réglages communs (publicité) : lus une fois au démarrage. Sans identifiant
   AdSense réel, rien n'est demandé à Google et l'option reste invisible. */
async function loadAppConfig() {
  const r = await api('/api/config');
  if (!r.ok || !r.data) return;
  /* Le support se lit même quand la publicité est vide. */
  SUPPORT.wa = String(r.data.supportWa || '').replace(/\D/g, '').slice(0, 15);
  OFFICIAL = /^https:\/\/[^\s]+$/i.test(String(r.data.officialUrl || '')) ? String(r.data.officialUrl).trim() : '';
  if (!r.data.ads || !r.data.adsClient) return;
  ADS.client = String(r.data.adsClient);
  ADS.top = String(r.data.adsTop || '');
  ADS.bottom = String(r.data.adsBottom || '');
  render();
}

/* Sous test (node --test), seul le code ci-dessus est chargé : pas de rendu, pas
   de réseau, pas de service worker. */
if (!globalThis.__AC_TEST__) {
  setInterval(syncTick, 20000);
  const resetToken = new URLSearchParams(location.search).get('reset');
  (async () => {
    await ensureLang(lang());
    render();
    rememberChannel();
    await bootAccount();
    loadAppConfig();
    if (resetToken) { resetModal(resetToken); return; }
    if (!localStorage.getItem(LANG_KEY)) { showLangGate(); return; }
    if (!me) { gateMode = db.shop ? 'login' : 'signup'; showAuthGate(); return; }
    askShop();
    autoRemind();
  })();
  fetch('version.json', { cache: 'no-store' })
    .then((r) => r.json())
    .then((v) => { appVersion = v && v.version ? String(v.version) : ''; })
    .catch(() => {});
  setupServiceWorker();
}
