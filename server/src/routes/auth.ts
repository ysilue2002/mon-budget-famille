import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { pool, query, withTransaction } from '../db/pool';
import { loginSchema, registerSchema } from '../validation';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'changez-moi-en-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

/**
 * Inscription : crée l'utilisateur, son foyer et le rôle familial admin.
 * La même adresse e-mail peut appartenir à plusieurs foyers via memberships,
 * mais l'inscription simple crée un foyer neuf.
 */
router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { email, password, familyName, primaryCurrency } = parsed.data;
  const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rowCount && existing.rowCount > 0) {
    res.status(409).json({ error: 'duplicate' });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
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

router.post('/login', async (req: Request, res: Response) => {
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
    `SELECT u.id, u.email, u.password_hash, f.id AS family_id, f.name AS family_name, f.primary_currency, m.role
     FROM users u
     JOIN memberships m ON m.user_id = u.id
     JOIN families f ON f.id = m.family_id
     WHERE u.email = $1
     ORDER BY f.created_at
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

export default router;
