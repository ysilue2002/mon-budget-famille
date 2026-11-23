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
  + '\nexport { maskState, restoreMasked, publicUser, parsePerms, publicDocHtml, cleanSrc, SIGNUP_LIMIT, SIGNUP_WINDOW_MS, signupGuard, newRefCode, refSrc, isAdmin, extendPremium, canAddStaff, isPremiumUntil, validSupportWa, adminToken, adminFromToken, newPremiumCode, codeExpired, newResetCode, normalizeResetCode, OFFICIAL_URL_RE, adminCodes, codeForAdmin, adminSigningKey, stripeEvent, unlockPatterns, totpAt, totpOk, totpMatch, adminTotps, csvOf, newBackupCode, normalizeBackupCode, issueBackupCodes, useBackupCode, backupCodesLeft, expireStalePayments, PENDING_DAYS, needsExpiryWarning, needsApprovalAlert, PAY_WARN_DAYS, APPROVAL_ALERT_HOURS };\n';
const mod = await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
const { maskState, restoreMasked, publicUser, parsePerms, publicDocHtml, cleanSrc, SIGNUP_LIMIT, SIGNUP_WINDOW_MS, signupGuard, newRefCode, refSrc, isAdmin, extendPremium, canAddStaff, isPremiumUntil, validSupportWa, adminToken, adminFromToken, newPremiumCode, codeExpired, newResetCode, normalizeResetCode, OFFICIAL_URL_RE, adminCodes, codeForAdmin, adminSigningKey, stripeEvent, unlockPatterns, totpAt, totpOk, totpMatch, adminTotps, csvOf, newBackupCode, normalizeBackupCode, issueBackupCodes, useBackupCode, backupCodesLeft, expireStalePayments, PENDING_DAYS, needsExpiryWarning, needsApprovalAlert, PAY_WARN_DAYS, APPROVAL_ALERT_HOURS } = mod;
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

test('le numéro du support n’accepte que des chiffres utilisables', () => {
  assert.equal(validSupportWa('+225 07 00 00 00 00'), true);
  assert.equal(validSupportWa('22507000000'), true);
  assert.equal(validSupportWa('abc'), false);
  assert.equal(validSupportWa('+225 07'), false);
  assert.equal(validSupportWa('1234567890123456'), false);
  assert.equal(validSupportWa(''), false);
});

test('la facture publique reprend le logo, jamais une image distante', () => {
  const base = { kind: 'FAC', title: 'Facture', number: 'FAC-2026-001', shop: 'B', lines: [], ht: '', ttc: '', labels: {} };
  const png = 'data:image/png;base64,' + 'A'.repeat(400);
  const withLogo = publicDocHtml(JSON.stringify({ ...base, logo: png }));
  assert.ok(withLogo.includes('class="mark"'), 'logo affiché');
  assert.ok(withLogo.includes(png), 'même image que sur le papier');
  const remote = publicDocHtml(JSON.stringify({ ...base, logo: 'https://exemple.test/logo.png' }));
  assert.ok(!remote.includes('class="mark"'), 'aucune image distante');
  const svg = publicDocHtml(JSON.stringify({ ...base, logo: 'data:image/svg+xml;base64,' + 'A'.repeat(400) }));
  assert.ok(!svg.includes('class="mark"'), 'seulement PNG ou JPEG');
});

test('un code d’activation expire à sa date, jamais avant', () => {
  const now = 1_800_000_000_000;
  assert.equal(codeExpired(now + 1000, now), false);
  assert.equal(codeExpired(now - 1000, now), true);
  assert.equal(codeExpired(now, now), true);
  assert.equal(codeExpired(0, now), false, 'sans date de fin : toujours valable');
  assert.equal(codeExpired(null, now), false);
});

test('un code de réinitialisation fait huit signes faciles à dicter', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = newResetCode();
    assert.equal(code.length, 8);
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  }
  assert.equal(normalizeResetCode(' abcd-2345 '), 'ABCD2345');
  assert.equal(normalizeResetCode('abcd 2345'), 'ABCD2345');
  assert.equal(normalizeResetCode(undefined), '');
});

test('le lien officiel n’accepte que https', () => {
  assert.equal(OFFICIAL_URL_RE.test('https://boutique.exemple.com'), true);
  assert.equal(OFFICIAL_URL_RE.test('https://boutique.exemple.com/app'), true);
  assert.equal(OFFICIAL_URL_RE.test('http://boutique.exemple.com'), false);
  assert.equal(OFFICIAL_URL_RE.test('javascript:alert(1)'), false);
  assert.equal(OFFICIAL_URL_RE.test('https://exemple.com/a b'), false);
});

test('un code d’activation fait huit signes faciles à dicter', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = newPremiumCode();
    assert.equal(code.length, 8);
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/, 'ni I, ni O, ni 0, ni 1');
  }
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

test('seuls les comptes listés entrent dans l’administration', () => {
  const list = ['patron@boutique.ci', '+225 07 00 00 00 00'];
  assert.equal(isAdmin({ email: 'patron@boutique.ci' }, list), true, 'e-mail listé');
  assert.equal(isAdmin({ email: 'PATRON@BOUTIQUE.CI' }, list), true, 'casse ignorée');
  assert.equal(isAdmin({ phone: '+225 07 00 00 00 00' }, list), true, 'numéro listé');
  assert.equal(isAdmin({ email: 'autre@boutique.ci' }, list), false, 'e-mail inconnu');
  assert.equal(isAdmin({ email: 'patron@boutique.ci' }, []), false, 'sans liste : personne');
  assert.equal(isAdmin(null, list), false, 'sans compte : personne');
});

test('la connexion administrateur exige un e-mail autorisé et le bon code', async () => {
  const env = { ADMIN_EMAILS: 'ysilue2002@gmail.com, ysilue2002@yahoo.fr', ADMIN_CODE: 'entrepreneuriat2015' };
  const future = Date.now() + 3600000;
  for (const email of ['ysilue2002@gmail.com', 'ysilue2002@yahoo.fr']) {
    const token = await adminToken(env, email, future);
    const who = await adminFromToken(env, token);
    assert.equal(who && who.email, email, 'les deux e-mails passent');
  }
  const token = await adminToken(env, 'ysilue2002@gmail.com', future);
  assert.equal(await adminFromToken(env, token.replace('ysilue2002', 'intrus')), null, 'e-mail modifié : refusé');
  assert.equal(await adminFromToken(env, token + 'x'), null, 'signature modifiée : refusée');
  assert.equal(await adminFromToken(env, await adminToken(env, 'autre@test.ci', future)), null, 'e-mail hors liste : refusé');
  assert.equal(await adminFromToken(env, await adminToken(env, 'ysilue2002@gmail.com', Date.now() - 1000)), null, 'session expirée : refusée');
  assert.equal(await adminFromToken({ ...env, ADMIN_CODE: 'autre-code' }, token), null, 'autre code : refusé');
  assert.equal(await adminToken({ ADMIN_EMAILS: env.ADMIN_EMAILS }, 'ysilue2002@gmail.com', future), '', 'sans code, rien n’est signé');
});

/* Chaque personne du support peut avoir son code : le journal dit alors qui a
   agi, et retirer une personne ne touche pas au code des autres. */
test('chaque personne du support peut avoir son propre code', () => {
  const env = { ADMIN_EMAILS: 'a@test.ci,b@test.ci', ADMIN_CODE: 'commun', ADMIN_CODES: 'b@test.ci:secret-b' };
  assert.equal(codeForAdmin(env, 'a@test.ci'), 'commun', 'sans code personnel : le code commun');
  assert.equal(codeForAdmin(env, 'B@TEST.CI'), 'secret-b', 'code personnel, casse ignorée');
  assert.equal(codeForAdmin(env, 'inconnu@test.ci'), 'commun');
  assert.equal(adminCodes(env).size, 1);
  assert.equal(adminSigningKey({ ADMIN_CODES: 'c@test.ci:solo' }), 'solo', 'sans ADMIN_CODE, le premier code signe');
  assert.equal(adminSigningKey({}), '', 'aucun code : rien n’est signé');
});

/* Second facteur : les vecteurs de la RFC 6238, puis une vérification réelle
   avec la fenêtre de dérive. */
test('le code à 6 chiffres suit la RFC 6238', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // « 12345678901234567890 »
  /* Vecteurs de l'annexe B, tronqués à six chiffres : 94287082, 07081804,
     89005924, 69279037. */
  assert.equal(await totpAt(secret, 59 * 1000), '287082');
  assert.equal(await totpAt(secret, 1111111109 * 1000), '081804');
  assert.equal(await totpAt(secret, 1234567890 * 1000), '005924');
  assert.equal(await totpAt(secret, 2000000000 * 1000), '279037');
  const env = { ADMIN_TOTP: `boss@test.ci:${secret}` };
  const now = Date.now();
  assert.equal(await totpOk(env, 'BOSS@test.ci', await totpAt(secret, now)), true, 'code du moment');
  assert.equal(await totpOk(env, 'boss@test.ci', await totpAt(secret, now - 30000)), true, 'fenêtre précédente');
  assert.equal(await totpOk(env, 'boss@test.ci', '000000'), false, 'mauvais code');
  assert.equal(await totpOk(env, 'boss@test.ci', ''), false, 'sans code');
  assert.equal(await totpOk(env, 'autre@test.ci', ''), true, 'sans secret : pas de second facteur');
  /* Le compteur renvoyé sert à refuser un code déjà employé : le même code
     doit toujours donner le même compteur, et deux codes voisins différer. */
  const t0 = 1111111109 * 1000;
  assert.equal(await totpMatch(secret, '081804', t0), Math.floor(t0 / 30000));
  assert.equal(await totpMatch(secret, '005924', t0), null, 'code d’un autre instant');
  assert.equal(await totpMatch(secret, '08180', t0), null, 'cinq chiffres');
  assert.equal(await totpMatch('', '081804', t0), null, 'sans secret');
  assert.equal(adminTotps(env).size, 1);
  assert.equal(adminTotps({ ADMIN_TOTP: 'sans-deux-points' }).size, 0);
});

/* L'export comptable doit rester lisible par Excel, même avec des virgules. */
test('le CSV échappe virgules, guillemets et sauts de ligne', () => {
  const csv = csvOf([['ref', 'note'], ['AC-1', 'a,b'], ['AC-2', 'dit "ok"'], ['AC-3', 'deux\nlignes']]);
  assert.ok(csv.startsWith('\ufeff'), 'BOM UTF-8');
  assert.ok(csv.includes('"a,b"'));
  assert.ok(csv.includes('"dit ""ok"""'));
  assert.ok(csv.includes('"deux\nlignes"'));
  assert.equal(csv.split('\r\n')[0], '\ufeffref,note');
});

/* Débloquer une boutique ne doit pas débloquer une autre dont l'e-mail finit
   par les mêmes caractères (a@x.com et aa@x.com). */
test('le déblocage ne vise que le compte demandé', () => {
  const [mail] = unlockPatterns('a@x.com', '');
  assert.equal(mail, '%:a@x.com');
  const like = (pattern, key) => key.endsWith(pattern.slice(1));
  assert.ok(like(mail, 'login-user:a@x.com'), 'même compte : débloqué');
  assert.ok(like(mail, 'login-id:41.1.1.1:a@x.com'), 'même compte, autre IP : débloqué');
  assert.ok(like(mail, 'admin-mail:a@x.com'), 'compte admin : débloqué');
  assert.equal(like(mail, 'login-user:aa@x.com'), false, 'voisin : intact');
  assert.equal(like(mail, 'login-user:ba@x.com'), false);
  assert.deepEqual(unlockPatterns('', '+225 07 00 00 00 00'), ['%:2250700000000']);
  assert.deepEqual(unlockPatterns('', ''), [], 'sans identifiant : rien');
});

/* La carte bancaire passe par Stripe : un webhook non signé ne doit jamais
   ouvrir un mois de Premium. */
test('la signature Stripe est vérifiée, horodatage compris', async () => {
  const { createHmac } = await import('node:crypto');
  const secret = 'whsec_test';
  const raw = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  const env = { STRIPE_WEBHOOK_SECRET: secret };
  assert.ok(await stripeEvent(env, raw, `t=${ts},v1=${sig}`), 'signature valide acceptée');
  assert.ok(await stripeEvent(env, raw, `t=${ts},v1=0000,v1=${sig}`), 'une signature valide suffit');
  assert.equal(await stripeEvent(env, raw, `t=${ts},v1=${'0'.repeat(64)}`), null, 'signature fausse refusée');
  assert.equal(await stripeEvent(env, raw, `t=${ts - 3600},v1=${sig}`), null, 'rejeu ancien refusé');
  assert.equal(await stripeEvent(env, `${raw} `, `t=${ts},v1=${sig}`), null, 'corps modifié refusé');
  assert.equal(await stripeEvent(env, raw, ''), null, 'sans en-tête refusé');
  assert.equal(await stripeEvent({}, raw, `t=${ts},v1=${sig}`), null, 'sans secret refusé');
});

test('un mois de Premium s’ajoute sans écraser une date encore à venir', () => {
  const day = 86400000;
  const future = Date.now() + 10 * day;
  assert.ok(extendPremium(future, 1) >= future + 29 * day, 'la date future est prolongée');
  assert.ok(extendPremium(0, 1) >= Date.now() + 29 * day, 'un compte gratuit part de maintenant');
  assert.equal(extendPremium(future, 0), 0, 'zéro mois retire le Premium');
  assert.equal(isPremiumUntil(Date.now() + day), true);
  assert.equal(isPremiumUntil(Date.now() - day), false);
  assert.equal(isPremiumUntil(0), false);
});

test('la version gratuite accepte un seul vendeur', () => {
  assert.equal(canAddStaff(0, false), true, 'premier vendeur accepté');
  assert.equal(canAddStaff(1, false), false, 'deuxième vendeur refusé');
  assert.equal(canAddStaff(1, true), true, 'Premium : vendeurs illimités');
  assert.equal(canAddStaff(8, true), true);
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

/* Une demande sans transfert ne doit pas rester « en attente » pour toujours :
   au bout de trente jours elle expire, sans toucher aux demandes récentes ni
   à celles déjà traitées. */
function fakeExpire(changes) {
  const seen = [];
  return {
    seen,
    prepare(sql) {
      const stmt = {
        bind() { return stmt; },
        async run() {
          seen.push(sql);
          if (sql.startsWith('UPDATE payments')) return { meta: { changes } };
          if (sql.startsWith('DELETE FROM app_config')) return { meta: { changes: 0 } };
          if (sql.startsWith('INSERT INTO admin_log')) return { meta: { changes: 1 } };
          throw new Error('requête inattendue : ' + sql);
        },
      };
      return stmt;
    },
  };
}

test('une demande sans transfert expire au bout de trente jours', async () => {
  const env = { DB: fakeExpire(2) };
  assert.equal(PENDING_DAYS, 30);
  assert.equal(await expireStalePayments(env, 1000000000000), 2);
  assert.ok(env.DB.seen[0].includes("status = 'expired'"), 'marquée expirée');
  assert.ok(env.DB.seen[0].includes("status = 'pending'"), 'seules les demandes encore ouvertes');
  assert.ok(env.DB.seen[0].includes('created < ?'), 'seules les plus vieilles');
  assert.equal(await expireStalePayments({ DB: { prepare() { throw new Error('panne'); } } }), 0, 'une panne ne casse pas la lecture');
});

/* Codes de secours : huit codes lisibles, stockés par empreinte, chacun ne
   servant qu'une fois — même si on le retape avec des espaces ou en minuscules. */
function fakeConfig() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() {
          if (/SELECT value FROM app_config WHERE key = \?/.test(sql)) {
            const v = rows.get(args[0]);
            return v === undefined ? null : { value: v };
          }
          throw new Error('requête inattendue : ' + sql);
        },
        async run() {
          if (sql.startsWith('INSERT INTO app_config')) {
            rows.set(args[0], args[1]);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('UPDATE app_config SET value = ? WHERE key = ? AND value = ?')) {
            if (rows.get(args[1]) !== args[2]) return { meta: { changes: 0 } };
            rows.set(args[1], args[0]);
            return { meta: { changes: 1 } };
          }
          throw new Error('requête inattendue : ' + sql);
        },
      };
      return stmt;
    },
  };
}

test('un code de secours ne sert qu’une fois', async () => {
  const code = newBackupCode();
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/, 'lisible au téléphone');
  assert.equal(normalizeBackupCode(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(normalizeBackupCode('AB CD EF GH'), 'ABCDEFGH');
  const env = { DB: fakeConfig() };
  const codes = await issueBackupCodes(env, 'boss@test.ci');
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8, 'huit codes différents');
  assert.equal((env.DB.rows.get('totpb:boss@test.ci') || '').includes(codes[0]), false, 'aucun code en clair en base');
  assert.equal(await backupCodesLeft(env, 'BOSS@test.ci'), 8, 'casse ignorée');
  assert.equal(await useBackupCode(env, 'boss@test.ci', codes[2].toLowerCase().replace('-', ' ')), true, 'accepté, espaces compris');
  assert.equal(await backupCodesLeft(env, 'boss@test.ci'), 7);
  assert.equal(await useBackupCode(env, 'boss@test.ci', codes[2]), false, 'déjà dépensé');
  assert.equal(await useBackupCode(env, 'boss@test.ci', 'AAAA-AAAA'), false, 'inconnu');
  assert.equal(await useBackupCode(env, 'boss@test.ci', 'court'), false, 'trop court');
  assert.equal(await useBackupCode(env, 'autre@test.ci', codes[0]), false, 'pas le code d’une autre personne');
  const fresh = await issueBackupCodes(env, 'boss@test.ci');
  assert.equal(await backupCodesLeft(env, 'boss@test.ci'), 8, 'une nouvelle liste remplace l’ancienne');
  assert.equal(await useBackupCode(env, 'boss@test.ci', codes[0]), false, 'les anciens codes ne marchent plus');
  assert.equal(await useBackupCode(env, 'boss@test.ci', fresh[0]), true);
});

/* Les deux rappels automatiques doivent tomber dans une fenêtre précise :
   trois jours avant l'expiration, jamais après, et jamais sur une demande
   déjà expirée ; quarante-huit heures après le premier accord, pas avant. */
test('l’avertissement avant expiration vise les trois derniers jours', () => {
  const now = 1900000000000;
  const d = 86400000;
  assert.equal(PAY_WARN_DAYS, 3);
  assert.equal(needsExpiryWarning(now - (PENDING_DAYS - PAY_WARN_DAYS) * d, now), true, 'premier jour utile');
  assert.equal(needsExpiryWarning(now - 28 * d, now), true, 'au milieu de la fenêtre');
  assert.equal(needsExpiryWarning(now - 26 * d, now), false, 'trop tôt');
  assert.equal(needsExpiryWarning(now - PENDING_DAYS * d, now), false, 'déjà expirée');
  assert.equal(needsExpiryWarning(0, now), false, 'sans date');
});

test('le premier approbateur est relancé après quarante-huit heures', () => {
  const now = 1900000000000;
  const h = 3600000;
  assert.equal(APPROVAL_ALERT_HOURS, 48);
  assert.equal(needsApprovalAlert(now - 48 * h, now), true, 'seuil atteint');
  assert.equal(needsApprovalAlert(now - 72 * h, now), true, 'plus vieux encore');
  assert.equal(needsApprovalAlert(now - 47 * h, now), false, 'pas encore');
  assert.equal(needsApprovalAlert(now + h, now), false, 'date future : rien');
  assert.equal(needsApprovalAlert(0, now), false, 'sans accord');
});
