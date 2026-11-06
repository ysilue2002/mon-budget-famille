/**
 * E2E sécurité : isolation entre foyers, normalisation de la charge utile et
 * révocation des jetons après réinitialisation du mot de passe.
 *
 * Usage : BASE=http://127.0.0.1:4400 node scripts/e2e-security.mjs
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4400';
const api = `${BASE}/api/v1`;

async function call(path, method, body, token) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      origin: 'http://localhost:5173',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function register(label) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await call('/auth/register', 'POST', {
    email,
    password: 'MotDePasseTest2026!',
    familyName: `Foyer ${label}`,
    primaryCurrency: 'XOF',
  });
  assert.equal(res.status, 201, `inscription ${label} : ${JSON.stringify(res.body)}`);
  return { email, token: res.body.token, familyId: res.body.family.id };
}

function pushOp(token, op) {
  return call('/sync/push', 'POST', { ops: [{ opId: randomUUID(), baseRev: 0, baseSnapshot: null, ...op }] }, token);
}

const stamp = () => ({ createdAt: Date.now(), updatedAt: Date.now(), deviceId: 'e2e', syncStatus: 'pending' });
const results = [];
const check = (name, cond, detail = '') => {
  results.push(`${cond ? 'OK  ' : 'FAIL'} ${name}${cond ? '' : ' → ' + detail}`);
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' → ' + detail}`);
};

const alice = await register('alice');
const bob = await register('bob');

// 1. Un client ne peut pas estampiller un enregistrement avec le foyer d'autrui.
const recordId = randomUUID();
const forged = await pushOp(alice.token, {
  entity: 'account',
  entityId: recordId,
  op: 'upsert',
  payload: {
    id: recordId,
    familyId: bob.familyId, // tentative de pollution inter-foyers
    name: 'Caisse Alice',
    type: 'cash',
    currency: 'XOF',
    openingBalance: 0,
    ...stamp(),
  },
  changedFields: ['id', 'familyId', 'name', 'type', 'currency', 'openingBalance'],
});
check('écriture acceptée dans le foyer du porteur du jeton', forged.status === 200 && forged.body.results[0].status === 'applied', JSON.stringify(forged.body));

const alicePull = await call('/sync/pull?cursor=0', 'GET', undefined, alice.token);
const stored = (alicePull.body?.changes ?? []).find((change) => change.recordId === recordId)?.record;
check(
  'le foyer de la charge utile est remplacé par celui du jeton',
  stored?.familyId === alice.familyId,
  `familyId stocké = ${stored?.familyId}`,
);

// 2. Le second foyer ne voit rien de cette écriture.
const bobPull = await call('/sync/pull?cursor=0', 'GET', undefined, bob.token);
check(
  'aucune donnée du foyer A visible depuis le foyer B',
  (bobPull.body?.changes ?? []).length === 0,
  `${(bobPull.body?.changes ?? []).length} changement(s) visibles`,
);

// 3. Une suppression émise par B ne touche pas l'enregistrement de A.
const bobDelete = await pushOp(bob.token, {
  entity: 'account',
  entityId: recordId,
  op: 'delete',
  payload: null,
  baseRev: 0,
});
check('suppression d’un identifiant inconnu traitée dans le foyer B', bobDelete.status === 200, JSON.stringify(bobDelete.body));
const aliceAfter = await call('/sync/pull?cursor=0', 'GET', undefined, alice.token);
const stillThere = (aliceAfter.body?.changes ?? []).some((change) => change.recordId === recordId && change.deleted === false);
check('l’enregistrement de A survit à la suppression de B', stillThere, 'enregistrement supprimé à tort');

// 4. Le pull de B ne contient jamais l'identifiant d'A.
check(
  'le pull de B reste vide après la suppression',
  (await call('/sync/pull?cursor=0', 'GET', undefined, bob.token)).body.changes.every((change) => change.recordId !== recordId),
  'fuite inter-foyers détectée',
);

// 5. Réinitialisation du mot de passe : les jetons déjà émis cessent d'être valides.
const carol = await register('carol');
const beforeReset = await call('/sync/pull?cursor=0', 'GET', undefined, carol.token);
check('jeton valide avant réinitialisation', beforeReset.status === 200, `status=${beforeReset.status}`);

const resetRequest = await call('/auth/reset', 'POST', { email: carol.email }, carol.token);
check('code de réinitialisation délivré à l’admin', resetRequest.status === 201, JSON.stringify(resetRequest.body));

const resetConfirm = await call('/auth/reset-confirm', 'POST', {
  email: carol.email,
  resetCode: resetRequest.body?.code,
  newPassword: 'NouveauMotDePasse2026!',
});
check('réinitialisation confirmée', resetConfirm.status === 200, JSON.stringify(resetConfirm.body));

const revoked = await call('/sync/pull?cursor=0', 'GET', undefined, carol.token);
check('ancien jeton refusé après réinitialisation', revoked.status === 401, `status=${revoked.status}`);

const relogin = await call('/auth/login', 'POST', { email: carol.email, password: 'NouveauMotDePasse2026!' });
check('connexion avec le nouveau mot de passe', relogin.status === 200, JSON.stringify(relogin.body));
const freshToken = await call('/sync/pull?cursor=0', 'GET', undefined, relogin.body?.token);
check('nouveau jeton accepté', freshToken.status === 200, `status=${freshToken.status}`);

// 6. Nettoyage : les comptes de test disparaissent.
for (const account of [alice, bob, carol]) {
  const token = account === carol ? relogin.body?.token : account.token;
  if (!token) continue;
  await call('/auth/account', 'DELETE', undefined, token);
}

const failed = results.filter((line) => line.startsWith('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} contrôles réussis`);
process.exit(failed.length === 0 ? 0 : 1);
