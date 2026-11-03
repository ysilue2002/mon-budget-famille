import { describe, expect, it } from 'vitest';
import { buildStatement, groupByMember, previousPeriod } from '@/core/statements';
import { normalizeSnapshot } from '@/core/exchange';
import type { Category, FinancialAccount, Transaction } from '@/core/types';

const snapshot = normalizeSnapshot({ XOF: 600, EUR: 0.92, USD: 1 }, 1_700_000_000_000);

const account = (id: string, name: string, currency: FinancialAccount['currency'], initialBalance: number): FinancialAccount => ({
  id,
  familyId: 'f1',
  name,
  type: 'cash',
  provider: null,
  currency,
  initialBalance,
  archived: false,
  baseRev: 0,
  rev: 0,
  updatedAt: 0,
  deviceId: 'd1',
  syncStatus: 'synced',
});

const categories: Category[] = [
  { id: 'cat-salaire', familyId: 'f1', nameFr: 'Salaire', nameEn: 'Salary', type: 'income' },
  { id: 'cat-logement', familyId: 'f1', nameFr: 'Logement', nameEn: 'Housing', type: 'expense' },
  { id: 'cat-alimentation', familyId: 'f1', nameFr: 'Alimentation', nameEn: 'Groceries', type: 'expense' },
];

const tx = (partial: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amountOriginal' | 'amountInPrimary'>): Transaction => ({
  familyId: 'f1',
  accountId: 'acc-cash',
  authorId: 'u1',
  authorName: 'Test',
  currencyOriginal: 'XOF',
  exchangeRate: 1,
  baseRev: 0,
  rev: 0,
  updatedAt: 0,
  deviceId: 'd1',
  syncStatus: 'synced',
  ...partial,
});

const accounts = [account('acc-cash', 'Espèces', 'XOF', 50_000), account('acc-eur', 'Compte EUR', 'EUR', 100_00)];

const transactions: Transaction[] = [
  // Avant la période : salaire de septembre, change l'ouverture d'octobre.
  tx({ id: 't1', date: '2026-09-30', type: 'income', amountOriginal: 100_000, amountInPrimary: 100_000, categoryId: 'cat-salaire' }),
  // Octobre
  tx({ id: 't2', date: '2026-10-01', type: 'income', amountOriginal: 300_000, amountInPrimary: 300_000, categoryId: 'cat-salaire' }),
  tx({ id: 't3', date: '2026-10-03', type: 'expense', amountOriginal: 120_000, amountInPrimary: 120_000, categoryId: 'cat-logement' }),
  tx({ id: 't4', date: '2026-10-08', type: 'expense', amountOriginal: 30_000, amountInPrimary: 30_000, categoryId: 'cat-alimentation' }),
  tx({ id: 't5', date: '2026-10-12', type: 'transfer', accountId: 'acc-cash', toAccountId: 'acc-eur', amountOriginal: 60_000, toAmount: 92, amountInPrimary: 60_000 }),
  // Hors période (novembre)
  tx({ id: 't6', date: '2026-11-02', type: 'expense', amountOriginal: 10_000, amountInPrimary: 10_000, categoryId: 'cat-alimentation' }),
];

describe('buildStatement', () => {
  const statement = buildStatement({
    accounts,
    transactions,
    categories,
    goals: [{ currentAmount: 200_000, currency: 'XOF' }],
    debts: [
      { kind: 'receivable', remainingAmount: 50_000, currency: 'XOF' },
      { kind: 'payable', remainingAmount: 10_000, currency: 'XOF' },
    ],
    from: '2026-10-01',
    to: '2026-10-31',
    primary: 'XOF',
    snapshot,
    lang: 'fr',
  });

  it('calcule le résultat de la période (hors transferts)', () => {
    expect(statement.income).toBe(300_000);
    expect(statement.expense).toBe(150_000);
    expect(statement.net).toBe(150_000);
    expect(statement.savingsRate).toBeCloseTo(50, 5);
    expect(statement.transferCount).toBe(1);
    expect(statement.transactionCount).toBe(4);
  });

  it('regroupe par catégorie, du plus lourd au plus léger, avec les parts', () => {
    expect(statement.expenseLines.map((line) => line.label)).toEqual(['Logement', 'Alimentation']);
    expect(statement.expenseLines[0].total).toBe(120_000);
    expect(statement.expenseLines[0].share).toBeCloseTo(80, 5);
    expect(statement.incomeLines).toHaveLength(1);
    expect(statement.incomeLines[0].share).toBeCloseTo(100, 5);
  });

  it('présente les mouvements de compte dans leur devise', () => {
    const cash = statement.accounts.find((line) => line.id === 'acc-cash');
    // Ouverture : 50 000 + 100 000 (salaire de septembre)
    expect(cash?.opening).toBe(150_000);
    expect(cash?.inflow).toBe(300_000);
    // Dépenses + transfert sortant
    expect(cash?.outflow).toBe(210_000);
    expect(cash?.closing).toBe(240_000);

    const euro = statement.accounts.find((line) => line.id === 'acc-eur');
    expect(euro?.opening).toBe(100_00);
    expect(euro?.inflow).toBe(92);
    expect(euro?.closing).toBe(100_92);

    // Équivalent en XOF : 100 EUR × (600 / 0,92) = 65 217 XOF
    expect(euro?.openingPrimary).toBe(65_217);
  });

  it('consolide le patrimoine à la date de clôture', () => {
    expect(statement.savings).toBe(200_000);
    expect(statement.receivables).toBe(50_000);
    expect(statement.payables).toBe(10_000);
    expect(statement.netWorth).toBe(statement.accountsTotal + 200_000 + 50_000 - 10_000);
  });

  it('reste cohérent sur une période vide', () => {
    const empty = buildStatement({
      accounts,
      transactions,
      categories,
      goals: [],
      debts: [],
      from: '2030-01-01',
      to: '2030-12-31',
      primary: 'XOF',
      snapshot,
      lang: 'en',
    });
    expect(empty.income).toBe(0);
    expect(empty.net).toBe(0);
    expect(empty.savingsRate).toBe(0);
    expect(empty.expenseLines).toEqual([]);
  });
});

describe('previousPeriod', () => {
  it('recule d’un mois pour un mois complet, y compris en janvier', () => {
    expect(previousPeriod('2026-10-01', '2026-10-31')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(previousPeriod('2026-01-01', '2026-01-31')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('recule d’un an pour une année complète', () => {
    expect(previousPeriod('2026-01-01', '2026-12-31')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('utilise une fenêtre de même longueur pour une période libre', () => {
    expect(previousPeriod('2026-10-05', '2026-10-14')).toEqual({ from: '2026-09-25', to: '2026-10-04' });
  });
});

describe('groupByMember', () => {
  it('attribue les opérations au membre choisi, sinon à l’auteur', () => {
    const rows = groupByMember(
      [
        tx({ id: 'm1', date: '2026-10-01', type: 'income', amountOriginal: 100_000, amountInPrimary: 100_000, member: 'Awa' }),
        tx({ id: 'm2', date: '2026-10-02', type: 'expense', amountOriginal: 20_000, amountInPrimary: 20_000, member: 'Awa' }),
        tx({ id: 'm3', date: '2026-10-03', type: 'expense', amountOriginal: 5_000, amountInPrimary: 5_000 }),
      ],
      'fr',
    );
    expect(rows.map((line) => line.label)).toEqual(['Awa', 'Test']);
    expect(rows[0]).toMatchObject({ income: 100_000, expense: 20_000, net: 80_000, count: 2 });
    expect(rows[1]).toMatchObject({ id: 'Test', income: 0, expense: 5_000, count: 1 });
  });

  it('regroupe les opérations non attribuées sous une ligne dédiée', () => {
    const rows = groupByMember(
      [tx({ id: 'm4', date: '2026-10-03', type: 'expense', amountOriginal: 5_000, amountInPrimary: 5_000, authorName: '—' })],
      'en',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Unassigned');
  });
});

describe('buildStatement — comparaison, membres et patrimoine historique', () => {
  const base = {
    accounts,
    transactions,
    categories,
    goals: [{ currentAmount: 200_000, currency: 'XOF' as const }],
    debts: [{ kind: 'payable' as const, remainingAmount: 10_000, currency: 'XOF' as const }],
    from: '2026-10-01',
    to: '2026-10-31',
    primary: 'XOF' as const,
    snapshot,
    lang: 'fr' as const,
  };

  it('ajoute les totaux de la période précédente', () => {
    const statement = buildStatement({ ...base, compare: true });
    expect(statement.comparison).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      income: 100_000,
      expense: 0,
      net: 100_000,
      savingsRate: 100,
    });
    expect(buildStatement(base).comparison).toBeUndefined();
  });

  it('compare les catégories avec la période précédente', () => {
    const statement = buildStatement({ ...base, compare: true });
    expect(statement.comparison?.expenseLines).toEqual([
      { id: 'cat-logement', label: 'Logement', current: 120_000, previous: 0, delta: 120_000 },
      { id: 'cat-alimentation', label: 'Alimentation', current: 30_000, previous: 0, delta: 30_000 },
    ]);
    expect(statement.comparison?.incomeLines[0]).toMatchObject({
      id: 'cat-salaire',
      current: 300_000,
      previous: 100_000,
      delta: 200_000,
    });
  });

  it('répartit les opérations par membre dans le bilan', () => {
    const statement = buildStatement({
      ...base,
      transactions: transactions.map((item) =>
        item.id === 't3' ? { ...item, member: 'Awa' } : item.id === 't4' ? { ...item, member: 'Awa' } : item,
      ),
    });
    const awa = statement.members.find((line) => line.label === 'Awa');
    expect(awa).toMatchObject({ income: 0, expense: 150_000, net: -150_000, count: 2 });
    expect(statement.members.every((line) => line.id !== 'unassigned')).toBe(true);
  });

  it('utilise le dernier relevé de patrimoine antérieur à la clôture', () => {
    const wealth = [
      { date: '2026-08-31', savings: 111_000, receivables: 22_000, payables: 33_000 },
      { date: '2026-10-20', savings: 444_000, receivables: 55_000, payables: 66_000 },
      { date: '2026-12-31', savings: 999_000, receivables: 0, payables: 0 },
    ];
    const statement = buildStatement({ ...base, wealth });
    expect(statement.wealthHistorical).toBe(true);
    expect(statement.wealthDate).toBe('2026-10-20');
    expect(statement.savings).toBe(444_000);
    expect(statement.netWorth).toBe(statement.accountsTotal + 444_000 + 55_000 - 66_000);
  });

  it('retombe sur les montants courants sans relevé historique', () => {
    const statement = buildStatement({ ...base, wealth: [{ date: '2026-12-31', savings: 999_000, receivables: 0, payables: 0 }] });
    expect(statement.wealthHistorical).toBe(false);
    expect(statement.wealthDate).toBe('2026-10-31');
    expect(statement.savings).toBe(200_000);
  });
});
