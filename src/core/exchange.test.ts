import { afterEach, describe, expect, it } from 'vitest';
import type { CurrencyCode } from './types';
import { FALLBACK_RATES, fetchRates, normalizeSnapshot } from './exchange';

const SUPPORTED: CurrencyCode[] = ['XOF', 'XAF', 'USD', 'NGN', 'GBP', 'EUR', 'CHF', 'EGP', 'MAD', 'AED'];

describe('exchange — normalisation des taux', () => {
  it('ne conserve que les devises prises en charge', () => {
    const raw = {
      XOF: 600,
      XAF: 605,
      USD: 1,
      NGN: 1500,
      GBP: 0.78,
      EUR: 0.92,
      CHF: 0.88,
      EGP: 48,
      MAD: 10,
      AED: 3.67,
      KRW: 12.34,
      GBP_old: 0.7,
    };
    const snapshot = normalizeSnapshot(raw, 42);
    expect(Object.keys(JSON.parse(JSON.stringify(snapshot.rates))).sort()).toEqual([...SUPPORTED].sort());
    expect(snapshot.fetchedAt).toBe(42);
    expect(snapshot.base).toBe('USD');
  });

  it('garantit USD = 1 et ignorer les taux <= 0', () => {
    const snapshot = normalizeSnapshot({ USD: 1, EUR: -3, GBP: 0.78 }, 1);
    expect(snapshot.rates.USD).toBe(1);
    expect(snapshot.rates.EUR).toBeUndefined();
    expect(snapshot.rates.GBP).toBe(0.78);
  });

  it('les taux de repli couvrent toutes les devises', () => {
    const snapshot = normalizeSnapshot(FALLBACK_RATES, 0, true);
    for (const code of SUPPORTED) {
      expect(snapshot.rates[code]).toBeGreaterThan(0);
    }
    expect(snapshot.stale).toBe(true);
  });
});

describe('exchange — fetchRates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retourne un snapshot normalisé en cas de succès', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ base_code: 'USD', time_last_update_unix: 2, rates: { USD: 1, EUR: 0.9 } }), { status: 200 }),
      ),
    );
    const snapshot = await fetchRates('https://x.test');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.rates.EUR).toBe(0.9);
    expect(snapshot!.fetchedAt).toBe(2000);
  });

  it('retourne null sur une erreur réseau ou un format invalide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    expect(await fetchRates('https://x.test')).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })));
    expect(await fetchRates('https://x.test')).toBeNull();
  });
});

// stub global `fetch` du navigateur en Node
import { vi } from 'vitest';
