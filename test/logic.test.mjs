// Tests des calculs qui décident de l'argent du commerçant, et de la fusion
// entre deux appareils. Aucune dépendance : node --test suffit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function charger() {
  const store = new Map();
  const ctx = {
    console,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: {
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, addEventListener() {} }),
      documentElement: {},
      body: { appendChild() {} },
      visibilityState: 'visible',
      title: '',
    },
    window: { addEventListener() {} },
    navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve() } },
    location: { search: '', origin: 'http://localhost', pathname: '/' },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    __AC_TEST__: true,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/i18n.js'), ctx, { filename: 'i18n.js' });
  vm.runInContext(read('public/app.js'), ctx, { filename: 'app.js' });
  vm.runInContext(
    'globalThis.__ac = { creditOf, paidOf, paysOf, debtOf, totalDebt, qtyOf, vatOf, ttcOf, amountOf, money, fr, mergeStates, fresh, loadDB, saveDB, stateBytes, countRecords, methodLabel, methodOptions, figures, isoOf, todayISO, costKnownOf, bilans, invoiceDue, unpaidInvoices, saleFromInvoice, invoiceReminderText, MAX_STATE, db };',
    ctx,
  );
  return { ac: ctx.__ac, ctx };
}

const { ac, ctx } = charger();
const dansVm = (code) => vm.runInContext(code, ctx);

test('le crédit d’une vente tient compte des paiements échelonnés', () => {
  const vente = { total: 5000, paid: 2000, pays: [{ id: 'p1', amount: 1000 }] };
  assert.equal(ac.paysOf(vente), 1000);
  assert.equal(ac.paidOf(vente), 3000);
  assert.equal(ac.creditOf(vente), 2000);
});

test('une vente ne peut pas être encaissée au-delà de son total', () => {
  const vente = { total: 1000, paid: 2500 };
  assert.equal(ac.paidOf(vente), 1000);
  assert.equal(ac.creditOf(vente), 0);
});

test('une vente sans versement reste entièrement due', () => {
  assert.equal(ac.creditOf({ total: 7500 }), 7500);
  assert.equal(ac.paidOf({ total: 7500 }), 0);
});

test('la dette fournisseur ne devient jamais négative', () => {
  assert.equal(ac.debtOf({ amount: 30000, paid: 12000 }), 18000);
  assert.equal(ac.debtOf({ amount: 10000, paid: 15000 }), 0);
});

test('la TVA est appliquée au taux du document', () => {
  assert.equal(ac.vatOf({ total: 10000, vat: 18 }), 1800);
  assert.equal(ac.ttcOf({ total: 10000, vat: 18 }), 11800);
  assert.equal(ac.amountOf({ total: 10000, vat: 18 }), 11800);
  assert.equal(ac.amountOf({ total: 10000, vat: 0 }), 10000);
});

test('le stock est la somme des mouvements', () => {
  dansVm('db.moves = [{ id: "m1", pid: "p1", delta: 10 }, { id: "m2", pid: "p1", delta: -3 }, { id: "m3", pid: "p2", delta: 4 }];');
  assert.equal(ac.qtyOf({ id: 'p1' }), 7);
  assert.equal(ac.qtyOf({ id: 'p2' }), 4);
  assert.equal(ac.qtyOf({ id: 'absent' }), 0);
});

test('les montants gardent un séparateur insécable (arabe compris)', () => {
  assert.equal(ac.fr(5000), '5\u00a0000');
  assert.equal(ac.money(5000), '5\u00a0000 FCFA');
  assert.ok(!ac.fr(5000).includes(' '), 'aucune espace sécable ne doit séparer les milliers');
});

test('la fusion garde la version la plus récente de chaque enregistrement', () => {
  const local = ac.fresh();
  local.shop = 'Chez Awa';
  local.sales = [{ id: 's1', total: 5000, paid: 2000, u: 200 }];
  const remote = ac.fresh();
  remote.shop = 'Ancien nom';
  remote.sales = [{ id: 's1', total: 4000, paid: 4000, u: 100 }];
  const out = ac.mergeStates(local, remote);
  assert.equal(out.sales.length, 1);
  assert.equal(out.sales[0].total, 5000, 'la modification la plus récente gagne');
  assert.equal(out.shop, 'Chez Awa');
});

test('la fusion additionne les paiements partiels des deux appareils', () => {
  // `paid` est l'acompte versé à la vente, `pays` les versements suivants :
  // la fusion garde le plus gros acompte et réunit les versements des deux appareils.
  const local = ac.fresh();
  local.sales = [{ id: 's1', total: 5000, paid: 1000, pays: [{ id: 'p1', amount: 1000 }] }];
  const remote = ac.fresh();
  remote.sales = [{ id: 's1', total: 5000, paid: 1000, pays: [{ id: 'p2', amount: 500 }] }];
  const out = ac.mergeStates(local, remote);
  const vente = out.sales[0];
  assert.equal(vente.pays.length, 2, 'les deux versements sont conservés');
  assert.equal(ac.paidOf(vente), 2500);
  assert.equal(ac.creditOf(vente), 2500);
});

test('la fusion ne dépasse jamais le total de la vente', () => {
  const local = ac.fresh();
  local.sales = [{ id: 's1', total: 5000, paid: 4000, pays: [{ id: 'p1', amount: 4000 }] }];
  const remote = ac.fresh();
  remote.sales = [{ id: 's1', total: 5000, paid: 5000 }];
  const out = ac.mergeStates(local, remote);
  assert.equal(ac.paidOf(out.sales[0]), 5000);
  assert.equal(ac.creditOf(out.sales[0]), 0);
});

test('une suppression ne revient pas après fusion (pierre tombale)', () => {
  const local = ac.fresh();
  local.tomb = [{ id: 's9', k: 'sales', u: 1 }];
  const remote = ac.fresh();
  remote.sales = [];
  const out = ac.mergeStates(local, remote);
  assert.equal(out.sales.filter((s) => s.id === 's9').length, 0);
});

test('la fusion garde la révision la plus haute et la boutique distante si la locale est vide', () => {
  const local = ac.fresh();
  local.meta.rev = 2;
  const remote = ac.fresh();
  remote.shop = 'Boutique distante';
  remote.meta.rev = 7;
  const out = ac.mergeStates(local, remote);
  assert.equal(out.meta.rev, 7);
  assert.equal(out.shop, 'Boutique distante');
});

test('la date du jour suit le calendrier local, pas UTC', () => {
  const locale = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  assert.equal(dansVm('todayISO()'), locale);
});

test('les moyens de paiement sont traduits sans changer la valeur enregistrée', () => {
  assert.equal(dansVm('methodLabel("Espèces")'), 'Espèces');
  dansVm('db.settings.lang = "ar"');
  assert.equal(dansVm('methodLabel("Espèces")'), 'نقدًا');
  assert.equal(dansVm('methodLabel("Banque")'), 'بنك');
  assert.equal(dansVm('methodLabel("Wave")'), 'Wave', 'un nom de service ne change pas');
  assert.ok(dansVm('methodOptions("Espèces")').includes('value="Espèces"'), 'la valeur envoyée au serveur reste en français');
  dansVm('db.settings.lang = "en"');
  assert.equal(dansVm('methodLabel("Espèces")'), 'Cash');
  dansVm('db.settings.lang = "fr"');
});

test('les trois langues exposent les mêmes clés de traduction', () => {
  // JSON.stringify évite de comparer des tableaux créés dans le contexte vm.
  const cles = JSON.parse(dansVm('JSON.stringify({ fr: Object.keys(I18N.fr), en: Object.keys(I18N.en), ar: Object.keys(I18N.ar) })'));
  const manquantes = (autre) => cles.fr.filter((k) => !cles[autre].includes(k));
  assert.deepEqual(manquantes('en'), [], 'clés absentes en anglais');
  assert.deepEqual(manquantes('ar'), [], 'clés absentes en arabe');
  const vides = ['fr', 'en', 'ar'].flatMap((l) => cles[l]
    .filter((k) => String(dansVm(`I18N.${l}[${JSON.stringify(k)}]`)).trim() === '')
    .map((k) => l + ':' + k));
  assert.deepEqual(vides, [], 'aucune traduction vide');
});

test('la sauvegarde locale signale un état trop volumineux', () => {
  dansVm('db.sales = [{ id: "zz", total: 1, note: "x".repeat(1900000) }];');
  ac.saveDB(false);
  assert.equal(ac.stateBytes() > ac.MAX_STATE, true);
  assert.equal(ac.db.meta.tooBig, true, 'le drapeau doit suivre la taille réelle');
  dansVm('db.sales = [];');
  ac.saveDB(false);
  assert.equal(ac.db.meta.tooBig, false, 'le drapeau doit retomber après nettoyage');
});

/* --- bénéfice et trésorerie : les deux erreurs trouvées à l'audit --- */
const viderPeriode = (code) => {
  dansVm(`db.expenses = []; db.debts = []; db.withdrawals = []; db.products = []; db.moves = []; ${code}`);
};

test('un achat de marchandise n’est pas compté deux fois dans le bénéfice', () => {
  viderPeriode(`db.sales = [{ id: 's1', date: todayISO(), total: 80000, cost: 50000, costKnown: true, paid: 80000 }];
    db.expenses = [{ id: 'e1', date: todayISO(), amount: 50000, label: 'Marchandise' }];`);
  const f = dansVm('figures("jour")');
  assert.equal(f.ca, 80000, 'chiffre d’affaires');
  assert.equal(f.cogs, 50000, 'coût des articles vendus');
  assert.equal(f.dep, 50000, 'la dépense reste visible');
  assert.equal(f.purchases, 50000, 'achats de marchandises isolés');
  assert.equal(f.profit, 30000, 'marge réelle : 80 000 − 50 000');
});

test('le bénéfice retranche quand même les autres dépenses', () => {
  viderPeriode(`db.sales = [{ id: 's2', date: todayISO(), total: 80000, cost: 50000, costKnown: true, paid: 80000 }];
    db.expenses = [{ id: 'e2', date: todayISO(), amount: 50000, label: 'Marchandise' },
                   { id: 'e3', date: todayISO(), amount: 7000, label: 'Loyer' }];`);
  const f = dansVm('figures("jour")');
  assert.equal(f.profit, 23000, '30 000 de marge − 7 000 de loyer');
});

test('une vente d’un mois précédent encaissée ce mois-ci entre dans la trésorerie', () => {
  const vieux = dansVm('(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })()');
  viderPeriode(`db.sales = [{ id: 's3', date: ${JSON.stringify(vieux)}, total: 10000, cost: 0, costKnown: true, paid: 0, pays: [{ id: 'p1', amount: 10000, u: Date.now() }] }];`);
  const f = dansVm('figures("mois")');
  assert.equal(f.ca, 0, 'la vente ne gonfle pas le CA du mois');
  assert.equal(f.cash, 10000, 'mais l’argent reçu ce mois est compté');
});

test('le bilan n’affiche qu’une seule ligne d’argent dehors', () => {
  viderPeriode(`db.sales = [{ id: 's5', date: todayISO(), total: 5000, cost: 1000, costKnown: true, paid: 3500 }];`);
  const f = dansVm('figures("tout")');
  assert.equal(f.due, 1500, 'reste dû sur les ventes de la période');
  const html = dansVm('bilans()');
  assert.equal((html.match(/Argent non encore encaissé/g) || []).length, 1, 'une seule ligne');
  assert.ok(!html.includes('Argent dehors'), 'le doublon est supprimé');
});

test('un coût à zéro est traité comme un coût inconnu', () => {
  assert.equal(ac.costKnownOf(0), false, '0 ne renseigne rien sur le bénéfice');
  assert.equal(ac.costKnownOf(1200), true);
  viderPeriode(`db.sales = [{ id: 's6', date: todayISO(), total: 5000, cost: 0, costKnown: false, paid: 5000 }];`);
  assert.equal(dansVm('figures("jour")').unknownCost.length, 1, 'la vente doit être signalée');
});

test('la trésorerie ne compte jamais plus que le total d’une vente', () => {
  viderPeriode(`db.sales = [{ id: 's4', date: todayISO(), total: 10000, cost: 0, costKnown: true, paid: 10000,
    pays: [{ id: 'p2', amount: 5000, u: Date.now() }] }];`);
  const f = dansVm('figures("jour")');
  assert.equal(f.cash, 10000, 'acompte + versement plafonnés au total');
});

/* --- factures payées : elles n'entrent dans le CA qu'une fois réglées --- */

test('une facture payée entre dans le CA du mois du règlement', () => {
  viderPeriode(`db.sales = []; db.docs = [
    { id: 'f1', kind: 'FAC', date: '2026-01-05', paidDate: todayISO(), total: 50000, vat: 0, lines: [] },
    { id: 'f2', kind: 'FAC', date: todayISO(), total: 30000, vat: 0, lines: [] },
    { id: 'f3', kind: 'DEV', date: todayISO(), paidDate: todayISO(), total: 9999, vat: 0, lines: [] }];`);
  const f = dansVm('figures("jour")');
  assert.equal(f.inv, 50000, 'seule la facture payée compte');
  assert.equal(f.ca, 50000, 'elle entre dans le chiffre d’affaires');
  assert.equal(f.cash, 50000, 'et dans l’encaissé');
  assert.ok(dansVm('bilans()').includes('dont factures payées'), 'la ligne est visible au bilan');
});

test('une facture compte dans le mois où elle est réglée, pas celui de son émission', () => {
  viderPeriode(`db.sales = []; db.docs = [{ id: 'f4', kind: 'FAC', date: '2026-01-05', paidDate: '2026-02-10', total: 20000, vat: 0, lines: [] }];`);
  assert.equal(dansVm('figures("mois", "2026-01")').ca, 0, 'émise en janvier, pas encore payée');
  assert.equal(dansVm('figures("mois", "2026-02")').ca, 20000, 'le règlement de février compte');
});

test('le rapport mensuel reste disponible sur un mois sans données', () => {
  viderPeriode(`db.sales = []; db.expenses = []; db.docs = []; db.withdrawals = [];`);
  const f = dansVm('figures("mois", "2020-03")');
  assert.equal(f.ca, 0);
  assert.equal(f.profit, 0);
  assert.ok(dansVm('monthsWithData()').includes(dansVm('todayISO().slice(0, 7)')));
});

/* --- facture convertie en vente : une seule source de revenu --- */

test('une facture transformée en vente n’est pas comptée deux fois', () => {
  viderPeriode(`db.sales = [{ id: 's9', date: todayISO(), total: 50000, cost: 0, costKnown: false, paid: 50000 }];
    db.docs = [{ id: 'f9', kind: 'FAC', date: todayISO(), paidDate: todayISO(), saleId: 's9', total: 50000, vat: 0, lines: [] }];`);
  const f = dansVm('figures("jour")');
  assert.equal(f.inv, 0, 'la facture liée est ignorée');
  assert.equal(f.ca, 50000, 'seule la vente compte');
});

test('une facture impayée est un dû mais pas encore un revenu', () => {
  viderPeriode(`db.sales = []; db.docs = [{ id: 'f7', kind: 'FAC', date: todayISO(), total: 20000, vat: 0, lines: [] }];`);
  const f = dansVm('figures("jour")');
  assert.equal(f.ca, 0, 'pas encore un revenu');
  assert.equal(f.invDue, 20000, 'mais un montant à réclamer');
  assert.equal(dansVm('invoiceDue()'), 20000);
  assert.ok(dansVm('bilans()').includes(dansVm('money(20000)')), 'le bilan affiche la facture impayée');
});

/* --- facture → vente : coût et moyen de paiement --- */

test('une facture payée avec coût produit une vente soldée au bon prix', () => {
  viderPeriode(`db.sales = []; db.docs = [{ id: 'f5', kind: 'FAC', number: 'FAC-5', date: isoOf(new Date(Date.now() - 5 * 86400000)),
    paidDate: todayISO(), total: 30000, vat: 0, cost: 12000, party: 'Awa', lines: [] }];`);
  const d = dansVm('db.docs[0]');
  const s = { ...dansVm('saleFromInvoice(db.docs[0], "Wave")') };
  assert.equal(s.total, 30000);
  assert.equal(s.paid, 30000, 'facture payée : vente soldée');
  assert.equal(s.date, d.paidDate, 'à la date du règlement');
  assert.equal(s.method, 'Wave', 'le moyen de paiement est celui choisi');
  assert.equal(dansVm('costKnownOf')(s.cost), true, 'coût saisi : bénéfice réel');
  assert.equal(s.docId, 'f5', 'la vente pointe vers sa facture');
});

test('une facture impayée devient une vente à crédit sans coût connu', () => {
  viderPeriode(`db.sales = []; db.docs = [{ id: 'f6', kind: 'FAC', number: 'FAC-6', date: todayISO(), total: 8000, vat: 0, party: 'Koffi', lines: [] }];`);
  const s = { ...dansVm('saleFromInvoice(db.docs[0], "")') };
  assert.equal(s.paid, 0, 'rien d’encaissé');
  assert.equal(dansVm('costKnownOf')(s.cost), false, 'coût 0 = inconnu, pas gratuit');
  dansVm('db.docs[0].saleId = "s-test"');
  assert.equal(dansVm('invoiceDue()'), 0, 'plus rien à réclamer après conversion');
});

/* --- relance d'une facture impayée --- */

test('la relance d’une facture est courtoise et reprend la facture', () => {
  viderPeriode(`db.sales = []; db.shop = 'Chez Awa'; db.settings.phone = '07 00 00 00 00';
    db.docs = [{ id: 'f3', kind: 'FAC', number: 'FAC-2026-003', date: todayISO(), total: 25000, vat: 0, party: 'Koffi', lines: [] }];`);
  const text = dansVm('invoiceReminderText(db.docs[0])');
  assert.match(text, /^Bonjour Koffi,/);
  assert.ok(text.includes('FAC-2026-003'), 'le numéro de la facture');
  assert.ok(text.includes(dansVm('money(25000)')), 'le montant');
  assert.ok(text.includes(dansVm('dayFR(db.docs[0].date)')), 'la date de la facture');
  assert.ok(text.includes('Chez Awa'), 'la boutique signe le message');
  assert.ok(text.includes('07 00 00 00 00'), 'le téléphone de la boutique');
  assert.ok(text.includes('ne pas tenir compte'), 'une porte de sortie si déjà payée');
  assert.ok(!text.includes('['), 'aucun champ non remplacé');
});
