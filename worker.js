const enc = new TextEncoder();
const SESSION_DAYS = 30;
const MAX_BODY = 2_000_000;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/.{1,2}/g).map((b) => parseInt(b, 16)));

async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unhex(saltHex), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  );
  return hex(bits);
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const cookieOf = (request, name) => {
  const raw = request.headers.get('cookie') || '';
  const found = raw.split(';').map((p) => p.trim()).find((p) => p.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
};

const validEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim()) && v.length <= 190;
const validPhone = (v) => typeof v === 'string' && /^\+?[\d ().-]{8,25}$/.test(v.trim());
const digitsOf = (v) => String(v || '').replace(/\D/g, '').replace(/^00/, '');
const validPass = (v) => typeof v === 'string' && v.length >= 8 && v.length <= 200;
/* Canal d'où vient une installation (marche, flyer, radio…). Un mot simple,
   jamais une adresse : ce qui n'est pas une lettre ou un tiret disparaît. */
const cleanSrc = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
/* Code de parrainage : six signes sans I, O, 0 ni 1, faciles à lire et à
   dicter au téléphone. Un par boutique, créé au premier affichage. */
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRefCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}
/* Le canal d'une installation parrainée : p- suivi du code, en minuscules,
   comme tous les canaux. */
const refSrc = (code) => (code ? 'p-' + String(code).toLowerCase().replace(/[^a-z0-9]/g, '') : '');

let schemaReady;
function ensureSchema(env) {
  if (schemaReady) return schemaReady;
  schemaReady = env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, phone TEXT, phone_digits TEXT, pass TEXT NOT NULL, salt TEXT NOT NULL, created INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS state (user_id TEXT PRIMARY KEY, json TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS resets (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mail_log (user_id TEXT PRIMARY KEY, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS throttle (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS state_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rev INTEGER NOT NULL, json TEXT NOT NULL, updated INTEGER NOT NULL, saved INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS state_history_user ON state_history(user_id, id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS public_docs (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, number TEXT NOT NULL, json TEXT NOT NULL, updated INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS installs (src TEXT NOT NULL, day TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (src, day))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    /* Codes de réinitialisation : huit signes à dicter, valables trente
       minutes, utilisés une seule fois. Seul leur empreinte est stockée. */
    env.DB.prepare('CREATE TABLE IF NOT EXISTS reset_codes (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)'),
    /* Vérification du numéro : un code court, valable quinze minutes, remplacé
       à chaque demande. Seule son empreinte est gardée. */
    env.DB.prepare('CREATE TABLE IF NOT EXISTS phone_codes (user_id TEXT PRIMARY KEY, code TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0)'),
    /* Codes d'activation Premium : créés par l'admin après paiement, utilisés
       une seule fois par la boutique qui les saisit. */
    env.DB.prepare('CREATE TABLE IF NOT EXISTS premium_codes (code TEXT PRIMARY KEY, months INTEGER NOT NULL, created INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, used_by TEXT, expires INTEGER, used_at INTEGER)'),
    /* Journal d'administration : qui a fait quoi, quand. Une ligne ne dit que
       l'action et sa cible, jamais un mot de passe ni un code. */
    env.DB.prepare('CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS admin_log_at ON admin_log(at)'),
    /* Demandes de paiement : Wave ou Orange Money validés à la main, carte
       confirmée par Stripe. La référence est ce que le commerçant écrit dans
       son transfert. */
    env.DB.prepare('CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, ref TEXT NOT NULL, user_id TEXT NOT NULL, months INTEGER NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, paid_at INTEGER, actor TEXT, note TEXT)'),
  ]).then(async () => {
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN phone_digits TEXT').run(); } catch {}
    // Comptes par téléphone uniquement : l'e-mail et le téléphone deviennent facultatifs.
    const usersTable = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").first();
    const usersSql = usersTable ? String(usersTable.sql || '') : '';
    if (/email\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i.test(usersSql) || /phone\s+TEXT\s+NOT\s+NULL/i.test(usersSql)) {
      // Migration atomique : tout réussit ou rien ne change.
      await env.DB.batch([
        env.DB.prepare('DROP TABLE IF EXISTS users_new'),
        env.DB.prepare('CREATE TABLE users_new (id TEXT PRIMARY KEY, email TEXT UNIQUE, phone TEXT, phone_digits TEXT, pass TEXT NOT NULL, salt TEXT NOT NULL, created INTEGER NOT NULL)'),
        env.DB.prepare('INSERT INTO users_new (id, email, phone, phone_digits, pass, salt, created) SELECT id, email, phone, phone_digits, pass, salt, created FROM users'),
        env.DB.prepare('DROP TABLE users'),
        env.DB.prepare('ALTER TABLE users_new RENAME TO users'),
      ]);
    }
    /* Équipe : un vendeur rattaché au compte du patron travaille sur les mêmes
       données. Placé après la migration de la table users, sinon les colonnes
       ajoutées disparaîtraient avec l'ancienne table. */
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN owner_id TEXT').run(); } catch {}
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN role TEXT').run(); } catch {}
    /* Droits accordés à chaque vendeur par le patron (JSON). */
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN perms TEXT').run(); } catch {}
    /* Nom affiché dans le journal, à la place de l'e-mail. */
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN name TEXT').run(); } catch {}
    /* Canal de provenance, noté une fois à l'inscription. */
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN src TEXT').run(); } catch {}
    /* Code de parrainage de la boutique, stable une fois créé. */
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN ref_code TEXT').run(); } catch {}
    /* Numéro prouvé par un code SMS : la récupération du compte devient plus
       sûre, et l'admin sait à quoi s'en tenir. */
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0').run(); } catch {}
    /* Abonnement Premium : date de fin, 0 ou vide = gratuit. */
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN premium_until INTEGER').run(); } catch {}
    /* Parrain d'une boutique et récompense déjà versée : un mois offert à
       chacun après la première vente du filleul, jamais à l'inscription. */
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN ref_by TEXT').run(); } catch {}
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN referral_rewarded INTEGER NOT NULL DEFAULT 0').run(); } catch {}
    /* Codes d'activation : date de validité et date d'utilisation, pour
       n'accepter un code qu'un temps et savoir qui s'en est servi. */
    try { await env.DB.prepare('ALTER TABLE premium_codes ADD COLUMN expires INTEGER').run(); } catch {}
    try { await env.DB.prepare('ALTER TABLE premium_codes ADD COLUMN used_at INTEGER').run(); } catch {}
    /* Code nominatif : réservé à une boutique précise, pour qu'un code offert
       ne soit pas revendu à un tiers. */
    try { await env.DB.prepare('ALTER TABLE premium_codes ADD COLUMN for_user TEXT').run(); } catch {}
    /* Rappel J-7 : on retient la date de fin déjà annoncée, pour ne pas
       répéter le même e-mail chaque jour. */
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN premium_reminded INTEGER NOT NULL DEFAULT 0').run(); } catch {}
    /* Relance d'une demande de paiement : une seule fois par demande. */
    try { await env.DB.prepare('ALTER TABLE payments ADD COLUMN notified INTEGER NOT NULL DEFAULT 0').run(); } catch {}
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, owner_id TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, used_by TEXT)',
    ).run(    );
  });
  /* Une panne passagère de la base ne doit pas condamner l'isolate : on oublie
     le schéma en échec pour retenter à la requête suivante. */
  schemaReady.catch(() => { schemaReady = null; });
  return schemaReady;
}

async function currentUser(request, env) {
  const token = cookieOf(request, 'ac_session');
  if (!token) return null;
  const hash = await sha256(token);
  /* Le vendeur hérite du Premium de la boutique, pas du sien. */
  const row = await env.DB.prepare(
    `SELECT s.user_id AS id, u.email, u.phone, u.phone_verified, u.name, u.owner_id, u.role, u.perms, s.expires,
       CASE WHEN u.owner_id IS NULL THEN COALESCE(u.premium_until, 0)
            ELSE COALESCE((SELECT o.premium_until FROM users o WHERE o.id = u.owner_id), 0) END AS premium_until
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
  ).bind(hash).first();
  if (!row) return null;
  if (row.expires < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(hash).run();
    return null;
  }
  return { id: row.id, email: row.email, phone: row.phone, phoneVerified: !!Number(row.phone_verified), name: row.name || null, ownerId: row.owner_id || null, role: row.role || 'owner', perms: parsePerms(row.perms), premiumUntil: Number(row.premium_until) || 0 };
}

async function createSession(env, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), userId, expires).run();
  return `ac_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

/* Code de réinitialisation : huit signes sans I, O, 0 ni 1, faciles à dicter
   au téléphone quand le client n'a pas accès à son e-mail. */
function newResetCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}
const normalizeResetCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* SMS de récupération : le même code à huit signes, pour les boutiques qui
   n'ont qu'un numéro. Le fournisseur est branché par deux secrets
   (SENT_API_KEY et SENT_PROJECT_ID) : sans eux, rien ne part et l'assistance
   reste le recours. Aucun envoi n'est bloquant. */
const smsReady = (env) => !!(env.SENT_API_KEY && env.SENT_PROJECT_ID);
async function sendSms(env, to, text) {
  if (!smsReady(env)) return false;
  const digits = digitsOf(to);
  if (digits.length < 8) return false;
  try {
    const r = await fetch('https://api.sent.dm/v1/messages', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.SENT_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ project_id: env.SENT_PROJECT_ID, channel: 'sms', to: '+' + digits, text }),
    });
    return r.ok;
  } catch { return false; }
}
async function sendResetSms(env, to, code) {
  if (!smsReady(env)) return false;
  return sendSms(env, to, `Assistant Commercial : votre code de réinitialisation est ${code}. Valable 30 minutes, à usage unique.`);
}

/* Vérification du numéro : six chiffres, valables quinze minutes. Elle prouve
   que le numéro est bien celui de la boutique avant de s'en servir pour la
   récupération. Un envoi qui échoue ne bloque jamais l'inscription. */
const PHONE_CODE_MS = 15 * 60000;
function newPhoneCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (bytes[0] % 900000));
}
const normalizePhoneCode = (v) => String(v || '').replace(/\D/g, '').slice(0, 6);
async function sendVerifySms(env, to, code) {
  return sendSms(env, to, `Assistant Commercial : votre code de vérification est ${code}. Valable 15 minutes. Si vous n'avez rien demandé, ignorez ce message.`);
}
async function issuePhoneCode(env, userId, phone) {
  const code = newPhoneCode();
  await env.DB.prepare('DELETE FROM phone_codes WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('INSERT INTO phone_codes (user_id, code, created, expires, tries) VALUES (?, ?, ?, ?, 0)')
    .bind(userId, await sha256('phone:' + code), Date.now(), Date.now() + PHONE_CODE_MS).run();
  const sent = await sendVerifySms(env, phone, code);
  if (!sent) await env.DB.prepare('DELETE FROM phone_codes WHERE user_id = ?').bind(userId).run();
  return sent;
}

async function sendResetMail(env, to, code, link) {
  if (!env.RESEND_API_KEY) return false;
  const from = env.MAIL_FROM || 'Assistant Commercial <onboarding@resend.dev>';
  const text = `Bonjour,\n\nVotre code pour choisir un nouveau mot de passe Assistant Commercial :\n\n    ${code}\n\nIl est valable 30 minutes et ne sert qu'une fois. Ouvrez l'application ici :\n${link}\n\nDans l'application : « Mot de passe oublié ? », puis saisissez ce code et votre nouveau mot de passe.\n\nSi vous n'avez rien demandé, ignorez cet e-mail : votre mot de passe ne change pas.`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'Assistant Commercial : votre code de réinitialisation', text }),
    });
    return r.ok;
  } catch { return false; }
}

/* Rappel de fin de Premium : un e-mail à J-7, une fois par période. Sans clé
   d'envoi, rien ne part : l'admin garde la liste « finit bientôt » pour
   prévenir à la main. */
async function sendPremiumMail(env, to, days, link) {
  if (!env.RESEND_API_KEY) return false;
  const from = env.MAIL_FROM || 'Assistant Commercial <onboarding@resend.dev>';
  const text = `Bonjour,\n\nVotre Premium Assistant Commercial se termine dans ${days} jour${days > 1 ? 's' : ''}.\n\nPour garder vos vendeurs et retirer les publicités, renouvelez depuis l'application :\n${link}\n\nRéglages → Premium → Payer maintenant.\n\nSi vous avez déjà renouvelé, ignorez ce message.`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'Assistant Commercial : votre Premium se termine bientôt', text }),
    });
    return r.ok;
  } catch { return false; }
}

/* Rappel J-7 : une fois par jour au maximum, et une seule fois par période
   Premium. Il part à la première requête de la journée (l'ouverture de
   l'application par n'importe qui), sans cron à configurer. Sans clé d'envoi,
   la date n'est pas retenue : le jour où la clé arrive, le rappel part. */
async function maybePremiumReminder(env, origin) {
  if (!env.RESEND_API_KEY) return;
  /* Une réservation par heure : plusieurs requêtes simultanées ne peuvent pas
     envoyer le même rappel, et dix boutiques par heure suffisent sans risquer
     de dépasser le temps d'un Worker. */
  const slot = new Date().toISOString().slice(0, 13);
  const claim = await env.DB.prepare(
    "INSERT INTO app_config (key, value) VALUES ('premiumRemindedOn', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE app_config.value <> excluded.value",
  ).bind(slot).run();
  if (!claim.meta || !claim.meta.changes) return;
  const now = Date.now();
  const soon = await env.DB.prepare(
    'SELECT id, email, premium_until FROM users WHERE owner_id IS NULL AND premium_until > ? AND premium_until < ? AND email IS NOT NULL AND COALESCE(premium_reminded, 0) <> premium_until LIMIT 10',
  ).bind(now, now + 7 * 86400000).all();
  for (const u of soon.results || []) {
    /* Réservation par boutique : deux ouvertures simultanées n'envoient
       qu'un e-mail. Une réservation annulée si l'envoi échoue. */
    const until = Number(u.premium_until) || 0;
    const own = await env.DB.prepare('UPDATE users SET premium_reminded = ? WHERE id = ? AND COALESCE(premium_reminded, 0) <> ?')
      .bind(until, u.id, until).run();
    if (!own.meta || !own.meta.changes) continue;
    const days = Math.max(1, Math.ceil((until - now) / 86400000));
    const sent = await sendPremiumMail(env, u.email, days, origin);
    if (!sent) await env.DB.prepare('UPDATE users SET premium_reminded = 0 WHERE id = ?').bind(u.id).run();
  }
  /* Demandes de paiement oubliées : une relance, une seule fois, après 24 h.
     Le bouton de l'admin reste là pour relancer à la main. */
  const stale = await env.DB.prepare(
    "SELECT p.id, p.ref, p.months, p.amount, u.email FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status = 'pending' AND COALESCE(p.notified, 0) = 0 AND p.created < ? AND u.email IS NOT NULL LIMIT 10",
  ).bind(now - 86400000).all();
  for (const p of stale.results || []) {
    const own = await env.DB.prepare('UPDATE payments SET notified = 1 WHERE id = ? AND COALESCE(notified, 0) = 0').bind(p.id).run();
    if (!own.meta || !own.meta.changes) continue;
    const text = `Bonjour,\n\nVotre demande Premium ${p.ref} (${p.months} mois, ${p.amount} FCFA) est toujours en attente.\n\nSi vous avez déjà transféré, envoyez-nous la preuve sur WhatsApp. Sinon, recommencez depuis l'application : Réglages → Premium → Payer maintenant.`;
    const sent = await sendTextMail(env, p.email, 'Assistant Commercial : paiement en attente', text);
    if (!sent) await env.DB.prepare('UPDATE payments SET notified = 0 WHERE id = ?').bind(p.id).run();
  }
}

/* Base32 (RFC 4648) : c'est l'alphabet que les applications
d'authentification affichent. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(text) {
  const clean = String(text || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 255);
      /* On ne garde que les bits restants : sans ce masque, la valeur dépasse
         32 bits et les octets suivants sont faux. */
      value &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(out);
}
async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey('raw', b32decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const buf = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i -= 1) { buf[i] = c & 255; c = Math.floor(c / 256); }
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const off = mac[mac.length - 1] & 15;
  const num = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(num % 1000000).padStart(6, '0');
}
const totpAt = (secret, ms) => hotp(secret, Math.floor(Number(ms) / 30000));
/* Second facteur optionnel : « email:BASE32,email:BASE32 » dans ADMIN_TOTP.
   Une personne sans secret garde le seul code d'administration. */
function adminTotps(env) {
  const map = new Map();
  for (const part of String(env.ADMIN_TOTP || '').split(',')) {
    const at = part.indexOf(':');
    if (at < 1) continue;
    const mail = part.slice(0, at).trim().toLowerCase();
    const secret = part.slice(at + 1).trim();
    if (mail && secret) map.set(mail, secret);
  }
  return map;
}
/* Renvoie le pas de temps (compteur de 30 s) qui correspond au code, ou null.
   Le compteur sert aussi à refuser un code déjà utilisé : sans cela, six
   chiffres lus par-dessus une épaule resteraient valables quatre-vingt-dix
   secondes, et rejouables. */
async function totpMatch(secret, code, now) {
  const given = String(code || '').replace(/\D/g, '');
  if (!secret || given.length !== 6) return null;
  const at = Number(now) || Date.now();
  for (const step of [-1, 0, 1]) {
    const counter = Math.floor((at + step * 30000) / 30000);
    if (same(given, await hotp(secret, counter))) return counter;
  }
  return null;
}
async function totpOk(env, email, code) {
  const secret = adminTotps(env).get(String(email || '').trim().toLowerCase());
  if (!secret) return true;
  return (await totpMatch(secret, code, Date.now())) !== null;
}
async function totpLastUsed(env, email) {
  try {
    const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('totp:' + email).first();
    return Number(row && row.value) || 0;
  } catch { return 0; }
}
async function totpRemember(env, email, counter) {
  try {
    await env.DB.prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind('totp:' + email, String(counter)).run();
  } catch { /* un échec mémoire ne doit pas empêcher la connexion */ }
}

/* Codes de secours : si le téléphone est perdu, un code à usage unique ouvre
   encore l'administration. Seule leur empreinte est gardée, comme un mot de
   passe : l'écran les affiche une fois, puis plus jamais. */
const BACKUP_COUNT = 8;
function newBackupCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = [...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}
const normalizeBackupCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const backupKey = (email) => 'totpb:' + String(email || '').trim().toLowerCase();
const backupHash = (email, code) => sha256('backup:' + String(email || '').trim().toLowerCase() + ':' + normalizeBackupCode(code));
async function backupHashes(env, email) {
  try {
    const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind(backupKey(email)).first();
    const list = row ? JSON.parse(String(row.value || '[]')) : [];
    return Array.isArray(list) ? list.map(String) : [];
  } catch { return []; }
}
async function backupCodesLeft(env, email) {
  return (await backupHashes(env, email)).length;
}
async function issueBackupCodes(env, email) {
  const list = [];
  for (let i = 0; i < BACKUP_COUNT; i += 1) list.push(newBackupCode());
  const hashes = [];
  for (const c of list) hashes.push(await backupHash(email, c));
  /* Une nouvelle liste remplace l'ancienne : un papier égaré ne doit pas
     rester une clé éternelle. */
  await env.DB.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(backupKey(email), JSON.stringify(hashes)).run();
  return list;
}
async function useBackupCode(env, email, code) {
  const plain = normalizeBackupCode(code);
  if (plain.length !== 8) return false;
  const key = backupKey(email);
  const hash = await backupHash(email, plain);
  /* Retrait sous condition sur l'ancienne valeur : deux essais simultanés du
     même code ne peuvent pas le dépenser deux fois. */
  for (let i = 0; i < 2; i += 1) {
    const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind(key).first().catch(() => null);
    if (!row) return false;
    let list;
    try { list = JSON.parse(String(row.value || '[]')); } catch { return false; }
    if (!Array.isArray(list) || !list.includes(hash)) return false;
    const next = JSON.stringify(list.filter((h) => h !== hash));
    const done = await env.DB.prepare('UPDATE app_config SET value = ? WHERE key = ? AND value = ?')
      .bind(next, key, String(row.value)).run().catch(() => null);
    if (done && done.meta && done.meta.changes) return true;
  }
  return false;
}

/* Une demande sans transfert au bout de trente jours n'est plus une demande :
   elle est marquée expirée, la boutique peut recommencer, et l'admin ne voit
   plus une ligne qui traîne. Le balayage se fait à la lecture, sans réveil
   planifié. */
const PENDING_DAYS = 30;
async function expireStalePayments(env, now) {
  const cutoff = (Number(now) || Date.now()) - PENDING_DAYS * 86400000;
  try {
    const r = await env.DB.prepare(
      "UPDATE payments SET status = 'expired', note = COALESCE(note, 'demande expirée') WHERE status = 'pending' AND created < ?",
    ).bind(cutoff).run();
    const n = Number((r.meta && r.meta.changes) || 0);
    if (n) await adminLog(env, 'systeme', 'request-expire', null, `${n} demande(s) sans transfert`);
    /* Les jetons d'accord, d'avertissement et de relance d'une demande qui
       n'est plus en attente ne servent plus à rien. */
    await env.DB.prepare(
      "DELETE FROM app_config WHERE (key LIKE 'payok:%' OR key LIKE 'paywarn:%' OR key LIKE 'paywait:%') AND substr(key, instr(key, ':') + 1) NOT IN (SELECT id FROM payments WHERE status = 'pending')",
    ).run().catch(() => {});
    return n;
  } catch { return 0; }
}

/* La boutique est prévenue trois jours avant l'expiration : elle a encore le
   temps de payer, ou d'annuler et de recommencer. Un seul avertissement par
   demande, celui qui a réellement pu partir. */
const PAY_WARN_DAYS = 3;
const needsExpiryWarning = (created, now) => {
  const age = (Number(now) || Date.now()) - (Number(created) || 0);
  return age >= (PENDING_DAYS - PAY_WARN_DAYS) * 86400000 && age < PENDING_DAYS * 86400000;
};
async function warnExpiringPayments(env, now) {
  const at = Number(now) || Date.now();
  try {
    const rows = await env.DB.prepare(
      "SELECT p.id, p.ref, p.months, p.amount, u.email FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status = 'pending' AND p.created >= ? AND p.created < ? LIMIT 50",
    ).bind(at - PENDING_DAYS * 86400000, at - (PENDING_DAYS - PAY_WARN_DAYS) * 86400000).all();
    let n = 0;
    for (const r of rows.results || []) {
      const key = 'paywarn:' + r.id;
      const done = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind(key).first().catch(() => null);
      if (done) continue;
      const text = `Bonjour,\n\nVotre demande Premium ${r.ref} (${r.months} mois, ${r.amount} FCFA) expire dans ${PAY_WARN_DAYS} jours.\n\nSi vous avez déjà transféré, envoyez-nous la preuve sur WhatsApp. Sinon, annulez-la et recommencez depuis l'application.`;
      const mailed = await sendTextMail(env, r.email, 'Assistant Commercial : votre demande expire bientôt', text);
      if (!mailed) continue;
      await env.DB.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(at)).run();
      n += 1;
    }
    if (n) await adminLog(env, 'systeme', 'request-warn', null, `${n} boutique(s) prévenue(s) avant expiration`);
    return n;
  } catch { return 0; }
}

/* Un premier accord qui attend depuis quarante-huit heures est relancé auprès
   de celui qui l'a donné : sans cela, le mois reste fermé sans que personne
   ne s'en aperçoive. */
const APPROVAL_ALERT_HOURS = 48;
const needsApprovalAlert = (at, now) => {
  const since = (Number(now) || Date.now()) - (Number(at) || 0);
  return Number(at) > 0 && since >= APPROVAL_ALERT_HOURS * 3600000;
};
async function alertStaleApprovals(env, now) {
  const at = Number(now) || Date.now();
  try {
    const rows = await env.DB.prepare("SELECT key, value FROM app_config WHERE key LIKE 'payok:%'").all();
    let n = 0;
    for (const r of rows.results || []) {
      let appr;
      try { appr = JSON.parse(String(r.value)); } catch { continue; }
      if (!appr || !appr.by || !needsApprovalAlert(appr.at, at)) continue;
      const id = String(r.key).slice(6);
      const done = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('paywait:' + id).first().catch(() => null);
      if (done) continue;
      const pay = await env.DB.prepare("SELECT ref, months, amount FROM payments WHERE id = ? AND status = 'pending'").bind(id).first().catch(() => null);
      if (!pay) continue;
      const text = `Bonjour,\n\nVotre accord sur ${pay.ref} (${pay.months} mois, ${pay.amount} FCFA) attend toujours un second administrateur. Ouvrez Administration, onglet Paiements, pour le faire confirmer.\n\nAucun mois n'est ouvert tant que personne n'a confirmé.`;
      const mailed = await sendTextMail(env, appr.by, 'Assistant Commercial : un second accord est attendu', text);
      if (!mailed) continue;
      await env.DB.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('paywait:' + id, String(at)).run();
      n += 1;
    }
    if (n) await adminLog(env, 'systeme', 'payment-approval-alert', null, `${n} premier(s) accord(s) relancé(s)`);
    return n;
  } catch { return 0; }
}

/* Un seul balayage, à chaque lecture des demandes : expiration, avertissement
   avant échéance, relance d'un accord oublié. Aucun envoi n'est bloquant. */
async function sweepPayments(env) {
  const now = Date.now();
  const expired = await expireStalePayments(env, now);
  await warnExpiringPayments(env, now);
  await alertStaleApprovals(env, now);
  return expired;
}

/* Reçu de paiement : au commerçant, et en copie au support s'il est réglé.
   Sans clé d'envoi, le reçu reste affiché dans l'application et l'admin le
   transmet sur WhatsApp. */
async function sendReceiptMail(env, to, info) {
  if (!env.RESEND_API_KEY || !to) return false;
  const from = env.MAIL_FROM || 'Assistant Commercial <onboarding@resend.dev>';
  /* Une copie mal saisie ne doit pas faire échouer le reçu du commerçant. */
  const copy = validEmail(String(env.SUPPORT_EMAIL || '').trim()) ? String(env.SUPPORT_EMAIL).trim() : '';
  const text = `Bonjour${info.shop ? ' ' + info.shop : ''},\n\nNous avons reçu votre paiement.\n\n  ${info.months} mois de Premium · ${info.amount} FCFA\n  Référence : ${info.ref}\n  Premium valable jusqu'au ${new Date(info.until).toLocaleDateString('fr-FR')}\n\nMerci. L'équipe Assistant Commercial.`;
  try {
    const body = { from, to: [to], subject: 'Assistant Commercial : paiement reçu', text };
    if (copy) body.bcc = [copy];
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
}

/* Relance d'une demande en attente : e-mail simple, sans reçu. */
async function sendTextMail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !to) return false;
  const from = env.MAIL_FROM || 'Assistant Commercial <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    return r.ok;
  } catch { return false; }
}

/* CSV pour la comptabilité : une cellule entre guillemets dès qu'elle contient
   une virgule, un guillemet ou un saut de ligne. Le BOM fait ouvrir le fichier
   en UTF-8 par Excel. */
const csvCell = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvOf = (rows) => '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

/* Journal d'administration. Écrit après coup, jamais à la place de l'action :
   une panne du journal ne doit pas empêcher d'offrir un mois ou de débloquer
   un compte. Conservé un peu plus d'un an, puis oublié. */
async function adminLog(env, actor, action, target, detail) {
  try {
    await env.DB.prepare('INSERT INTO admin_log (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)')
      .bind(Date.now(), String(actor || '—'), String(action), target ? String(target).slice(0, 120) : null, detail ? String(detail).slice(0, 300) : null).run();
    await env.DB.prepare('DELETE FROM admin_log WHERE at < ?').bind(Date.now() - 400 * 86400000).run();
  } catch { /* le journal ne fait jamais échouer une action */ }
}

/* Stripe : carte bancaire. Rien ne s'active ici sans les deux secrets ; sans
   eux, l'écran propose Wave, Orange Money ou WhatsApp. */
async function stripeCheckout(env, origin, months, amount, userId) {
  if (!env.STRIPE_SECRET_KEY) return null;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', `${origin}/?paid=1`);
  form.set('cancel_url', `${origin}/?paid=0`);
  form.set('client_reference_id', userId);
  form.set('metadata[user_id]', userId);
  form.set('metadata[months]', String(months));
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'xof');
  form.set('line_items[0][price_data][unit_amount]', String(Math.round(amount)));
  form.set('line_items[0][price_data][product_data][name]', `Assistant Commercial — ${months} mois`);
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.url ? { id: String(d.id || ''), url: String(d.url) } : null;
  } catch { return null; }
}

/* Signature Stripe : HMAC-SHA256 de « horodatage.corps ». Cinq minutes de
   tolérance, et une signature valide parmi celles annoncées suffit. */
async function stripeEvent(env, raw, header) {
  const secret = String(env.STRIPE_WEBHOOK_SECRET || '');
  if (!secret || !header) return null;
  const parts = String(header).split(',').map((p) => p.trim());
  const stamp = (parts.find((p) => p.startsWith('t=')) || '').slice(2);
  const sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const ts = Number(stamp);
  if (!Number.isFinite(ts) || !sigs.length) return null;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return null;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${raw}`)));
  if (!sigs.some((s) => same(s, expected))) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/* Un seul lien officiel pour toute l'application : celui saisi dans
   l'administration. À défaut, l'adresse par laquelle la demande est arrivée. */
const OFFICIAL_URL_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s]*)?$/i;
async function officialBase(env, url) {
  try {
    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'officialUrl'").first();
    const v = row ? String(row.value || '').trim() : '';
    if (v && OFFICIAL_URL_RE.test(v)) return v.replace(/\/+$/, '');
  } catch { /* base indisponible : on retombe sur l'adresse de la requête */ }
  return url.origin;
}

async function blocked(env, key, limit) {
  const row = await env.DB.prepare('SELECT hits, reset FROM throttle WHERE key = ?').bind(key).first();
  return !!row && row.reset > Date.now() && row.hits >= limit;
}

async function tooMany(env, key, limit, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT hits, reset FROM throttle WHERE key = ?').bind(key).first();
  if (!row || row.reset < now) {
    await env.DB.prepare('INSERT INTO throttle (key, hits, reset) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = 1, reset = excluded.reset').bind(key, now + windowMs).run();
    return false;
  }
  if (row.hits >= limit) return true;
  await env.DB.prepare('UPDATE throttle SET hits = hits + 1 WHERE key = ?').bind(key).run();
  return false;
}

async function readBody(request) {
  /* Refuser avant de lire : un corps annoncé trop gros ne doit pas être
     chargé en mémoire pour être rejeté ensuite. */
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY) throw new Error('trop volumineux');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error('trop volumineux');
  return text ? JSON.parse(text) : {};
}

/* Dix versions suffisent pour rattraper une erreur sans faire grossir la base. */
const HISTORY_KEEP = 10;
async function rememberState(env, userId, rev, json, updated) {
  await env.DB.prepare('INSERT INTO state_history (user_id, rev, json, updated, saved) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, rev, json, updated, Date.now())
    .run();
  await env.DB.prepare(
    'DELETE FROM state_history WHERE user_id = ? AND id NOT IN (SELECT id FROM state_history WHERE user_id = ? ORDER BY id DESC LIMIT ?)',
  ).bind(userId, userId, HISTORY_KEEP).run();
}

/* Les données d'un vendeur sont celles de son patron. */
const dataOwner = (user) => user.ownerId || user.id;

/* Droits d'un vendeur, choisis par le patron. Par défaut tout est permis :
   retirer un droit est une décision explicite du patron. */
const FULL_PERMS = { del: true, price: true };
/* Le journal est borné côté client ; le serveur applique le même plafond
   lorsqu'il remet les lignes des autres après une sauvegarde de vendeur. */
const LOG_MAX = 300;
function parsePerms(raw) {
  if (!raw) return { ...FULL_PERMS };
  if (typeof raw === 'object') return { del: raw.del !== false, price: raw.price !== false };
  try {
    const p = JSON.parse(raw);
    return { del: p.del !== false, price: p.price !== false };
  } catch { return { ...FULL_PERMS }; }
}

/* Identité renvoyée au client : le rôle et les droits doivent être connus dès
   la connexion, sinon un vendeur est traité comme patron jusqu'au rechargement. */
function publicUser(u) {
  return {
    id: u.id,
    email: u.email || null,
    phone: u.phone || null,
    name: u.name || null,
    phoneVerified: !!Number(u.phoneVerified !== undefined ? u.phoneVerified : u.phone_verified),
    ownerId: u.ownerId || u.owner_id || null,
    role: u.role || 'owner',
    perms: parsePerms(u.perms),
    premiumUntil: Number(u.premiumUntil || u.premium_until) || 0,
  };
}

/* Premium : un mois s'ajoute à la date de fin si elle est encore à venir. */
const PREMIUM_MONTH_MS = 30 * 86400000;
function extendPremium(current, months) {
  const base = Math.max(Date.now(), Number(current) || 0);
  return months > 0 ? base + months * PREMIUM_MONTH_MS : 0;
}
const isPremiumUntil = (until) => Number(until) > Date.now();
/* Gratuit : un seul vendeur. Premium : autant que la boutique en veut. */
const canAddStaff = (count, premium) => !!premium || Number(count) < 1;
/* Code d'activation : huit signes sans I, O, 0 ni 1, dictés sans erreur au
   téléphone. Il vaut pour un nombre de mois, une seule fois. */
const newPremiumCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
};
async function createPremiumCode(env, months, expires, forUser) {
  for (let i = 0; i < 8; i += 1) {
    const code = newPremiumCode();
    try {
      await env.DB.prepare('INSERT INTO premium_codes (code, months, created, used, used_by, expires, for_user) VALUES (?, ?, ?, 0, NULL, ?, ?)')
        .bind(code, months, Date.now(), Number(expires) || null, forUser || null).run();
      return code;
    } catch { /* collision improbable : on retente */ }
  }
  return '';
}
/* Un code sans date de fin reste valable : c'est le cas des codes créés
   avant l'ajout des dates. */
const codeExpired = (expires, now) => !!Number(expires) && Number(expires) <= (Number(now) || Date.now());

/* Ce qu'un vendeur ne doit jamais recevoir : prix d'achat, marges, dépenses
   et montants fournisseurs. On les vide à la lecture et on les rétablit
   depuis l'état du patron à l'écriture, pour qu'une sauvegarde du vendeur ne
   les efface pas. */
const SECRET_FIELDS = {
  products: ['buy'],
  sales: ['cost'],
  docs: ['cost'],
  expenses: ['amount'],
  withdrawals: ['amount'],
  debts: ['amount', 'paid', 'pays'],
};

/* Comparaison des noms saisis à l'encaissement : espaces et casse ignorés.
   Une vente antérieure sans identifiant reste celle du vendeur qui porte ce
   nom, sans quoi il perdrait tout son historique d'avant les comptes. */
const normName = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

function maskState(text, viewerId = '', viewerNames = []) {
  let db;
  try { db = JSON.parse(text || '{}'); } catch { return text; }
  if (!db || typeof db !== 'object') return text;
  for (const [key, fields] of Object.entries(SECRET_FIELDS)) {
    const list = db[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      for (const field of fields) if (field in item) item[field] = null;
    }
  }
  /* Un vendeur ne reçoit que son propre travail : ses ventes (noms de clients
     et montants compris) et ses lignes de journal. Celles du patron et des
     autres vendeurs ne quittent pas le serveur. Une vente antérieure, sans
     identifiant, reste au patron : il peut la rattacher à un vendeur. */
  const me = String(viewerId || '');
  const myNames = new Set((Array.isArray(viewerNames) ? viewerNames : []).map(normName).filter(Boolean));
  if (Array.isArray(db.sales)) {
    db.sales = db.sales.filter((s) => s && typeof s === 'object'
      && (String(s.byId || '') === me || (!s.byId && myNames.has(normName(s.by)))));
  }
  if (Array.isArray(db.log)) {
    db.log = db.log.filter((e) => e && typeof e === 'object' && String(e.byId || '') === me);
  }
  return JSON.stringify(db);
}

function restoreMasked(storedText, incomingText) {
  let stored;
  let incoming;
  try { stored = JSON.parse(storedText || '{}'); incoming = JSON.parse(incomingText || '{}'); } catch { return incomingText; }
  if (!stored || !incoming || typeof incoming !== 'object') return incomingText;
  const buyOf = new Map();
  if (Array.isArray(stored.products)) {
    for (const p of stored.products) if (p && p.id) buyOf.set(String(p.id), Math.max(0, Number(p.buy) || 0));
  }
  for (const [key, fields] of Object.entries(SECRET_FIELDS)) {
    const mine = incoming[key];
    if (!Array.isArray(mine)) continue;
    const theirs = Array.isArray(stored[key]) ? stored[key] : [];
    const byId = new Map(theirs.filter((x) => x && x.id).map((x) => [String(x.id), x]));
    for (let i = mine.length - 1; i >= 0; i--) {
      const item = mine[i];
      if (!item || typeof item !== 'object') continue;
      const source = item.id ? byId.get(String(item.id)) : null;
      if (source) {
        for (const field of fields) if (field in source) item[field] = source[field];
        continue;
      }
      /* Élément créé par le vendeur : le coût d'une vente se recalcule avec le
         prix d'achat du patron. Une dépense, un prélèvement ou un achat sans
         montant ne peut pas venir de son écran : on ne l'enregistre pas. */
      if (key === 'sales') {
        const pid = String(item.pid || '');
        if (pid && buyOf.has(pid)) {
          item.cost = (Number(item.qty) || 0) * buyOf.get(pid);
          item.costKnown = true;
        } else {
          item.cost = 0;
        }
        continue;
      }
      if (key === 'expenses' || key === 'withdrawals' || key === 'debts') mine.splice(i, 1);
    }
  }
  /* Ventes : le vendeur n'en reçoit que les siennes, on remet donc celles des
     autres avant écriture — sinon sa sauvegarde effacerait les ventes du
     patron. Elles sont ajoutées après le calcul des coûts : un coût déjà
     enregistré n'est pas recalculé. */
  if (Array.isArray(incoming.sales)) {
    const seen = new Set(incoming.sales.filter((s) => s && s.id).map((s) => String(s.id)));
    for (const s of (Array.isArray(stored.sales) ? stored.sales : [])) {
      if (s && s.id && !seen.has(String(s.id))) incoming.sales.push(s);
    }
  }
  /* Journal : le montant d'une entrée déjà connue vient du patron ; une entrée
     créée par le vendeur garde le montant de son action (il le connaît déjà).
     Le vendeur ne reçoit que ses propres lignes : celles des autres sont
     remises ici, sinon sa sauvegarde effacerait l'historique du patron. */
  if (Array.isArray(incoming.log)) {
    const storedArr = Array.isArray(stored.log) ? stored.log : [];
    const storedLog = new Map(storedArr.filter((x) => x && x.id).map((x) => [String(x.id), x]));
    for (const e of incoming.log) {
      if (!e || typeof e !== 'object') continue;
      const source = e.id ? storedLog.get(String(e.id)) : null;
      if (source && 'amount' in source) e.amount = source.amount;
      else e.amount = Math.max(0, Math.round(Number(e.amount) || 0));
    }
    const seen = new Set(incoming.log.filter((x) => x && x.id).map((x) => String(x.id)));
    for (const e of storedArr) if (e && e.id && !seen.has(String(e.id))) incoming.log.push(e);
    incoming.log = incoming.log
      .filter((e) => e && typeof e === 'object')
      .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
    if (incoming.log.length > LOG_MAX) incoming.log = incoming.log.slice(-LOG_MAX);
  }
  return JSON.stringify(incoming);
}

/* ---------------- administration ----------------
   La page /admin n'est pas protégée par un mot de passe séparé : elle exige un
   compte normal dont l'e-mail (ou le numéro) figure dans le secret
   ADMIN_EMAILS. Sans ce secret, personne n'entre : pas de compte par défaut. */
function adminList(env) {
  return String(env.ADMIN_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function isAdmin(user, list) {
  if (!user || !Array.isArray(list) || !list.length) return false;
  const email = String(user.email || '').trim().toLowerCase();
  const digits = digitsOf(user.phone || '');
  return list.some((v) => (v.includes('@') ? v === email : digits.length > 0 && digitsOf(v) === digits));
}
/* Connexion d'administration : un e-mail de la liste et le code commun
   donnent un cookie signé, sans exiger un compte dans l'application. Le code
   n'est jamais envoyé au navigateur ; le cookie ne contient que l'e-mail et sa
   date d'expiration, signés avec le code. */
const ADMIN_COOKIE = 'ac_admin';
/* Huit heures : une journée de travail, pas une semaine. Un poste laissé
   ouvert le soir ne reste pas administrateur jusqu'au lendemain soir. */
const ADMIN_SESSION_MS = 8 * 3600000;
/* Chaque personne du support peut avoir son propre code : le secret
   ADMIN_CODES accepte « email:code,email:code ». Sans lui, le code commun
   ADMIN_CODE continue de fonctionner, donc rien ne casse. */
function adminCodes(env) {
  const map = new Map();
  for (const part of String(env.ADMIN_CODES || '').split(',')) {
    const at = part.indexOf(':');
    if (at < 1) continue;
    const mail = part.slice(0, at).trim().toLowerCase();
    const code = part.slice(at + 1).trim();
    if (mail && code) map.set(mail, code);
  }
  return map;
}
const adminSigningKey = (env) => String(env.ADMIN_CODE || [...adminCodes(env).values()][0] || '');
const codeForAdmin = (env, email) => adminCodes(env).get(String(email || '').trim().toLowerCase()) || String(env.ADMIN_CODE || '');

/* Clés de limitation à effacer pour débloquer un compte. Le « %: » devant
   l'identifiant est indispensable : sans lui, débloquer a@x.com effacerait
   aussi le verrou de aa@x.com. */
function unlockPatterns(email, phone) {
  const patterns = [];
  const mail = String(email || '').trim().toLowerCase();
  const digits = digitsOf(phone || '');
  if (mail) patterns.push('%:' + mail);
  if (digits.length >= 8) patterns.push('%:' + digits);
  return patterns;
}
const adminEmailOk = (email, list) => Array.isArray(list) && list.includes(String(email || '').trim().toLowerCase());

async function adminToken(env, email, expires) {
  const key = adminSigningKey(env);
  if (!key) return '';
  const payload = `${String(email).trim().toLowerCase()}|${Number(expires) || 0}`;
  const sig = (await sha256(payload + '|' + key)).slice(0, 32);
  /* Ni « | » ni « @ » ne sont interdits dans un cookie : la valeur reste
     lisible et se vérifie telle quelle. */
  return payload + '.' + sig;
}

/* Vérification silencieuse : cookie absent, mal signé, expiré ou e-mail retiré
   de la liste donnent tous « pas administrateur », jamais une erreur utile à
   un curieux. */
async function adminFromToken(env, raw) {
  const key = adminSigningKey(env);
  if (!key || !raw) return null;
  const at = raw.lastIndexOf('.');
  if (at < 1) return null;
  const payload = raw.slice(0, at);
  const sig = raw.slice(at + 1);
  const expected = (await sha256(payload + '|' + key)).slice(0, 32);
  if (!same(sig, expected)) return null;
  const parts = payload.split('|');
  if (parts.length !== 2) return null;
  const email = parts[0].trim().toLowerCase();
  const expires = Number(parts[1]) || 0;
  if (!(expires > Date.now())) return null;
  if (!adminEmailOk(email, adminList(env))) return null;
  return { email, expires };
}
const adminSession = (request, env) => adminFromToken(env, cookieOf(request, ADMIN_COOKIE));
/* Réglages communs à toute l'application : publicité, emplacements et numéro
   WhatsApp du support (activation Premium et aide). */
const EMPTY_CONFIG = { ads: false, adsClient: '', adsTop: '', adsBottom: '', supportWa: '', supportMail: '', officialUrl: '', payWave: '', payOm: '', priceMonth: 0 };
async function readConfig(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM app_config').all();
  const map = {};
  for (const r of rows.results || []) map[r.key] = r.value;
  return {
    ads: map.ads === '1',
    adsClient: map.adsClient || '',
    adsTop: map.adsTop || '',
    adsBottom: map.adsBottom || '',
    supportWa: map.supportWa || '',
    /* Adresse de repli quand WhatsApp n'est pas renseigné : le commerçant
       garde un moyen d'écrire à l'équipe. */
    supportMail: map.supportMail || '',
    officialUrl: map.officialUrl || '',
    /* Encaissement du Premium : numéros Wave et Orange Money de l'équipe et
       prix d'un mois, en FCFA. Vides : seul le code ou WhatsApp reste. */
    payWave: map.payWave || '',
    payOm: map.payOm || '',
    priceMonth: Math.max(0, Math.round(Number(map.priceMonth) || 0)),
    /* Seuil du second accord : 0 = un seul administrateur suffit. */
    paySeuil: Math.max(0, Math.round(Number(map.paySeuil) || 0)),
  };
}
async function saveConfig(env, cfg) {
  const pairs = [['ads', cfg.ads ? '1' : '0'], ['adsClient', cfg.adsClient], ['adsTop', cfg.adsTop], ['adsBottom', cfg.adsBottom], ['supportWa', cfg.supportWa || ''], ['supportMail', cfg.supportMail || ''], ['officialUrl', cfg.officialUrl || ''], ['payWave', cfg.payWave || ''], ['payOm', cfg.payOm || ''], ['priceMonth', String(Math.max(0, Math.round(Number(cfg.priceMonth) || 0)))], ['paySeuil', String(Math.max(0, Math.round(Number(cfg.paySeuil) || 0)))]];
  await env.DB.batch(pairs.map(([k, v]) => env.DB.prepare(
    'INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).bind(k, v)));
}
const ADMIN_REF = /^ca-pub-\d{10,20}$/;
const ADMIN_SLOT = /^\d{6,20}$/;
/* Numéro du support : 8 à 15 chiffres, indicatif compris. Un numéro local
   (07 00…) est accepté tel quel, wa.me s'en accommode. */
const validSupportWa = (v) => /^\d{8,15}$/.test(digitsOf(v));

/* 20 inscriptions par heure et par adresse IP : un patron et ses vendeurs
   partagent souvent le même Wi-Fi, et 10 les bloquait au milieu d'une mise en
   route. Renvoie vrai quand l'adresse doit attendre. */
const SIGNUP_LIMIT = 20;
const SIGNUP_WINDOW_MS = 60 * 60000;
async function signupGuard(env, ip) {
  const key = 'signup:' + (ip || 'local');
  if (await blocked(env, key, SIGNUP_LIMIT)) return true;
  await tooMany(env, key, SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
  return false;
}

async function api(request, env, url, ctx) {
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/me' && request.method === 'GET') {
    const user = await currentUser(request, env);
    return json({ user });
  }

  /* Réglages communs, lus par tous les appareils, même avant connexion :
     seulement la publicité, aucun secret. */
  if (path === '/api/config' && request.method === 'GET') {
    try {
      const cfg = await readConfig(env);
      /* Le rappel J-7 part en tâche de fond : la réponse ne l'attend pas. */
      const job = maybePremiumReminder(env, await officialBase(env, url)).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
      /* Les numéros d'encaissement ne sortent que par /api/premium/offer : la
         configuration publique reste sans coordonnées de paiement. */
      const { payWave, payOm, priceMonth, ...pub } = cfg;
      /* L'application a besoin de savoir si le SMS est branché pour ne pas
         proposer un bouton de vérification qui échouerait. */
      return json(Object.assign({}, pub, { sms: smsReady(env) }));
    } catch { return json(EMPTY_CONFIG); }
  }

  /* Tarif et moyens de paiement du Premium : publics, ce ne sont pas des
     secrets — le commerçant doit les voir avant même de se connecter. */
  if (path === '/api/premium/offer' && request.method === 'GET') {
    const cfg = await readConfig(env);
    return json({
      priceMonth: cfg.priceMonth,
      payWave: cfg.payWave,
      payOm: cfg.payOm,
      supportWa: cfg.supportWa,
      card: !!env.STRIPE_SECRET_KEY,
    });
  }

  /* Rapprochement automatique : Wave, Orange Money ou un agrégateur appellent
     ici après un transfert. La signature partage PAY_HOOK_SECRET, le montant
     doit couvrir la demande, et une référence ne s'ouvre qu'une fois. */
  if (path === '/api/payments/hook' && request.method === 'POST') {
    const secret = String(env.PAY_HOOK_SECRET || '');
    if (!secret) return json({ error: 'notconfigured' }, 503);
    const raw = await request.text();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(raw)));
    if (!same(String(request.headers.get('x-pay-signature') || ''), expected)) return json({ error: 'signature' }, 401);
    let body = {};
    try { body = JSON.parse(raw); } catch { return json({ error: 'body' }, 400); }
    const ref = String(body.ref || '').trim().toUpperCase();
    const amount = Math.round(Number(body.amount) || 0);
    const provider = String(body.provider || 'wave').slice(0, 20);
    const pay = await env.DB.prepare('SELECT * FROM payments WHERE ref = ? ORDER BY created DESC LIMIT 1').bind(ref).first();
    if (!pay) return json({ error: 'ref' }, 404);
    if (pay.status === 'paid') return json({ ok: true, duplicate: true });
    if (pay.status !== 'pending') return json({ error: 'closed' }, 409);
    if (amount < Number(pay.amount)) return json({ error: 'amount' }, 400);
    const claim = await env.DB.prepare("UPDATE payments SET status = 'paid', paid_at = ?, actor = ?, note = ? WHERE id = ? AND status = 'pending'")
      .bind(Date.now(), provider, 'rapprochement automatique', pay.id).run();
    if (!claim.meta || !claim.meta.changes) return json({ ok: true, duplicate: true });
    const months = Math.max(1, Math.min(12, Number(pay.months) || 1));
    await env.DB.prepare('UPDATE users SET premium_until = MAX(?, COALESCE(premium_until, 0)) + ?, premium_reminded = 0 WHERE id = ?')
      .bind(Date.now(), months * PREMIUM_MONTH_MS, pay.user_id).run();
    const fresh = await env.DB.prepare('SELECT premium_until, email, phone FROM users WHERE id = ?').bind(pay.user_id).first();
    const until = Number(fresh && fresh.premium_until) || 0;
    const mailed = await sendReceiptMail(env, fresh && fresh.email, { shop: '', months, amount: Number(pay.amount) || 0, ref, until });
    await adminLog(env, provider, 'payment', (fresh && (fresh.email || fresh.phone)) || pay.user_id, `${months} mois · ${pay.amount} FCFA · ${ref} · automatique`);
    return json({ ok: true, months, premiumUntil: until, mail: mailed });
  }

  /* Stripe appelle ici sans cookie ni origine : sa signature fait foi. La
     réponse est toujours 200 quand l'événement est authentique, même s'il ne
     concerne pas nos comptes, sinon Stripe réessaie sans fin. */
  if (path === '/api/stripe/webhook' && request.method === 'POST') {
    const raw = await request.text();
    const ev = await stripeEvent(env, raw, request.headers.get('stripe-signature'));
    if (!ev) return json({ error: 'signature' }, 400);
    if (ev.type === 'checkout.session.completed') {
      const obj = ev.data && ev.data.object ? ev.data.object : {};
      const userId = String((obj.metadata && obj.metadata.user_id) || obj.client_reference_id || '');
      const months = Math.max(1, Math.min(12, Math.round(Number(obj.metadata && obj.metadata.months) || 0)));
      const eventId = 'ev-' + String(ev.id || '');
      /* Une session « terminée » peut être impayée (moyens asynchrones) : seul
         un paiement réellement encaissé en francs ouvre un mois. */
      const settled = String(obj.payment_status || '') === 'paid' && String(obj.currency || '').toLowerCase() === 'xof';
      if (userId && months && ev.id && settled) {
        /* Stripe peut renvoyer le même événement : l'identifiant rend l'ajout
           idempotent, un mois n'est jamais offert deux fois. */
        const seen = await env.DB.prepare('SELECT id FROM payments WHERE id = ?').bind(eventId).first();
        if (!seen) {
          const row = await env.DB.prepare('SELECT email FROM users WHERE id = ? AND owner_id IS NULL').bind(userId).first();
          if (row) {
            await env.DB.batch([
              /* MAX(...) en SQL : deux webhooks simultanés ne s'écrasent pas. */
              env.DB.prepare('UPDATE users SET premium_until = MAX(?, COALESCE(premium_until, 0)) + ?, premium_reminded = 0 WHERE id = ?')
                .bind(Date.now(), months * PREMIUM_MONTH_MS, userId),
              env.DB.prepare("INSERT INTO payments (id, ref, user_id, months, amount, method, status, created, paid_at, actor, note) VALUES (?, ?, ?, ?, ?, 'card', 'paid', ?, ?, 'Stripe', ?)")
                .bind(eventId, String(obj.id || ''), userId, months, Math.round(Number(obj.amount_total) || 0), Date.now(), Date.now(), 'carte'),
            ]);
            const paidRow = await env.DB.prepare('SELECT premium_until FROM users WHERE id = ?').bind(userId).first();
            await sendReceiptMail(env, row.email, { shop: '', months, amount: Math.round(Number(obj.amount_total) || 0), ref: String(obj.id || eventId), until: Number(paidRow && paidRow.premium_until) || 0 });
            await adminLog(env, 'Stripe', 'payment', row.email || userId, `${months} mois par carte · ${Math.round(Number(obj.amount_total) || 0)} FCFA`);
          }
        }
      }
    }
    return json({ received: true });
  }

  if (path === '/api/signup' && request.method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (await signupGuard(env, ip)) return json({ error: 'slow' }, 429);
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    // Un compte peut être créé avec un e-mail, un numéro, ou les deux.
    if (!email && !phone) return json({ error: 'identifier' }, 400);
    if (email && !validEmail(email)) return json({ error: 'email' }, 400);
    if (phone && !validPhone(phone)) return json({ error: 'phone' }, 400);
    if (!validPass(password)) return json({ error: 'password' }, 400);
    if (email) {
      const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (exists) return json({ error: 'exists' }, 409);
    }
    const phoneDigits = phone ? digitsOf(phone) : null;
    if (phoneDigits) {
      const samePhone = await env.DB.prepare('SELECT id FROM users WHERE phone_digits = ?').bind(phoneDigits).first();
      if (samePhone) return json({ error: 'phone_taken' }, 409);
    }
    const id = crypto.randomUUID();
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const pass = await pbkdf2(password, salt);
    const src = cleanSrc(body.src);
    /* Un lien de parrainage porte le code du parrain : la récompense attend la
       première vraie vente du filleul, pas la simple inscription. */
    let refBy = null;
    if (src.startsWith('p-')) {
      const inviter = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ?').bind(src.slice(2).toUpperCase()).first();
      if (inviter) refBy = inviter.id;
    }
    await env.DB.prepare('INSERT INTO users (id, email, phone, phone_digits, pass, salt, created, src, ref_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, email || null, phone || null, phoneDigits, pass, salt, Date.now(), src || null, refBy).run();
    /* Compteur par canal : aucun nom, aucun compte, juste combien d'installations. */
    if (src) {
      const day = new Date().toISOString().slice(0, 10);
      await env.DB.prepare('INSERT INTO installs (src, day, hits) VALUES (?, ?, 1) ON CONFLICT(src, day) DO UPDATE SET hits = hits + 1').bind(src, day).run();
      /* Le compteur ne raconte que six mois : au-delà, il ne dit plus rien. */
      await env.DB.prepare('DELETE FROM installs WHERE day < ?').bind(new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)).run();
    }
    /* Numéro à vérifier : le code part tout de suite si le SMS est branché.
       L'inscription n'attend pas la réponse : sans réseau SMS, elle réussit
       quand même et la vérification reste proposée dans les réglages. */
    let verify = false;
    if (phoneDigits && smsReady(env)) {
      try { verify = await issuePhoneCode(env, id, phone); } catch { verify = false; }
    }
    const cookie = await createSession(env, id);
    return json({ user: publicUser({ id, email: email || null, phone: phone || null, phoneVerified: 0, premiumUntil: 0 }), verify }, 200, { 'set-cookie': cookie });
  }

  if (path === '/api/login' && request.method === 'POST') {
    const body = await readBody(request);
    const identifier = String(body.login || body.email || '').trim();
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    const ipKey = 'login-ip:' + ip;
    /* Deux compteurs, pas un : une boutique, un cybercafé ou un réseau mobile
       partagent une adresse IP. Une personne qui se trompe de mot de passe ne
       doit pas bloquer ses vendeurs — seul son propre identifiant se bloque. */
    const who = identifier.includes('@') ? identifier.toLowerCase() : digitsOf(identifier);
    const idKey = 'login-id:' + ip + ':' + who;
    /* Troisième compteur, par compte seul : une attaque répartie sur plusieurs
       adresses ne doit pas essayer indéfiniment le même e-mail ou numéro.
       L'admin lève ce verrou d'un clic depuis la fiche de la boutique. */
    const userKey = 'login-user:' + who;
    if (await blocked(env, idKey, 10) || await blocked(env, ipKey, 100) || await blocked(env, userKey, 10)) return json({ error: 'slow' }, 429);
    const password = String(body.password || '');
    let user = null;
    if (identifier.includes('@')) {
      user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(identifier.toLowerCase()).first();
    } else {
      const digits = digitsOf(identifier);
      if (digits.length >= 8) {
        user = await env.DB.prepare('SELECT * FROM users WHERE phone_digits = ?').bind(digits).first();
        if (!user) {
          const rows = await env.DB.prepare('SELECT * FROM users WHERE phone_digits LIKE ?').bind('%' + digits).all();
          const list = rows.results || [];
          if (list.length === 1) user = list[0];
        }
        if (!user) {
          const old = await env.DB.prepare('SELECT * FROM users WHERE phone_digits IS NULL').all();
          const match = (old.results || []).filter((u) => digitsOf(u.phone) === digits || digitsOf(u.phone).endsWith(digits));
          if (match.length === 1) user = match[0];
        }
      }
    }
    if (!user) {
      await tooMany(env, idKey, 10, 15 * 60000);
      await tooMany(env, ipKey, 100, 15 * 60000);
      await tooMany(env, userKey, 10, 15 * 60000);
      return json({ error: 'credentials' }, 401);
    }
    const hash = await pbkdf2(password, user.salt);
    if (!same(hash, user.pass)) {
      await tooMany(env, idKey, 10, 15 * 60000);
      await tooMany(env, ipKey, 100, 15 * 60000);
      await tooMany(env, userKey, 10, 15 * 60000);
      return json({ error: 'credentials' }, 401);
    }
    const cookie = await createSession(env, user.id);
    return json({ user: publicUser(user) }, 200, { 'set-cookie': cookie });
  }

  /* Demande de réinitialisation : un compte se retrouve par e-mail ou par
     téléphone, comme à la connexion. Un code à huit signes part par e-mail
     quand l'envoi est configuré. Sans e-mail sur le compte, la réponse le dit
     franchement et l'assistance remet le code par WhatsApp (onglet Boutiques). */
  if (path === '/api/forgot' && request.method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (await blocked(env, 'forgot:' + ip, 10)) return json({ ok: true, mail: false });
    await tooMany(env, 'forgot:' + ip, 10, 60 * 60000);
    const body = await readBody(request);
    const ident = String(body.ident || body.email || '').trim();
    let user = null;
    if (ident.includes('@')) {
      const email = ident.toLowerCase();
      if (!validEmail(email)) return json({ ok: true, mail: false });
      user = await env.DB.prepare('SELECT id, email, phone FROM users WHERE email = ?').bind(email).first();
    } else {
      /* Même tolérance qu'à la connexion : le numéro complet, ou sa fin quand
         elle ne désigne qu'un seul compte. */
      const digits = digitsOf(ident);
      if (digits.length < 8) return json({ ok: true, mail: false });
      user = await env.DB.prepare('SELECT id, email, phone FROM users WHERE phone_digits = ?').bind(digits).first();
      if (!user) {
        const rows = await env.DB.prepare('SELECT id, email, phone FROM users WHERE phone_digits LIKE ?').bind('%' + digits).all();
        const found = rows.results || [];
        if (found.length === 1) user = found[0];
      }
    }
    if (!user) return json({ ok: true, mail: false });
    /* Un compte tenu par son téléphone seulement n'a de code que si le
       fournisseur SMS est branché ; sinon l'assistance le remet à la main. */
    if (!user.email && !smsReady(env)) return json({ ok: true, mail: false, support: true });
    const last = await env.DB.prepare('SELECT created FROM reset_codes WHERE user_id = ? ORDER BY created DESC LIMIT 1').bind(user.id).first();
    if (last && Date.now() - last.created < 5 * 60000) {
      const mail = !!(user.email && env.RESEND_API_KEY);
      const sms = !!(user.phone && smsReady(env));
      return json({ ok: true, mail, sms, support: !mail && !sms });
    }
    await env.DB.prepare('DELETE FROM reset_codes WHERE user_id = ?').bind(user.id).run();
    const code = newResetCode();
    await env.DB.prepare('INSERT INTO reset_codes (code, user_id, created, expires, used) VALUES (?, ?, ?, ?, 0)')
      .bind(await sha256('reset:' + code), user.id, Date.now(), Date.now() + 30 * 60000).run();
    /* Les deux canaux partent quand ils existent : beaucoup de boutiques ont
       un e-mail saisi à l'inscription mais ne le lisent pas. */
    const mailed = user.email ? await sendResetMail(env, user.email, code, await officialBase(env, url)) : false;
    const texted = user.phone ? await sendResetSms(env, user.phone, code) : false;
    return json({ ok: true, mail: mailed, sms: texted, support: !mailed && !texted });
  }

  /* Nouveau mot de passe avec le code reçu. L'ancien lien à jeton reste
     accepté pour les e-mails déjà partis. */
  if (path === '/api/reset' && request.method === 'POST') {
    const body = await readBody(request);
    const password = String(body.password || '');
    if (!validPass(password)) return json({ error: 'password' }, 400);
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (await blocked(env, 'reset:' + ip, 20)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'reset:' + ip, 20, 60 * 60000);
    const code = normalizeResetCode(body.code);
    const token = String(body.token || '');
    const codeHash = code ? await sha256('reset:' + code) : '';
    let userId = null;
    if (code) {
      const row = await env.DB.prepare('SELECT user_id, expires, used FROM reset_codes WHERE code = ?').bind(codeHash).first();
      if (!row || row.used || row.expires < Date.now()) return json({ error: 'code' }, 400);
      userId = row.user_id;
      await env.DB.prepare('UPDATE reset_codes SET used = 1 WHERE code = ?').bind(codeHash).run();
    } else if (/^[a-f0-9]{64}$/.test(token)) {
      const tokenHash = await sha256(token);
      const row = await env.DB.prepare('SELECT user_id, expires, used FROM resets WHERE token = ?').bind(tokenHash).first();
      if (!row || row.used || row.expires < Date.now()) return json({ error: 'code' }, 400);
      userId = row.user_id;
      await env.DB.prepare('UPDATE resets SET used = 1 WHERE token = ?').bind(tokenHash).run();
    } else {
      return json({ error: 'code' }, 400);
    }
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const pass = await pbkdf2(password, salt);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pass = ?, salt = ? WHERE id = ?').bind(pass, salt, userId),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    ]);
    return json({ ok: true });
  }

  /* Vérifier le numéro du compte : un code à six chiffres par SMS. Le compte
     reste utilisable sans cette preuve ; elle sert surtout à la récupération. */
  if (path === '/api/phone/start' && request.method === 'POST') {
    const account = await currentUser(request, env);
    if (!account) return json({ error: 'auth' }, 401);
    if (!account.phone) return json({ error: 'phone' }, 400);
    if (!smsReady(env)) return json({ error: 'sms' }, 503);
    if (await blocked(env, 'phone:' + account.id, 5)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'phone:' + account.id, 5, 60 * 60000);
    /* Un code par minute au plus : deux appuis ne font pas deux SMS payants. */
    const last = await env.DB.prepare('SELECT created FROM phone_codes WHERE user_id = ?').bind(account.id).first();
    if (last && Date.now() - Number(last.created) < 60000) {
      return json({ ok: true, wait: Math.ceil((60000 - (Date.now() - Number(last.created))) / 1000) });
    }
    const sent = await issuePhoneCode(env, account.id, account.phone);
    if (!sent) return json({ error: 'send' }, 502);
    return json({ ok: true });
  }

  if (path === '/api/phone/confirm' && request.method === 'POST') {
    const account = await currentUser(request, env);
    if (!account) return json({ error: 'auth' }, 401);
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (await blocked(env, 'phonec:' + ip, 20)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'phonec:' + ip, 20, 60 * 60000);
    const body = await readBody(request);
    const code = normalizePhoneCode(body.code);
    if (code.length !== 6) return json({ error: 'code' }, 400);
    const row = await env.DB.prepare('SELECT code, expires, tries FROM phone_codes WHERE user_id = ?').bind(account.id).first();
    /* Cinq essais puis le code est brûlé : six chiffres ne se devinent pas au
       hasard, mais pas non plus en boucle. */
    if (!row || Number(row.expires) < Date.now() || Number(row.tries) >= 5) {
      await env.DB.prepare('DELETE FROM phone_codes WHERE user_id = ?').bind(account.id).run();
      return json({ error: 'code' }, 400);
    }
    if (!same(await sha256('phone:' + code), row.code)) {
      await env.DB.prepare('UPDATE phone_codes SET tries = tries + 1 WHERE user_id = ?').bind(account.id).run();
      return json({ error: 'code' }, 400);
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?').bind(account.id),
      env.DB.prepare('DELETE FROM phone_codes WHERE user_id = ?').bind(account.id),
    ]);
    return json({ ok: true, user: Object.assign({}, account, { phoneVerified: true }) });
  }

  if (path === '/api/logout' && request.method === 'POST') {
    const token = cookieOf(request, 'ac_session');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': 'ac_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  }

  /* Page de connexion de l'administration : e-mail autorisé + code commun.
     Aucun compte n'est créé, aucun mot de passe d'application n'est demandé. */
  if (path === '/api/admin/login' && request.method === 'POST') {
    const list = adminList(env);
    if (!list.length || !adminSigningKey(env)) return json({ error: 'notconfigured' }, 503);
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '');
    /* Deux verrous, pas un : l'adresse réseau et l'e-mail visé. Sans le second,
       une attaque répartie sur plusieurs adresses essaie sans fin le compte
       d'un administrateur dont l'e-mail est connu. */
    const ipKey = 'admin-login:' + ip;
    const mailKey = 'admin-mail:' + (email || 'vide');
    if (await blocked(env, ipKey, 20) || await blocked(env, mailKey, 8)) return json({ error: 'slow' }, 429);
    /* Le code est comparé par empreintes : même longueur, même temps, et
       aucune trace du vrai code dans la réponse. */
    const expectedCode = codeForAdmin(env, email);
    /* Deux serrures quand ADMIN_TOTP est posé pour cette personne : le code
       d'administration, puis les six chiffres de son téléphone — et chaque
       code à six chiffres ne sert qu'une fois. */
    const totpSecret = adminTotps(env).get(email);
    let counter = totpSecret ? await totpMatch(totpSecret, body.totp, Date.now()) : null;
    const lastCounter = totpSecret ? await totpLastUsed(env, email) : 0;
    let second = totpSecret ? counter !== null && counter > lastCounter : true;
    /* Téléphone perdu : un code de secours, à usage unique, remplace les six
       chiffres. Il n'ouvre la porte qu'une fois, puis disparaît. */
    let backup = false;
    if (totpSecret && !second) {
      backup = await useBackupCode(env, email, body.totp);
      if (backup) { second = true; counter = null; }
    }
    const ok = adminEmailOk(email, list) && !!expectedCode
      && same(await sha256(code), await sha256(expectedCode)) && second;
    if (!ok) {
      await tooMany(env, ipKey, 20, 15 * 60000);
      await tooMany(env, mailKey, 8, 15 * 60000);
      await adminLog(env, email || '—', 'login-fail', null, second ? 'code refusé' : 'code à 6 chiffres refusé');
      return json({ error: 'credentials' }, 401);
    }
    const expires = Date.now() + ADMIN_SESSION_MS;
    const token = await adminToken(env, email, expires);
    if (counter !== null) await totpRemember(env, email, counter);
    await adminLog(env, email, 'login', null, backup ? 'session ouverte · code de secours' : 'session ouverte');
    /* SameSite=Strict : le cookie d'administration ne part jamais avec une
       requête venue d'un autre site, même en simple navigation. */
    return json({ ok: true, email, expires }, 200, {
      'set-cookie': `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_SESSION_MS / 1000}`,
    });
  }

  if (path === '/api/admin/logout' && request.method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }

  const user = await currentUser(request, env);
  /* L'administration accepte son propre cookie, ou un compte connecté dont
     l'e-mail figure dans la liste. */
  const admin = path.startsWith('/api/admin/') ? await adminSession(request, env) : null;
  /* L'administration n'ouvre ses portes qu'avec son propre cookie signé. Un
     compte de l'application, même avec l'e-mail administrateur, ne suffit
     pas : une session de boutique volée ne devient jamais une session
     d'administration, et le code reste exigé à chaque nouveau poste. */
  if (path.startsWith('/api/admin/') && !admin) return json({ error: 'auth' }, 401);
  if (!user && !admin) return json({ error: 'auth' }, 401);

  /* Codes de secours : le téléphone est perdu, la session est encore ouverte.
     On en crée huit, affichés une seule fois, jamais relus ensuite. */
  if (path === '/api/admin/totp/backup' && request.method === 'POST') {
    const email = String(admin.email || '').trim().toLowerCase();
    if (!adminTotps(env).get(email)) return json({ error: 'totp' }, 400);
    const codes = await issueBackupCodes(env, email);
    await adminLog(env, email, 'totp-backup', null, `${codes.length} codes de secours créés`);
    return json({ codes, left: codes.length });
  }

  /* ---------------- tableau de bord administrateur ---------------- */
  if (path === '/api/admin/stats' && request.method === 'GET') {
    const list = adminList(env);
    if (!list.length) return json({ error: 'notconfigured' }, 503);
    if (!admin && !isAdmin(user, list)) return json({ error: 'forbidden' }, 403);
    const now = Date.now();
    const day = 86400000;
    const one = async (sql, ...args) => {
      try {
        const r = await env.DB.prepare(sql).bind(...args).first();
        return Number(r && r.n) || 0;
      } catch { return 0; }
    };
    const counts = {
      owners: await one('SELECT COUNT(*) AS n FROM users WHERE owner_id IS NULL'),
      staff: await one('SELECT COUNT(*) AS n FROM users WHERE owner_id IS NOT NULL'),
      active7: await one('SELECT COUNT(*) AS n FROM state WHERE updated > ?', now - 7 * day),
      premium: await one('SELECT COUNT(*) AS n FROM users WHERE owner_id IS NULL AND premium_until > ?', now),
      /* Premium qui se termine sous sept jours : à prévenir avant la coupure. */
      premiumSoon: await one('SELECT COUNT(*) AS n FROM users WHERE owner_id IS NULL AND premium_until > ? AND premium_until < ?', now, now + 7 * day),
      newToday: await one('SELECT COUNT(*) AS n FROM users WHERE owner_id IS NULL AND created > ?', now - day),
      new7: await one('SELECT COUNT(*) AS n FROM users WHERE owner_id IS NULL AND created > ?', now - 7 * day),
      sales: await one("SELECT COALESCE(SUM(json_array_length(json_extract(json,'$.sales'))), 0) AS n FROM state"),
      docs: await one("SELECT COALESCE(SUM(json_array_length(json_extract(json,'$.docs'))), 0) AS n FROM state"),
    };
    /* Inscriptions des quatorze derniers jours : une barre par jour. */
    const signupRows = await env.DB.prepare('SELECT created FROM users WHERE owner_id IS NULL AND created > ?').bind(now - 13 * day).all();
    const byDay = new Map();
    for (let i = 13; i >= 0; i -= 1) byDay.set(new Date(now - i * day).toISOString().slice(0, 10), 0);
    for (const r of signupRows.results || []) {
      const key = new Date(Number(r.created) || 0).toISOString().slice(0, 10);
      if (byDay.has(key)) byDay.set(key, byDay.get(key) + 1);
    }
    const signups = [...byDay.entries()].map(([d, n]) => ({ day: d, n }));
    const countryRows = await env.DB.prepare(
      "SELECT COALESCE(NULLIF(json_extract(s.json,'$.settings.country'), ''), '—') AS country, COUNT(*) AS n FROM state s GROUP BY country ORDER BY n DESC LIMIT 15",
    ).all().catch(() => ({ results: [] }));
    const channelRows = await env.DB.prepare('SELECT src, SUM(hits) AS n FROM installs GROUP BY src ORDER BY n DESC LIMIT 10').all();
    /* Comptes encore bloqués : l'écran doit pouvoir le dire et proposer le
       déblocage, sans fouiller la base. */
    const throttleRows = await env.DB.prepare('SELECT key FROM throttle WHERE reset > ? LIMIT 400').bind(now).all().catch(() => ({ results: [] }));
    const lockedKeys = (throttleRows.results || []).map((r) => String(r.key));
    const isLocked = (email, phone) => {
      const mail = String(email || '').trim().toLowerCase();
      const digits = digitsOf(phone || '');
      return lockedKeys.some((k) => (mail && k.includes(mail)) || (digits.length >= 8 && k.includes(digits)));
    };
    const reminderRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'premiumRemindedOn'").first().catch(() => null);
    const shops = await env.DB.prepare(
      `SELECT u.id, u.email, u.phone, u.phone_verified, u.name, u.created, u.src, u.premium_until,
        COALESCE(json_extract(s.json,'$.shop'), '') AS shop,
        COALESCE(json_extract(s.json,'$.settings.country'), '') AS country,
        s.updated, COALESCE(json_array_length(json_extract(s.json,'$.sales')), 0) AS sales,
        COALESCE(json_array_length(json_extract(s.json,'$.docs')), 0) AS docs
       FROM users u LEFT JOIN state s ON s.user_id = u.id
       WHERE u.owner_id IS NULL ORDER BY u.created DESC LIMIT 100`,
    ).all();
    /* Codes de secours restants pour la personne connectée : pour qu'elle en
       recrée avant de perdre son téléphone, pas après. */
    const backupLeft = admin ? await backupCodesLeft(env, admin.email) : 0;
    const backupOn = !!(admin && adminTotps(env).get(String(admin.email || '').trim().toLowerCase()));
    return json({
      counts: {
        ...counts,
        locked: (shops.results || []).filter((r) => isLocked(r.email, r.phone)).length,
        pendingPayments: await one("SELECT COUNT(*) AS n FROM payments WHERE status = 'pending'"),
        stalePayments: await one("SELECT COUNT(*) AS n FROM payments WHERE status = 'pending' AND created < ?", now - 86400000),
      },
      signups,
      countries: (countryRows.results || []).map((r) => ({ country: String(r.country || '—'), n: Number(r.n) || 0 })),
      channels: (channelRows.results || []).map((r) => ({ src: String(r.src || 'direct'), n: Number(r.n) || 0 })),
      shops: (shops.results || []).map((r) => ({
        id: String(r.id), shop: String(r.shop || ''), email: r.email || null, phone: r.phone || null,
        name: r.name || null, country: String(r.country || ''), created: Number(r.created) || 0,
        updated: Number(r.updated) || 0, sales: Number(r.sales) || 0, docs: Number(r.docs) || 0,
        premiumUntil: Number(r.premium_until) || 0, src: String(r.src || ''),
        phoneVerified: !!Number(r.phone_verified),
        locked: isLocked(r.email, r.phone),
      })),
      config: await readConfig(env),
      /* Dernier jour où les rappels J-7 ont tourné : visible pour savoir si
         l'envoi automatique est vivant. */
      reminderDay: reminderRow ? String(reminderRow.value || '') : '',
      /* L'envoi d'e-mails dépend d'un secret, pas d'un réglage : l'admin voit
         s'il est actif, jamais sa valeur. */
      mail: !!env.RESEND_API_KEY,
      /* SMS de récupération : le fournisseur se branche par secrets, comme
         l'e-mail. L'admin voit s'il est actif, jamais sa valeur. */
      sms: smsReady(env),
      /* Session en cours : l'écran affiche l'e-mail et l'heure de fin, pour
         qu'un poste laissé ouvert se voie avant de surprendre. */
      admin: admin ? { email: admin.email, expires: admin.expires } : null,
      /* Ce qui est branché, jamais la valeur des secrets. */
      totpBackup: { active: backupOn, left: backupLeft },
      hooks: {
        pay: !!env.PAY_HOOK_SECRET,
        card: !!env.STRIPE_SECRET_KEY,
        totp: adminTotps(env).size,
        mail: !!env.RESEND_API_KEY,
        sms: smsReady(env),
      },
    });
  }

  /* Essai de SMS depuis l'administration : le seul moyen de savoir que la
     clé Sent est bonne sans attendre qu'un commerçant perde son mot de passe. */
  if (path === '/api/admin/sms-test' && request.method === 'POST') {
    if (!admin) return json({ error: 'forbidden' }, 403);
    if (!smsReady(env)) return json({ error: 'sms' }, 503);
    if (await blocked(env, 'adms:' + admin.email, 5)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'adms:' + admin.email, 5, 60 * 60000);
    const body = await readBody(request);
    const to = String(body.to || '').trim();
    if (!validPhone(to)) return json({ error: 'phone' }, 400);
    const sent = await sendSms(env, to, "Assistant Commercial : essai de SMS depuis l'administration. Si ce message arrive, le fournisseur est bien branché.");
    await adminLog(env, admin.email, 'config', 'sms', sent ? 'essai réussi' : 'essai échoué');
    return json({ ok: sent }, sent ? 200 : 502);
  }

  /* Code de réinitialisation remis à la main : l'assistance le lit par
     téléphone ou l'envoie sur WhatsApp quand le commerçant n'a pas d'e-mail. */
  if (path === '/api/admin/reset-code' && request.method === 'POST') {
    const list = adminList(env);
    if (!list.length) return json({ error: 'notconfigured' }, 503);
    if (!admin && !isAdmin(user, list)) return json({ error: 'forbidden' }, 403);
    if (await blocked(env, 'adreset:' + (admin ? admin.email : user.id), 40)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'adreset:' + (admin ? admin.email : user.id), 40, 60 * 60000);
    const body = await readBody(request);
    const id = String(body.id || '');
    const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (!target) return json({ error: 'user' }, 404);
    const code = newResetCode();
    const expires = Date.now() + 30 * 60000;
    await env.DB.prepare('DELETE FROM reset_codes WHERE user_id = ?').bind(target.id).run();
    await env.DB.prepare('INSERT INTO reset_codes (code, user_id, created, expires, used) VALUES (?, ?, ?, ?, 0)')
      .bind(await sha256('reset:' + code), target.id, Date.now(), expires).run();
    await adminLog(env, admin.email, 'reset-code', target.id, 'code de passe créé');
    return json({ code, expires });
  }

  /* Premium : le patron offre des mois à une boutique, ou les retire. */
  if (path === '/api/admin/premium' && request.method === 'POST') {
    const list = adminList(env);
    if (!list.length) return json({ error: 'notconfigured' }, 503);
    if (!admin && !isAdmin(user, list)) return json({ error: 'forbidden' }, 403);
    const body = await readBody(request);
    const id = String(body.id || '');
    const months = Math.max(0, Math.min(24, Math.round(Number(body.months) || 0)));
    const row = await env.DB.prepare('SELECT premium_until FROM users WHERE id = ? AND owner_id IS NULL').bind(id).first();
    if (!row) return json({ error: 'notfound' }, 404);
    const current = Number(row.premium_until) || 0;
    const until = months ? Math.max(Date.now(), current) + months * 30 * 86400000 : 0;
    await env.DB.prepare('UPDATE users SET premium_until = ?, premium_reminded = 0 WHERE id = ?').bind(until, id).run();
    await adminLog(env, admin.email, 'premium', id, months ? `+${months} mois` : 'Premium retiré');
    return json({ premiumUntil: until });
  }

  /* Codes d'activation : l'admin en crée un après paiement, le commerçant le
     saisit dans l'application et son mois s'ouvre immédiatement. */
  if (path === '/api/admin/codes' && request.method === 'GET') {
    const list = adminList(env);
    if (!list.length) return json({ error: 'notconfigured' }, 503);
    if (!admin && !isAdmin(user, list)) return json({ error: 'forbidden' }, 403);
    const rows = await env.DB.prepare(
      `SELECT c.code, c.months, c.created, c.expires, c.for_user, u.email, u.phone
       FROM premium_codes c LEFT JOIN users u ON u.id = c.for_user
       WHERE c.used = 0 ORDER BY c.created DESC LIMIT 60`,
    ).all();
    const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM premium_codes WHERE used = 1').first();
    /* Qui a activé quoi : le code, les mois, la boutique et le compte. Utile
       pour retrouver un paiement, jamais pour autre chose. */
    const history = await env.DB.prepare(
      `SELECT c.code, c.months, c.used_at, u.email, u.phone, u.name,
        COALESCE(json_extract(s.json,'$.shop'), '') AS shop
       FROM premium_codes c JOIN users u ON u.id = c.used_by
       LEFT JOIN state s ON s.user_id = u.id
       WHERE c.used = 1 ORDER BY c.used_at DESC LIMIT 30`,
    ).all().catch(() => ({ results: [] }));
    return json({
      codes: (rows.results || []).map((r) => ({
        code: String(r.code), months: Number(r.months) || 1,
        created: Number(r.created) || 0, expires: Number(r.expires) || 0,
        forUser: r.for_user ? String(r.for_user) : null,
        for: r.email || r.phone || '',
      })),
      used: Number(used && used.n) || 0,
      history: (history.results || []).map((r) => ({
        code: String(r.code), months: Number(r.months) || 1, usedAt: Number(r.used_at) || 0,
        email: r.email || null, phone: r.phone || null, name: r.name || null, shop: String(r.shop || ''),
      })),
    });
  }

  if (path === '/api/admin/codes' && request.method === 'POST') {
    const list = adminList(env);
    if (!list.length) return json({ error: 'notconfigured' }, 503);
    if (!admin && !isAdmin(user, list)) return json({ error: 'forbidden' }, 403);
    const body = await readBody(request);
    const months = Math.max(1, Math.min(12, Math.round(Number(body.months) || 1)));
    const days = Math.max(1, Math.min(365, Math.round(Number(body.days) || 30)));
    /* Code nominatif : réservé à une boutique, donc un seul à la fois. */
    const forUser = String(body.userId || '').trim();
    let target = null;
    if (forUser) {
      target = await env.DB.prepare('SELECT id, email, phone FROM users WHERE id = ?').bind(forUser).first();
      if (!target) return json({ error: 'user' }, 404);
    }
    /* Par lot : une promotion, un revendeur ou une école demandent plusieurs
       codes d'un coup. Cinquante au maximum, pour ne pas noyer la liste. */
    const count = target ? 1 : Math.max(1, Math.min(50, Math.round(Number(body.count) || 1)));
    const expires = Date.now() + days * 86400000;
    const codes = [];
    for (let i = 0; i < count; i += 1) {
      const made = await createPremiumCode(env, months, expires, target ? target.id : null);
      if (!made) return json({ error: 'server', codes }, 500);
      codes.push(made);
    }
    await adminLog(env, admin.email, 'codes', target ? (target.email || target.phone || target.id) : null,
      `${codes.length} code(s) · ${months} mois${target ? ' · nominatif' : ''}`);
    /* « code » reste renvoyé pour l'ancien écran ; « codes » porte le lot. */
    return json({ codes, code: codes[0], months, expires });
  }

  /* Publicité commune : activée pour l'application, avec l'identifiant AdSense
     et les deux emplacements. Une valeur vide désactive tout. */
  if (path === '/api/admin/config' && request.method === 'POST') {
    const list = adminList(env);
    if (!list.length) return json({ error: 'notconfigured' }, 503);
    if (!admin && !isAdmin(user, list)) return json({ error: 'forbidden' }, 403);
    const body = await readBody(request);
    const client = String(body.adsClient || '').trim();
    const top = String(body.adsTop || '').trim();
    const bottom = String(body.adsBottom || '').trim();
    /* Le numéro du support part tel quel vers wa.me : uniquement des chiffres,
       indicatif compris, sinon le bouton enverrait vers un lien cassé. */
    const supportWa = digitsOf(body.supportWa).slice(0, 15);
    if (String(body.supportWa || '').trim() && !validSupportWa(body.supportWa)) return json({ error: 'support' }, 400);
    /* Adresse de repli : sert seulement à ouvrir un e-mail prérempli. */
    const supportMail = String(body.supportMail || '').trim().toLowerCase();
    if (supportMail && !validEmail(supportMail)) return json({ error: 'support' }, 400);
    if (client && !ADMIN_REF.test(client)) return json({ error: 'client' }, 400);
    if (top && !ADMIN_SLOT.test(top)) return json({ error: 'slot' }, 400);
    if (bottom && !ADMIN_SLOT.test(bottom)) return json({ error: 'slot' }, 400);
    /* Un seul lien officiel : https, sans espace. Sert aux e-mails, aux liens
       de facture et aux partages, même si l'application répond ailleurs. */
    const officialUrl = String(body.officialUrl || '').trim().replace(/\/+$/, '');
    if (officialUrl && !OFFICIAL_URL_RE.test(officialUrl)) return json({ error: 'url' }, 400);
    /* Encaissement du Premium : mêmes règles que le support, des chiffres et
       un prix en francs entiers. */
    if (String(body.payWave || '').trim() && !validSupportWa(body.payWave)) return json({ error: 'pay' }, 400);
    if (String(body.payOm || '').trim() && !validSupportWa(body.payOm)) return json({ error: 'pay' }, 400);
    const priceMonth = Math.max(0, Math.min(1000000, Math.round(Number(body.priceMonth) || 0)));
    /* Seuil du second accord : un montant en francs, jamais négatif. */
    const paySeuil = Math.max(0, Math.min(10000000, Math.round(Number(body.paySeuil) || 0)));
    const cfg = {
      ads: !!body.ads && !!client, adsClient: client, adsTop: top, adsBottom: bottom, supportWa, supportMail, officialUrl,
      payWave: digitsOf(body.payWave).slice(0, 15), payOm: digitsOf(body.payOm).slice(0, 15), priceMonth, paySeuil,
    };
    await saveConfig(env, cfg);
    await adminLog(env, admin.email, 'config', 'réglages', `prix ${priceMonth} FCFA · wave ${cfg.payWave || '—'} · om ${cfg.payOm || '—'}${paySeuil ? ' · 2 accords dès ' + paySeuil + ' FCFA' : ''}`);
    return json({ ok: true, config: cfg });
  }

  /* Journal d'administration : qui a offert un mois, changé un réglage,
     débloqué un compte. Lecture seule, la plus récente en tête. */
  if (path === '/api/admin/log' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT at, actor, action, target, detail FROM admin_log ORDER BY id DESC LIMIT 100').all();
    return json({
      entries: (rows.results || []).map((r) => ({
        at: Number(r.at) || 0, actor: String(r.actor || ''), action: String(r.action || ''),
        target: r.target ? String(r.target) : '', detail: r.detail ? String(r.detail) : '',
      })),
    });
  }

  /* Débloquer un compte sans attendre la fin du verrou : on efface les
     compteurs d'essais qui portent son e-mail ou son numéro. */
  if (path === '/api/admin/unlock' && request.method === 'POST') {
    const body = await readBody(request);
    const target = await env.DB.prepare('SELECT id, email, phone FROM users WHERE id = ?').bind(String(body.id || '')).first();
    if (!target) return json({ error: 'user' }, 404);
    const patterns = unlockPatterns(target.email, target.phone);
    if (!patterns.length) return json({ error: 'user' }, 404);
    const res = await env.DB.prepare(`DELETE FROM throttle WHERE ${patterns.map(() => 'key LIKE ?').join(' OR ')}`).bind(...patterns).run();
    const freed = Number((res.meta && res.meta.changes) || 0);
    const who = String(target.email || '').trim().toLowerCase() || digitsOf(target.phone || '');
    await adminLog(env, admin.email, 'unlock', who, `${freed} compteur(s) effacé(s)`);
    return json({ ok: true, freed });
  }

  /* Paiements : les demandes Wave / Orange Money en attente, et les dernières
     lignes réglées. La validation est le seul geste qui ouvre un mois. */
  if (path === '/api/admin/payments' && request.method === 'GET') {
    /* Les demandes sans transfert n'encombrent plus la liste, celles qui vont
       expirer sont signalées et les accords oubliés relancés. */
    await sweepPayments(env);
    const rows = await env.DB.prepare(
      `SELECT p.id, p.ref, p.months, p.amount, p.method, p.status, p.created, p.paid_at, p.actor, p.note, p.notified,
        u.email, u.phone, COALESCE(json_extract(s.json,'$.shop'), '') AS shop
       FROM payments p LEFT JOIN users u ON u.id = p.user_id LEFT JOIN state s ON s.user_id = p.user_id
       ORDER BY p.created DESC LIMIT 40`,
    ).all().catch(() => ({ results: [] }));
    /* Premier accord déjà donné, en attente d'un second regard. */
    const apprRows = await env.DB.prepare("SELECT key, value FROM app_config WHERE key LIKE 'payok:%'").all().catch(() => ({ results: [] }));
    const approved = new Map();
    for (const r of apprRows.results || []) {
      try {
        const v = JSON.parse(String(r.value));
        if (v && v.by) approved.set(String(r.key).slice(6), { by: String(v.by), at: Number(v.at) || 0 });
      } catch { /* ligne illisible : ignorée */ }
    }
    return json({
      payments: (rows.results || []).map((r) => ({
        id: String(r.id), ref: String(r.ref || ''), months: Number(r.months) || 1, amount: Number(r.amount) || 0,
        method: String(r.method || ''), status: String(r.status || ''), created: Number(r.created) || 0,
        paidAt: Number(r.paid_at) || 0, actor: r.actor || null, note: r.note || null, notified: Number(r.notified) || 0,
        email: r.email || null, phone: r.phone || null, shop: String(r.shop || ''),
        approvedBy: (approved.get(String(r.id)) || {}).by || null,
        approvedAt: (approved.get(String(r.id)) || {}).at || 0,
      })),
    });
  }

  if (path === '/api/admin/payment' && request.method === 'POST') {
    const body = await readBody(request);
    const id = String(body.id || '');
    const pay = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first();
    if (!pay) return json({ error: 'notfound' }, 404);
    /* Expirée : la boutique doit en créer une nouvelle, rien ne se rouvre. */
    if (pay.status === 'expired') return json({ error: 'expired' }, 409);
    /* Déjà réglée ou refusée : le dire clairement, sans rien rouvrir. */
    if (pay.status !== 'pending') return json({ error: 'done' }, 409);
    const target = await env.DB.prepare('SELECT id, email, phone, premium_until FROM users WHERE id = ?').bind(pay.user_id).first();
    if (!target) return json({ error: 'user' }, 404);
    const note = String(body.note || '').slice(0, 120) || null;
    const label = target.email || target.phone || target.id;
    if (body.ok) {
      /* Garde : l'admin recopie la référence affichée. Sans elle, un clic
         rapide sur la mauvaise ligne ouvrirait le mois d'une autre boutique.
         Une demande de plus de trente jours n'ouvre qu'après confirmation. */
      const ref = String(body.ref || '').trim().toUpperCase();
      if (ref !== String(pay.ref).toUpperCase()) return json({ error: 'ref' }, 409);
      if (!(Number(pay.amount) > 0)) return json({ error: 'amount' }, 409);
      if (!body.force && Date.now() - (Number(pay.created) || 0) > 30 * 86400000) return json({ error: 'old' }, 409);
      /* Deux regards au-delà d'un seuil : le premier administrateur enregistre
         son accord, un autre doit confirmer. Un même compte ne signe jamais
         les deux fois. */
      const cfg = await readConfig(env);
      const seuil = Math.max(0, Math.round(Number(cfg.paySeuil) || 0));
      const apprKey = 'payok:' + id;
      let firstBy = '';
      if (seuil && Number(pay.amount) >= seuil) {
        const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind(apprKey).first().catch(() => null);
        try { firstBy = row ? String((JSON.parse(String(row.value)) || {}).by || '') : ''; } catch { firstBy = ''; }
        if (!firstBy) {
          await env.DB.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(apprKey, JSON.stringify({ by: admin.email, at: Date.now() })).run();
          await adminLog(env, admin.email, 'payment-first', label, `${pay.amount} FCFA · ${pay.ref} · attend un second accord`);
          return json({ ok: false, need: 'second', first: admin.email, seuil });
        }
        if (firstBy === admin.email) return json({ error: 'self' }, 409);
      }
      const months = Math.max(1, Number(pay.months) || 1);
      /* Le statut est changé en premier et sous condition : deux clics
         simultanés n'ouvrent qu'un mois. */
      const claim = await env.DB.prepare("UPDATE payments SET status = 'paid', paid_at = ?, actor = ?, note = ? WHERE id = ? AND status = 'pending'")
        .bind(Date.now(), admin.email, note, id).run();
      if (!claim.meta || !claim.meta.changes) return json({ error: 'done' }, 409);
      if (firstBy) await env.DB.prepare('DELETE FROM app_config WHERE key = ?').bind(apprKey).run().catch(() => {});
      await env.DB.prepare('UPDATE users SET premium_until = MAX(?, COALESCE(premium_until, 0)) + ?, premium_reminded = 0 WHERE id = ?')
        .bind(Date.now(), months * PREMIUM_MONTH_MS, target.id).run();
      const fresh = await env.DB.prepare('SELECT premium_until FROM users WHERE id = ?').bind(target.id).first();
      const until = Number(fresh && fresh.premium_until) || 0;
      const who = await env.DB.prepare("SELECT COALESCE(json_extract(s.json,'$.shop'), '') AS shop FROM state s WHERE s.user_id = ?").bind(target.id).first();
      const mailed = await sendReceiptMail(env, target.email, { shop: String((who && who.shop) || ''), months, amount: Number(pay.amount) || 0, ref: pay.ref, until });
      await adminLog(env, admin.email, 'payment', label, `${months} mois · ${pay.amount} FCFA · ${pay.ref}${firstBy ? ' · 2 regards (' + firstBy + ')' : ''}${mailed ? ' · reçu envoyé' : ''}`);
      return json({ ok: true, premiumUntil: until, mail: mailed });
    }
    await env.DB.prepare("UPDATE payments SET status = 'rejected', actor = ?, note = ? WHERE id = ?").bind(admin.email, note, id).run();
    await env.DB.prepare('DELETE FROM app_config WHERE key = ?').bind('payok:' + id).run().catch(() => {});
    await adminLog(env, admin.email, 'payment-reject', label, `${pay.ref}${note ? ' · ' + note : ''}`);
    return json({ ok: true });
  }

  /* Remboursement : le mois retiré, la ligne gardée en « refunded ». On ne
     supprime jamais un paiement — une comptabilité se relit. */
  if (path === '/api/admin/refund' && request.method === 'POST') {
    const body = await readBody(request);
    const id = String(body.id || '');
    const pay = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(id).first();
    if (!pay) return json({ error: 'notfound' }, 404);
    if (pay.status === 'refunded') return json({ error: 'done' }, 409);
    if (pay.status !== 'paid') return json({ error: 'unpaid' }, 409);
    const claim = await env.DB.prepare("UPDATE payments SET status = 'refunded', note = ? WHERE id = ? AND status = 'paid'")
      .bind(String(body.note || '').slice(0, 120) || 'remboursé', id).run();
    if (!claim.meta || !claim.meta.changes) return json({ error: 'done' }, 409);
    const months = Math.max(1, Number(pay.months) || 1);
    await env.DB.prepare('UPDATE users SET premium_until = MAX(?, COALESCE(premium_until, 0) - ?) WHERE id = ?')
      .bind(Date.now(), months * PREMIUM_MONTH_MS, pay.user_id).run();
    const fresh = await env.DB.prepare('SELECT premium_until, email, phone FROM users WHERE id = ?').bind(pay.user_id).first();
    const until = Number(fresh && fresh.premium_until) || 0;
    await adminLog(env, admin.email, 'refund', (fresh && (fresh.email || fresh.phone)) || pay.user_id, `${months} mois retirés · ${pay.ref}`);
    return json({ ok: true, premiumUntil: until });
  }

  /* Relance à la main d'une demande en attente : e-mail si possible, et le
     lien WhatsApp pour que le support double le message. */
  if (path === '/api/admin/payment-remind' && request.method === 'POST') {
    const body = await readBody(request);
    const pay = await env.DB.prepare("SELECT * FROM payments WHERE id = ? AND status = 'pending'").bind(String(body.id || '')).first();
    if (!pay) return json({ error: 'notfound' }, 404);
    const u = await env.DB.prepare('SELECT email, phone FROM users WHERE id = ?').bind(pay.user_id).first();
    const text = `Bonjour,\n\nVotre demande Premium ${pay.ref} (${pay.months} mois, ${pay.amount} FCFA) est toujours en attente.\n\nSi vous avez déjà transféré, envoyez-nous la preuve sur WhatsApp. Sinon, vous pouvez annuler et recommencer depuis l'application.`;
    const mailed = await sendTextMail(env, u && u.email, 'Assistant Commercial : paiement en attente', text);
    await env.DB.prepare('UPDATE payments SET notified = 1 WHERE id = ?').bind(pay.id).run();
    await adminLog(env, admin.email, 'payment-remind', (u && (u.email || u.phone)) || pay.user_id, `${pay.ref}${mailed ? ' · e-mail envoyé' : ' · e-mail indisponible'}`);
    return json({ ok: true, mail: mailed, message: text, phone: digitsOf(u && u.phone) });
  }

  /* Export comptable : deux fichiers, paiements et journal. Le BOM et les
     guillemets sont posés dans csvOf pour qu'Excel ne casse rien. */
  if (path === '/api/admin/export' && request.method === 'GET') {
    const kind = url.searchParams.get('type') === 'log' ? 'log' : 'payments';
    /* Un export sort des données personnelles du serveur : il laisse une
       trace, écrite avant la lecture pour figurer dans le fichier du journal. */
    await adminLog(env, admin.email, 'export', kind === 'log' ? 'journal' : 'paiements', 'CSV téléchargé');
    let rows;
    let name;
    if (kind === 'log') {
      const r = await env.DB.prepare('SELECT at, actor, action, target, detail FROM admin_log ORDER BY id DESC LIMIT 5000').all();
      rows = [['date', 'acteur', 'action', 'cible', 'detail']];
      for (const x of r.results || []) rows.push([new Date(Number(x.at) || 0).toISOString(), x.actor, x.action, x.target || '', x.detail || '']);
      name = 'journal-admin.csv';
    } else {
      const r = await env.DB.prepare(
        `SELECT p.ref, p.created, p.paid_at, p.status, p.method, p.months, p.amount, p.actor, p.note, u.email, u.phone
         FROM payments p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created DESC LIMIT 5000`,
      ).all();
      rows = [['reference', 'cree_le', 'paye_le', 'statut', 'moyen', 'mois', 'montant_fcfa', 'acteur', 'note', 'email', 'telephone']];
      for (const x of r.results || []) {
        rows.push([
          x.ref, x.created ? new Date(Number(x.created)).toISOString() : '', x.paid_at ? new Date(Number(x.paid_at)).toISOString() : '',
          x.status, x.method, x.months, x.amount, x.actor || '', x.note || '', x.email || '', x.phone || '',
        ]);
      }
      name = 'paiements.csv';
    }
    return new Response(csvOf(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name}"`,
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
      },
    });
  }

  /* Purge : au-delà de treize mois, les paiements réglés et le journal
     s'effacent. Une demande encore en attente n'est jamais supprimée. */
  if (path === '/api/admin/purge' && request.method === 'POST') {
    const cutoff = Date.now() - 400 * 86400000;
    const a = await env.DB.prepare("DELETE FROM payments WHERE created < ? AND status <> 'pending'").bind(cutoff).run();
    const b = await env.DB.prepare('DELETE FROM admin_log WHERE at < ?').bind(cutoff).run();
    await env.DB.prepare("DELETE FROM app_config WHERE key LIKE 'payok:%' AND substr(key, 7) NOT IN (SELECT id FROM payments WHERE status = 'pending')").run().catch(() => {});
    const pays = Number((a.meta && a.meta.changes) || 0);
    const lines = Number((b.meta && b.meta.changes) || 0);
    await adminLog(env, admin.email, 'purge', null, `${pays} paiement(s) · ${lines} ligne(s) de journal`);
    return json({ ok: true, payments: pays, log: lines });
  }

  /* D'où viennent les installations : agregat par canal, sans aucune donnée
     personnelle. Sert à juger un flyer ou une radio, pas à suivre les gens. */
  if (path === '/api/installs' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT src, SUM(hits) AS n FROM installs GROUP BY src ORDER BY n DESC LIMIT 20').all();
    return json({ sources: (rows.results || []).map((r) => ({ src: String(r.src), n: Number(r.n) || 0 })) });
  }

  /* Parrainage : un code court par boutique, créé ici la première fois, et le
     nombre de commerçants installés par son lien. Aucun nom, aucun compte
     n'est renvoyé : le parrain voit seulement combien sont venus. */
  if (path === '/api/referral' && request.method === 'GET') {
    const owner = dataOwner(user);
    const row = await env.DB.prepare('SELECT ref_code FROM users WHERE id = ?').bind(owner).first();
    let code = row ? String(row.ref_code || '') : '';
    for (let i = 0; i < 6 && !code; i += 1) {
      const tryCode = newRefCode();
      const taken = await env.DB.prepare('SELECT id FROM users WHERE ref_code = ?').bind(tryCode).first();
      if (taken) continue;
      await env.DB.prepare('UPDATE users SET ref_code = ? WHERE id = ?').bind(tryCode, owner).run();
      code = tryCode;
    }
    if (!code) return json({ error: 'server' }, 500);
    const n = await env.DB.prepare('SELECT COALESCE(SUM(hits), 0) AS n FROM installs WHERE src = ?').bind(refSrc(code)).first();
    return json({ code, count: Number(n && n.n) || 0 });
  }

  /* Activation Premium par code : réservée au patron (un vendeur ne modifie
     pas l'abonnement de la boutique), un code ne sert qu'une fois, et deux
     essais simultanés ne peuvent pas ouvrir deux fois le même mois. */
  if (path === '/api/premium/redeem' && request.method === 'POST') {
    if (user.ownerId) return json({ error: 'owner' }, 403);
    if (await blocked(env, 'redeem:' + user.id, 10)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'redeem:' + user.id, 10, 15 * 60000);
    const body = await readBody(request);
    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(code)) return json({ error: 'code' }, 404);
    const found = await env.DB.prepare('SELECT months, expires, for_user FROM premium_codes WHERE code = ? AND used = 0').bind(code).first();
    if (!found) return json({ error: 'code' }, 404);
    if (codeExpired(found.expires)) return json({ error: 'expired' }, 410);
    /* Code nominatif : il ne sert qu'à la boutique pour laquelle il a été créé,
       même si quelqu'un d'autre l'a lu par-dessus une épaule. */
    if (found.for_user && found.for_user !== user.id) return json({ error: 'other' }, 403);
    const months = Math.max(1, Math.min(12, Number(found.months) || 1));
    const take = await env.DB.prepare('UPDATE premium_codes SET used = 1, used_by = ?, used_at = ? WHERE code = ? AND used = 0')
      .bind(user.id, Date.now(), code).run();
    if (!take.meta || !take.meta.changes) return json({ error: 'code' }, 404);
    /* MAX(...) en SQL : deux codes saisis en même temps s'additionnent au lieu
       de s'écraser. */
    await env.DB.prepare('UPDATE users SET premium_until = MAX(?, COALESCE(premium_until, 0)) + ?, premium_reminded = 0 WHERE id = ?')
      .bind(Date.now(), months * PREMIUM_MONTH_MS, user.id).run();
    const fresh = await env.DB.prepare('SELECT premium_until FROM users WHERE id = ?').bind(user.id).first();
    const until = Number(fresh && fresh.premium_until) || 0;
    await adminLog(env, 'code', 'redeem', user.email || user.phone || user.id, `${months} mois · ${code}`);
    return json({ ok: true, months, premiumUntil: until, user: publicUser({ ...user, premiumUntil: until }) });
  }

  /* Paiement Wave / Orange Money : le serveur donne une référence que le
     commerçant écrit dans son transfert. L'admin valide, le mois s'ouvre.
     Aucun montant n'est cru sur parole : c'est le numéro du support qui
     encaisse, et la validation se fait à la main. */
  if (path === '/api/premium/request' && request.method === 'POST') {
    if (user.ownerId) return json({ error: 'owner' }, 403);
    const cfg = await readConfig(env);
    if (!cfg.priceMonth) return json({ error: 'price' }, 400);
    const body = await readBody(request);
    const months = Math.max(1, Math.min(12, Math.round(Number(body.months) || 1)));
    const method = body.method === 'om' ? 'om' : body.method === 'wave' ? 'wave' : '';
    if (!method) return json({ error: 'method' }, 400);
    if (method === 'wave' && !cfg.payWave) return json({ error: 'method' }, 400);
    if (method === 'om' && !cfg.payOm) return json({ error: 'method' }, 400);
    if (await blocked(env, 'pay:' + user.id, 10)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'pay:' + user.id, 10, 60 * 60000);
    /* Une seule demande en attente par formule et par moyen : un double clic
       ne crée pas deux lignes à valider. */
    const existing = await env.DB.prepare(
      "SELECT id, ref, amount, months FROM payments WHERE user_id = ? AND status = 'pending' AND method = ? AND months = ? AND created > ? ORDER BY created DESC LIMIT 1",
    ).bind(user.id, method, months, Date.now() - 86400000).first();
    if (existing) {
      return json({
        id: String(existing.id), ref: String(existing.ref), amount: Number(existing.amount) || 0, months,
        method, number: method === 'wave' ? cfg.payWave : cfg.payOm, supportWa: cfg.supportWa,
      });
    }
    const id = crypto.randomUUID();
    const ref = 'AC-' + newRefCode();
    const amount = cfg.priceMonth * months;
    await env.DB.prepare('INSERT INTO payments (id, ref, user_id, months, amount, method, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ref, user.id, months, amount, method, 'pending', Date.now()).run();
    await adminLog(env, 'boutique', 'pay-request', user.email || user.phone || user.id, `${months} mois · ${method} · ${ref}`);
    return json({ id, ref, amount, months, method, number: method === 'wave' ? cfg.payWave : cfg.payOm, supportWa: cfg.supportWa });
  }

  /* Demande en attente côté commerçant : il voit sa référence et peut
     l'annuler s'il s'est trompé de moyen ou de durée. */
  if (path === '/api/premium/request' && request.method === 'GET') {
    /* Une demande trop vieille disparaît, une qui va expirer est signalée. */
    await sweepPayments(env);
    const row = await env.DB.prepare(
      "SELECT id, ref, months, amount, method, created FROM payments WHERE user_id = ? AND status = 'pending' ORDER BY created DESC LIMIT 1",
    ).bind(user.id).first();
    const cfg = await readConfig(env);
    if (!row) return json({ pending: null, supportWa: cfg.supportWa });
    return json({
      pending: {
        id: String(row.id), ref: String(row.ref), months: Number(row.months) || 1,
        amount: Number(row.amount) || 0, method: String(row.method || ''),
        created: Number(row.created) || 0,
        number: row.method === 'wave' ? cfg.payWave : cfg.payOm,
      },
      supportWa: cfg.supportWa,
    });
  }

  if (path === '/api/premium/request/cancel' && request.method === 'POST') {
    const body = await readBody(request);
    const id = String(body.id || '');
    const row = await env.DB.prepare("SELECT id, ref FROM payments WHERE id = ? AND user_id = ? AND status = 'pending'")
      .bind(id, user.id).first();
    if (!row) return json({ error: 'notfound' }, 404);
    const done = await env.DB.prepare("UPDATE payments SET status = 'cancelled', note = 'annulée par la boutique' WHERE id = ? AND status = 'pending'").bind(row.id).run();
    if (!done.meta || !done.meta.changes) return json({ error: 'notfound' }, 404);
    await adminLog(env, 'boutique', 'request-cancel', user.email || user.phone || user.id, String(row.ref));
    return json({ ok: true });
  }

  /* Carte bancaire : Stripe ouvre sa page de paiement, le webhook confirme.
     Sans clé, l'écran propose les autres moyens plutôt qu'un bouton mort. */
  if (path === '/api/stripe/checkout' && request.method === 'POST') {
    if (user.ownerId) return json({ error: 'owner' }, 403);
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'card' }, 503);
    if (await blocked(env, 'checkout:' + user.id, 10)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'checkout:' + user.id, 10, 60 * 60000);
    const cfg = await readConfig(env);
    if (!cfg.priceMonth) return json({ error: 'price' }, 400);
    const body = await readBody(request);
    const months = Math.max(1, Math.min(12, Math.round(Number(body.months) || 1)));
    const session = await stripeCheckout(env, await officialBase(env, url), months, cfg.priceMonth * months, user.id);
    if (!session) return json({ error: 'card' }, 502);
    return json({ url: session.url });
  }

  /* Le QR d'un document ouvre la facture chez le client. Le serveur garde une
     copie figée de ce qui a été imprimé, identifiée par un jeton stable par
     numéro : un lien déjà envoyé montre toujours la même facture. */
  if (path === '/api/doc/publish' && request.method === 'POST') {
    const body = await readBody(request);
    const number = String(body.number || '').trim();
    if (!DOC_NUMBER.test(number)) return json({ error: 'number' }, 400);
    if (!body.snapshot || typeof body.snapshot !== 'object') return json({ error: 'snapshot' }, 400);
    const snap = JSON.stringify(body.snapshot);
    if (snap.length > 20000) return json({ error: 'snapshot' }, 400);
    if (await blocked(env, 'publish:' + user.id, 120)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'publish:' + user.id, 120, 60 * 60000);
    const token = (await sha256(dataOwner(user) + ':' + number)).slice(0, 24);
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO public_docs (token, user_id, number, json, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, number = excluded.number, json = excluded.json, updated = excluded.updated',
      ).bind(token, dataOwner(user), number, snap, Date.now()),
      /* Un lien de facture ne sert qu'au client du moment : on jette les copies
         que plus personne n'ouvre, sinon la base grossit sans fin. */
      env.DB.prepare('DELETE FROM public_docs WHERE updated < ?').bind(Date.now() - 400 * 86400000),
    ]);
    return json({ token, url: `${await officialBase(env, url)}/f/${token}` });
  }

  if (path === '/api/password' && request.method === 'POST') {
    const body = await readBody(request);
    const current = String(body.current || '');
    const password = String(body.password || '');
    if (!validPass(password)) return json({ error: 'password' }, 400);
    const row = await env.DB.prepare('SELECT pass, salt FROM users WHERE id = ?').bind(user.id).first();
    if (!row) return json({ error: 'auth' }, 401);
    if (!same(await pbkdf2(current, row.salt), row.pass)) return json({ error: 'current' }, 401);
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const pass = await pbkdf2(password, salt);
    const token = cookieOf(request, 'ac_session');
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pass = ?, salt = ? WHERE id = ?').bind(pass, salt, user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').bind(user.id, token ? await sha256(token) : ''),
    ]);
    return json({ ok: true });
  }

  if (path === '/api/email' && request.method === 'POST') {
    if (await blocked(env, 'email:' + user.id, 10)) return json({ error: 'slow' }, 429);
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email)) return json({ error: 'email' }, 400);
    const taken = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (taken && taken.id !== user.id) return json({ error: 'exists' }, 409);
    await tooMany(env, 'email:' + user.id, 10, 60 * 60000);
    await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, user.id).run();
    return json({ ok: true, user: publicUser({ ...user, email }) });
  }

  /* Nom affiché dans le journal : choisi par chaque compte, jamais deviné. */
  if (path === '/api/name' && request.method === 'POST') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'auth' }, 401);
    const body = await readBody(request);
    const name = String(body.name || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (name.length < 2) return json({ error: 'name' }, 400);
    await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run();
    return json({ ok: true, user: publicUser({ ...user, name }) });
  }

  /* ---------------- équipe ---------------- */
  if (path === '/api/staff' && request.method === 'GET') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'auth' }, 401);
    if (user.ownerId) {
      const owner = await env.DB.prepare('SELECT id, email, phone, name FROM users WHERE id = ?').bind(user.ownerId).first();
      return json({ role: 'staff', owner: owner ? { id: owner.id, email: owner.email, phone: owner.phone, name: owner.name || null } : null });
    }
    const staff = await env.DB.prepare('SELECT id, email, phone, name, perms FROM users WHERE owner_id = ? ORDER BY created').bind(user.id).all();
    const invites = await env.DB.prepare(
      'SELECT code, expires FROM invites WHERE owner_id = ? AND used_by IS NULL AND expires > ? ORDER BY created DESC LIMIT 5',
    ).bind(user.id, Date.now()).all();
    return json({
      role: 'owner',
      staff: (staff.results || []).map((s) => ({ id: s.id, email: s.email, phone: s.phone, name: s.name || null, perms: parsePerms(s.perms) })),
      invites: invites.results || [],
    });
  }

  if (path === '/api/staff/invite' && request.method === 'POST') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'auth' }, 401);
    if (user.ownerId) return json({ error: 'owner' }, 403);
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE owner_id = ?').bind(user.id).first();
    if (!canAddStaff(count && count.n, isPremiumUntil(user.premiumUntil))) {
      return json({ error: 'premium', what: 'staff' }, 403);
    }
    await tooMany(env, 'invite:' + user.id, 20, 60 * 60000);
    const code = hex(crypto.getRandomValues(new Uint8Array(3))).toUpperCase();
    const expires = Date.now() + 7 * 86400000;
    await env.DB.prepare('INSERT INTO invites (code, owner_id, created, expires) VALUES (?, ?, ?, ?)')
      .bind(code, user.id, Date.now(), expires)
      .run();
    return json({ code, expires });
  }

  if (path === '/api/staff/join' && request.method === 'POST') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'auth' }, 401);
    if (user.ownerId) return json({ error: 'already' }, 409);
    /* Un code à 6 caractères se devine : on limite les essais par compte et
       par adresse, sans jamais révéler si le code existe. */
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if ((await blocked(env, 'join:' + user.id, 10)) || (await blocked(env, 'joinip:' + ip, 30))) {
      return json({ error: 'slow' }, 429);
    }
    await tooMany(env, 'join:' + user.id, 10, 15 * 60000);
    await tooMany(env, 'joinip:' + ip, 30, 15 * 60000);
    const body = await readBody(request);
    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: 'code' }, 400);
    const invite = await env.DB.prepare('SELECT owner_id, expires, used_by FROM invites WHERE code = ?').bind(code).first();
    if (!invite || invite.used_by || invite.expires < Date.now()) return json({ error: 'code' }, 400);
    if (invite.owner_id === user.id) return json({ error: 'self' }, 400);
    /* Le plafond est vérifié aussi à l'entrée : un code créé avant le premier
       vendeur ne doit pas permettre d'en ajouter un deuxième en gratuit. */
    const owner = await env.DB.prepare('SELECT premium_until FROM users WHERE id = ?').bind(invite.owner_id).first();
    const team = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE owner_id = ?').bind(invite.owner_id).first();
    if (!canAddStaff(team && team.n, isPremiumUntil(owner && owner.premium_until))) {
      return json({ error: 'premium', what: 'staff' }, 403);
    }
    await env.DB.prepare('UPDATE users SET owner_id = ?, role = ?, perms = NULL WHERE id = ?').bind(invite.owner_id, 'staff', user.id).run();
    await env.DB.prepare('UPDATE invites SET used_by = ? WHERE code = ?').bind(user.id, code).run();
    return json({ ok: true, ownerId: invite.owner_id });
  }

  if (path === '/api/staff/leave' && request.method === 'POST') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'auth' }, 401);
    await env.DB.prepare('UPDATE users SET owner_id = NULL, role = ?, perms = NULL WHERE id = ?').bind('owner', user.id).run();
    return json({ ok: true });
  }

  if (path === '/api/staff/remove' && request.method === 'POST') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'auth' }, 401);
    if (user.ownerId) return json({ error: 'owner' }, 403);
    const body = await readBody(request);
    const id = String(body.id || '');
    await env.DB.prepare('UPDATE users SET owner_id = NULL, role = ?, perms = NULL WHERE id = ? AND owner_id = ?').bind('owner', id, user.id).run();
    return json({ ok: true });
  }

  /* Le patron choisit ce que chaque vendeur peut faire dans la boutique. */
  if (path === '/api/staff/perms' && request.method === 'POST') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'auth' }, 401);
    if (user.ownerId) return json({ error: 'owner' }, 403);
    const body = await readBody(request);
    const id = String(body.id || '');
    const perms = { del: body.del !== false, price: body.price !== false };
    await env.DB.prepare('UPDATE users SET perms = ? WHERE id = ? AND owner_id = ?')
      .bind(JSON.stringify(perms), id, user.id)
      .run();
    return json({ ok: true, perms });
  }

  if (path === '/api/data' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT json, rev, updated FROM state WHERE user_id = ?').bind(dataOwner(user)).first();
    if (!row) return json({ json: null, rev: 0, updated: 0 });
    const body = user.ownerId ? maskState(row.json, user.id, [user.name, user.email]) : row.json;
    return json({ json: body, rev: row.rev, updated: row.updated });
  }

  if (path === '/api/data/history' && request.method === 'GET') {
    if (!isPremiumUntil(user.premiumUntil)) return json({ error: 'premium', what: 'history' }, 403);
    const rows = await env.DB.prepare(
      'SELECT id, rev, updated, saved, length(json) AS bytes FROM state_history WHERE user_id = ? ORDER BY id DESC LIMIT 20',
    ).bind(dataOwner(user)).all();
    return json({ versions: rows.results || [] });
  }

  if (path === '/api/data/restore' && request.method === 'POST') {
    if (user.ownerId) return json({ error: 'owner' }, 403);
    if (!isPremiumUntil(user.premiumUntil)) return json({ error: 'premium', what: 'history' }, 403);
    const body = await readBody(request);
    const id = Number(body.id) || 0;
    const version = await env.DB.prepare('SELECT json, rev, updated FROM state_history WHERE user_id = ? AND id = ?').bind(dataOwner(user), id).first();
    if (!version) return json({ error: 'notfound' }, 404);
    const current = await env.DB.prepare('SELECT json, rev, updated FROM state WHERE user_id = ?').bind(dataOwner(user)).first();
    /* L'état remplacé part dans l'historique : une restauration reste réversible. */
    if (current) await rememberState(env, dataOwner(user), current.rev, current.json, current.updated);
    const rev = (current ? current.rev : 0) + 1;
    await env.DB.prepare(
      'INSERT INTO state (user_id, json, rev, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, rev = excluded.rev, updated = excluded.updated',
    ).bind(dataOwner(user), version.json, rev, Date.now()).run();
    return json({ restored: true, rev });
  }

  if (path === '/api/data' && request.method === 'PUT') {
    const body = await readBody(request);
    const incoming = Number(body.updated) || 0;
    const incomingRev = Number(body.rev) || 0;
    const rawPayload = typeof body.json === 'string' ? body.json : JSON.stringify(body.json || {});
    const row = await env.DB.prepare('SELECT json, rev, updated FROM state WHERE user_id = ?').bind(dataOwner(user)).first();
    if (row && row.rev > incomingRev) {
      return json({ saved: false, json: user.ownerId ? maskState(row.json, user.id, [user.name, user.email]) : row.json, rev: row.rev, updated: row.updated });
    }
    /* Droits du vendeur : une suppression d'article ou un changement de prix
       de vente interdit est refusé en bloc. Le client se recale alors sur
       l'état du patron, pour qu'aucune modification partielle ne survive. */
    if (user.ownerId && row) {
      const perms = user.perms || FULL_PERMS;
      if (!perms.del || !perms.price) {
        let stored = null;
        let mine = null;
        try { stored = JSON.parse(row.json || '{}'); } catch {}
        try { mine = JSON.parse(rawPayload || '{}'); } catch {}
        if (stored && mine) {
          const known = new Map((stored.products || []).filter((p) => p && p.id).map((p) => [String(p.id), p]));
          const sent = new Map((mine.products || []).filter((p) => p && p.id).map((p) => [String(p.id), p]));
          if (!perms.del) {
            for (const pid of known.keys()) if (!sent.has(pid)) return json({ error: 'perm', what: 'del' }, 403);
          }
          if (!perms.price) {
            for (const [pid, p] of sent) {
              const old = known.get(pid);
              if (old && Math.max(0, Number(p.sell) || 0) !== Math.max(0, Number(old.sell) || 0)) {
                return json({ error: 'perm', what: 'price' }, 403);
              }
            }
          }
        }
      }
    }
    /* Le vendeur envoie un état où les valeurs sensibles sont vides : on
       remet celles du patron avant d'écrire. */
    const payload = user.ownerId && row ? restoreMasked(row.json, rawPayload) : rawPayload;
    /* La version écrasée est conservée avant écriture : c'est le filet de
       sécurité si une synchronisation remplace un état par erreur. */
    if (row && row.json !== payload) await rememberState(env, dataOwner(user), row.rev, row.json, row.updated);
    const rev = (row ? row.rev : 0) + 1;
    await env.DB.prepare(
      'INSERT INTO state (user_id, json, rev, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, rev = excluded.rev, updated = excluded.updated',
    ).bind(dataOwner(user), payload, rev, incoming).run();
    /* Parrainage : la première vente du filleul offrit un mois à lui et à son
       parrain. Un échec ici ne doit jamais empêcher la vente d'être gardée. */
    if (!user.ownerId) {
      try {
        const mine = await env.DB.prepare('SELECT ref_by, referral_rewarded, premium_until FROM users WHERE id = ?').bind(user.id).first();
        if (mine && mine.ref_by && !Number(mine.referral_rewarded)) {
          const sent = JSON.parse(rawPayload || '{}');
          if (Array.isArray(sent.sales) && sent.sales.length) {
            const parrain = await env.DB.prepare('SELECT premium_until FROM users WHERE id = ?').bind(mine.ref_by).first();
            const untilMine = extendPremium(mine.premium_until, 1);
            const untilParrain = parrain ? extendPremium(parrain.premium_until, 1) : 0;
            const jobs = [env.DB.prepare('UPDATE users SET premium_until = ?, referral_rewarded = 1 WHERE id = ?').bind(untilMine, user.id)];
            if (parrain) jobs.push(env.DB.prepare('UPDATE users SET premium_until = ? WHERE id = ?').bind(untilParrain, mine.ref_by));
            await env.DB.batch(jobs);
          }
        }
      } catch { /* le parrainage reste un bonus, jamais une condition */ }
    }
    return json({ saved: true, rev, updated: incoming });
  }

  return json({ error: 'notfound' }, 404);
}

/* Numéro de document produit par l'application : DEV-2026-001, FAC-2026-012. */
const DOC_NUMBER = /^[A-Z]{3}-\d{4}-\d{3}$/;
/* Une origine illisible ("null", valeur bricolée) est refusée, jamais une
   erreur 500 : le contrôle doit répondre proprement. */
function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === url.host; } catch { return false; }
}

/* Page publique de la facture : le contenu vient du navigateur, donc tout est
   échappé et rien n'est exécuté. Aucun script de l'application n'y tourne. */
const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => HTML_ESC[c]);

function publicDocHtml(text, nonce) {
  let s;
  try { s = JSON.parse(text || '{}'); } catch { return null; }
  if (!s || typeof s !== 'object') return null;
  const labels = s.labels && typeof s.labels === 'object' ? s.labels : {};
  const L = (k, d) => escHtml(labels[k] || d);
  const lines = (Array.isArray(s.lines) ? s.lines.slice(0, 80) : [])
    .map((l) => `<tr><td>${escHtml(l && l.label)}</td><td class="n">${escHtml(l && l.qty)}</td><td class="n">${escHtml(l && l.price)}</td><td class="n">${escHtml(l && l.amount)}</td></tr>`)
    .join('');
  const client = s.client && typeof s.client === 'object' ? s.client : {};
  const clientLines = [client.name, client.phone, client.email, client.address]
    .filter(Boolean).map((v) => `<div>${escHtml(v)}</div>`).join('');
  const notes = (Array.isArray(s.notes) ? s.notes.slice(0, 6) : [])
    .map((n) => `<div>${escHtml(n)}</div>`).join('');
  const vat = s.vat && typeof s.vat === 'object' && s.vat.value
    ? `<tr><th colspan="3">${escHtml(s.vat.label)}</th><td class="n">${escHtml(s.vat.value)}</td></tr>` : '';
  const lang = /^[a-z]{2}$/.test(String(s.lang || '')) ? String(s.lang) : 'fr';
  /* Numéro de la boutique pour répondre en un geste : uniquement des chiffres,
     sinon le lien ne s'affiche pas (mieux vaut aucun bouton qu'un lien cassé). */
  const wa = String(s.wa || '').replace(/\D/g, '').slice(0, 15);
  const waText = String(s.waText || '').slice(0, 200);
  /* Même logo que sur le papier, réduit à l'envoi. Seule une image PNG ou JPEG
     en data-URL passe : une adresse distante ne doit pas charger un tiers sur
     la facture du client. */
  const logo = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]{100,16000}$/.test(String(s.logo || ''))
    ? String(s.logo) : '';
  return `<!doctype html>
<html lang="${lang}" dir="${s.rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${escHtml(s.title)} ${escHtml(s.number)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:18px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Tahoma,sans-serif;color:#14261b;background:#f7f4ea;font-size:17px;line-height:1.5}
.sheet{max-width:760px;margin:0 auto;background:#fff;border:1px solid #d9e5db;border-radius:14px;padding:22px}
.mark{display:block;max-height:90px;max-width:220px;margin:0 auto 12px}
.bar{height:6px;background:#14532d;border-radius:4px;margin-bottom:16px}
h1{font-size:24px;margin:0 0 4px;color:#14532d;text-transform:uppercase;letter-spacing:1px}
.num{font-size:19px;font-weight:700}
.meta{color:#5b6b60;font-size:15px;margin-bottom:14px}
.box{border:1px solid #d9e5db;border-radius:10px;padding:12px;margin:14px 0}
.box>b{display:block;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin:10px 0}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #e6ece7;font-size:16px}
th{font-size:14px;text-transform:uppercase;color:#5b6b60}
.n{text-align:right;white-space:nowrap}
.state{display:inline-block;margin:6px 0 2px;padding:6px 12px;border-radius:9px;font-weight:700;font-size:15px}
.state.ok{background:#e5f5e9;color:#14532d;border:1px solid #14532d}
.state.warn{background:#fff4d6;color:#7a4a00;border:1px solid #b7791f}
.notes{color:#5b6b60;font-size:14px;margin-top:14px}
footer{margin-top:16px;padding-top:12px;border-top:1px solid #e6ece7;font-size:13px;color:#5b6b60;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.print{display:inline-flex;align-items:center;min-height:48px;padding:10px 18px;border-radius:12px;border:2px solid #14532d;background:#fff;color:#14532d;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
.write{display:inline-flex;align-items:center;min-height:48px;padding:10px 18px;border-radius:12px;border:2px solid #14532d;background:#14532d;color:#fff;font:inherit;font-weight:700;text-decoration:none}
@media print{body{background:#fff;padding:0}.sheet{border:0;border-radius:0;padding:0}.acts{display:none}}
</style>
</head>
<body>
<main class="sheet">
<div class="bar"></div>
${logo ? `<img class="mark" src="${logo}" alt="">` : ''}
<h1>${escHtml(s.title)}</h1>
<div class="num">N° ${escHtml(s.number)}</div>
<div class="meta">${escHtml(s.date || '')}</div>
<div class="box"><b>${escHtml(s.shop)}</b>${s.place ? `<div>${escHtml(s.place)}</div>` : ''}${s.contact ? `<div>${escHtml(s.contact)}</div>` : ''}</div>
<div class="box"><b>${L('client', 'Client')}</b>${clientLines || '<div>—</div>'}</div>
<table>
<thead><tr><th>${L('line', 'Désignation')}</th><th class="n">${L('qty', 'Qté')}</th><th class="n">${L('price', 'Prix')}</th><th class="n">${L('ht', 'Montant')}</th></tr></thead>
<tbody>${lines}</tbody>
</table>
<table><tbody>
<tr><th colspan="3">${L('ht', 'Total HT')}</th><td class="n">${escHtml(s.ht)}</td></tr>
${vat}
<tr><th colspan="3">${L('total', 'Total TTC')}</th><td class="n">${escHtml(s.ttc)}</td></tr>
</tbody></table>
${s.kind === 'FAC' ? `<div class="state ${s.paid ? 'ok' : 'warn'}">${s.paid ? `✓ ${L('paid', 'Payée')}${s.paidOn ? ' · ' + L('paidOn', 'payée le') + ' ' + escHtml(s.paidOn) : ''}` : L('unpaid', 'Non payée')}</div>` : ''}
${notes ? `<div class="notes">${notes}</div>` : ''}
<div class="acts">
<button class="print" id="docPrint">${L('print', 'Imprimer')}</button>
${wa ? `<a class="write" href="https://wa.me/${wa}?text=${escHtml(encodeURIComponent(waText))}" target="_blank" rel="noopener noreferrer">${L('waShop', 'Écrire à la boutique')}</a>` : ''}
</div>
<script nonce="${escHtml(nonce)}">document.getElementById('docPrint').addEventListener('click', function () { window.print(); });</script>
<footer><span>Assistant Commercial</span><span>${escHtml(s.number)}</span></footer>
</main>
</body>
</html>`;
}

const DOC_CSS = 'body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Tahoma,sans-serif;background:#f7f4ea;color:#14261b;padding:24px;text-align:center}';
const docMissing = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Document introuvable</title><style>${DOC_CSS}</style></head><body><h1>Document introuvable</h1><p>Ce lien n'existe plus ou n'a jamais existé.</p><p style="color:#5b6b60">This link is no longer available.</p></body></html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    /* Page publique d'une facture, ouverte par le QR du document. */
    const share = url.pathname.match(/^\/f\/([a-f0-9]{24})$/);
    if (share) {
      /* Le seul script de la page est celui du bouton Imprimer : il porte un
         nonce, et rien d'autre ne peut s'exécuter, même si un jour un champ
         échappé passait entre les mailles. */
      const nonce = hex(crypto.getRandomValues(new Uint8Array(12)));
      const base = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' };
      const headers = {
        ...base,
        'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      };
      const off = { ...base, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
      if (!env.DB) return new Response(docMissing, { status: 503, headers: off });
      try {
        await ensureSchema(env);
        const row = await env.DB.prepare('SELECT json FROM public_docs WHERE token = ?').bind(share[1]).first();
        const html = row ? publicDocHtml(row.json, nonce) : null;
        return new Response(html || docMissing, { status: html ? 200 : 404, headers: html ? headers : off });
      } catch {
        return new Response(docMissing, { status: 503, headers: off });
      }
    }

    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) return json({ error: 'database' }, 500);
      await ensureSchema(env);
      /* Stripe n'envoie ni cookie ni origine : c'est sa signature qui protège
         le webhook, pas le contrôle d'origine. */
      const isHook = url.pathname === '/api/stripe/webhook' || url.pathname === '/api/payments/hook';
      if (request.method !== 'GET' && !isHook && !sameOrigin(request, url)) {
        return json({ error: 'origin' }, 403);
      }
      try {
        return await api(request, env, url, ctx);
      } catch (e) {
        return json({ error: 'server', detail: String(e && e.message ? e.message : e) }, 500);
      }
    }
    const response = await env.ASSETS.fetch(request);
    const copy = new Response(response.body, response);
    copy.headers.set('x-content-type-options', 'nosniff');
    copy.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    copy.headers.set('x-frame-options', 'SAMEORIGIN');
    copy.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    /* La page d'administration ne se laisse ni encadrer par un autre site ni
       exécuter d'autre script que le sien : une page piégée ne peut pas faire
       cliquer l'admin à sa place. */
    if (url.pathname === '/admin' || url.pathname === '/admin.html') {
      copy.headers.set('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      copy.headers.set('x-frame-options', 'DENY');
      copy.headers.set('referrer-policy', 'no-referrer');
      copy.headers.set('cache-control', 'no-store');
      copy.headers.set('x-robots-tag', 'noindex, nofollow');
    }
    return copy;
  },
};
