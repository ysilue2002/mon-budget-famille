// Tests du serveur : ce qu'un vendeur reçoit, et ce que sa sauvegarde ne doit
// pas effacer. Le fichier worker.js est un module ESM sans dépendance : on
// l'importe tel quel (avec deux exports ajoutés pour le test) sans toucher au
// code déployé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'worker.js'), 'utf8')
  + '\nexport { maskState, restoreMasked, publicUser, parsePerms, publicDocHtml, cleanSrc, SIGNUP_LIMIT, SIGNUP_WINDOW_MS, signupGuard, newRefCode, refSrc };\n';
const mod = await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
const { maskState, restoreMasked, publicUser, parsePerms, publicDocHtml, cleanSrc, SIGNUP_LIMIT, SIGNUP_WINDOW_MS, signupGuard, newRefCode, refSrc } = mod;
const { variant } = await import(new URL('../scripts/presentation.mjs', import.meta.url).href);

const OWNER = 'owner-1';
const SELLER = 'seller-1';
const OTHER = 'seller-2';

function etat() {
  return {
    products: [{ id: 'p1', name: 'Savon', buy: 5000, sell: 8000 }],
    sales: [{ id: 's1', pid: 'p1', qty: 1, total: 8000, cost: 5000, by: 'Awa', byId: SELLER }],
    expenses: [{ id: 'e1', label: 'Loyer', amount: 12000 }],
    withdrawals: [{ id: 'w1', amount: 2000 }],
    debts: [{ id: 'd1', amount: 3000, paid: 1000, pays: [{ amount: 1000 }] }],
    docs: [{ id: 'f1', kind: 'FAC', cost: 4000, total: 9000 }],
    log: [
      { id: 'l1', at: 1, byId: OWNER, by: 'Patron', act: 'expense', amount: 12000 },
      { id: 'l2', at: 2, byId: SELLER, by: 'Awa', act: 'sale', amount: 8000 },
      { id: 'l3', at: 3, byId: OTHER, by: 'Koffi', act: 'sale', amount: 9000 },
    ],
  };
}
const round = (v) => JSON.parse(JSON.stringify(v));

test('maskState vide les champs sensibles pour un vendeur', () => {
  const out = JSON.parse(maskState(JSON.stringify(etat()), SELLER));
  assert.equal(out.products[0].buy, null);
  assert.equal(out.sales[0].cost, null);
  assert.equal(out.expenses[0].amount, null);
  assert.equal(out.withdrawals[0].amount, null);
  assert.equal(out.debts[0].amount, null);
  assert.equal(out.debts[0].paid, null);
  assert.equal(out.debts[0].pays, null);
  assert.equal(out.docs[0].cost, null);
  /* Ce qui n'est pas secret reste lisible : le vendeur doit pouvoir travailler. */
  assert.equal(out.products[0].sell, 8000);
  assert.equal(out.sales[0].total, 8000);
});

test('maskState ne renvoie au vendeur que ses lignes de journal', () => {
  const out = JSON.parse(maskState(JSON.stringify(etat()), SELLER));
  assert.deepEqual(out.log.map((e) => e.id), ['l2']);
  assert.equal(out.log[0].amount, 8000);
});

test('maskState ne laisse rien fuiter pour un vendeur sans action', () => {
  const out = JSON.parse(maskState(JSON.stringify(etat()), 'inconnu'));
  assert.deepEqual(out.log, []);
});

test('restoreMasked remet les lignes des autres et leurs montants', () => {
  const stored = JSON.stringify(etat());
  const incoming = etat();
  incoming.log = [
    { id: 'l2', at: 2, byId: SELLER, by: 'Awa', act: 'sale', amount: 0 },
    { id: 'l4', at: 4, byId: SELLER, by: 'Awa', act: 'productEdit', amount: 0 },
  ];
  const out = JSON.parse(restoreMasked(stored, JSON.stringify(incoming)));
  assert.deepEqual(out.log.map((e) => e.id), ['l1', 'l2', 'l3', 'l4']);
  assert.equal(out.log.find((e) => e.id === 'l1').amount, 12000);
  assert.equal(out.log.find((e) => e.id === 'l2').amount, 8000);
  assert.equal(out.log.find((e) => e.id === 'l4').amount, 0);
});

test('restoreMasked rétablit prix d’achat et coût des ventes', () => {
  const stored = JSON.stringify(etat());
  const incoming = etat();
  incoming.products = [{ id: 'p1', name: 'Savon', buy: 0, sell: 8000 }];
  incoming.sales = [{ id: 's2', pid: 'p1', qty: 2, total: 16000, cost: 0, by: 'Awa', byId: SELLER }];
  const out = JSON.parse(restoreMasked(stored, JSON.stringify(incoming)));
  assert.equal(out.products[0].buy, 5000);
  assert.equal(out.sales[0].cost, 10000);
  assert.equal(out.sales[0].costKnown, true);
});

test('restoreMasked refuse une dépense créée par un vendeur', () => {
  const stored = JSON.stringify(etat());
  const incoming = etat();
  incoming.expenses = [{ id: 'e1', label: 'Loyer', amount: 0 }, { id: 'e2', label: 'Faux', amount: 9000 }];
  const out = JSON.parse(restoreMasked(stored, JSON.stringify(incoming)));
  assert.deepEqual(out.expenses.map((e) => e.id), ['e1']);
  assert.equal(out.expenses[0].amount, 12000);
});

test('maskState ne renvoie au vendeur que ses propres ventes', () => {
  const state = etat();
  state.sales.push({ id: 's2', total: 16000, by: 'Patron', byId: OWNER, cost: 6000 });
  state.sales.push({ id: 's3', total: 9000, by: 'Koffi', byId: OTHER, cost: 4000 });
  /* Vente antérieure, sans identifiant : elle reste au patron. */
  state.sales.push({ id: 's4', total: 8000, by: 'Vendeur Awa', cost: 5000 });
  const out = JSON.parse(maskState(JSON.stringify(state), SELLER));
  assert.deepEqual(out.sales.map((s) => s.id), ['s1']);
});

test('maskState garde au vendeur ses ventes anciennes reconnues par son nom', () => {
  const state = etat();
  state.sales.push({ id: 's2', total: 16000, by: '  Awa ', cost: 6000 });
  state.sales.push({ id: 's3', total: 4000, by: 'Koffi', cost: 1000 });
  const out = JSON.parse(maskState(JSON.stringify(state), SELLER, ['awa']));
  assert.deepEqual(out.sales.map((s) => s.id), ['s1', 's2']);
  /* Sans le nom du compte, la vente antérieure reste au patron. */
  const strict = JSON.parse(maskState(JSON.stringify(state), SELLER));
  assert.deepEqual(strict.sales.map((s) => s.id), ['s1']);
});

test('restoreMasked remet les ventes des autres comptes', () => {
  const stored = etat();
  stored.sales.push({ id: 's2', total: 16000, by: 'Patron', byId: OWNER, cost: 6000 });
  const incoming = etat();
  incoming.sales = [{ id: 's3', pid: 'p1', qty: 2, total: 16000, by: 'Awa', byId: SELLER }];
  const out = JSON.parse(restoreMasked(JSON.stringify(stored), JSON.stringify(incoming)));
  assert.deepEqual(out.sales.map((s) => s.id), ['s3', 's1', 's2']);
  assert.equal(out.sales.find((s) => s.id === 's2').cost, 6000);
  assert.equal(out.sales.find((s) => s.id === 's3').cost, 10000);
});

test('restoreMasked garde le journal borné à 300 lignes', () => {
  const stored = etat();
  stored.log = Array.from({ length: 300 }, (_, i) => ({
    id: 'x' + i, at: i + 1, byId: OWNER, by: 'Patron', act: 'sale', amount: 0,
  }));
  const incoming = { ...etat(), log: [{ id: 'mine', at: 400, byId: SELLER, by: 'Awa', act: 'sale', amount: 5000 }] };
  const out = JSON.parse(restoreMasked(JSON.stringify(stored), JSON.stringify(incoming)));
  assert.equal(out.log.length, 300);
  assert.equal(out.log[0].id, 'x1');
  assert.equal(out.log[out.log.length - 1].id, 'mine');
});

test('publicUser expose rôle, droits et nom, avec des valeurs sûres', () => {
  const owner = publicUser({ id: 'u1', email: 'a@exemple.com' });
  assert.equal(owner.role, 'owner');
  assert.equal(owner.ownerId, null);
  assert.equal(owner.name, null);
  assert.deepEqual(owner.perms, { del: true, price: true });
  const staff = publicUser({
    id: 'u2', owner_id: 'u1', role: 'staff', name: 'Awa', perms: '{"del":false,"price":true}',
  });
  assert.equal(staff.ownerId, 'u1');
  assert.equal(staff.name, 'Awa');
  assert.deepEqual(staff.perms, { del: false, price: true });
});

test('parsePerms lit le JSON, l’objet, et retombe sur tout permis', () => {
  assert.deepEqual(parsePerms(null), { del: true, price: true });
  assert.deepEqual(parsePerms('pas du json'), { del: true, price: true });
  assert.deepEqual(parsePerms({ del: false }), { del: false, price: true });
  assert.deepEqual(parsePerms('{"del":false,"price":false}'), { del: false, price: false });
});

/* --- page publique d’une facture --- */

test('la page publique d’une facture n’exécute rien de ce qu’on lui envoie', () => {
  const html = publicDocHtml(JSON.stringify({
    title: 'Facture',
    number: 'FAC-2026-001',
    shop: '<script>alert(1)</script>',
    client: { name: 'Awa & fils' },
    lines: [{ label: '<img src=x onerror=alert(2)>', qty: 1, price: '1 FCFA', amount: '1 FCFA' }],
    ht: '1 FCFA',
    ttc: '1 FCFA',
  }));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'texte échappé');
  assert.ok(!html.includes('<script>alert'), 'aucune balise exécutable');
  assert.ok(!html.includes('<img src=x'), 'attribut d’image neutralisé');
  assert.ok(html.includes('Awa &amp; fils'));
  assert.ok(html.includes('noindex'), 'page hors moteurs de recherche');
  assert.equal(publicDocHtml('pas du json'), null, 'contenu illisible : rien à afficher');
});

test('la page publique dit si la facture est payée', () => {
  const base = { title: 'Facture', number: 'FAC-2026-001', shop: 'Boutique', lines: [], ht: '1 FCFA', ttc: '1 FCFA' };
  const paid = publicDocHtml(JSON.stringify({ ...base, kind: 'FAC', paid: true, paidOn: '12/11/2026' }));
  assert.ok(paid.includes('Payée'), 'badge payée');
  assert.ok(paid.includes('payée le 12/11/2026'), 'date du paiement');
  assert.ok(paid.includes('state ok'));
  const unpaid = publicDocHtml(JSON.stringify({ ...base, kind: 'FAC', paid: false }));
  assert.ok(unpaid.includes('Non payée'), 'badge non payée');
  assert.ok(unpaid.includes('state warn'));
  const quote = publicDocHtml(JSON.stringify({ ...base, title: 'Devis', number: 'DEV-2026-002', kind: 'DEV' }));
  assert.ok(!quote.includes('state warn'), 'un devis n’est ni payé ni impayé');
  const trap = publicDocHtml(JSON.stringify({ ...base, kind: 'FAC', paid: true, paidOn: '<b>x</b>' }));
  assert.ok(!trap.includes('<b>x</b>'), 'date de paiement échappée');
});

test('la page publique ne laisse passer que le script du bouton Imprimer', () => {
  const html = publicDocHtml(JSON.stringify({ title: 'Facture', number: 'FAC-2026-001', shop: 'B', lines: [], ht: '', ttc: '' }), 'abc123');
  assert.ok(html.includes('nonce="abc123"'), 'script autorisé par nonce');
  assert.ok(html.includes('id="docPrint"'));
  assert.ok(!html.includes('onclick='), 'aucun gestionnaire inline');
  assert.ok(!html.includes('<script src'), 'aucun script externe');
});

test('chaque langue a sa page de présentation et sa vignette', () => {
  const src = fs.readFileSync(path.join(root, 'public', 'presentation.html'), 'utf8');
  const en = variant(src, 'en');
  assert.ok(en.includes('<html lang="en"'), 'langue de la page');
  assert.ok(en.includes('/og-en.jpg'), 'vignette anglaise');
  assert.ok(en.includes('content="en_US"'), 'locale anglaise');
  assert.ok(en.includes('/presentation-en"'), 'adresse propre');
  assert.ok(!en.includes('/og.jpg"'), 'aucune vignette française');
  const ar = variant(src, 'ar');
  assert.ok(ar.includes('/og-ar.jpg'));
  assert.ok(ar.includes('dir="rtl"'), 'arabe de droite à gauche');
  assert.ok(ar.includes('/presentation-ar"'));
  assert.ok(variant(src, 'qq').includes('/og.jpg'), 'langue inconnue : français');
  assert.ok(variant(variant(src, 'en'), 'ar').includes('/og-ar.jpg'), 'pas de suffixe empilé');
});

test('la facture publique permet d’écrire à la boutique, sans lien cassé', () => {
  const base = { kind: 'FAC', title: 'Facture', number: 'FAC-2026-001', shop: 'B', lines: [], ht: '', ttc: '', labels: {} };
  const ok = publicDocHtml(JSON.stringify({ ...base, wa: '+225 07 00 00 00 00', waText: 'Bonjour & merci' }));
  assert.ok(ok.includes('https://wa.me/2250700000000?text=Bonjour%20%26%20merci'), 'lien WhatsApp propre');
  assert.ok(ok.includes('rel="noopener noreferrer"'), 'ouvre sans donner la main sur la page');
  assert.ok(ok.includes('Écrire à la boutique'));
  const none = publicDocHtml(JSON.stringify({ ...base, wa: '', waText: 'x' }));
  assert.ok(!none.includes('wa.me/'), 'sans numéro : aucun bouton');
  const dirty = publicDocHtml(JSON.stringify({ ...base, wa: 'abc"><script>', waText: 'x' }));
  assert.ok(!dirty.includes('wa.me/'), 'numéro invalide : aucun bouton');
});

test('le code de parrainage est court, lisible et devient un canal', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = newRefCode();
    assert.equal(code.length, 6);
    /* Ni I, ni O, ni 0, ni 1 : un code se dicte au téléphone sans erreur. */
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  }
  assert.equal(refSrc('AWA7'), 'p-awa7');
  assert.equal(cleanSrc(refSrc('AWA7')), 'p-awa7', 'le canal parrain reste valide');
  assert.equal(refSrc(''), '', 'sans code : aucun canal');
  assert.equal(refSrc('<b>'), 'p-b');
});

test('cleanSrc ne garde qu’un mot de canal', () => {
  assert.equal(cleanSrc(' Marche '), 'marche');
  assert.equal(cleanSrc('a/b?c'), 'abc');
  assert.equal(cleanSrc('<script>'), 'script');
  assert.equal(cleanSrc(''), '');
  assert.equal(cleanSrc(null), '');
});

/* --- limitation des inscriptions --- */

function fakeThrottle() {
  const rows = new Map();
  return {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() {
          const r = rows.get(args[0]);
          return r ? { hits: r.hits, reset: r.reset } : null;
        },
        async run() {
          if (sql.startsWith('INSERT INTO throttle')) rows.set(args[0], { hits: 1, reset: args[1] });
          else if (sql.startsWith('UPDATE throttle')) { const r = rows.get(args[0]); if (r) r.hits += 1; }
          else throw new Error('requête inattendue : ' + sql);
          return {};
        },
      };
      return stmt;
    },
  };
}

test('l’inscription est limitée à 20 par heure et par adresse', async () => {
  const env = { DB: fakeThrottle() };
  for (let i = 0; i < SIGNUP_LIMIT; i += 1) {
    assert.equal(await signupGuard(env, '1.2.3.4'), false, `inscription ${i + 1} autorisée`);
  }
  assert.equal(await signupGuard(env, '1.2.3.4'), true, 'la 21e est refusée');
  assert.equal(await signupGuard(env, '5.6.7.8'), false, 'une autre adresse reste libre');
  assert.equal(SIGNUP_WINDOW_MS, 60 * 60000);
});
