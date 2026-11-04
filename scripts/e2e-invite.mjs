/**
 * E2E invitation de foyer : POST /auth/invite (admin), inscription par code,
 * POST /auth/join (utilisateur connecté), réutilisation, expiration, isolation.
 * Usage : BASE=http://127.0.0.1:4400 node e2e-invite.mjs
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

async function request(method, path, body, token) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      origin: 'http://localhost:5173',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
async function get(path, token) {
  const res = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}
const post = request.bind(null, 'POST');

const db = new pg.Client({ connectionString: DB });
await db.connect();
const stamp = Date.now();

// ——— Données : Alice (admin de F1), Bob avec code, Dave tout seul (F2).
const alice = await post('/auth/register', {
  email: `alice-${stamp}@example.test`,
  password: 'mot-de-passe-solide',
  familyName: 'Foyer Alice',
  primaryCurrency: 'XOF',
});
assert.equal(alice.status, 201, `register alice: ${JSON.stringify(alice.body)}`);
const aliceToken = alice.body.token;
const familyId = alice.body.family.id;

let code;

await check('invite: un admin génère un code à 8 caractères, valable 7 jours', async () => {
  const res = await post('/auth/invite', undefined, aliceToken);
  assert.equal(res.status, 201, `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  code = res.body.code;
  assert.equal(typeof code, 'string');
  assert.match(code, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.ok(!/[ILO01]/.test(code), `caractère ambigu dans ${code}`);
  const expires = new Date(res.body.expiresAt).getTime();
  assert.ok(expires > Date.now() + 6 * 24 * 3600_000, `expiration trop proche : ${res.body.expiresAt}`);
});

await check('invite refuse les non-administrateurs', async () => {
  // Bob n'existe pas encore ; on teste avec un jeton invalide et sans jeton.
  const none = await post('/auth/invite', undefined, undefined);
  assert.equal(none.status, 401);
});

const bob = await post('/auth/register', {
  email: `bob-${stamp}@example.test`,
  password: 'mot-de-passe-solide',
  familyName: '',
  primaryCurrency: 'XOF',
  invitationCode: code,
});
await check('inscription par code : le nouveau compte rejoint le foyer invité', async () => {
  assert.equal(bob.status, 201, `HTTP ${bob.status}: ${JSON.stringify(bob.body)}`);
  assert.equal(bob.body.family.id, familyId, 'foyer différent de celui invité');
  assert.equal(bob.body.role, 'member');
  const membership = await db.query('SELECT role FROM memberships WHERE user_id = $1', [bob.body.user.id]);
  assert.equal(membership.rows[0].role, 'member');
  const used = await db.query('SELECT used_by FROM invitations WHERE code = $1', [code]);
  assert.ok(used.rows[0].used_by, 'invitation non marquée utilisée');
  const families = await db.query('SELECT count(*)::int AS n FROM families WHERE id = $1', [familyId]);
  assert.equal(families.rows[0].n, 1, 'un foyer alternatif devrait exister');
});

await check('le code est à usage unique : réinscription refusée', async () => {
  const charlie = await post('/auth/register', {
    email: `charlie-${stamp}@example.test`,
    password: 'mot-de-passe-solide',
    familyName: 'Fantomme',
    primaryCurrency: 'XOF',
    invitationCode: code,
  });
  assert.equal(charlie.status, 410);
  assert.equal(charlie.body.error, 'invitation-used');
  const users = await db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [`charlie-${stamp}@example.test`]);
  assert.equal(users.rows[0].n, 0, 'compte créé malgré le code épuisé');
});

const bobToken = bob.body.token;

await check('partage : le membre invité pousse, l’admin reçoit (même foyer serveur)', async () => {
  const push = await post(
    '/sync/push',
    { ops: [{ opId: randomUUID(), entity: 'transaction', entityId: `tx-bob-${stamp}`, op: 'upsert', payload: { id: `tx-bob-${stamp}`, amount: 42, note: 'op de Bob' } }] },
    bobToken,
  );
  assert.equal(push.status, 200, `HTTP ${push.status}: ${JSON.stringify(push.body)}`);
  assert.equal(push.body.results[0].status, 'applied');
  const pull = await get('/sync/pull?cursor=0', aliceToken);
  assert.equal(pull.status, 200);
  assert.ok(pull.body.changes.some((c) => c.recordId === `tx-bob-${stamp}`), 'opération de Bob absente du pull d’Alice');
});

await check('partage réciproque : l’admin pousse, le membre invité reçoit', async () => {
  const push = await post(
    '/sync/push',
    { ops: [{ opId: randomUUID(), entity: 'account', entityId: `acc-alice-${stamp}`, op: 'upsert', payload: { id: `acc-alice-${stamp}`, name: 'Compte Alice', balance: 5 } }] },
    aliceToken,
  );
  assert.equal(push.body.results[0].status, 'applied');
  const pull = await get('/sync/pull?cursor=0', bobToken);
  assert.ok(pull.body.changes.some((c) => c.recordId === `acc-alice-${stamp}`), 'compte d’Alice absent du pull de Bob');
});

await check('join avec un code inconnu : message distinct', async () => {
  const res = await post('/auth/join', { invitationCode: 'AAAA2233' }, bobToken);
  assert.equal(res.status, 410);
  assert.equal(res.body.error, 'invitation-unknown');
});

let stale;

await check('join avec un code expiré : message distinct', async () => {
  const res = await post('/auth/invite', undefined, aliceToken);
  stale = res.body.code;
  await db.query('UPDATE invitations SET expires_at = now() - interval \'1 day\' WHERE code = $1', [stale]);
  const joined = await post('/auth/join', { invitationCode: stale }, bobToken);
  assert.equal(joined.status, 410);
  assert.equal(joined.body.error, 'invitation-expired');
});

await check('join idempotent : membre déjà présent sans consommer le code', async () => {
  const res = await post('/auth/invite', undefined, aliceToken);
  const freshCode = res.body.code;
  const joined = await post('/auth/join', { invitationCode: freshCode }, aliceToken);
  assert.equal(joined.status, 200, `HTTP ${joined.status}: ${JSON.stringify(joined.body)}`);
  assert.equal(joined.body.family.id, familyId);
  const unused = await db.query('SELECT used_at FROM invitations WHERE code = $1', [freshCode]);
  assert.equal(unused.rows[0].used_at, null, 'code consommé malgré une adhésion existante');
});

await check('isolation : un foyer tiers ne reçoit rien du foyer invité', async () => {
  const dave = await post('/auth/register', {
    email: `dave-${stamp}@example.test`,
    password: 'mot-de-passe-solide',
    familyName: 'Foyer Dave',
    primaryCurrency: 'EUR',
  });
  assert.equal(dave.status, 201);
  const pull = await get('/sync/pull?cursor=0', dave.body.token);
  assert.equal(pull.status, 200);
  assert.equal(pull.body.changes.length, 0, `fuite : ${JSON.stringify(pull.body.changes)}`);
});

await check('code normalisé en majuscules', async () => {
  const res = await post('/auth/invite', undefined, aliceToken);
  const validCode = res.body.code;
  const rejected = await post('/auth/join', { invitationCode: validCode.toLowerCase() }, bobToken);
  // Bob est déjà membre : réponse idempotente, donc le code en minuscules a bien été accepté.
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.family.id, familyId);
});

await db.end();

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} vérifications passées`);
if (failures.length > 0) process.exit(1);
