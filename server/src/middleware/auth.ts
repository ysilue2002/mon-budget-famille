import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool';
import { JWT_SECRET } from '../config';
import type { Role } from '../validation';

export interface AuthRequest extends Request {
  auth?: {
    userId: string;
    familyId: string;
    role: Role;
  };
}

/** Extrait le JWT Bearer, vérifie la signature et résout foyer + rôle. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const [bearer, token] = (req.headers.authorization ?? '').split(' ');
  if (bearer !== 'Bearer' || !token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    // Un compte peut appartenir à plusieurs foyers via `memberships` : la
    // plus récente adhésion l'emporte (celle à laquelle l'utilisateur vient
    // de se rattacher, par exemple via une invitation).
    const rows = await query<{ user_id: string; family_id: string; role: Role }>(
      `SELECT m.user_id, m.family_id, m.role
       FROM memberships m
       WHERE m.user_id = $1
       ORDER BY m.created_at DESC
       LIMIT 1`,
      [payload.sub],
    );
    const membership = rows.rows[0];
    if (!membership) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    (req as AuthRequest).auth = {
      userId: membership.user_id,
      familyId: membership.family_id,
      role: membership.role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

/** Rôle minimal requis (hiérarchie admin > manager > member > readonly). */
const ROLE_RANK: Record<Role, number> = { admin: 3, manager: 2, member: 1, readonly: 0 };

export function requireRole(minimum: Role): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const auth = (req as AuthRequest).auth;
    if (!auth || ROLE_RANK[auth.role] < ROLE_RANK[minimum]) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}
