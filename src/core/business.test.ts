import { describe, expect, it } from 'vitest';
import { buildBusinessStatement, businessTransactions } from '@/core/business';
import type { Category, Transaction } from '@/core/types';

const categories: Category[] = [
  { id: 'c-ventes', familyId: 'f1', nameFr: 'Ventes', nameEn: 'Sales', type: 'income' },
  { id: 'c-achats', familyId: 'f1', nameFr: 'Achats', nameEn: 'Purchases', type: 'expense' },
];

let counter = 0;
function tx(
  partial: Pick<Transaction, 'date' | 'type' | 'amountInPrimary'> & Partial<Transaction>,
): Transaction {
  counter += 1;
  return {
    id: `tx-${counter}`,
    familyId: 'f1',
    accountId: 'a1',
    authorId: 'u1',
    authorName: 'Awa',
    amountOriginal: partial.amountInPrimary,
    currencyOriginal: 'XOF',
    exchangeRate: 1,
    baseRev: 0,
    rev: 0,
    updatedAt: 0,
    deviceId: 'dev',
    syncStatus: 'pending',
    ...partial,
  };
}

const operations: Transaction[] = [
  tx({ date: '2025-12-31', type: 'income', amountInPrimary: 40_000, businessId: 'b1', categoryId: 'c-ventes' }),
  tx({ date: '2026-01-10', type: 'income', amountInPrimary: 100_000, businessId: 'b1', categoryId: 'c-ventes' }),
  tx({ date: '2026-02-05', type: 'income', amountInPrimary: 50_000, businessId: 'b1', categoryId: 'c-ventes', settled: false }),
  tx({ date: '2026-02-10', type: 'expense', amountInPrimary: 30_000, businessId: 'b1', categoryId: 'c-achats' }),
  tx({ date: '2026-02-20', type: 'expense', amountInPrimary: 20_000, businessId: 'b1', categoryId: 'c-achats', settled: false }),
  // Autre activité et transfert : jamais comptés dans les états de b1.
  tx({ date: '2026-02-01', type: 'income', amountInPrimary: 999, businessId: 'b2', categoryId: 'c-ventes' }),
  tx({ date: '2026-02-02', type: 'transfer', amountInPrimary: 700, businessId: 'b1' }),
  // Opération du foyer sans activité.
  tx({ date: '2026-02-03', type: 'income', amountInPrimary: 500, categoryId: 'c-ventes' }),
];

describe('buildBusinessStatement', () => {
  it('calcule le compte de résultat de la période par catégorie', () => {
    const statement = buildBusinessStatement({
      businessId: 'b1',
      transactions: operations,
      categories,
      from: '2026-02-01',
      to: '2026-02-28',
      lang: 'fr',
    });

    expect(statement.revenue).toBe(50_000);
    expect(statement.expense).toBe(50_000);
    expect(statement.result).toBe(0);
    expect(statement.margin).toBe(0);
    expect(statement.revenueByCategory).toEqual([
      { id: 'c-ventes', label: 'Ventes', total: 50_000, count: 1 },
    ]);
    expect(statement.expenseByCategory).toEqual([
      { id: 'c-achats', label: 'Achats', total: 50_000, count: 2 },
    ]);
    expect(businessTransactions(operations, 'b1').filter((row) => row.date >= '2026-02-01' && row.date <= '2026-02-28')).toHaveLength(3);
  });

  it('distingue trésorerie réglée, créances et dettes, et équilibre le bilan', () => {
    const statement = buildBusinessStatement({
      businessId: 'b1',
      transactions: operations,
      categories,
      from: '2026-02-01',
      to: '2026-02-28',
      lang: 'fr',
    });

    // Ouverture : relevés réglés avant février.
    expect(statement.openingCash).toBe(140_000);
    expect(statement.cashIn).toBe(0);
    expect(statement.cashOut).toBe(30_000);
    expect(statement.cashChange).toBe(-30_000);
    expect(statement.closingCash).toBe(110_000);
    expect(statement.receivables).toBe(50_000);
    expect(statement.payables).toBe(20_000);
    // Situation nette = recettes cumulées − charges cumulées jusqu'à la clôture.
    expect(statement.equity).toBe(140_000);
    expect(statement.totalAssets).toBe(statement.closingCash + statement.receivables);
    expect(statement.totalLiabilities).toBe(statement.payables + statement.equity);
    expect(statement.totalAssets).toBe(statement.totalLiabilities);
  });

  it('ignore les transferts et les opérations des autres activités', () => {
    const tagged = businessTransactions(operations, 'b1');
    expect(tagged.every((row) => row.type !== 'transfer')).toBe(true);
    expect(tagged.some((row) => row.businessId !== 'b1')).toBe(false);

    const statement = buildBusinessStatement({
      businessId: 'b1',
      transactions: operations,
      categories,
      from: '2025-01-01',
      to: '2026-12-31',
      lang: 'en',
    });
    expect(statement.revenue).toBe(190_000);
    expect(statement.expense).toBe(50_000);
    expect(statement.result).toBe(140_000);
    expect(statement.margin).toBeCloseTo((140_000 / 190_000) * 100, 5);
  });

  it('renvoie des états vides sans opération rattachée', () => {
    const statement = buildBusinessStatement({
      businessId: 'inconnue',
      transactions: operations,
      categories,
      from: '2026-01-01',
      to: '2026-12-31',
      lang: 'fr',
    });
    expect(statement.revenue).toBe(0);
    expect(statement.expense).toBe(0);
    expect(statement.result).toBe(0);
    expect(statement.margin).toBe(0);
    expect(statement.revenueByCategory).toEqual([]);
    expect(statement.totalAssets).toBe(0);
    expect(statement.totalLiabilities).toBe(0);
  });
});
