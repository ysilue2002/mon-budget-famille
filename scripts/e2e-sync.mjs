/**
 * E2E push/pull contre PostgreSQL réel, via l'API HTTP (aucun mock).
 * Usage : BASE=http://127.0.0.1:4400 node e2e-sync.mjs
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from '../server/node_modules/pg/lib/index.js';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4400';
const DB = 'postgres://budget@127.0.0.1:55432/monbudget';
const api = `${BASE}/api/v1`;
const results = [];
let step = 0;

async function check(name, fn) {
  step += 1;
  try {
    await fn();
    results.push({ n: step, name, ok: true });
    console.log(`ok ${step} - ${name}`);
  } catch (error) {
    results.push({ n: step, name, ok: false, error: error.message });
    console.log(`FAIL ${step} - ${name}\n     ${error.message}`);
    throw error;
  }
}

async function post(path, body, token) {
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      origin: 'http://localhost:5173',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path, token) {
  const res = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}

const db = new pg.Client({ connectionString: DB });
await db.connect();
const stamp = Date.now();

// 1. Comptes réels
const alice = await post('/auth/register', {
  email: `alice-${stamp}@example.test`,
  password: 'mot-de-passe-solide',
  familyName: 'Foyer Alice',
  primaryCurrency: 'XOF',
});
const bob = await post('/auth/register', {
  email: `bob-${stamp}@example.test`,
  password: 'mot-de-passe-solide',
  familyName: 'Foyer Bob',
  primaryCurrency: 'EUR',
});
assert.equal(alice.status, 201, `register alice: ${JSON.stringify(alice.body)}`);
assert.equal(bob.status, 201, `register bob: ${JSON.stringify(bob.body)}`);

const login = await post('/auth/login', { email: `alice-${stamp}@example.test`, password: 'mot-de-passe-solide' });
assert.equal(login.status, 200);
const token = login.body.token;
const familyId = alice.body.family.id;

const op1 = randomUUID(); // upsert valide acc-1
const op2 = randomUUID(); // upsert invalide (NUL byte refusé par jsonb)
const op3 = randomUUID(); // upsert valide tx-1

await check('push: un op refusée isole le lot, les autres passent', async () => {
  const payloadBad = { id: 'acc-bad', name: 'Libellé\u0000cassé', balance: 5 };
  const { status, body } = await post(
    '/sync/push',
    {
      ops: [
        { opId: op1, entity: 'account', entityId: 'acc-1', op: 'upsert', payload: { id: 'acc-1', name: 'Compte courant', balance: 100, currency: 'XOF' } },
        { opId: op2, entity: 'account', entityId: 'acc-bad', op: 'upsert', payload: payloadBad },
        { opId: op3, entity: 'transaction', entityId: 'tx-1', op: 'upsert', payload: { id: 'tx-1', amount: 25, accountId: 'acc-1' } },
      ],
    },
    token,
  );
  assert.equal(status, 200, `HTTP ${status}: ${JSON.stringify(body)}`);
  const byId = Object.fromEntries(body.results.map((r) => [r.opId, r]));
  assert.equal(byId[op1].status, 'applied');
  assert.equal(byId[op1].rev, 1);
  assert.equal(byId[op2].status, 'failed', `attendu failed: ${JSON.stringify(byId[op2])}`);
  assert.equal(byId[op2].error, 'operation-failed');
  assert.equal(byId[op3].status, 'applied');
  // Aucun détail SQL ne doit fuiter.
  assert.equal(JSON.stringify(byId[op2]).includes('jsonb'), false);
  assert.equal(JSON.stringify(byId[op2]).includes('22P05'), false);
});

await check("l'opération refusée ne laisse aucune trace partielle", async () => {
  const rec = await db.query('SELECT 1 FROM records WHERE family_id = $1 AND record_id = $2', [familyId, 'acc-bad']);
  assert.equal(rec.rowCount, 0, 'enregistrement partiel écrit');
  const ops = await db.query('SELECT 1 FROM processed_ops WHERE op_id = $1', [op2]);
  assert.equal(ops.rowCount, 0, 'op marquée traitée alors qu\'elle a échoué');
  const log = await db.query('SELECT 1 FROM change_log WHERE family_id = $1 AND record_id = $2', [familyId, 'acc-bad']);
  assert.equal(log.rowCount, 0, 'changement journalisé malgré l\'échec');
  const okRow = await db.query('SELECT record, rev, deleted FROM records WHERE family_id = $1 AND record_id = $2', [familyId, 'acc-1']);
  assert.equal(okRow.rowCount, 1);
  assert.equal(Number(okRow.rows[0].rev), 1);
  assert.equal(okRow.rows[0].record.syncStatus, 'synced');
});

await check('réessai de la même opId après correction: accepté', async () => {
  const { body } = await post(
    '/sync/push',
    { ops: [{ opId: op2, entity: 'account', entityId: 'acc-bad', op: 'upsert', payload: { id: 'acc-bad', name: 'Libellé corrigé', balance: 5 } }] },
    token,
  );
  assert.equal(body.results[0].status, 'applied');
  assert.equal(body.results[0].rev, 1);
});

await check('idempotence: rejouer la même opId ne réapplique rien', async () => {
  const before = await db.query('SELECT count(*)::int AS n FROM change_log WHERE family_id = $1', [familyId]);
  const { body } = await post(
    '/sync/push',
    { ops: [{ opId: op1, entity: 'account', entityId: 'acc-1', op: 'upsert', payload: { id: 'acc-1', name: 'Compte courant', balance: 100, currency: 'XOF' } }] },
    token,
  );
  const r = body.results[0];
  assert.equal(r.status, 'duplicate');
  const after = await db.query('SELECT count(*)::int AS n FROM change_log WHERE family_id = $1', [familyId]);
  assert.equal(after.rows[0].n, before.rows[0].n, 'change_log a grossi');
  const row = await db.query('SELECT rev FROM records WHERE family_id = $1 AND record_id = $2', [familyId, 'acc-1']);
  assert.equal(Number(row.rows[0].rev), 1, 'révision incrémentée par un doublon');
});

await check('fusion champ par champ: deux gestes disjoints sont conservés', async () => {
  const util = await post(
    '/sync/push',
    {
      ops: [
        {
          opId: randomUUID(),
          entity: 'account',
          entityId: 'acc-1',
          op: 'upsert',
          payload: { name: 'Compte courant', balance: 150, currency: 'XOF' },
          changedFields: ['balance'],
          baseSnapshot: { name: 'Compte courant', balance: 100, currency: 'XOF' },
        },
      ],
    },
    token,
  );
  assert.equal(util.body.results[0].status, 'applied');
  assert.equal(util.body.results[0].rev, 2);

  const other = await post(
    '/sync/push',
    {
      ops: [
        {
          opId: randomUUID(),
          entity: 'account',
          entityId: 'acc-1',
          op: 'upsert',
          payload: { name: 'Compte joint', balance: 150, currency: 'XOF' },
          changedFields: ['name'],
          baseSnapshot: { name: 'Compte courant', balance: 150, currency: 'XOF' },
        },
      ],
    },
    token,
  );
  assert.equal(other.body.results[0].status, 'applied');
  assert.equal(other.body.results[0].rev, 3);
  const merged = other.body.results[0].mergedPayload;
  assert.equal(merged.name, 'Compte joint');
  assert.equal(merged.balance, 150, 'le solde distant a été écrasé');
});

await check('conflit réel: champ modifié des deux côtés signalé, pas écrasé', async () => {
  const { body } = await post(
    '/sync/push',
    {
      ops: [
        {
          opId: randomUUID(),
          entity: 'account',
          entityId: 'acc-1',
          op: 'upsert',
          payload: { name: 'Ancien nom', balance: 150, currency: 'XOF' },
          changedFields: ['name'],
          baseSnapshot: { name: 'Compte courant', balance: 150, currency: 'XOF' },
        },
      ],
    },
    token,
  );
  const r = body.results[0];
  assert.equal(r.status, 'conflict');
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].field, 'name');
  assert.equal(r.conflicts[0].remoteValue, 'Compte joint');
  assert.equal(r.conflicts[0].localValue, 'Ancien nom');
  const row = await db.query('SELECT record FROM records WHERE family_id = $1 AND record_id = $2', [familyId, 'acc-1']);
  assert.equal(row.rows[0].record.name, 'Compte joint', 'valeur locale écrasée malgré le conflit');
});

await check('pull: tous les changements depuis 0, curseur stable', async () => {
  const first = await get('/sync/pull?cursor=0', token);
  assert.equal(first.status, 200);
  const forAcc = first.body.changes.filter((c) => c.recordId === 'acc-1');
  assert.equal(forAcc.length, 4, `attendu 4 changements acc-1, reçu ${forAcc.length}`);
  assert.deepEqual(forAcc.map((c) => c.rev), [1, 2, 3, 4]);
  assert.equal(first.body.changes.some((c) => c.recordId === 'tx-1'), true);

  const second = await get(`/sync/pull?cursor=${first.body.cursor}`, token);
  assert.equal(second.body.changes.length, 0, 'pull incrémental rejoue des changements');
});

await check('suppression: tombstone poussé et reçu par le pull', async () => {
  const before = await get('/sync/pull?cursor=0', token);
  const del = await post('/sync/push', { ops: [{ opId: randomUUID(), entity: 'account', entityId: 'acc-1', op: 'delete', payload: null }] }, token);
  assert.equal(del.body.results[0].status, 'applied');
  const after = await get(`/sync/pull?cursor=${before.body.cursor}`, token);
  assert.equal(after.body.changes.length, 1);
  const change = after.body.changes[0];
  assert.equal(change.recordId, 'acc-1');
  assert.equal(change.deleted, true);
  assert.equal(change.record, null);
  const row = await db.query('SELECT deleted, rev FROM records WHERE family_id = $1 AND record_id = $2', [familyId, 'acc-1']);
  assert.equal(row.rows[0].deleted, true);
});

await check('second foyer: isolation totale du pull', async () => {
  const res = await get('/sync/pull?cursor=0', bob.body.token);
  assert.equal(res.status, 200);
  assert.equal(res.body.changes.length, 0, `fuite entre foyers: ${JSON.stringify(res.body.changes)}`);
  const noFamily = await get('/sync/pull?cursor=0', 'jeton-invalide');
  assert.equal(noFamily.status, 401);
});

await db.end();
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} vérifications E2E réussies`);
