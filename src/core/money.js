import { CURRENCIES, minorUnitFactor } from './currencies';
/**
 * Arithmétique monétaire en entiers (sous-unités).
 * Aucun flottant n'est stocké : les arrondis sont effectués à la frontière.
 */
export function toMinor(major, code) {
    if (!Number.isFinite(major))
        throw new Error(`Montant invalide: ${major}`);
    return Math.round(major * minorUnitFactor(code));
}
export function toMajor(minor, code) {
    return minor / minorUnitFactor(code);
}
export function isMinorAmount(value) {
    return typeof value === 'number' && Number.isSafeInteger(value);
}
/**
 * Interprète une saisie utilisateur ("1 234,56", "1,234.56", "1200").
 * Quand les deux séparateurs coexistent, le dernier est le séparateur
 * décimal et l'autre est un séparateur de milliers (ex : "1,234.56").
 * Retourne les sous-unités de la devise, ou null si illisible.
 * XOF/XAF/NGN : les décimales sont ignorées (devise à 0 décimale).
 */
export function parseAmountInput(raw, code) {
    const cleaned = raw.replace(/\s|\u00a0|\u202f/g, '');
    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');
    let normalized;
    if (hasComma && hasDot) {
        normalized =
            cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
                ? cleaned.replace(/\./g, '').replace(/,/g, '.')
                : cleaned.replace(/,/g, '');
    }
    else if (hasComma) {
        normalized = cleaned.replace(/,/g, '.');
    }
    else {
        normalized = cleaned;
    }
    if (normalized === '' || !/^-?\d*(\.\d+)?$/.test(normalized))
        return null;
    const value = Number(normalized);
    if (!Number.isFinite(value))
        return null;
    if (value < 0)
        return null;
    const factor = minorUnitFactor(code);
    const minor = Math.round(value * factor);
    if (!Number.isSafeInteger(minor))
        return null;
    return minor;
}
/** Devise de repli si aucune paire de taux n'existe. */
function requireCurrency(code) {
    if (!CURRENCIES[code])
        throw new CurrencyError(code);
}
export class CurrencyError extends Error {
    constructor(code) {
        super(`Devise non prise en charge: ${code}`);
        Object.defineProperty(this, "code", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: code
        });
        this.name = 'CurrencyError';
    }
}
/**
 * Taux croisé pour 1 unité de `from` exprimé en `to`,
 * à partir d'un snapshot base USD. Retourne null si le taux est indisponible.
 */
export function rateBetween(from, to, snapshot) {
    if (from === to)
        return 1;
    if (!snapshot)
        return null;
    const rateFrom = from === 'USD' ? 1 : snapshot.rates[from];
    const rateTo = to === 'USD' ? 1 : snapshot.rates[to];
    if (!rateFrom || !rateTo)
        return null;
    const rate = rateTo / rateFrom;
    return Number.isFinite(rate) && rate > 0 ? rate : null;
}
/**
 * Convertit un montant en sous-unités d'une devise vers une autre.
 * Arrondi au plus proche (½ supérieur) en sous-unités cibles.
 */
export function convertMinor(amountMinor, from, to, snapshot) {
    requireCurrency(from);
    requireCurrency(to);
    if (from === to)
        return amountMinor;
    const rate = rateBetween(from, to, snapshot);
    if (rate === null)
        return null;
    const scale = minorUnitFactor(to) / minorUnitFactor(from);
    const converted = Math.round(amountMinor * scale * rate);
    return Number.isSafeInteger(converted) ? converted : null;
}
/** Convertit puis valide la plage entière sûre. */
export function addMinor(...values) {
    const total = values.reduce((acc, v) => acc + v, 0);
    if (!Number.isSafeInteger(total))
        throw new Error('Dépassement de capacité entière');
    return total;
}
export function percentOf(spent, limit) {
    if (limit <= 0)
        return 0;
    return Math.round((spent / limit) * 1000) / 10;
}
