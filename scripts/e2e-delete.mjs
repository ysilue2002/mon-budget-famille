/**
 * E2E « suppression vs édition hors ligne » contre PostgreSQL réel, via l'API.
 * Usage : BASE=http://127.0.0.1:4400 node e2e-delete.mjs
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from '../server/node_modules/pg/lib/index.js';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4400';
const DB = 'postgres://budget@127.0.0.1:55432/monbudget';
const api = `${BASE}/api/v1`;
let step = 0;

async function check(name, fn) {
  step += 1;
  try {
    await fn();
    console.log(`ok ${step} - ${name}`);
  } catch (error) {
    console.log(`FAIL ${step} - ${name}\n     ${error.message}`);
    throw error;
  }
}

async function post(path, body, token) {
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path, token) {
  const res = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}

const push = (ops, token) => post('/sync/push', { ops }, token);
const op = (entityId, o, baseRev, extra = {}) => ({
  opId: randomUUID(),
  entity: 'account',
  entityId,
  op: o,
  payload: o === 'delete' ? null : { id: entityId, ...extra.payload },
  baseRev,
  ...(o === 'delete' ? {} : { changedFields: extra.changedFields ?? ['name'], baseSnapshot: extra.baseSnapshot ?? {} }),
});

const db = new pg.Client({ connectionString: DB });
await db.connect();
const stamp = Date.now();

const alice = await post('/auth/register', {
  email: `del-alice-${stamp}@example.test`,
  password: 'mot-de-passe-solide',
  familyName: 'Foyer Suppression',
  primaryCurrency: 'XOF',
});
const token = alice.body.token;
assert.equal(alice.status, 201);

const id = `del-${stamp}`;

await check('création : révision 1 sur un enregistrement réellement neuf', async () => {
  const res = await push([op(id, 'upsert', 0, { payload: { name: 'Compte vivant', balance: 100 } })], token);
  assert.equal(res.status, 200);
  assert.equal(res.body.results[0].status, 'applied');
  assert.equal(res.body.results[0].rev, 1);
});

await check('suppression : révision 2, tombstone posé', async () => {
  const res = await push([op(id, 'delete', 1)], token);
  assert.equal(res.body.results[0].status, 'applied');
  assert.equal(res.body.results[0].rev, 2);
  const row = await db.query('SELECT rev, deleted, record FROM records WHERE entity = $1 AND record_id = $2', ['account', id]);
  assert.equal(Number(row.rows[0].rev), 2);
  assert.equal(row.rows[0].deleted, true);
});

await check('édition hors ligne (baseRev 1 < tombstone rev 2) : conflit, pas de résurrection', async () => {
  const res = await push([op(id, 'upsert', 1, { payload: { name: 'Édition hors ligne' }, baseSnapshot: { name: 'Compte vivant' } })], token);
  const result = res.body.results[0];
  assert.equal(result.status, 'conflict');
  assert.equal(result.rev, 2);
  assert.equal(result.deleted, true);
  assert.equal(result.mergedPayload, null);
  assert.deepEqual(result.conflicts, [{ field: 'name', remoteValue: null, localValue: 'Édition hors ligne' }]);
});

await check('la ligne reste supprimée et inchangée en base, aucun change_log parasite', async () => {
  const row = await db.query('SELECT rev, deleted, record FROM records WHERE entity = $1 AND record_id = $2', ['account', id]);
  assert.equal(Number(row.rows[0].rev), 2);
  assert.equal(row.rows[0].deleted, true);
  assert.deepEqual(row.rows[0].record, { id });
  const logs = await db.query('SELECT rev, deleted FROM change_log WHERE entity = $1 AND record_id = $2 ORDER BY id ASC', ['account', id]);
  assert.deepEqual(logs.rows.map((r) => [Number(r.rev), r.deleted]), [[1, false], [2, true]]);
});

await check("l'opération refusée est bien marquée traitée (pas de rejeu infini)", async () => {
  const seen = await db.query('SELECT count(*)::int AS n FROM processed_ops WHERE record_id = $1', [id]);
  assert.equal(seen.rows[0].n, 3);
});

await check('baseRev inconnue (0) : la suppression gagne aussi', async () => {
  const res = await push([op(id, 'upsert', 0, { payload: { name: 'Création locale' } })], token);
  assert.equal(res.body.results[0].status, 'conflict');
  assert.equal(res.body.results[0].deleted, true);
});

await check('recréation délibérée (baseRev 2 = tombstone) : rev 3, ligne vivante', async () => {
  const res = await push([op(id, 'upsert', 2, { payload: { name: 'Recréé volontairement', balance: 42 } })], token);
  const result = res.body.results[0];
  assert.equal(result.status, 'applied');
  assert.equal(result.rev, 3);
  const row = await db.query('SELECT rev, deleted, record FROM records WHERE entity = $1 AND record_id = $2', ['account', id]);
  assert.equal(Number(row.rows[0].rev), 3);
  assert.equal(row.rows[0].deleted, false);
  assert.equal(row.rows[0].record.name, 'Recréé volontairement');
  assert.equal(row.rows[0].record.rev, 3);
  assert.equal(row.rows[0].record.baseRev, 3);
});

await check('le pull expose rev 3 vivante puis le tombstone final sans régression de révision', async () => {
  const pulled = await get('/sync/pull?cursor=0', token);
  const forId = pulled.body.changes.filter((c) => c.recordId === id);
  assert.deepEqual(forId.map((c) => [c.rev, c.deleted]), [[1, false], [2, true], [3, false]]);
  const del = await push([op(id, 'delete', 3)], token);
  assert.equal(del.body.results[0].rev, 4);
  const after = await get(`/sync/pull?cursor=${pulled.body.cursor}`, token);
  const tail = after.body.changes.filter((c) => c.recordId === id);
  assert.deepEqual(tail.map((c) => [c.rev, c.deleted, c.record]), [[4, true, null]]);
});

await check('autre tentative tardive (baseRev 2 < 4) : toujours bloquée', async () => {
  const res = await push([op(id, 'upsert', 2, { payload: { name: 'Trop tard' } })], token);
  assert.equal(res.body.results[0].status, 'conflict');
  assert.equal(res.body.results[0].deleted, true);
  assert.equal(res.body.results[0].rev, 4);
});

await check('recréation après le second tombstone (baseRev 4) : rev 5, sans conflit', async () => {
  const res = await push([op(id, 'upsert', 4, { payload: { name: 'Retour assumé', balance: 7 } })], token);
  assert.equal(res.body.results[0].status, 'applied');
  assert.equal(res.body.results[0].rev, 5);
  const row = await db.query('SELECT rev, deleted, record FROM records WHERE entity = $1 AND record_id = $2', ['account', id]);
  assert.equal(Number(row.rows[0].rev), 5);
  assert.equal(row.rows[0].deleted, false);
  assert.equal(row.rows[0].record.name, 'Retour assumé');
});

console.log(`\n${step}/${step} vérifications OK`);
await db.end();
