import { CURRENCIES, minorUnitFactor } from './currencies';
import type { CurrencyCode, RateSnapshot } from './types';

/**
 * Arithmétique monétaire en entiers (sous-unités).
 * Aucun flottant n'est stocké : les arrondis sont effectués à la frontière.
 */

export function toMinor(major: number, code: CurrencyCode): number {
  if (!Number.isFinite(major)) throw new Error(`Montant invalide: ${major}`);
  return Math.round(major * minorUnitFactor(code));
}

export function toMajor(minor: number, code: CurrencyCode): number {
  return minor / minorUnitFactor(code);
}

export function isMinorAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Interprète une saisie utilisateur ("1 234,56", "1,234.56", "1200").
 * Quand les deux séparateurs coexistent, le dernier est le séparateur
 * décimal et l'autre est un séparateur de milliers (ex : "1,234.56").
 * Retourne les sous-unités de la devise, ou null si illisible.
 * XOF/XAF/NGN : les décimales sont ignorées (devise à 0 décimale).
 */
export function parseAmountInput(raw: string, code: CurrencyCode): number | null {
  const cleaned = raw.replace(/\s|\u00a0|\u202f/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized: string;
  if (hasComma && hasDot) {
    normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(/,/g, '.')
        : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    normalized = cleaned.replace(/,/g, '.');
  } else {
    normalized = cleaned;
  }
  if (normalized === '' || !/^-?\d*(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  const factor = minorUnitFactor(code);
  const minor = Math.round(value * factor);
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

/** Devise de repli si aucune paire de taux n'existe. */
function requireCurrency(code: CurrencyCode): void {
  if (!CURRENCIES[code]) throw new CurrencyError(code);
}

export class CurrencyError extends Error {
  constructor(public readonly code: string) {
    super(`Devise non prise en charge: ${code}`);
    this.name = 'CurrencyError';
  }
}

/**
 * Taux croisé pour 1 unité de `from` exprimé en `to`,
 * à partir d'un snapshot base USD. Retourne null si le taux est indisponible.
 */
export function rateBetween(
  from: CurrencyCode,
  to: CurrencyCode,
  snapshot: Pick<RateSnapshot, 'rates'> | null | undefined,
): number | null {
  if (from === to) return 1;
  if (!snapshot) return null;
  const rateFrom = from === 'USD' ? 1 : snapshot.rates[from];
  const rateTo = to === 'USD' ? 1 : snapshot.rates[to];
  if (!rateFrom || !rateTo) return null;
  const rate = rateTo / rateFrom;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Convertit un montant en sous-unités d'une devise vers une autre.
 * Arrondi au plus proche (½ supérieur) en sous-unités cibles.
 */
export function convertMinor(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  snapshot: Pick<RateSnapshot, 'rates'> | null | undefined,
): number | null {
  requireCurrency(from);
  requireCurrency(to);
  if (from === to) return amountMinor;
  const rate = rateBetween(from, to, snapshot);
  if (rate === null) return null;
  const scale = minorUnitFactor(to) / minorUnitFactor(from);
  const converted = Math.round(amountMinor * scale * rate);
  return Number.isSafeInteger(converted) ? converted : null;
}

/** Convertit puis valide la plage entière sûre. */
export function addMinor(...values: number[]): number {
  const total = values.reduce((acc, v) => acc + v, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Dépassement de capacité entière');
  return total;
}

export function percentOf(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((spent / limit) * 1000) / 10;
}
