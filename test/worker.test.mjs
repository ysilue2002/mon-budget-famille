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
  + '\nexport { maskState, restoreMasked, publicUser, parsePerms };\n';
const mod = await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
const { maskState, restoreMasked, publicUser, parsePerms } = mod;

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
