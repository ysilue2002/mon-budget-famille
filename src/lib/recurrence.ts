/**
 * Arithmétique pure des échéances récurrentes.
 *
 * Aucune dépendance à la base : utilisable par le dépôt, la génération et les tests.
 * Le jour du mois de `startDate` sert d'ancre, ce qui évite la dérive classique
 * (31 janvier → 28 février → 28 mars au lieu de 31 mars).
 */
import { toISODate } from '@/lib/date';
import type { RecurrenceFrequency } from '@/core/types';

/** Jour du mois (1-31) d'une date ISO. */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Nombre de jours du mois d'une date ISO. */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Échéance suivante. `weekly` avance de 7 × interval jours ; `monthly` et
 * `yearly` conservent le jour d'ancrage, réduit au dernier jour du mois si besoin.
 */
export function advanceRecurringDate(
  iso: string,
  frequency: RecurrenceFrequency,
  interval: number,
  anchorDay = dayOfMonth(iso),
): string {
  const [year, month, day] = iso.split('-').map(Number);
  const step = Number.isFinite(interval) ? Math.max(1, Math.trunc(interval)) : 1;

  if (frequency === 'weekly') {
    return toISODate(new Date(year, month - 1, day + 7 * step));
  }

  const months = frequency === 'monthly' ? step : step * 12;
  const target = (month - 1) + months;
  const targetYear = year + Math.floor(target / 12);
  const targetMonth = ((target % 12) + 12) % 12;
  const clampedDay = Math.min(anchorDay, lastDayOfMonth(targetYear, targetMonth));
  return toISODate(new Date(targetYear, targetMonth, clampedDay));
}

/** Première échéance de la règle qui n'est pas antérieure à `notBefore`. */
export function firstRecurringDue(
  startDate: string,
  frequency: RecurrenceFrequency,
  interval: number,
  notBefore: string,
): string {
  const anchor = dayOfMonth(startDate);
  let cursor = startDate;
  for (let guard = 0; cursor < notBefore && guard < 1000; guard += 1) {
    cursor = advanceRecurringDate(cursor, frequency, interval, anchor);
  }
  return cursor;
}

/** Identifiant déterministe de l'opération générée pour une échéance donnée. */
export function recurringTransactionId(ruleId: string, dateISO: string): string {
  return `rec-${ruleId}-${dateISO}`;
}
