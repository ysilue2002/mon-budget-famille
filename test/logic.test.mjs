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
    'globalThis.__ac = { creditOf, paidOf, paysOf, debtOf, totalDebt, qtyOf, vatOf, ttcOf, amountOf, money, fr, mergeStates, fresh, loadDB, saveDB, stateBytes, countRecords, methodLabel, methodOptions, MAX_STATE, db };',
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
