/**
 * E2E — Réinitialisation de mot de passe + suppression de compte.
 * Pré-requis : PostgreSQL sur 55432 (monbudget), API sur 4400 blonde (comme
 * e2e-invite.mjs). Utilise 4 inscriptions < 5/h/IP : API relancée avant.
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
const admin = `admin-${stamp}@e2e.test`;
const member = `member-${stamp}@e2e.test`;
const PASSWORD = 'ancien-mot-de-passe';
const NEW_PASSWORD = 'nouveau-mot-de-passe-9';

// ── Mise en place : admin (foyer partagé) + membre, ou invité via invitation ──
console.log('\n[1] Mise en place du foyer partagé');
const adminReg = await api('POST', '/auth/register', {
  email: admin,
  password: PASSWORD,
  familyName: 'Foyer Reset E2E',
  primaryCurrency: 'XOF',
});
ok('admin enregistré', adminReg.status === 201);
const adminToken = adminReg.json?.token;

const inv = await api('POST', '/auth/invite', null, adminToken);
ok('invitation émise', inv.status === 201);
const memberReg = await api('POST', '/auth/register', {
  email: member,
  password: PASSWORD,
  name: 'Membre Reset',
  invitationCode: inv.json?.code,
});
ok('membre inscrit par code', memberReg.status === 201);
const memberToken = memberReg.json?.token;

// ── Déli vreance du code admin ──
console.log('\n[2] Génération du code admin');
const wrongFamilyReg = await api('POST', '/auth/register', {
  email: `outsider-${stamp}@e2e.test`,
  password: PASSWORD,
  familyName: 'Autre foyer',
  primaryCurrency: 'EUR',
});
ok('tiers enregistré', wrongFamilyReg.status === 201);
const outsiderToken = wrongFamilyReg.json?.token;

const resetUnknown = await api('POST', '/auth/reset', { email: 'personne@e2e.test' }, adminToken);
ok('reset d\'un inconnu refusé (404 not-a-member)', resetUnknown.status === 404 && resetUnknown.json?.error === 'not-a-member');

const resetOutsider = await api('POST', '/auth/reset', { email: `outsider-${stamp}@e2e.test` }, adminToken);
ok('reset trans-foyer refusé (404 not-a-member)', resetOutsider.status === 404);

const unprivileged = await api('POST', '/auth/reset', { email: member }, memberToken);
ok('reset refusé sans rôle admin (403)', unprivileged.status === 403);

const resetUp = await api('POST', '/auth/reset', { email: member }, adminToken);
ok('code délivré pour le membre', resetUp.status === 201 && /^[A-HJKMNP-Z2-9]{8}$/.test(resetUp.json?.code ?? ''));

// ── Confirmation du reset ──
console.log('\n[3] Confirmation du reset');
const confirmUnknown = await api('POST', '/auth/reset-confirm', {
  email: member,
  resetCode: 'X8K2H4MN', // plausible mais jamais délivré
  newPassword: NEW_PASSWORD,
});
ok('code inconnu refusé (reset-invalid)', confirmUnknown.status === 400 && confirmUnknown.json?.error === 'reset-invalid');

const confirmOK = await api('POST', '/auth/reset-confirm', { email: member, resetCode: resetUp.json.code, newPassword: NEW_PASSWORD });
ok('nouveau mot de passe adopté', confirmOK.status === 200 && confirmOK.json?.ok === true);

const replays = await api('POST', '/auth/reset-confirm', { email: member, resetCode: resetUp.json.code, newPassword: NEW_PASSWORD });
ok('usage unique (2e usage refusé)', replays.status === 400 && replays.json?.error === 'reset-invalid');

const oldLogin = await api('POST', '/auth/login', { email: member, password: PASSWORD });
ok('ancien mot de passe rejeté', oldLogin.status === 401);

const newLogin = await api('POST', '/auth/login', { email: member, password: NEW_PASSWORD });
ok('nouveau mot de passe accepté', newLogin.status === 200 && newLogin.json?.token);
const newToken = newLogin.json?.token;

// La réinitialisation révoque les jetons émis avant : l'ancien jeton du membre
// ne doit plus ouvrir la moindre route authentifiée.
const oldTokenAfterReset = await api('GET', '/sync/pull?cursor=0', null, memberToken);
ok('ancien jeton révoqué par la réinitialisation', oldTokenAfterReset.status === 401);

// Le compte fonctionne toujours avec le nouveau jeton : push avant suppression.
const push = await api(
  'POST',
  '/sync/push',
  {
    ops: [
      {
        opId: crypto.randomUUID(),
        entity: 'transaction',
        entityId: 'tx-reset-e2e',
        op: 'upsert',
        payload: { id: 'tx-reset-e2e', note: 'avt suppression', date: '2026-01-02', amountInPrimary: 100, type: 'expense' },
      },
    ],
  },
  newToken,
);
ok('push accepté avant suppression', push.status === 200);

// ── Suppression de compte ──
console.log('\n[4] Suppression du compte');
const del = await api('DELETE', '/auth/account', null, newToken);
ok('compte supprimé (foyer partagé : reste un autre membre, 0 foyer vide)', del.status === 200 && del.json?.deletedFamilies === 0);

const afterDel = await api('GET', '/sync/pull?cursor=0', null, newToken);
ok('jeton refusé après suppression', afterDel.status === 401);

const delAdmin = await api('DELETE', '/auth/account', null, adminToken);
ok('foyer de l\'admin seul supprimé : 1 foyer vide', delAdmin.status === 200 && delAdmin.json?.deletedFamilies === 1);

const adminAfterDel = await api('GET', '/sync/pull?cursor=0', null, adminToken);
ok('jeton admin refusé après suppression', adminAfterDel.status === 401);

// Re-inscription de la même adresse : l'utilisateur est parti de la table users.
const reReg = await api('POST', '/auth/register', {
  email: member,
  password: PASSWORD,
  familyName: 'Foyer neuf',
  primaryCurrency: 'XOF',
});
ok('adresse libérée : re-inscription possible', reReg.status === 201);

console.log(`\nE2E reset+delete : ${passed} réussi(s), ${failed} échec(s)`);
process.exit(failed > 0 ? 1 : 0);
