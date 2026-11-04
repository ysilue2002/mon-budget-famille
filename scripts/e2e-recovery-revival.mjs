/**
 * E2E — phrase de secours (récupération sans codes) et reprise du foyer en
 * attente (suppression de compte du dernier membre = foyer conservé 30 j).
 * Pré-requis : PostgreSQL sur 55432 (monbudget), API sur 4400.
 * Inscriptions : 4 (< lim register 10/h/IP), API à relancer avant si besoin.
 */
const BASE = 'http://127.0.0.1:4400/api/v1';
let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const stamp = Date.now().toString(36);
const email = `recup-${stamp}@e2e.test`;
const PASSWORD = 'mot-de-passe-initial';
const PHRASE = 'phrase-de-secours-secrete-42';
const NEW_PASSWORD = 'nouveau-mot-de-passe-9';

// ─── 1. Phrase de secours : état, définition, validation ───
console.log('\n[1] Phrase de secours');
const reg = await api('POST', '/auth/register', {
  email,
  password: PASSWORD,
  familyName: 'Foyer Phrase E2E',
  primaryCurrency: 'EUR',
});
ok('inscription', reg.status === 201);
const token = reg.json?.token;

const status0 = await api('GET', '/auth/recovery-phrase', null, token);
ok('état initial : phrase absente', status0.status === 200 && status0.json?.set === false);

const anon = await api('POST', '/auth/recovery-phrase', { recoveryPhrase: PHRASE });
ok('définition en dehors du compte refusée (401)', anon.status === 401);

const short = await api('POST', '/auth/recovery-phrase', { recoveryPhrase: 'trop courte' }, token);
ok('phrase trop courte refusée (400 validation)', short.status === 400);

const setPhrase = await api('POST', '/auth/recovery-phrase', { recoveryPhrase: PHRASE }, token);
ok('phrase de secours définie', setPhrase.status === 200 && setPhrase.json?.ok === true);

const status1 = await api('GET', '/auth/recovery-phrase', null, token);
ok('état : phrase présente', status1.status === 200 && status1.json?.set === true);

// ─── 2. Reset par phrase de secours (sans authentification) ───
console.log('\n[2] Réinitialisation par phrase de secours');
const wrongPhrase = await api('POST', '/auth/recovery-reset', {
  email,
  recoveryPhrase: 'phrase-fausse-tout-a-fait-différente',
  newPassword: NEW_PASSWORD,
});
ok('mauvaise phrase refusée (recovery-invalid)', wrongPhrase.status === 400 && wrongPhrase.json?.error === 'recovery-invalid');

const unknownEmail = await api('POST', '/auth/recovery-reset', {
  email: `personne-${stamp}@e2e.test`,
  recoveryPhrase: PHRASE,
  newPassword: NEW_PASSWORD,
});
ok('e-mail inconnu refusé (recovery-invalid)', unknownEmail.status === 400 && unknownEmail.json?.error === 'recovery-invalid');

const resetOk = await api('POST', '/auth/recovery-reset', { email, recoveryPhrase: PHRASE, newPassword: NEW_PASSWORD });
ok('reset par phrase accepté', resetOk.status === 200 && resetOk.json?.ok === true);

const oldLogin = await api('POST', '/auth/login', { email, password: PASSWORD });
ok('ancien mot de passe rejeté', oldLogin.status === 401);

const newLogin = await api('POST', '/auth/login', { email, password: NEW_PASSWORD });
ok('nouveau mot de passe accepté', newLogin.status === 200 && newLogin.json?.token);
const freshToken = newLogin.json?.token;

// ─── 3. Suppression du compte : foyer du dernier membre conservé 30 jours ───
console.log('\n[3] Suppression du compte : foyer conservé');
const push = await api(
  'POST',
  '/sync/push',
  {
    ops: [
      {
        opId: crypto.randomUUID(),
        entity: 'transaction',
        entityId: 'tx-recovery-e2e',
        op: 'upsert',
        payload: { id: 'tx-recovery-e2e', note: 'avant suppression', date: '2026-02-01', amountInPrimary: 250, type: 'income' },
      },
    ],
  },
  freshToken,
);
ok('push accepté avant suppression', push.status === 200);

const del = await api('DELETE', '/auth/account', null, freshToken);
ok('suppression : foyer conservé avec reprise possible', del.status === 200 && del.json?.recoverableFamilies === 1);
const familyId = newLogin.json?.family?.id;

const afterDel = await api('GET', '/sync/pull?cursor=0', null, freshToken);
ok('jeton refusé après suppression', afterDel.status === 401);

// ─── 4. Reprise du foyer : mauvaise phrase, puis reprise complète ───
console.log('\n[4] Reprise du foyer en attente');
const wrongRevival = await api('POST', '/auth/register', {
  email,
  password: PASSWORD,
  familyName: 'Intrusion',
  primaryCurrency: 'XOF',
  recoveryPhrase: 'phrase-fausse-tout-a-fait-différente',
});
ok('reprise refusée sans la vraie phrase (403 recovery-invalid)', wrongRevival.status === 403 && wrongRevival.json?.error === 'recovery-invalid');

const revive = await api('POST', '/auth/register', {
  email,
  password: NEW_PASSWORD,
  familyName: 'Foyer neuf', // ignoré : le foyer d'origine est restauré
  primaryCurrency: 'XOF',   // ignoré : la devise primaire d'origine est restaurée
  recoveryPhrase: PHRASE,
});
ok('reprise acceptée (revived: true)', revive.status === 201 && revive.json?.revived === true && revive.json?.role === 'admin');
ok('nom du foyer d\'origine restauré', revive.json?.family?.name === 'Foyer Phrase E2E');
ok('devise primaire d\'origine restaurée', revive.json?.family?.primaryCurrency === 'EUR');

const reviveToken = revive.json?.token;
const pull = await api('GET', '/sync/pull?cursor=0', null, reviveToken);
const tx = pull.json?.changes?.find((row) => row.recordId === 'tx-recovery-e2e');
ok('données du foyer préservées (transaction retrouvée)', tx?.record?.amountInPrimary === 250);

// ─── 5. Garde-fous ───
console.log('\n[5] Garde-fous');
const reReg = await api('POST', '/auth/register', {
  email,
  password: PASSWORD,
  familyName: 'Tour',
  primaryCurrency: 'XOF',
});
ok('e-mail occupé à nouveau après reprise (409 duplicate)', reReg.status === 409 && reReg.json?.error === 'duplicate');

const DB = 'postgres://budget@127.0.0.1:55432/monbudget';
const e2eDb = await import('../server/node_modules/pg/lib/index.js');
const pg = new e2eDb.default.Client({ connectionString: DB });
await pg.connect();
const revivalClean = await pg.query(
  'SELECT recovery_email IS NULL AND recovery_expires_at IS NULL AS clean FROM families WHERE id = $1',
  [familyId],
);
ok('marqueurs de récupération nettoyés après reprise', revivalClean.rows[0]?.clean === true);
await pg.end();

// Sans phrase de secours : purge immédiate, l'adresse est directe libre.
console.log('\n[6] Sans phrase de secours : purge immédiate');
const noPhraseEmail = `no-phrase-${stamp}@e2e.test`;
const noPhraseReg = await api('POST', '/auth/register', {
  email: noPhraseEmail,
  password: PASSWORD,
  familyName: 'Foyer sans phrase',
  primaryCurrency: 'XOF',
});
ok('inscription sans phrase', noPhraseReg.status === 201);
const noPhraseDel = await api('DELETE', '/auth/account', null, noPhraseReg.json?.token);
ok('suppression : purge immédiate (0 reprise possible)', noPhraseDel.status === 200 && noPhraseDel.json?.recoverableFamilies === 0);
const noPhraseReReg = await api('POST', '/auth/register', {
  email: noPhraseEmail,
  password: PASSWORD,
  familyName: 'Foyer neuf de remplacement',
  primaryCurrency: 'EUR',
});
ok('adresse directement libre : re-inscription propre', noPhraseReReg.status === 201 && noPhraseReReg.json?.family?.name === 'Foyer neuf de remplacement');
await pg.end();

console.log(`\nE2E récupération : ${passed} réussi(s), ${failed} échec(s)`);
process.exit(failed > 0 ? 1 : 0);
