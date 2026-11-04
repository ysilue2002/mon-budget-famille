/**
 * Seed de démonstration — foyer complet via la vraie API (aucun mock).
 * Pré-requis : PostgreSQL 55432 (monbudget) + API sur 4000 (comme la preview Vite).
 * Usage : BASE=http://127.0.0.1:4000 node seed-demo.mjs
 * Idempotent : si le compte existe déjà, le seed se reconnecte et re-pousse les
 * mêmes enregistrements (rev idem → résultat identique côté pull).
 */
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4000';
const api = `${BASE}/api/v1`;

const EMAIL = 'demo@example.com';
const MEMBER_EMAIL = 'member-demo@example.com';
const PASSWORD = 'MaPhraseDemo2026!';

function headers(token) {
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    origin: 'http://localhost:3000',
  };
}
async function apiCall(method, path, body, token) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

let TOKEN = '';
let pending = [];
let applied = 0;
let chain = Promise.resolve();

function push(entity, entityId, payload) {
  pending.push({
    opId: crypto.randomUUID(),
    entity,
    entityId,
    op: 'upsert',
    payload,
  });
  if (pending.length >= 50) {
    chain = chain.then(() => flush());
  }
}
async function flush() {
  const batch = pending;
  pending = [];
  if (batch.length === 0) return;
  const res = await fetch(`${api}/sync/push`, {
    method: 'POST',
    headers: headers(TOKEN),
    body: JSON.stringify({ ops: batch }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `push HTTP ${res.status}: ${JSON.stringify(body)}`);
  for (const r of body.results) {
    assert.ok(['applied', 'conflict'].includes(r.status), `push failed: ${JSON.stringify(r)}`);
    applied += 1;
  }
}

// ——— 1. Compte admin (déjà existant ? connexion) ------------------------------
let reg = await apiCall('POST', '/auth/register', {
  email: EMAIL,
  password: PASSWORD,
  familyName: 'Famille Démo',
  primaryCurrency: 'XOF',
});
if (reg.status === 409) {
  reg = await apiCall('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
}
assert.ok([200, 201].includes(reg.status), `register/login: ${JSON.stringify(reg.body)}`);
TOKEN = reg.json.token;
const familyId = reg.json.family.id;
const userId = reg.json.user.id;

// Phrase de secours du compte démo (Réglages affichera « phrase définie »).
const PHRASE = 'phrase-de-secours-demo-tres-longue-01';
const phraseStatus = await apiCall('POST', '/auth/recovery-phrase', { recoveryPhrase: PHRASE }, TOKEN);
assert.ok([200, 201].includes(phraseStatus.status), `recovery-phrase: ${JSON.stringify(phraseStatus.json)}`);

// ——— 2. Membre invité ---------------------------------------------------------
const memberName = 'Démo Membre';
let member = await apiCall('POST', '/auth/register', {
  email: MEMBER_EMAIL,
  password: PASSWORD,
  familyName: 'Invité',
  primaryCurrency: 'XOF',
  invitationCode: undefined,
});
if (member.status === 409) {
  // Déjà inscrit : le rattachement au foyer se fait via /auth/join + code neuf.
  const mLogin = await apiCall('POST', '/auth/login', { email: MEMBER_EMAIL, password: PASSWORD });
  assert.equal(mLogin.status, 200);
  const codeResp = await apiCall('POST', '/auth/invite', undefined, TOKEN);
  assert.equal(codeResp.status, 201, JSON.stringify(codeResp.body));
  member = await apiCall('POST', '/auth/join', { invitationCode: codeResp.json.code }, mLogin.json.token);
} else {
  const codeResp = await apiCall('POST', '/auth/invite', undefined, TOKEN);
  assert.equal(codeResp.status, 201, `invite: ${JSON.stringify(codeResp.body)}`);
  member = await apiCall('POST', '/auth/join', { invitationCode: codeResp.json.code }, member.json.token);
}
assert.equal(member.status, 200, `join membre: ${JSON.stringify(member.json)}`);

const F = familyId;
const dev = 'seed-demo';
const TODAY = '2026-11-04';

const sf = () => ({ baseRev: 0, rev: 0, updatedAt: Date.now(), deviceId: dev, syncStatus: 'synced' });

// ——— 3. Comptes ---------------------------------------------------------------
push('account', 'acc-banque', { id: 'acc-banque', familyId: F, name: 'Compte BIC Joint', type: 'bank', provider: null, currency: 'XOF', initialBalance: 1560000, color: '#14532d', archived: false, ...sf() });
push('account', 'acc-mobile', { id: 'acc-mobile', familyId: F, name: 'Orange Money Awa', type: 'mobile', provider: 'orange', currency: 'XOF', initialBalance: 85000, color: '#f97316', archived: false, ...sf() });
push('account', 'acc-caisse', { id: 'acc-caisse', familyId: F, name: 'Caisse maison', type: 'cash', provider: null, currency: 'XOF', initialBalance: 70000, color: '#6b7280', archived: false, ...sf() });
push('account', 'acc-epargne', { id: 'acc-epargne', familyId: F, name: 'Épargne', type: 'bank', provider: null, currency: 'XOF', initialBalance: 350000, color: '#0ea5e9', archived: false, ...sf() });

// ——— 4. Catégories ------------------------------------------------------------
const cats = [
  ['cat-loyer', 'Loyer', 'Rent', 'expense', '🏠'],
  ['cat-alimentaire', 'Alimentation', 'Groceries', 'expense', '🛒'],
  ['cat-transport', 'Transport', 'Transport', 'expense', '🚌'],
  ['cat-ecole', 'Scolarité', 'School fees', 'expense', '🎒'],
  ['cat-sante', 'Santé', 'Health', 'expense', '💊'],
  ['cat-loisirs', 'Loisirs', 'Leisure', 'expense', '🎉'],
  ['cat-epargne', 'Épargne', 'Savings', 'expense', '🏦'],
  ['cat-salaire', 'Salaire', 'Salary', 'income', '💼'],
  ['cat-vente', 'Vente boutique', 'Shop sales', 'income', '🧵'],
  ['cat-prestation', 'Prestation', 'Services', 'income', '🔧'],
];
for (const [id, fr, en, type, icon] of cats) {
  push('category', id, { id, familyId: F, nameFr: fr, nameEn: en, type, icon, ...sf() });
}
const [LO, AL, TR, EC, SN, LOI, EP, SA, VEN, PRE] = cats.map((c) => c[0]);

// ——— 5. Transactions ----------------------------------------------------------
const tx = [];
function addTx(id, o) {
  if (o.date > TODAY) return; // pas d'opération datée dans le futur
  tx.push({
    id, familyId: F, accountId: o.acc, toAccountId: o.to, authorId: userId,
    authorName: o.by ?? 'Awa Démo', type: o.type, amountOriginal: o.amount,
    toAmount: o.toAmount, currencyOriginal: 'XOF', exchangeRate: 1,
    amountInPrimary: o.amount, categoryId: o.cat,
    ...(o.member ? { member: o.member } : {}),
    ...(o.biz ? { businessId: o.biz, settled: o.settled } : {}),
    date: o.date, note: o.note, ...sf(),
  });
}
const months = ['2026-09', '2026-10', '2026-11'];
const daysByMonth = {
  '2026-09': [3, 8, 13, 17, 22, 27],
  '2026-10': [3, 8, 13, 17, 22, 27],
  '2026-11': [1, 3],
};
let n = 0;
for (const ym of months) {
  addTx(`sal-${ym}`, { acc: 'acc-banque', type: 'income', amount: 850000, cat: SA, by: 'Moussa Démo', date: `${ym}-01`, note: `Salaire du mois`, member: 'Moussa' });
  for (const d of daysByMonth[ym]) {
    const dd = String(d).padStart(2, '0');
    n += 1;
    addTx(`agr-${ym}-${dd}`, { acc: 'acc-mobile', type: 'expense', amount: 8000 + (n % 7) * 1500, cat: AL, date: `${ym}-${dd}`, note: 'Marché + viande', member: 'Awa' });
    addTx(`tr-${ym}-${dd}`, { acc: 'acc-caisse', type: 'expense', amount: 500 + (n % 4) * 250, cat: TR, date: `${ym}-${dd}`, note: 'Taxi / car rapide' });
  }
  addTx(`loyer-${ym}`, { acc: 'acc-banque', type: 'expense', amount: 175000, cat: LO, date: `${ym}-02`, by: 'Moussa Démo', note: 'Loyer mensuel', member: 'Moussa' });
  addTx(`forfait-${ym}`, { acc: 'acc-mobile', type: 'expense', amount: 12000, cat: TR, date: `${ym}-05`, note: 'Recharge Orange' });
  addTx(`ecole-${ym}`, { acc: 'acc-banque', type: 'expense', amount: 45000, cat: EC, date: `${ym}-07`, by: 'Moussa Démo', note: 'Cantine + fournitures' });
  addTx(`sante-${ym}`, { acc: 'acc-caisse', type: 'expense', amount: 15000, cat: SN, date: `${ym}-12`, note: 'Pharmacie' });
  addTx(`loisir-${ym}`, { acc: 'acc-caisse', type: 'expense', amount: 9000 + (n % 5) * 3000, cat: LOI, date: `${ym}-18`, note: 'Sortie famille' });
  addTx(`epargne-${ym}`, { acc: 'acc-banque', to: 'acc-epargne', type: 'transfer', amount: 150000, toAmount: 150000, date: `${ym}-04`, by: 'Moussa Démo', note: 'Épargne mensuelle', member: 'Moussa' });
}
const bizId = 'biz-demo';
addTx('biz-1', { acc: 'acc-mobile', type: 'income', amount: 92000, cat: VEN, biz: bizId, settled: true, date: '2026-10-08', note: 'Vente plateaux mariage', member: 'Awa' });
addTx('biz-2', { acc: 'acc-banque', type: 'income', amount: 250000, cat: PRE, biz: bizId, settled: false, date: '2026-10-20', note: 'Uniformes école (créance)', member: 'Moussa' });
addTx('biz-3', { acc: 'acc-mobile', type: 'expense', amount: 38000, cat: AL, biz: bizId, settled: false, date: '2026-10-12', note: 'Achat tissus (fournitures)', member: 'Awa' });
addTx('biz-4', { acc: 'acc-mobile', type: 'income', amount: 45000, cat: VEN, biz: bizId, settled: false, date: '2026-11-02', note: 'Robes festival (créance)', member: 'Awa' });
for (const t of tx) push('transaction', t.id, t);

// ——— 6. Budgets ----------------------------------------------------------------
const BUDGETS = [[AL, 250000], [TR, 60000], [LOI, 40000], [SN, 25000], [EC, 60000]];
for (const ym of months) {
  for (const [cat, limit] of BUDGETS) {
    push('budget', `b-${cat}-${ym}`, { id: `b-${cat}-${ym}`, familyId: F, period: ym, categoryId: cat, amountLimit: limit, currency: 'XOF', alertThreshold: 75, ...sf() });
  }
}

// ——— 7. Objectifs d'épargne ----------------------------------------------------
push('goal', 'goal-urgent', { id: 'goal-urgent', familyId: F, name: "Fonds d'urgence", targetAmount: 2000000, currency: 'XOF', currentAmount: 650000, targetDate: null, status: 'active', createdAt: Date.now(), ...sf() });
push('goal', 'goal-voyage', { id: 'goal-voyage', familyId: F, name: 'Voyage Saint-Louis', targetAmount: 450000, currency: 'XOF', currentAmount: 120000, targetDate: '2026-12-20', status: 'active', createdAt: Date.now(), ...sf() });

// ——— 8. Dettes et créances -----------------------------------------------------
push('debt', 'debt-ecole', { id: 'debt-ecole', familyId: F, kind: 'payable', partyName: 'École Zoom', initialAmount: 120000, remainingAmount: 40000, currency: 'XOF', dueDate: '2026-11-30', status: 'open', createdAt: Date.now(), payments: [{ id: 'pay-1', amount: 80000, date: '2026-10-14', accountId: 'acc-banque' }], ...sf() });
push('debt', 'debt-sow', { id: 'debt-sow', familyId: F, kind: 'receivable', partyName: 'Oncle Sow', initialAmount: 250000, remainingAmount: 150000, currency: 'XOF', dueDate: null, status: 'open', createdAt: Date.now(), payments: [{ id: 'pay-2', amount: 100000, date: '2026-10-05', accountId: 'acc-mobile' }], ...sf() });

// ——— 9. Récurrences ------------------------------------------------------------
for (const [id, name, type, cat, amount, account, nextDue, start] of [
  ['rec-loyer', 'Loyer', 'expense', LO, 175000, 'acc-banque', '2026-12-02', '2025-01-02'],
  ['rec-salaire', 'Salaire', 'income', SA, 850000, 'acc-banque', '2026-12-01', '2025-01-01'],
  ['rec-epargne', 'Épargne mensuelle', 'expense', EP, 150000, 'acc-banque', '2026-12-04', '2025-01-04'],
  ['rec-internet', 'Internet maison', 'expense', TR, 12000, 'acc-mobile', '2026-11-15', '2026-08-05'],
]) {
  push('recurring', id, { id, familyId: F, name, type, accountId: account, categoryId: cat, amountOriginal: amount, currency: 'XOF', frequency: 'monthly', interval: 1, startDate: start, nextDueDate: nextDue, endDate: null, active: true, createdAt: Date.now(), ...sf() });
}

// ——— 10. Patrimoine (bilan mensuel) --------------------------------------------
const WEALTH = [
  ['2026-07-01', 1620000, 150000, 120000],
  ['2026-08-01', 1690000, 150000, 120000],
  ['2026-09-01', 1760000, 150000, 120000],
  ['2026-10-01', 1985000, 250000, 120000],
  ['2026-10-31', 2015000, 250000, 40000],
];
for (const [date, savings, receivables, payables] of WEALTH) {
  push('wealth', `wealth-${date}`, { id: `wealth-${date}`, familyId: F, date, primary: 'XOF', savings, receivables, payables, createdAt: Date.now(), ...sf() });
}

// ——— 11. Activité professionnelle ----------------------------------------------
push('business', bizId, { id: bizId, familyId: F, name: 'Atelier Couture Démo', activity: 'Vente de vêtements', taxId: 'SN-2026-DEMO', notes: 'Atelier de couture à Guédiawaye.', archived: false, createdAt: Date.now(), ...sf() });

const health = await fetch(`${BASE}/api/v1/health`);
await flush();
await chain;
console.log(`Seed OK — ${applied} opérations poussées pour le foyer ${F}.`);
console.log(`Admin   : ${EMAIL} / ${PASSWORD}`);
console.log(`Membre  : ${MEMBER_EMAIL} / ${PASSWORD}`);
console.log(`Phrase de secours : ${PHRASE}`);
