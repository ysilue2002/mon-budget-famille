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
  const row = await env.DB.prepare(
    'SELECT s.user_id AS id, u.email, u.phone, u.name, u.owner_id, u.role, u.perms, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
  ).bind(hash).first();
  if (!row) return null;
  if (row.expires < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(hash).run();
    return null;
  }
  return { id: row.id, email: row.email, phone: row.phone, name: row.name || null, ownerId: row.owner_id || null, role: row.role || 'owner', perms: parsePerms(row.perms) };
}

async function createSession(env, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), userId, expires).run();
  return `ac_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

async function sendResetMail(env, to, link) {
  if (!env.RESEND_API_KEY) return false;
  const from = env.MAIL_FROM || 'Assistant Commercial <onboarding@resend.dev>';
  const text = `Bonjour,\n\nPour choisir un nouveau mot de passe Assistant Commercial, ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n'avez rien demandé, ignorez cet e-mail : votre mot de passe ne change pas.`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'Assistant Commercial : nouveau mot de passe', text }),
    });
    return r.ok;
  } catch { return false; }
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
    ownerId: u.ownerId || u.owner_id || null,
    role: u.role || 'owner',
    perms: parsePerms(u.perms),
  };
}

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

async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/me' && request.method === 'GET') {
    const user = await currentUser(request, env);
    return json({ user });
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
    await env.DB.prepare('INSERT INTO users (id, email, phone, phone_digits, pass, salt, created, src) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, email || null, phone || null, phoneDigits, pass, salt, Date.now(), src || null).run();
    /* Compteur par canal : aucun nom, aucun compte, juste combien d'installations. */
    if (src) {
      const day = new Date().toISOString().slice(0, 10);
      await env.DB.prepare('INSERT INTO installs (src, day, hits) VALUES (?, ?, 1) ON CONFLICT(src, day) DO UPDATE SET hits = hits + 1').bind(src, day).run();
      /* Le compteur ne raconte que six mois : au-delà, il ne dit plus rien. */
      await env.DB.prepare('DELETE FROM installs WHERE day < ?').bind(new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)).run();
    }
    const cookie = await createSession(env, id);
    return json({ user: publicUser({ id, email: email || null, phone: phone || null }) }, 200, { 'set-cookie': cookie });
  }

  if (path === '/api/login' && request.method === 'POST') {
    const body = await readBody(request);
    const identifier = String(body.login || body.email || '').trim();
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    const ipKey = 'login-ip:' + ip;
    /* Deux compteurs, pas un : une boutique, un cybercafé ou un réseau mobile
       partagent une adresse IP. Une personne qui se trompe de mot de passe ne
       doit pas bloquer ses vendeurs — seul son propre identifiant se bloque. */
    const idKey = 'login-id:' + ip + ':' + (identifier.includes('@') ? identifier.toLowerCase() : digitsOf(identifier));
    if (await blocked(env, idKey, 10) || await blocked(env, ipKey, 100)) return json({ error: 'slow' }, 429);
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
    if (!user) { await tooMany(env, idKey, 10, 15 * 60000); await tooMany(env, ipKey, 100, 15 * 60000); return json({ error: 'credentials' }, 401); }
    const hash = await pbkdf2(password, user.salt);
    if (!same(hash, user.pass)) { await tooMany(env, idKey, 10, 15 * 60000); await tooMany(env, ipKey, 100, 15 * 60000); return json({ error: 'credentials' }, 401); }
    const cookie = await createSession(env, user.id);
    return json({ user: publicUser(user) }, 200, { 'set-cookie': cookie });
  }

  if (path === '/api/forgot' && request.method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (await blocked(env, 'forgot:' + ip, 30)) return json({ ok: true, mail: false });
    await tooMany(env, 'forgot:' + ip, 30, 60 * 60000);
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email)) return json({ ok: true, mail: false });
    const user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();
    if (!user) return json({ ok: true, mail: false });
    const last = await env.DB.prepare('SELECT created FROM resets WHERE user_id = ? ORDER BY created DESC LIMIT 1').bind(user.id).first();
    if (last && Date.now() - last.created < 5 * 60000) return json({ ok: true, mail: !!env.RESEND_API_KEY });
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('DELETE FROM resets WHERE user_id = ?').bind(user.id).run();
    await env.DB.prepare('INSERT INTO resets (token, user_id, created, expires, used) VALUES (?, ?, ?, ?, 0)').bind(await sha256(token), user.id, Date.now(), Date.now() + 3600000).run();
    const sent = await sendResetMail(env, user.email, `${url.origin}/?reset=${token}`);
    return json({ ok: true, mail: sent });
  }

  if (path === '/api/reset' && request.method === 'POST') {
    const body = await readBody(request);
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'token' }, 400);
    if (!validPass(password)) return json({ error: 'password' }, 400);
    const hash = await sha256(token);
    const row = await env.DB.prepare('SELECT user_id, expires, used FROM resets WHERE token = ?').bind(hash).first();
    if (!row || row.used || row.expires < Date.now()) return json({ error: 'token' }, 400);
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const pass = await pbkdf2(password, salt);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pass = ?, salt = ? WHERE id = ?').bind(pass, salt, row.user_id),
      env.DB.prepare('UPDATE resets SET used = 1 WHERE token = ?').bind(hash),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
    ]);
    return json({ ok: true });
  }

  if (path === '/api/logout' && request.method === 'POST') {
    const token = cookieOf(request, 'ac_session');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': 'ac_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  }

  const user = await currentUser(request, env);
  if (!user) return json({ error: 'auth' }, 401);

  /* D'où viennent les installations : agregat par canal, sans aucune donnée
     personnelle. Sert à juger un flyer ou une radio, pas à suivre les gens. */
  if (path === '/api/installs' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT src, SUM(hits) AS n FROM installs GROUP BY src ORDER BY n DESC LIMIT 20').all();
    return json({ sources: (rows.results || []).map((r) => ({ src: String(r.src), n: Number(r.n) || 0 })) });
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
    return json({ token, url: `${url.origin}/f/${token}` });
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
    const rows = await env.DB.prepare(
      'SELECT id, rev, updated, saved, length(json) AS bytes FROM state_history WHERE user_id = ? ORDER BY id DESC LIMIT 20',
    ).bind(dataOwner(user)).all();
    return json({ versions: rows.results || [] });
  }

  if (path === '/api/data/restore' && request.method === 'POST') {
    if (user.ownerId) return json({ error: 'owner' }, 403);
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
  async fetch(request, env) {
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
      if (request.method !== 'GET' && !sameOrigin(request, url)) {
        return json({ error: 'origin' }, 403);
      }
      try {
        return await api(request, env, url);
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
    return copy;
  },
};
