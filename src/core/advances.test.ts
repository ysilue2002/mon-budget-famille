import { describe, expect, it } from 'vitest';
import {
  advanceDirection,
  advanceRemaining,
  isAdvanceComplete,
  openAdvancesRemaining,
  openAdvancesTotal,
} from './advances';
import type { Advance } from './types';

function advance(partial: Partial<Advance>): Advance {
  return {
    id: 'a1',
    familyId: 'f1',
    subject: 'Commande de 10 sacs de riz',
    amount: 15_000,
    expected: 25_000,
    receivedOn: '2026-11-01',
    status: 'open',
    createdAt: 0,
    baseRev: 0,
    rev: 0,
    updatedAt: 0,
    deviceId: 'd',
    syncStatus: 'synced',
    ...partial,
  };
}

describe('avances — sens de l’acompte', () => {
  it('reçu par défaut, versé quand il est indiqué', () => {
    expect(advanceDirection(advance({}))).toBe('received');
    expect(advanceDirection(advance({ direction: 'paid' }))).toBe('paid');
  });

  it('les totaux en cours se filtrent par sens', () => {
    const rows = [
      advance({ id: 'a', amount: 10_000, direction: 'received' }),
      advance({ id: 'b', amount: 4_000, direction: 'paid' }),
    ];
    expect(openAdvancesTotal(rows)).toBe(14_000);
    expect(openAdvancesTotal(rows, 'received')).toBe(10_000);
    expect(openAdvancesTotal(rows, 'paid')).toBe(4_000);
  });

  it('le restant suit le même filtre', () => {
    const rows = [
      advance({ id: 'a', amount: 10_000, expected: 25_000, direction: 'received' }),
      advance({ id: 'b', amount: 4_000, expected: 10_000, direction: 'paid' }),
    ];
    expect(openAdvancesRemaining(rows, 'received')).toBe(15_000);
    expect(openAdvancesRemaining(rows, 'paid')).toBe(6_000);
  });
});

describe('avances — reste à recevoir', () => {
  it('reste = total attendu − montant reçu', () => {
    expect(advanceRemaining(advance({ amount: 15_000, expected: 25_000 }))).toBe(10_000);
  });

  it('jamais négatif, et nul sans montant attendu', () => {
    expect(advanceRemaining(advance({ amount: 30_000, expected: 25_000 }))).toBe(0);
    expect(advanceRemaining(advance({ amount: 15_000, expected: undefined }))).toBe(0);
  });

  it('complète seulement si un montant attendu est renseigné et atteint', () => {
    expect(isAdvanceComplete(advance({ amount: 25_000, expected: 25_000 }))).toBe(true);
    expect(isAdvanceComplete(advance({ amount: 15_000, expected: 25_000 }))).toBe(false);
    expect(isAdvanceComplete(advance({ amount: 15_000, expected: undefined }))).toBe(false);
  });
});

describe('avances — totaux', () => {
  it('seules les avances en cours comptent', () => {
    const rows = [
      advance({ id: 'a', amount: 15_000, expected: 25_000, status: 'open' }),
      advance({ id: 'b', amount: 5_000, expected: 5_000, status: 'open' }),
      advance({ id: 'c', amount: 9_000, expected: 9_000, status: 'delivered' }),
      advance({ id: 'd', amount: 7_000, expected: 7_000, status: 'refunded' }),
    ];
    expect(openAdvancesTotal(rows)).toBe(20_000);
    expect(openAdvancesRemaining(rows)).toBe(10_000);
  });
});
