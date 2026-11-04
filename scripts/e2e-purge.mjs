/**
 * E2E de la purge de l'historique serveur (change_log / processed_ops),
 * contre PostgreSQL réel : la vraie fonction purgeServerHistory du serveur est
 * exécutée via un sous-processus tsx, et l'API sert au push/pull.
 * Usage : BASE=http://127.0.0.1:4400 node e2e-purge.mjs
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from '../server/node_modules/pg/lib/index.js';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4400';
const DB = 'postgres://budget@127.0.0.1:55432/monbudget';
import { fileURLToPath } from 'node:url';
const SERVER_DIR = new URL('../server/', import.meta.url).pathname.replace(/\/$/, '');
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

/** Exécute la vraie purge (src/db/purge.ts) dans un sous-processus tsx. */
function runPurge() {
  const out = execFileSync(
    process.execPath,
    ['--import', 'tsx', '-e',
      `import { purgeServerHistory } from './src/db/purge.ts';
       purgeServerHistory().then((s) => console.log(JSON.stringify(s)))
         .catch((e) => { console.error(e); process.exit(1); });`,
    ],
    { cwd: SERVER_DIR, env: { ...process.env, DATABASE_URL: DB }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(out.trim());
}

const db = new pg.Client({ connectionString: DB });
await db.connect();
const stamp = Date.now();

const reg = await post('/auth/register', {
  email: `purge-${stamp}@example.test`,
  password: 'mot-de-passe-solide',
  familyName: 'Foyer Purge',
  primaryCurrency: 'XOF',
});
assert.equal(reg.status, 201, `register: ${JSON.stringify(reg.body)}`);
const familyId = reg.body.family.id;
const token = reg.body.token ?? (await post('/auth/login', { email: `purge-${stamp}@example.test`, password: 'mot-de-passe-solide' })).body.token;

await check('push puis pull : le changement est servi', async () => {
  const { status, body } = await post(
    '/sync/push',
    { ops: [{ opId: randomUUID(), entity: 'account', entityId: 'acc-purge', op: 'upsert', payload: { id: 'acc-purge', name: 'Compte purge', balance: 10, currency: 'XOF' } }] },
    token,
  );
  assert.equal(status, 200, `HTTP ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.results[0].status, 'applied');
  const pull = await get('/sync/pull?cursor=0', token);
  assert.equal(pull.status, 200);
  assert.ok(pull.body.changes.some((c) => c.recordId === 'acc-purge'), 'pull vide avant purge');
});

await check('purge: les lignes vieillies de change_log et processed_ops sont supprimées', async () => {
  const before = await db.query(
    'SELECT (SELECT count(*)::int FROM change_log WHERE family_id = $1) AS cl, (SELECT count(*)::int FROM processed_ops WHERE family_id = $1) AS po',
    [familyId],
  );
  assert.ok(before.rows[0].cl >= 1, 'aucun change_log à purger');
  assert.ok(before.rows[0].po >= 1, 'aucun processed_ops à purger');

  await db.query("UPDATE change_log SET created_at = now() - interval '91 days' WHERE family_id = $1", [familyId]);
  await db.query("UPDATE processed_ops SET created_at = now() - interval '91 days' WHERE family_id = $1", [familyId]);

  const stats = runPurge();
  assert.ok(stats.changeLog >= 1, `changeLog purgé: ${stats.changeLog}`);
  assert.ok(stats.processedOps >= 1, `processedOps purgé: ${stats.processedOps}`);

  const after = await db.query(
    'SELECT (SELECT count(*)::int FROM change_log WHERE family_id = $1) AS cl, (SELECT count(*)::int FROM processed_ops WHERE family_id = $1) AS po',
    [familyId],
  );
  assert.equal(after.rows[0].cl, 0, 'change_log non purgé');
  assert.equal(after.rows[0].po, 0, 'processed_ops non purgé');
});

await check("le changement purgé n'est pas servi par un pull depuis 0", async () => {
  const pull = await get('/sync/pull?cursor=0', token);
  assert.equal(pull.status, 200);
  assert.equal(pull.body.changes.some((c) => c.recordId === 'acc-purge'), false, 'ancien changement encore servi après purge');
});

await check("les enregistrements actuels restent intacts après purge", async () => {
  const rec = await db.query('SELECT record, rev, deleted FROM records WHERE family_id = $1 AND record_id = $2', [familyId, 'acc-purge']);
  assert.equal(rec.rowCount, 1, 'record disparu');
  assert.equal(rec.rows[0].record.name, 'Compte purge');
});

await check('push et pull continués après purge', async () => {
  const { status, body } = await post(
    '/sync/push',
    { ops: [{ opId: randomUUID(), entity: 'account', entityId: 'acc-purge-2', op: 'upsert', payload: { id: 'acc-purge-2', name: 'Compte purge 2', balance: 20, currency: 'XOF' } }] },
    token,
  );
  assert.equal(status, 200, `HTTP ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.results[0].status, 'applied');
  const pull = await get('/sync/pull?cursor=0', token);
  assert.equal(pull.status, 200);
  assert.equal(pull.body.changes.some((c) => c.recordId === 'acc-purge-2'), true, 'nouveau changement non livré');
  const log = await db.query('SELECT count(*)::int AS n FROM change_log WHERE family_id = $1', [familyId]);
  assert.equal(log.rows[0].n, 1, 'le nouveau changement doit être réjournalisé');
});

await db.end();

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} vérifications passées`);
if (failures.length > 0) process.exit(1);
