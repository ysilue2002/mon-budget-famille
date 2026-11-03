import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { z } from 'zod';
import { randomUUID, randomInt, createHash } from 'node:crypto';
import { pool, query, withTransaction, type TxClient } from '../db/pool';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../config';
import { rateLimit } from '../middleware/rateLimit';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth';
import {
  INVITATION_ALPHABET,
  joinSchema,
  loginSchema,
  registerSchema,
  recoveryPhraseSetSchema,
  recoveryResetSchema,
  resetConfirmSchema,
  resetRequestSchema,
  type Role,
} from '../validation';

const router = Router();

/** Adresse e-mail soumise, normalisée, pour distinguer les comptes d'une même IP. */
function submittedEmail(req: Request): string {
  const body = req.body as { email?: unknown } | undefined;
  return typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
}

// Inscription : par défaut 10 créations de foyer par heure et par IP.
// `REGISTER_LIMIT_MAX` permet de l'ajuster (tests E2E, instance dédiee).
const REGISTER_LIMIT_MAX = Number(process.env.REGISTER_LIMIT_MAX ?? 10);
const registerLimiter = rateLimit({ name: 'register-ip', windowMs: 60 * 60_000, max: REGISTER_LIMIT_MAX });
// Connexion : plafond par IP (balayage de comptes) et par couple IP + e-mail
// (force brute ciblée), le tout sur 15 minutes.
const loginIpLimiter = rateLimit({ name: 'login-ip', windowMs: 15 * 60_000, max: 30 });
const loginAccountLimiter = rateLimit({
  name: 'login-account',
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => `${req.ip ?? 'unknown'}|${submittedEmail(req)}`,
});
// Invitation : 20 codes par heure et par IP (abus de génération de codes).
const inviteLimiter = rateLimit({ name: 'invite-ip', windowMs: 60 * 60_000, max: 20 });
// Rattachement : 10 tentatives par 15 minutes et par IP (code épuisé/érroné).
const joinLimiter = rateLimit({ name: 'join-ip', windowMs: 15 * 60_000, max: 10 });
// Réinitialisation : 10 demandes admin et 10 confirmations par 15 min et par IP.
const resetLimiter = rateLimit({ name: 'reset-ip', windowMs: 15 * 60_000, max: 10 });
// Suppression de compte : 5 par 15 minutes et par IP (action destructrice).
const deleteAccountLimiter = rateLimit({ name: 'delete-ip', windowMs: 15 * 60_000, max: 5 });
// Phrase de secours : 10 définitions par heure et par IP (réglages).
const recoverySetLimiter = rateLimit({ name: 'recovery-set-ip', windowMs: 60 * 60_000, max: 10 });
// Tentatives de réinitialisation par phrase : plafond par IP et par couple
// IP + e-mail (la phrase est vérifiée par bcrypt, lente : chaque essai coûte).
const recoveryIpLimiter = rateLimit({ name: 'recovery-ip', windowMs: 15 * 60_000, max: 20 });
const recoveryAccountLimiter = rateLimit({
  name: 'recovery-account',
  windowMs: 15 * 60_000,
  max: 5,
  key: (req) => `${req.ip}\u00a0*${submittedEmail(req)}`,
});
// Foyer en attente de récupération : regroupé avec l'inscription, mais plafond
// spécifique par IP + e-mail pour la force brute ciblée sur la phrase.// Foyer en attente de récupération : regroupé avec l'inscription, mais plafond
// spécifique par IP + e-mail pour la force brute ciblée sur la phrase(personne
// ne reçoit la phrase : seul son hash vit côté serveur).
/** Délai pendant lequel le foyer survit au compte supprimé du dernier membre. */
const FAMILY_RECOVERY_DAYS = 30;

const INVITE_TTL_DAYS = 7;

/** Code lisible sans ambiguïté : 8 caractères de l'alphabet sans I/L/O/0/1. */
function generateInviteCode(client: Pick<TxClient, 'query'>): Promise<string> {
  const draw = () =>
    Array.from({ length: 8 }, () => INVITATION_ALPHABET[randomInt(INVITATION_ALPHABET.length)]).join('');
  const attempt = async (triesLeft = 5): Promise<string> => {
    if (triesLeft <= 0) throw new Error('impossible de générer un code unique');
    const code = draw();
    const taken = await client.query('SELECT 1 FROM invitations WHERE code = $1', [code]);
    if (taken.rowCount) return attempt(triesLeft - 1);
    return code;
  };
  return attempt();
}

interface InviteRow {
  code: string;
  family_id: string;
  expires_at: Date;
  used_at: Date | null;
}

/** Charge l'invitation hors transaction : erreurs distinctes pour 404 / 410. */
async function loadInvitation(client: Pick<TxClient, 'query'>, code: string): Promise<InviteRow | null> {
  const rows = await client.query<InviteRow>(
    'SELECT code, family_id, expires_at, used_at FROM invitations WHERE code = $1 FOR UPDATE',
    [code],
  );
  return rows.rows[0] ?? null;
}

/** Statut d'une invitation : 'ok' si usable, sinon la raison du refus. */
export function invitationStatus(invite: InviteRow | null): 'unknown' | 'expired' | 'used' | 'ok' {
  if (!invite) return 'unknown';
  if (invite.used_at !== null) return 'used';
  if (invite.expires_at.getTime() <= Date.now()) return 'expired';
  return 'ok';
}
function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

/** Foyer en attente de récupération : la plus récente fenêtre valide, verrouillée FOR UPDATE. */
function pendingFamilyFor(client: Pick<TxClient, 'query'>, email: string) {
  return client.query<{ id: string; name: string; primary_currency: string; recovery_phrase_hash: string }>(
    `SELECT id, name, primary_currency, recovery_phrase_hash
     FROM families
     WHERE recovery_email = $1
       AND recovery_expires_at IS NOT NULL
       AND recovery_expires_at > now()
     ORDER BY recovery_expires_at DESC
     LIMIT 1
     FOR UPDATE`,
    [email.toLowerCase()],
  );
}

/**
 * Réactivation d'un foyer en attente de récupération, déclenchée par
 * /auth/register avec la phrase de secours du compte supprimé. Le nouveau
 * compte est recréé administrateur de l'ancien foyer : les records, le
 * journal et le carnet d'adhésions sont préservés. Échec : `recovery-invalid`
 * (phrase inconnue ou erronée — la réponse est identique dans les deux cas).
 */
async function revivePendingFamily(
  req: Request,
  res: Response,
  data: z.infer<typeof registerSchema>,
): Promise<boolean> {
  const email = data.email.toLowerCase();
  const hash = await bcrypt.hash(data.password, 10);
  const outcome = await withTransaction(async (client) => {
    const pending = await pendingFamilyFor(client, email);
    if (!pending.rowCount) return null;
    const family = pending.rows[0];
    const phrase = typeof data.recoveryPhrase === 'string' ? data.recoveryPhrase : '';
    if (!phrase || !(await bcrypt.compare(phrase, family.recovery_phrase_hash))) {
      res.status(403).json({ error: 'recovery-invalid' });
      return 'answered' as const;
    }
    const created = await client.query<{ id: string; email: string }>(
      'INSERT INTO users (email, password_hash, recovery_phrase_hash) VALUES ($1, $2, $3) RETURNING id, email',
      [email, hash, family.recovery_phrase_hash],
    );
    await client.query(
      "INSERT INTO memberships (family_id, user_id, role) VALUES ($1, $2, 'admin')",
      [family.id, created.rows[0].id],
    );
    await client.query(
      'UPDATE families SET recovery_phrase_hash = NULL, recovery_email = NULL, recovery_expires_at = NULL WHERE id = $1',
      [family.id],
    );
    return { user: created.rows[0], family };
  });
  if (!outcome || outcome === 'answered') {
    return Boolean(outcome);
  }
  res.status(201).json({
    token: signToken(outcome.user.id),
    user: { id: outcome.user.id, email: outcome.user.email },
    family: { id: outcome.family.id, name: outcome.family.name, primaryCurrency: outcome.family.primary_currency },
    role: 'admin' as const,
    revived: true,
  });
  return true;
}

/**
 * Inscription : crée l'utilisateur, son foyer et le rôle familial admin.
 * La même adresse e-mail peut appartenir à plusieurs foyers via memberships,
 * mais l'inscription simple crée un foyer neuf.
 */
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { email, password, familyName, primaryCurrency, invitationCode } = parsed.data;
  const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rowCount && existing.rowCount > 0) {
    res.status(409).json({ error: 'duplicate' });
    return;
  }
  const hash = await bcrypt.hash(password, 10);

  // Inscription sans invitation : pas de foyer éphémère, l'utilisateur rejoint
  // directement le foyer avec un rôle de membre. Le code n'est validé qu'en
  // transaction (FOR UPDATE) pour éviter deux usages simultanés.
  if (invitationCode) {
    let targetFamilyId: string | null = null;
    const registered = await withTransaction(async (client) => {
      const invite = await loadInvitation(client, invitationCode);
      const status = invitationStatus(invite);
      if (!invite || status !== 'ok') {
        res.status(410).json({ error: `invitation-${status}` });
        return null;
      }
      targetFamilyId = invite.family_id;
      const created = await client.query<{ id: string; email: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email.toLowerCase(), hash],
      );
      await client.query('INSERT INTO memberships (family_id, user_id, role) VALUES ($1, $2, $3)', [
        invite.family_id,
        created.rows[0].id,
        'member',
      ]);
      await client.query('UPDATE invitations SET used_at = now(), used_by = $1 WHERE code = $2', [
        created.rows[0].id,
        invitationCode,
      ]);
      return created.rows[0];
    });
    if (!registered || !targetFamilyId) return;
    const family = await query<{ id: string; name: string; primary_currency: string }>(
      'SELECT id, name, primary_currency FROM families WHERE id = $1',
      [targetFamilyId],
    );
    res.status(201).json({
      token: signToken(registered.id),
      user: { id: registered.id, email: registered.email },
      family: { id: family.rows[0].id, name: family.rows[0].name, primaryCurrency: family.rows[0].primary_currency },
      role: 'member',
    });
    return;
  }

  // Foyer en attente de récupération : l'adresse e-mail du dernier membre
  // réactive l'ancien foyer (données intactes) en prouvant la maîtrise par la
  // phrase de secours. Sinon : création d'un foyer ordinaire.
  if (!invitationCode && (await revivePendingFamily(req, res, parsed.data))) return;

  const familyId = randomUUID();
  const user = await withTransaction(async (client) => {
    const family = await client.query('INSERT INTO families (id, name, primary_currency) VALUES ($1, $2, $3) RETURNING id, name, primary_currency', [
      familyId,
      familyName,
      primaryCurrency,
    ]);
    const created = await client.query<{ id: string; email: string }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), hash],
    );
    await client.query('INSERT INTO memberships (family_id, user_id, role) VALUES ($1, $2, $3)', [familyId, created.rows[0].id, 'admin']);
    return created.rows[0];
  });

  res.status(201).json({
    token: signToken(user.id),
    user: { id: user.id, email: user.email },
    family: { id: familyId, name: familyName, primaryCurrency },
  });
});

router.post('/login', loginIpLimiter, loginAccountLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  const rows = await query<{
    id: string;
    email: string;
    password_hash: string;
    family_id: string;
    family_name: string;
    primary_currency: string;
    role: string;
  }>(
    // Plus récente adhésion d'abord : cohérent avec requireAuth (middleware/auth.ts).
    `SELECT u.id, u.email, u.password_hash, f.id AS family_id, f.name AS family_name, f.primary_currency, m.role
     FROM users u
     JOIN memberships m ON m.user_id = u.id
     JOIN families f ON f.id = m.family_id
     WHERE u.email = $1
     ORDER BY m.created_at DESC
     LIMIT 1`,
    [email.toLowerCase()],
  );
  const row = rows.rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({
    token: signToken(row.id),
    user: { id: row.id, email: row.email },
    family: { id: row.family_id, name: row.family_name, primaryCurrency: row.primary_currency },
    role: row.role,
  });
});

/** Réinitialisation : code valable 30 minutes, un seul usage. */
const RESET_TTL_MS = 30 * 60 * 1000;

/** SHA-256 hex du code : la table ne stocke jamais le code en clair. */
function hashResetCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Tirage de code réinit : même alphabet lisible que les invitations. */
function generateResetCode(client: Pick<TxClient, 'query'>): Promise<string> {
  const draw = () =>
    Array.from({ length: 8 }, () => INVITATION_ALPHABET[randomInt(INVITATION_ALPHABET.length)]).join('');
  const attempt = async (triesLeft = 5): Promise<string> => {
    if (triesLeft <= 0) throw new Error('impossible de générer un code unique');
    const code = draw();
    const taken = await client.query('SELECT 1 FROM password_resets WHERE code_hash = $1', [
      hashResetCode(code),
    ]);
    if (taken.rowCount) return attempt(triesLeft - 1);
    return code;
  };
  return attempt();
}
router.post('/invite', inviteLimiter, requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const result = await withTransaction(async (client) => {
    const code = await generateInviteCode(client);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO invitations (code, family_id, created_by, expires_at) VALUES ($1, $2, $3, $4)',
      [code, auth.familyId, auth.userId, expiresAt.toISOString()],
    );
    return { code, expiresAt: expiresAt.toISOString() };
  });
  res.status(201).json(result);
});

/**
 * Rattachement d'un utilisateur CONNECTÉ à un foyer par code d'invitation :
 * le contenu local de son appareil est réamorcé côté client. Idempotent si le
 * compte est déjà membre du foyer (le code n'est pas consommé).
 */
router.post('/join', joinLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const outcome = await withTransaction(async (client) => {
    const invite = await loadInvitation(client, parsed.data.invitationCode);
    const status = invitationStatus(invite);
    if (!invite || status !== 'ok') {
      res.status(410).json({ error: `invitation-${status}` });
      return null;
    }
    const family = await client.query<{ id: string; name: string; primary_currency: string }>(
      'SELECT f.id, f.name, f.primary_currency FROM families f WHERE f.id = $1',
      [invite.family_id],
    );
    const already = await client.query<{ role: Role }>(
      'SELECT role FROM memberships WHERE family_id = $1 AND user_id = $2',
      [invite.family_id, auth.userId],
    );
    if (already.rowCount) {
      // Déjà membre : réponse réussie, aucune consommation du code.
      return { family: family.rows[0], role: already.rows[0].role, consumed: false };
    }
    await client.query('INSERT INTO memberships (family_id, user_id, role) VALUES ($1, $2, $3)', [
      invite.family_id,
      auth.userId,
      'member',
    ]);
    await client.query('UPDATE invitations SET used_at = now(), used_by = $1 WHERE code = $2', [
      auth.userId,
      parsed.data.invitationCode,
    ]);
    return { family: family.rows[0], role: 'member' as Role, consumed: true };
  });
  if (!outcome) return;
  res.json({
    family: { id: outcome.family.id, name: outcome.family.name, primaryCurrency: outcome.family.primary_currency },
    role: outcome.role,
  });
});

/**
 * Réinitialisation de mot de passe, délivrance admin : l'administrateur du
 * foyer génère un code à usage unique (30 min) pour un membre qui a perdu son
 * mot de passe (le serveur n'envoie pas d'e-mail, le code est relayé hors
 * canal). Seul le hash du code est stocké.
 */
router.post('/reset', resetLimiter, requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  // Le membre doit appartenir au foyer de l'admin : pas de reset trans-foyer.
  const member = await query<{ id: string }>(
    `SELECT u.id FROM users u
     JOIN memberships m ON m.user_id = u.id
     WHERE u.email = $1 AND m.family_id = $2`,
    [email, auth.familyId],
  );
  const target = member.rows[0];
  if (!target) {
    res.status(404).json({ error: 'not-a-member' });
    return;
  }
  const result = await withTransaction(async (client) => {
    const code = await generateResetCode(client);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await client.query(
      'INSERT INTO password_resets (code_hash, user_id, created_by, expires_at) VALUES ($1, $2, $3, $4)',
      [hashResetCode(code), target.id, auth.userId, expiresAt.toISOString()],
    );
    return { code, expiresAt: expiresAt.toISOString() };
  });
  res.status(201).json(result);
});

/**
 * Confirmation du reset : SANS authentification (c'est le fond du service).
 * Code + e-mail + nouveau mot de passe, usage unique en transaction avec
 * FOR UPDATE. Réponse identique quand le code est inconnu/expiré/déjà utilisé
 * : pas de discrimination exploitable entre les trois.
 */
router.post('/reset-confirm', resetLimiter, async (req: Request, res: Response) => {
  const parsed = resetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const ok = await withTransaction(async (client) => {
    const rows = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1 FOR UPDATE',
      [email],
    );
    const user = rows.rows[0];
    if (!user) return false;
    const codeHash = hashResetCode(parsed.data.resetCode);
    const resets = await client.query<{ expires_at: Date; used_at: Date | null }>(
      'SELECT expires_at, used_at FROM password_resets WHERE code_hash = $1 FOR UPDATE',
      [codeHash],
    );
    const reset = resets.rows[0];
    if (!reset || reset.used_at !== null || reset.expires_at.getTime() <= Date.now()) return false;
    // Écrase un éventuel ancien code : un seul reset actif par couple code.
    await client.query('UPDATE password_resets SET used_at = now() WHERE code_hash = $1', [codeHash]);
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    return true;
  });
  if (!ok) {
    res.status(400).json({ error: 'reset-invalid' });
    return;
  }
  res.json({ ok: true });
});

/**
 * Phrase de secours : définition (ou remplacement) pour le compte connecté.
 * Seul le bcrypt de la phrase est stocké (jamais la phrase en clair).
 */
router.post('/recovery-phrase', recoverySetLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = recoveryPhraseSetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const hash = await bcrypt.hash(parsed.data.recoveryPhrase, 10);
  await query('UPDATE users SET recovery_phrase_hash = $1 WHERE id = $2', [hash, auth.userId]);
  res.json({ ok: true });
});

/** État de la phrase de secours : la carte Réglages sait si elle est définie. */
router.get('/recovery-phrase', requireAuth, async (req: AuthRequest, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const rows = await query<{ phrase_set: boolean }>(
    'SELECT recovery_phrase_hash IS NOT NULL AS phrase_set FROM users WHERE id = $1',
    [auth.userId],
  );
  res.json({ set: rows.rows[0]?.phrase_set ?? false });
});

/**
 * Réinitialisation de mot de passe par phrase de secours : SANS authentification,
 * sans e-mail et sans administrateur. Déviance vers `recovery-invalid` quand le
 * couple e-mail/phrase ne correspond pas : inconnu, sans phrase, phrase erronée,
 * compte fantomê équivalent — pas de discrimination exploitable.
 */
router.post('/recovery-reset', recoveryIpLimiter, recoveryAccountLimiter, async (req: Request, res: Response) => {
  const parsed = recoveryResetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const ok = await withTransaction(async (client) => {
    const rows = await client.query<{ id: string; recovery_phrase_hash: string | null }>(
      'SELECT id, recovery_phrase_hash FROM users WHERE email = $1 FOR UPDATE',
      [email],
    );
    const user = rows.rows[0];
    if (!user || !user.recovery_phrase_hash) return false;
    const phrase = parsed.data.recoveryPhrase;
    if (!(await bcrypt.compare(phrase, user.recovery_phrase_hash))) return false;
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    // Révocation des codes admin en circulation : tout accès en attente saute.
    await client.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);
    return true;
  });
  if (!ok) {
    res.status(400).json({ error: 'recovery-invalid' });
    return;
  }
  res.json({ ok: true });
});

/** Purge des données d'un foyer (journal, opérations, records), dans l'ordre des clés. */
async function deleteFamilyData(client: Pick<TxClient, 'query'>, familyId: string): Promise<void> {
  await client.query('DELETE FROM change_log WHERE family_id = $1', [familyId]);
  await client.query('DELETE FROM processed_ops WHERE family_id = $1', [familyId]);
  await client.query('DELETE FROM records WHERE family_id = $1', [familyId]);
  await client.query('DELETE FROM families WHERE id = $1', [familyId]);
}

/**
 * Suppression du compte : retire les adhésions et le compte lui-même
 * (l'adresse e-mail est immédiatement libérée). Les foyers devenus vides ne
 * sont PLUS purgés d'office : si l'utilisateur avait une phrase de secours,
 * le foyer passe en « attente de récupération » pendant 30 jours — une
 * re-inscription de la même adresse avec la phrase le réactive (admin du
 * foyer d'origine, données intactes) ; sinon les données sont purgées à
 * l'expiration par la purge périodique. Sans phrase de secours, la purge
 * immédiate s'applique (comme avant) : personne ne peut prouver la reprise.
 */
router.delete('/account', deleteAccountLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const result = await withTransaction(async (client) => {
    const userRow = await client.query<{ email: string; recovery_phrase_hash: string | null }>(
      'SELECT email, recovery_phrase_hash FROM users WHERE id = $1 FOR UPDATE',
      [auth.userId],
    );
    const user = userRow.rows[0];
    const memberships = await client.query<{ family_id: string }>(
      'SELECT family_id FROM memberships WHERE user_id = $1',
      [auth.userId],
    );
    const familyIds = memberships.rows.map((r) => r.family_id);
    await client.query('DELETE FROM memberships WHERE user_id = $1', [auth.userId]);
    let deletedFamilies = 0;
    let recoverableFamilies = 0;
    for (const familyId of familyIds) {
      const remaining = await client.query('SELECT 1 FROM memberships WHERE family_id = $1 LIMIT 1', [
        familyId,
      ]);
      if (remaining.rowCount) continue; // foyer partagé : reste aux autres membres
      const phraseHash = user?.recovery_phrase_hash ?? null;
      if (phraseHash) {
        // Délai de 30 jours : reprise possible par le même e-mail + phrase.
        const expiresAt = new Date(Date.now() + FAMILY_RECOVERY_DAYS * 24 * 60 * 60 * 1000);
        await client.query(
          `UPDATE families SET recovery_phrase_hash = $1, recovery_email = $2, recovery_expires_at = $3
           WHERE id = $4`,
          [phraseHash, user?.email?.toLowerCase() ?? null, expiresAt.toISOString(), familyId],
        );
        recoverableFamilies += 1;
      } else {
        deletedFamilies += 1;
        await deleteFamilyData(client, familyId);
      }
    }
    await client.query('DELETE FROM password_resets WHERE user_id = $1', [auth.userId]);
    await client.query('DELETE FROM users WHERE id = $1', [auth.userId]);
    return { deletedFamilies, recoverableFamilies };
  });
  res.json(result);
});

export default router;
