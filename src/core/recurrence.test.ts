import { describe, expect, it } from 'vitest';
import { advanceRecurringDate, dayOfMonth, firstRecurringDue, recurringTransactionId } from '@/lib/recurrence';

describe('advanceRecurringDate', () => {
  it('avance d’une semaine, avec intervalle', () => {
    expect(advanceRecurringDate('2025-01-01', 'weekly', 1)).toBe('2025-01-08');
    expect(advanceRecurringDate('2025-01-01', 'weekly', 2)).toBe('2025-01-15');
    expect(advanceRecurringDate('2025-12-29', 'weekly', 1)).toBe('2026-01-05');
  });

  it('conserve le jour d’ancrage pour les échéances mensuelles', () => {
    const anchor = dayOfMonth('2025-01-31');
    expect(anchor).toBe(31);
    expect(advanceRecurringDate('2025-01-31', 'monthly', 1, anchor)).toBe('2025-02-28');
    // Pas de dérive : on revient au 31 dès que le mois le permet.
    expect(advanceRecurringDate('2025-02-28', 'monthly', 1, anchor)).toBe('2025-03-31');
  });

  it('gère les années bissextiles et les intervalles annuels', () => {
    const anchor = dayOfMonth('2024-02-29');
    expect(advanceRecurringDate('2024-02-29', 'yearly', 1, anchor)).toBe('2025-02-28');
    expect(advanceRecurringDate('2024-02-29', 'yearly', 2, anchor)).toBe('2026-02-28');
    expect(advanceRecurringDate('2024-03-15', 'yearly', 1, 15)).toBe('2025-03-15');
    expect(advanceRecurringDate('2024-03-31', 'monthly', 3, 31)).toBe('2024-06-30');
  });

  it('retombe sur un intervalle de 1 si la valeur est invalide', () => {
    expect(advanceRecurringDate('2025-01-01', 'weekly', 0)).toBe('2025-01-08');
    expect(advanceRecurringDate('2025-01-01', 'monthly', Number.NaN)).toBe('2025-02-01');
  });
});

describe('firstRecurringDue', () => {
  it('ne génère jamais le passé', () => {
    expect(firstRecurringDue('2025-01-05', 'monthly', 1, '2025-03-10')).toBe('2025-04-05');
    expect(firstRecurringDue('2025-03-15', 'monthly', 1, '2025-03-10')).toBe('2025-03-15');
    expect(firstRecurringDue('2025-03-10', 'monthly', 1, '2025-03-10')).toBe('2025-03-10');
  });
});

describe('recurringTransactionId', () => {
  it('est déterministe par règle et par échéance', () => {
    expect(recurringTransactionId('abc', '2025-01-31')).toBe('rec-abc-2025-01-31');
    expect(recurringTransactionId('abc', '2025-01-31')).toBe(recurringTransactionId('abc', '2025-01-31'));
    expect(recurringTransactionId('abc', '2025-01-31')).not.toBe(recurringTransactionId('abc', '2025-02-28'));
  });
});
