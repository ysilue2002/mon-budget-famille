import type { NextFunction, Request, Response } from 'express';

/**
 * Limitation de débit en mémoire (fenêtre fixe).
 *
 * Volontairement sans dépendance : le besoin est de ralentir une attaque par
 * force brute sur /auth, pas de tenir un quota distribué. Le compteur est
 * **par processus** ; derrière plusieurs instances, chaque instance applique
 * sa propre limite.
 */
export interface RateLimitOptions {
  /** Nom du seau : évite les collisions entre plusieurs limiteurs. */
  name: string;
  windowMs: number;
  max: number;
  /** Clé du seau (par défaut : IP du client, via `trust proxy`). */
  key?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Plafond de seaux gardés en mémoire (protège contre un balayage d'IP). */
const MAX_BUCKETS = 10_000;

export function rateLimit({ name, windowMs, max, key }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  const keyOf = key ?? ((req: Request) => req.ip ?? 'unknown');

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    if (buckets.size > MAX_BUCKETS) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
      // Toujours saturé par des seaux actifs : on repart de zéro plutôt que de
      // laisser la mémoire croître sans borne.
      if (buckets.size > MAX_BUCKETS) buckets.clear();
    }

    const id = `${name}:${keyOf(req)}`;
    const bucket = buckets.get(id);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'too-many-requests', retryAfter });
      return;
    }

    bucket.count += 1;
    next();
  };
}
