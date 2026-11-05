import { describe, expect, it } from 'vitest';
import { allocatePayment, allocatablePayment, partyBalance } from './payments';

const docs = [
  { id: 'b', due: 2_000, date: '2026-03-10' },
  { id: 'a', due: 1_000, date: '2026-01-05' },
  { id: 'c', due: 0, date: '2026-02-01' },
];

describe('payments — imputation', () => {
  it('paie la dette la plus ancienne d\'abord', () => {
    expect(allocatePayment(docs, 1_500)).toEqual([
      { id: 'a', amount: 1_000 },
      { id: 'b', amount: 500 },
    ]);
  });

  it('ignore les documents soldés et ne dépasse jamais le reste dû', () => {
    expect(allocatePayment(docs, 10_000)).toEqual([
      { id: 'a', amount: 1_000 },
      { id: 'b', amount: 2_000 },
    ]);
  });

  it('un montant nul ou négatif ne produit aucune imputation', () => {
    expect(allocatePayment(docs, 0)).toEqual([]);
    expect(allocatePayment(docs, -500)).toEqual([]);
  });

  it('montant imputable plafonné au total dû', () => {
    expect(allocatablePayment(docs, 5_000)).toBe(3_000);
    expect(allocatablePayment(docs, 700)).toBe(700);
  });

  it('solde d\'une fiche = somme des restes dus', () => {
    expect(partyBalance(docs)).toBe(3_000);
  });
});
