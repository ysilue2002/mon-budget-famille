import { describe, expect, it } from 'vitest';
import { computeAccountBalance } from './selectors';

const account = { id: 'a1', initialBalance: 10_000 };

describe('computeAccountBalance — crédits non encaissés', () => {
  it('exclut une vente à crédit du solde disponible', () => {
    const rows = [
      { accountId: 'a1', type: 'income' as const, amountOriginal: 5_000, settled: false },
      { accountId: 'a1', type: 'income' as const, amountOriginal: 2_000, settled: true },
    ];
    expect(computeAccountBalance(account, rows)).toBe(12_000);
  });

  it('exclut un achat à crédit (dette fournisseur) des sorties', () => {
    const rows = [{ accountId: 'a1', type: 'expense' as const, amountOriginal: 3_000, settled: false }];
    expect(computeAccountBalance(account, rows)).toBe(10_000);
  });

  it('les opérations du foyer sans statut restent comptées', () => {
    expect(
      computeAccountBalance(account, [{ accountId: 'a1', type: 'expense' as const, amountOriginal: 1_000 }]),
    ).toBe(9_000);
  });
});
