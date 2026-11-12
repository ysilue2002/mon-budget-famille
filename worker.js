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

let schemaReady;
function ensureSchema(env) {
  schemaReady = schemaReady || env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, phone TEXT NOT NULL, phone_digits TEXT, pass TEXT NOT NULL, salt TEXT NOT NULL, created INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS state (user_id TEXT PRIMARY KEY, json TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS resets (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mail_log (user_id TEXT PRIMARY KEY, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS throttle (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset INTEGER NOT NULL)'),
  ]).then(async () => {
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN phone_digits TEXT').run(); } catch {}
  });
  return schemaReady;
}

async function currentUser(request, env) {
  const token = cookieOf(request, 'ac_session');
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT s.user_id AS id, u.email, u.phone, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').bind(hash).first();
  if (!row) return null;
  if (row.expires < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(hash).run();
    return null;
  }
  return { id: row.id, email: row.email, phone: row.phone };
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

async function sendDocMail(env, to, subject, text, filename, content) {
  if (!env.RESEND_API_KEY) return false;
  const from = env.MAIL_FROM || 'Assistant Commercial <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: String(subject).slice(0, 180), text: String(text).slice(0, 4000), attachments: [{ filename, content }] }),
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
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error('trop volumineux');
  return text ? JSON.parse(text) : {};
}

async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/me' && request.method === 'GET') {
    const user = await currentUser(request, env);
    return json({ user });
  }

  if (path === '/api/signup' && request.method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (await blocked(env, 'signup:' + ip, 10)) return json({ error: 'slow' }, 429);
    await tooMany(env, 'signup:' + ip, 10, 60 * 60000);
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    if (!validEmail(email)) return json({ error: 'email' }, 400);
    if (!validPhone(phone)) return json({ error: 'phone' }, 400);
    if (!validPass(password)) return json({ error: 'password' }, 400);
    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (exists) return json({ error: 'exists' }, 409);
    const phoneDigits = digitsOf(phone);
    const samePhone = await env.DB.prepare('SELECT id FROM users WHERE phone_digits = ?').bind(phoneDigits).first();
    if (samePhone) return json({ error: 'phone_taken' }, 409);
    const id = crypto.randomUUID();
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const pass = await pbkdf2(password, salt);
    await env.DB.prepare('INSERT INTO users (id, email, phone, phone_digits, pass, salt, created) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, email, phone, phoneDigits, pass, salt, Date.now()).run();
    const cookie = await createSession(env, id);
    return json({ user: { id, email, phone } }, 200, { 'set-cookie': cookie });
  }

  if (path === '/api/login' && request.method === 'POST') {
    const body = await readBody(request);
    const identifier = String(body.login || body.email || '').trim();
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    const ipKey = 'login:' + ip;
    if (await blocked(env, ipKey, 20)) return json({ error: 'slow' }, 429);
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
    if (!user) { await tooMany(env, ipKey, 20, 15 * 60000); return json({ error: 'credentials' }, 401); }
    const hash = await pbkdf2(password, user.salt);
    if (!same(hash, user.pass)) { await tooMany(env, ipKey, 20, 15 * 60000); return json({ error: 'credentials' }, 401); }
    const cookie = await createSession(env, user.id);
    return json({ user: { id: user.id, email: user.email, phone: user.phone } }, 200, { 'set-cookie': cookie });
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

  if (path === '/api/send-doc' && request.method === 'POST') {
    const body = await readBody(request);
    const to = String(body.to || '').trim().toLowerCase();
    if (!validEmail(to)) return json({ error: 'email' }, 400);
    const filename = String(body.filename || 'document.pdf').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'document.pdf';
    const pdf = String(body.pdf || '').replace(/\s/g, '');
    if (pdf.length < 100 || pdf.length > 1600000 || !/^[A-Za-z0-9+/=]+$/.test(pdf)) return json({ error: 'pdf' }, 400);
    const day = new Date().toISOString().slice(0, 10);
    const row = await env.DB.prepare('SELECT day, count FROM mail_log WHERE user_id = ?').bind(user.id).first();
    const count = row && row.day === day ? row.count : 0;
    if (count >= 20) return json({ ok: true, mail: false, error: 'limit' });
    await env.DB.prepare('INSERT INTO mail_log (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET day = excluded.day, count = CASE WHEN mail_log.day = excluded.day THEN mail_log.count + 1 ELSE 1 END').bind(user.id, day).run();
    const sent = await sendDocMail(env, to, String(body.subject || 'Document'), String(body.text || ''), filename, pdf);
    return json({ ok: true, mail: sent });
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

  if (path === '/api/data' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT json, rev, updated FROM state WHERE user_id = ?').bind(user.id).first();
    return json(row ? { json: row.json, rev: row.rev, updated: row.updated } : { json: null, rev: 0, updated: 0 });
  }

  if (path === '/api/data' && request.method === 'PUT') {
    const body = await readBody(request);
    const incoming = Number(body.updated) || 0;
    const incomingRev = Number(body.rev) || 0;
    const payload = typeof body.json === 'string' ? body.json : JSON.stringify(body.json || {});
    const row = await env.DB.prepare('SELECT json, rev, updated FROM state WHERE user_id = ?').bind(user.id).first();
    if (row && row.rev > incomingRev) {
      return json({ saved: false, json: row.json, rev: row.rev, updated: row.updated });
    }
    const rev = (row ? row.rev : 0) + 1;
    await env.DB.prepare(
      'INSERT INTO state (user_id, json, rev, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, rev = excluded.rev, updated = excluded.updated',
    ).bind(user.id, payload, rev, incoming).run();
    return json({ saved: true, rev, updated: incoming });
  }

  return json({ error: 'notfound' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) return json({ error: 'database' }, 500);
      await ensureSchema(env);
      if (request.method !== 'GET' && request.headers.get('origin') && new URL(request.headers.get('origin')).host !== url.host) {
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
