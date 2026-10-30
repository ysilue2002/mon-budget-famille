import { Router } from 'express';
import { z } from 'zod';

/**
 * Proxy des taux de change avec cache mémoire (1 h).
 * Le client peut appeler l'API publique directement, mais un proxy
 * évite d'exposer la clé d'un fournisseur payant le cas échéant.
 */

const responseSchema = z.object({
  base_code: z.string(),
  time_last_update_unix: z.number().optional(),
  rates: z.record(z.number().positive()),
});

const RATES_API_URL = process.env.RATES_API_URL || 'https://open.er-api.com/v6/latest/USD';
const TTL_MS = 60 * 60 * 1_000;

interface RateSnapshot {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

let cache: { at: number; snapshot: RateSnapshot } | null = null;

const router = Router();

router.get('/', async (_req, res) => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    res.json({ ...cache.snapshot, source: 'cache' });
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    const response = await fetch(RATES_API_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json: unknown = await response.json();
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) throw new Error('format de réponse invalide');
    const snapshot: RateSnapshot = {
      base: 'USD',
      rates: parsed.data.rates,
      fetchedAt: (parsed.data.time_last_update_unix ?? Math.floor(Date.now() / 1000)) * 1000,
    };
    cache = { at: Date.now(), snapshot };
    res.json({ ...snapshot, source: 'network' });
  } catch (error) {
    if (cache) {
      res.json({ ...cache.snapshot, source: 'cache-stale' });
      return;
    }
    console.error('[rates]', error);
    res.status(502).json({ error: 'rates-unavailable' });
  }
});

export default router;
