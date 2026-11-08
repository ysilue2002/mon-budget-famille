import { describe, expect, it } from 'vitest';
import {
  anchorFor,
  buildIncomeStatement,
  buildPeriodReport,
  paidAmount,
  periodRange,
  previousAnchor,
  shiftAnchor,
  unpaidAmount,
} from './reports';
import type { Advance, FinancialAccount, Product, TradeDocument, TradeLine, Transaction } from './types';

const sync = { baseRev: 0, rev: 1, updatedAt: 0, deviceId: 'test', syncStatus: 'synced' as const };

function tx(partial: Partial<Transaction> & { date: string; type: Transaction['type']; amountInPrimary: number }): Transaction {
  return {
    id: partial.id ?? `t-${Math.random()}`,
    familyId: 'f1',
    accountId: partial.accountId ?? 'cash',
    authorId: 'u1',
    authorName: 'Test',
    amountOriginal: partial.amountInPrimary,
    currencyOriginal: 'XOF',
    exchangeRate: 1,
    categoryId: partial.categoryId,
    businessId: partial.businessId ?? 'b1',
    date: partial.date,
    settled: partial.settled,
    settledAmount: partial.settledAmount,
    note: partial.note,
    type: partial.type,
    amountInPrimary: partial.amountInPrimary,
    ...sync,
  };
}

function doc(partial: Partial<TradeDocument> & { date: string; total: number; kind: 'sale' | 'purchase' }): TradeDocument {
  return {
    id: partial.id ?? `d-${Math.random()}`,
    familyId: 'f1',
    businessId: partial.businessId ?? 'b1',
    kind: partial.kind,
    date: partial.date,
    lines: [],
    total: partial.total,
    paid: partial.paid ?? partial.total,
    due: partial.due ?? 0,
    paymentMethod: 'cash',
    accountId: 'cash',
    createdAt: 0,
    ...sync,
  };
}

const account: FinancialAccount = {
  id: 'cash',
  familyId: 'f1',
  name: 'Caisse',
  type: 'cash',
  provider: 'wave',
  currency: 'XOF',
  initialBalance: 50_000,
  archived: false,
  ...sync,
};

const product: Product = {
  id: 'p1',
  familyId: 'f1',
  name: 'Sac de riz',
  unit: 'sac',
  buyPrice: 8_000,
  sellPrice: 10_000,
  stockQty: 5,
  alertQty: 1,
  archived: false,
  createdAt: 0,
  ...sync,
};

const advance = (amount: number, receivedOn: string, status: Advance['status'] = 'open'): Advance => ({
  id: `a-${receivedOn}-${amount}`,
  familyId: 'f1',
  subject: 'Commande',
  amount,
  expected: amount + 5_000,
  receivedOn,
  status,
  createdAt: 0,
  ...sync,
});

describe('bilans — bornes de période', () => {
  it('mois, trimestre et année sont inclusifs', () => {
    expect(periodRange('month', '2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29', year: 2028 });
    expect(periodRange('quarter', '2026-Q4')).toEqual({ from: '2026-10-01', to: '2026-12-31', year: 2026 });
    expect(periodRange('year', '2026')).toEqual({ from: '2026-01-01', to: '2026-12-31', year: 2026 });
  });

  it('décalage et période précédente traversent les années', () => {
    expect(previousAnchor('month', '2026-01')).toBe('2025-12');
    expect(previousAnchor('quarter', '2026-Q1')).toBe('2025-Q4');
    expect(previousAnchor('year', '2026')).toBe('2025');
    expect(shiftAnchor('month', '2025-12', 1)).toBe('2026-01');
    expect(shiftAnchor('quarter', '2025-Q4', 1)).toBe('2026-Q1');
  });

  it('ancre calculée depuis une date', () => {
    expect(anchorFor('month', '2026-11-05')).toBe('2026-11');
    expect(anchorFor('quarter', '2026-11-05')).toBe('2026-Q4');
    expect(anchorFor('year', '2026-11-05')).toBe('2026');
  });
});

describe('bilans — formules', () => {
  const transactions = [
    tx({ id: 'v1', date: '2026-02-03', type: 'income', amountInPrimary: 100_000 }),
    tx({ id: 'v2', date: '2026-02-10', type: 'income', amountInPrimary: 50_000, settled: false, settledAmount: 20_000 }),
    tx({ id: 'a1', date: '2026-02-05', type: 'expense', amountInPrimary: 30_000 }),
    tx({ id: 'a2', date: '2026-02-20', type: 'expense', amountInPrimary: 10_000, settled: false, settledAmount: 0 }),
    tx({ id: 'v-hors', date: '2026-01-31', type: 'income', amountInPrimary: 999_000 }),
    tx({ id: 'tr', date: '2026-02-06', type: 'transfer', amountInPrimary: 5_000 }),
    tx({ id: 'v-remise', date: '2026-02-07', type: 'income', amountInPrimary: 7_000, businessId: 'autre' }),
  ];
  const sales = [doc({ date: '2026-02-03', total: 100_000, kind: 'sale' }), doc({ date: '2026-02-10', total: 50_000, kind: 'sale', paid: 20_000, due: 30_000 })];
  const purchases = [doc({ date: '2026-02-05', total: 30_000, kind: 'purchase' })];
  const report = buildPeriodReport({
    businessId: 'b1',
    transactions,
    sales,
    purchases,
    products: [product],
    advances: [advance(15_000, '2026-02-01'), advance(4_000, '2026-01-15')],
    accounts: [account],
    from: '2026-02-01',
    to: '2026-02-28',
  });

  it('ventes de la période, hors autre activité et hors période', () => {
    expect(report.sales).toBe(150_000);
  });

  it('les achats ne sont jamais comptés deux fois', () => {
    expect(report.purchases).toBe(30_000);
    expect(report.expensesTotal).toBe(40_000);
    expect(report.otherExpenses).toBe(10_000);
  });

  it('résultat = ventes − charges de la période', () => {
    expect(report.result).toBe(110_000);
    expect(report.margin).toBeCloseTo((110_000 / 150_000) * 100, 5);
  });

  it('encaissements et paiements ne retiennent que la part réglée', () => {
    expect(paidAmount({ amountInPrimary: 50_000, settled: false, settledAmount: 20_000 })).toBe(20_000);
    expect(unpaidAmount({ amountInPrimary: 50_000, settled: false, settledAmount: 20_000 })).toBe(30_000);
    expect(report.cashIn).toBe(120_000);
    expect(report.cashOut).toBe(30_000);
    expect(report.netCashFlow).toBe(90_000);
  });

  it('crédits clients et fournisseurs = reste dû cumulé', () => {
    expect(report.customerCredit).toBe(30_000);
    expect(report.supplierCredit).toBe(10_000);
  });

  it('les avances ne sont pas des ventes et sont suivies à part', () => {
    expect(report.advancesReceived).toBe(15_000);
    expect(report.advancesOpen).toBe(19_000);
  });

  it('un acompte versé à un fournisseur reste une sortie, jamais une recette', () => {
    const supplierDeposit = { ...advance(20_000, '2026-02-10'), direction: 'paid' as const };
    const withDeposit = buildPeriodReport({
      businessId: 'b1',
      transactions,
      sales,
      purchases,
      products: [product],
      advances: [supplierDeposit, advance(15_000, '2026-02-01')],
      accounts: [account],
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(withDeposit.advancesReceived).toBe(15_000);
    expect(withDeposit.advancesOpen).toBe(15_000);
  });

  it('stock valorisé au prix d’achat', () => {
    expect(report.stockValue).toBe(40_000);
  });

  it('bénéfice et argent disponible sont deux notions distinctes', () => {
    // Une seule vente de 10 000 encaissée, caisse ouverte à 50 000 :
    // le bénéfice vaut 10 000, l'argent disponible 60 000.
    const single = buildPeriodReport({
      businessId: 'b1',
      transactions: [tx({ date: '2026-02-03', type: 'income', amountInPrimary: 10_000 })],
      sales: [],
      purchases: [],
      products: [],
      advances: [],
      accounts: [account],
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(single.result).toBe(10_000);
    expect(single.cashAvailable).toBe(60_000);
    expect(single.cashAvailable).not.toBe(single.result);
  });

  it('les transferts ne sont comptés ni en vente ni en dépense', () => {
    expect(report.sales).not.toBe(157_000);
    expect(report.monthly.find((m) => m.month === '2026-02')?.sales).toBe(150_000);
    expect(report.monthly.find((m) => m.month === '2026-02')?.expenses).toBe(40_000);
    expect(report.monthly.find((m) => m.month === '2026-01')?.sales).toBe(999_000);
  });

  it('graphique annuel : 12 mois, dont les totaux de la période', () => {
    expect(report.monthly).toHaveLength(12);
    expect(report.monthly.reduce((sum, m) => sum + m.sales, 0)).toBe(1_149_000);
  });

  it('la comparaison entre périodes est un simple écart', () => {
    const previous = buildPeriodReport({
      businessId: 'b1',
      transactions,
      sales,
      purchases,
      products: [product],
      advances: [],
      accounts: [account],
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(previous.sales).toBe(999_000);
    expect(previous.result).toBe(999_000);
    expect(report.result - previous.result).toBe(-889_000);
  });
});

describe('compte de résultat', () => {
  const transactions = [
    tx({ id: 'sale-s1', date: '2026-02-03', type: 'income', amountInPrimary: 100_000 }),
    tx({ id: 'purchase-p1', date: '2026-02-05', type: 'expense', amountInPrimary: 30_000, categoryId: 'cat-autres' }),
    tx({ id: 'd1', date: '2026-02-08', type: 'expense', amountInPrimary: 12_000, categoryId: 'cat-loyer' }),
    tx({ id: 'd2', date: '2026-02-09', type: 'expense', amountInPrimary: 8_000, categoryId: 'cat-loyer' }),
    tx({ id: 'd3', date: '2026-02-10', type: 'expense', amountInPrimary: 5_000, categoryId: 'cat-transport' }),
    tx({ id: 'd4', date: '2026-02-11', type: 'expense', amountInPrimary: 3_000 }),
    tx({ id: 'd-hors', date: '2026-01-20', type: 'expense', amountInPrimary: 99_000, categoryId: 'cat-loyer' }),
    tx({ id: 'd-autre', date: '2026-02-12', type: 'expense', amountInPrimary: 7_000, categoryId: 'cat-loyer', businessId: 'autre' }),
    tx({ id: 'tr', date: '2026-02-13', type: 'transfer', amountInPrimary: 4_000 }),
  ];
  const statement = buildIncomeStatement({
    businessId: 'b1',
    transactions,
    sales: [],
    purchases: [],
    from: '2026-02-01',
    to: '2026-02-28',
  });

  it('produits, charges et résultat de la période', () => {
    expect(statement.revenue).toBe(100_000);
    expect(statement.goods).toBe(30_000);
    expect(statement.expenses).toBe(58_000);
    expect(statement.result).toBe(42_000);
    expect(statement.margin).toBeCloseTo(42);
  });

  it('les achats de marchandises ne figurent pas dans les autres charges', () => {
    const ids = statement.otherExpenses.map((line) => line.id);
    expect(ids).not.toContain('cat-autres');
    expect(statement.otherExpenses.reduce((sum, line) => sum + line.total, 0)).toBe(28_000);
  });

  it('les autres charges sont regroupées par catégorie, de la plus forte à la plus faible', () => {
    expect(statement.otherExpenses).toEqual([
      { id: 'cat-loyer', total: 20_000 },
      { id: 'cat-transport', total: 5_000 },
      { id: '', total: 3_000 },
    ]);
  });

  it('période vide : tout à zéro, pas de division par zéro', () => {
    const empty = buildIncomeStatement({
      businessId: 'b1',
      transactions: [],
      sales: [],
      purchases: [],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(empty.revenue).toBe(0);
    expect(empty.expenses).toBe(0);
    expect(empty.margin).toBe(0);
    expect(empty.otherExpenses).toEqual([]);
  });
});

const line = (lineTotal: number): TradeLine => ({
  id: `l-${lineTotal}`,
  label: 'Riz',
  qty: 1,
  unitPrice: lineTotal,
  lineTotal,
});

describe('TVA — bénéfice hors taxe', () => {
  const sale: TradeDocument = {
    ...doc({ date: '2026-04-10', total: 11_800, kind: 'sale', paid: 11_800, due: 0 }),
    taxRate: 18,
    lines: [line(10_000)],
  };
  const purchase: TradeDocument = {
    ...doc({ date: '2026-04-12', total: 5_900, kind: 'purchase', paid: 5_900, due: 0 }),
    taxRate: 18,
    lines: [line(5_000)],
  };
  const transactions = [
    tx({ id: 'sale-s1', date: '2026-04-10', type: 'income', amountInPrimary: 11_800 }),
    tx({ id: 'purchase-p1', date: '2026-04-12', type: 'expense', amountInPrimary: 5_900, categoryId: 'cat-autres' }),
    tx({ id: 'd1', date: '2026-04-15', type: 'expense', amountInPrimary: 1_000, categoryId: 'cat-loyer' }),
  ];

  const report = buildPeriodReport({
    businessId: 'b1',
    transactions,
    sales: [sale],
    purchases: [purchase],
    products: [],
    advances: [],
    accounts: [account],
    from: '2026-04-01',
    to: '2026-04-30',
  });

  const statement = buildIncomeStatement({
    businessId: 'b1',
    transactions,
    sales: [sale],
    purchases: [purchase],
    from: '2026-04-01',
    to: '2026-04-30',
  });

  it('le bénéfice est hors taxe, et la TVA reste à reverser', () => {
    expect(report.sales).toBe(11_800);
    expect(report.salesNet).toBe(10_000);
    expect(report.purchasesNet).toBe(5_000);
    expect(report.salesTax).toBe(1_800);
    expect(report.purchasesTax).toBe(900);
    expect(report.taxDue).toBe(900);
    expect(report.result).toBe(4_000);
    expect(report.margin).toBeCloseTo(40);
  });

  it('le compte de résultat détaillé affiche la TVA collectée, déductible et à payer', () => {
    expect(statement.revenue).toBe(10_000);
    expect(statement.goods).toBe(5_000);
    expect(statement.expenses).toBe(6_000);
    expect(statement.result).toBe(4_000);
    expect(statement.salesTax).toBe(1_800);
    expect(statement.purchasesTax).toBe(900);
    expect(statement.taxDue).toBe(900);
  });

  it('le graphique mensuel compare des montants hors taxe', () => {
    expect(report.monthly.find((point) => point.month === '2026-04')).toEqual({
      month: '2026-04',
      sales: 10_000,
      expenses: 6_000,
      result: 4_000,
    });
  });
});

describe('bilans — périodes vides', () => {
  it('aucune donnée : tous les montants à zéro, pas de division par zéro', () => {
    const empty = buildPeriodReport({
      businessId: 'b1',
      transactions: [],
      sales: [],
      purchases: [],
      products: [],
      advances: [],
      accounts: [],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(empty.result).toBe(0);
    expect(empty.margin).toBe(0);
    expect(empty.monthly.every((m) => m.sales === 0 && m.expenses === 0)).toBe(true);
  });
});
