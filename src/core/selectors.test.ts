import { describe, expect, it } from 'vitest';
import type { Budget, Transaction } from './types';
import { budgetStatus, computeAccountBalance, monthTotalsOf, sumByType } from './selectors';

type TxLike = Pick<Transaction, 'type' | 'accountId' | 'toAccountId' | 'amountOriginal'> & { toAmount?: number };
type SummaryTx = Pick<Transaction, 'type' | 'amountInPrimary'>;

describe('selectors — solde de compte', () => {
  const account = { id: 'a1', initialBalance: 10_000 };

  it('applique revenus − dépenses − transferts sortants', () => {
    const txs: TxLike[] = [
      { accountId: 'a1', type: 'income', amountOriginal: 5_000 },
      { accountId: 'a1', type: 'expense', amountOriginal: 2_000 },
      { accountId: 'a1', type: 'transfer', amountOriginal: 3_500, toAccountId: 'a2' },
    ];
    expect(computeAccountBalance(account, txs)).toBe(9_500);
  });

  it('crédite le compte destination d’un transfert (avec montant cible)', () => {
    const txs: TxLike[] = [
      { accountId: 'other', type: 'transfer', amountOriginal: 3_500, toAccountId: 'a1', toAmount: 1_170 },
    ];
    expect(computeAccountBalance(account, txs)).toBe(11_170);
  });

  it('ignore les opérations des autres comptes', () => {
    const txs: TxLike[] = [{ accountId: 'other', type: 'expense', amountOriginal: 9_999 }];
    expect(computeAccountBalance(account, txs)).toBe(10_000);
  });
});

describe('selectors — totaux mensuels', () => {
  it('revenus et dépenses excluent les transferts', () => {
    const txs: SummaryTx[] = [
      { type: 'income', amountInPrimary: 100_000 },
      { type: 'expense', amountInPrimary: 20_000 },
      { type: 'transfer', amountInPrimary: 5_000 },
    ];
    const totals = monthTotalsOf(txs, 'transfer');
    expect(totals.income).toBe(100_000);
    expect(totals.expense).toBe(20_000);
    expect(totals.remaining).toBe(80_000);
  });

  it('sumByType ignore les transferts dans les revenus', () => {
    const txs: SummaryTx[] = [
      { type: 'transfer', amountInPrimary: 7 },
      { type: 'income', amountInPrimary: 12 },
    ];
    expect(sumByType(txs, 'income')).toBe(12);
  });
});

describe('selectors — état de budget', () => {
  const budget = { amountLimit: 10_000, alertThreshold: 80 } as Pick<Budget, 'amountLimit' | 'alertThreshold'>;

  it('calcule percent, reste, alerte, dépassement', () => {
    const ok = budgetStatus(budget, 3_000);
    expect(ok.percent).toBe(30);
    expect(ok.remaining).toBe(7_000);
    expect(ok.alert).toBe(false);
    expect(ok.over).toBe(false);

    const alert = budgetStatus(budget, 8_500);
    expect(alert.percent).toBe(85);
    expect(alert.alert).toBe(true);
    expect(alert.over).toBe(false);

    const over = budgetStatus(budget, 12_000);
    expect(over.over).toBe(true);
    expect(over.remaining).toBe(0);
  });
});
