import { z } from 'zod';
import { db } from '@/db/dexie';
import { CURRENCIES, SUPPORTED_CURRENCIES } from './currencies';
/** Réponse attendue du fournisseur de taux (format open.er-api.com). */
const ratesResponseSchema = z.object({
    result: z.literal('success').optional(),
    provider: z.string().optional(),
    base_code: z.string(),
    time_last_update_unix: z.number().optional(),
    time_last_update_utc: z.string().optional(),
    rates: z.record(z.number().positive()),
});
const envUrl = import.meta.env?.VITE_RATES_API_URL ?? '';
export const RATES_API_URL = envUrl || 'https://open.er-api.com/v6/latest/USD';
/** Validité d'un taux : actualisation quotidienne exigée par le cahier des charges. */
export const RATES_MAX_AGE_MS = 60 * 60 * 1_000;
/**
 * Taux de repli utilisés uniquement si l'IndexedDB est vide ET le réseau
 * indisponible (premier lancement hors ligne). Marqués `stale`.
 */
export const FALLBACK_RATES = {
    XOF: 600,
    XAF: 600,
    USD: 1,
    NGN: 1500,
    GBP: 0.78,
    EUR: 0.92,
    CHF: 0.88,
};
function pickSupported(rates) {
    const out = {};
    for (const code of SUPPORTED_CURRENCIES) {
        const value = rates[code] ?? (code === 'USD' ? 1 : undefined);
        if (typeof value === 'number' && value > 0)
            out[code] = value;
    }
    if (out.USD === undefined)
        out.USD = 1;
    return out;
}
export function normalizeSnapshot(raw, fetchedAt, stale = false) {
    return { base: 'USD', rates: pickSupported(raw), fetchedAt, stale };
}
export function fallbackSnapshot() {
    return normalizeSnapshot(FALLBACK_RATES, 0, true);
}
/** Interroge l'API de taux (timeout 6 s) et normalise la réponse. */
export async function fetchRates(url = RATES_API_URL, fetchFn = typeof fetch === 'function' ? fetch : () => Promise.reject(new Error('fetch indisponible'))) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    try {
        const res = await fetchFn(url, { signal: controller.signal });
        if (!res.ok)
            return null;
        const json = await res.json();
        const parsed = ratesResponseSchema.safeParse(json);
        if (!parsed.success)
            return null;
        const fetchedAt = parsed.data.time_last_update_unix
            ? parsed.data.time_last_update_unix * 1000
            : Date.now();
        return normalizeSnapshot(parsed.data.rates, fetchedAt, false);
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
async function readCache() {
    const doc = await db.rates.get('latest');
    return doc ?? null;
}
async function writeCache(snapshot) {
    await db.rates.put({ ...snapshot, key: 'latest' });
}
export async function getCachedRates() {
    return readCache();
}
export function isFresh(snapshot, now = Date.now()) {
    if (snapshot.stale)
        return false;
    return now - snapshot.fetchedAt <= RATES_MAX_AGE_MS;
}
/**
 * Stratégie cache-d'abord :
 * 1. cache présent et frais  -> réseau non requis (mode hors ligne instantané)
 * 2. réseau joignable         -> récupération + écriture du cache
 * 3. cache présent (périmé)  -> réutilisé, marqué tel quel
 * 4. rien                    -> taux de repli marqués `stale`
 */
export async function getRates(options = {}) {
    const cached = await readCache();
    if (!options.forceRefresh && cached && isFresh(cached)) {
        return { snapshot: cached, source: 'cache' };
    }
    const network = await fetchRates();
    if (network) {
        await writeCache(network);
        return { snapshot: network, source: 'network' };
    }
    if (cached)
        return { snapshot: cached, source: 'cache' };
    return { snapshot: fallbackSnapshot(), source: 'fallback' };
}
/** Actualisation explicite (bouton « Actualiser les taux »). */
export async function refreshRates() {
    return getRates({ forceRefresh: true });
}
/** Conversion simple exposée aux widgets, null si la paire est indisponible. */
export function crossRate(from, to, snapshot) {
    if (!snapshot)
        return null;
    if (from === to)
        return 1;
    const rf = from === 'USD' ? 1 : snapshot.rates[from];
    const rt = to === 'USD' ? 1 : snapshot.rates[to];
    if (!rf || !rt)
        return null;
    const rate = rt / rf;
    return Number.isFinite(rate) && rate > 0 ? rate : null;
}
/** Liste des devises réellement disponibles dans le snapshot courant. */
export function availableCurrencies(snapshot) {
    if (!snapshot)
        return [...SUPPORTED_CURRENCIES];
    return SUPPORTED_CURRENCIES.filter((code) => code === 'USD' || typeof snapshot.rates[code] === 'number');
}
export function isSupportedCurrency(code) {
    return code in CURRENCIES;
}
