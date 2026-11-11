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
const validPass = (v) => typeof v === 'string' && v.length >= 8 && v.length <= 200;

let schemaReady;
function ensureSchema(env) {
  schemaReady = schemaReady || env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, phone TEXT NOT NULL, pass TEXT NOT NULL, salt TEXT NOT NULL, created INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS state (user_id TEXT PRIMARY KEY, json TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL)'),
  ]);
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
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    if (!validEmail(email)) return json({ error: 'email' }, 400);
    if (!validPhone(phone)) return json({ error: 'phone' }, 400);
    if (!validPass(password)) return json({ error: 'password' }, 400);
    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (exists) return json({ error: 'exists' }, 409);
    const id = crypto.randomUUID();
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const pass = await pbkdf2(password, salt);
    await env.DB.prepare('INSERT INTO users (id, email, phone, pass, salt, created) VALUES (?, ?, ?, ?, ?, ?)').bind(id, email, phone, pass, salt, Date.now()).run();
    const cookie = await createSession(env, id);
    return json({ user: { id, email, phone } }, 200, { 'set-cookie': cookie });
  }

  if (path === '/api/login' && request.method === 'POST') {
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) return json({ error: 'credentials' }, 401);
    const hash = await pbkdf2(password, user.salt);
    if (!same(hash, user.pass)) return json({ error: 'credentials' }, 401);
    const cookie = await createSession(env, user.id);
    return json({ user: { id: user.id, email: user.email, phone: user.phone } }, 200, { 'set-cookie': cookie });
  }

  if (path === '/api/logout' && request.method === 'POST') {
    const token = cookieOf(request, 'ac_session');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': 'ac_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  }

  const user = await currentUser(request, env);
  if (!user) return json({ error: 'auth' }, 401);

  if (path === '/api/data' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT json, rev, updated FROM state WHERE user_id = ?').bind(user.id).first();
    return json(row ? { json: row.json, rev: row.rev, updated: row.updated } : { json: null, rev: 0, updated: 0 });
  }

  if (path === '/api/data' && request.method === 'PUT') {
    const body = await readBody(request);
    const incoming = Number(body.updated) || 0;
    const payload = typeof body.json === 'string' ? body.json : JSON.stringify(body.json || {});
    const row = await env.DB.prepare('SELECT json, rev, updated FROM state WHERE user_id = ?').bind(user.id).first();
    if (row && row.updated > incoming) {
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
    return env.ASSETS.fetch(request);
  },
};
