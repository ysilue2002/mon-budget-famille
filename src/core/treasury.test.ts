import { describe, expect, it } from 'vitest';
import {
  accountLines,
  buildTreasurySnapshot,
  chargesAddUp,
  creditsAt,
  flowRows,
  groupAccounts,
  purchasePaymentsIn,
  settlementsIn,
  totalAvailable,
  transfersIn,
} from '@/core/treasury';
import { buildPeriodReport } from '@/core/reports';
import type {
  Advance,
  FinancialAccount,
  Product,
  Settlement,
  TradeDocument,
  Transaction,
} from '@/core/types';

const sync = { baseRev: 0, rev: 0, updatedAt: 0, deviceId: 'dev', syncStatus: 'pending' as const };

function account(partial: Partial<FinancialAccount> & { id: string; name: string; type: FinancialAccount['type'] }): FinancialAccount {
  return {
    familyId: 'f1',
    provider: null,
    currency: 'XOF',
    initialBalance: 0,
    archived: false,
    ...sync,
    ...partial,
  };
}

function tx(partial: Partial<Transaction> & { id: string; accountId: string; type: Transaction['type'] }): Transaction {
  return {
    familyId: 'f1',
    authorId: 'u1',
    authorName: 'Awa',
    amountOriginal: 0,
    currencyOriginal: 'XOF',
    exchangeRate: 1,
    amountInPrimary: 0,
    date: '2026-11-05',
    businessId: 'b1',
    ...sync,
    ...partial,
  };
}

function document(partial: Partial<TradeDocument> & { id: string; kind: 'sale' | 'purchase' }): TradeDocument {
  return {
    familyId: 'f1',
    businessId: 'b1',
    date: '2026-11-05',
    lines: [],
    total: 0,
    paid: 0,
    due: 0,
    paymentMethod: 'cash',
    accountId: 'cash-1',
    createdAt: 0,
    ...sync,
    ...partial,
  };
}

function settlement(partial: Partial<Settlement> & { id: string }): Settlement {
  return {
    familyId: 'f1',
    kind: 'client',
    amount: 0,
    method: 'cash',
    date: '2026-11-05',
    createdAt: 0,
    ...sync,
    ...partial,
  };
}

const product: Product = {
  id: 'p1',
  familyId: 'f1',
  name: 'Sac de riz',
  unit: 'sac',
  buyPrice: 0,
  sellPrice: 0,
  stockQty: 0,
  alertQty: 0,
  archived: false,
  createdAt: 0,
  ...sync,
};

const accounts: FinancialAccount[] = [
  account({ id: 'cash-1', name: 'Caisse boutique', type: 'cash', initialBalance: 50_000 }),
  account({ id: 'bank-1', name: 'Banque', type: 'bank', initialBalance: 100_000 }),
  account({ id: 'wave-1', name: 'Wave', type: 'mobile', provider: 'wave', initialBalance: 20_000 }),
  account({ id: 'om-1', name: 'Orange Money', type: 'mobile', provider: 'orange', initialBalance: 10_000 }),
];

describe('soldes par compte', () => {
  it('additionne solde initial, entrées, sorties et transferts', () => {
    const transactions = [
      tx({ id: 't1', accountId: 'cash-1', type: 'income', amountOriginal: 30_000 }),
      tx({ id: 't2', accountId: 'cash-1', type: 'expense', amountOriginal: 5_000 }),
      tx({ id: 't3', accountId: 'cash-1', type: 'transfer', toAccountId: 'bank-1', amountOriginal: 15_000 }),
    ];
    const lines = accountLines(accounts, transactions);
    const cash = lines.find((line) => line.account.id === 'cash-1');
    const bank = lines.find((line) => line.account.id === 'bank-1');
    expect(cash?.balance).toBe(60_000); // 50 000 + 30 000 − 5 000 − 15 000
    expect(cash?.movements).toBe(3);
    expect(bank?.balance).toBe(115_000); // 100 000 + 15 000 reçus
    expect(totalAvailable(lines)).toBe(60_000 + 115_000 + 20_000 + 10_000);
  });

  it('groupe caisse, banques et mobile money et ignore les comptes archivés', () => {
    const archived = account({ id: 'old', name: 'Ancienne caisse', type: 'cash', archived: true, initialBalance: 999 });
    const lines = accountLines([...accounts, archived], []);
    const groups = groupAccounts(lines);
    expect(groups.map((group) => group.group)).toEqual(['cash', 'bank', 'mobile']);
    expect(groups[0].total).toBe(50_000);
    expect(groups[2].lines.map((line) => line.account.name)).toEqual(['Orange Money', 'Wave']);
    expect(groups[2].total).toBe(30_000);
  });
});

describe('crédits et avances', () => {
  it('calcule ce qui reste à encaisser et à payer, à la date demandée', () => {
    const sales = [
      document({ id: 's1', kind: 'sale', total: 10_000, paid: 4_000, due: 6_000, partyName: 'Awa' }),
      document({ id: 's2', kind: 'sale', date: '2026-12-05', total: 8_000, paid: 0, due: 8_000, partyName: 'Koffi' }),
    ];
    const purchases = [document({ id: 'a1', kind: 'purchase', total: 5_000, paid: 2_000, due: 3_000, partyName: 'Grossiste' })];
    const credits = creditsAt(sales, purchases, '2026-11-30');
    expect(credits.customer).toBe(6_000); // la vente de décembre est hors période
    expect(credits.supplier).toBe(3_000);
    expect(credits.customers).toBe(1);
    expect(credits.suppliers).toBe(1);
  });
});

describe('transferts', () => {
  it('compte les transferts sans en faire une recette ni une dépense', () => {
    const transactions = [
      tx({ id: 't1', accountId: 'cash-1', type: 'transfer', toAccountId: 'wave-1', amountOriginal: 25_000, amountInPrimary: 25_000 }),
      tx({ id: 't2', accountId: 'cash-1', type: 'transfer', toAccountId: 'bank-1', amountOriginal: 5_000, amountInPrimary: 5_000, date: '2026-12-01' }),
    ];
    const transfers = transfersIn(transactions, '2026-11-01', '2026-11-30');
    expect(transfers).toEqual({ count: 1, total: 25_000 });
  });
});

describe('flux de la période', () => {
  const sales = [document({ id: 's1', kind: 'sale', total: 10_000, paid: 4_000, due: 6_000 })];
  const purchases = [document({ id: 'a1', kind: 'purchase', total: 5_000, paid: 2_000, due: 3_000 })];
  const transactions = [
    tx({ id: 'sale-s1', accountId: 'cash-1', type: 'income', amountOriginal: 10_000, amountInPrimary: 10_000, settled: false, settledAmount: 4_000 }),
    tx({ id: 'purchase-a1', accountId: 'cash-1', type: 'expense', amountOriginal: 5_000, amountInPrimary: 5_000, settled: false, settledAmount: 2_000 }),
    tx({ id: 'e1', accountId: 'cash-1', type: 'expense', amountOriginal: 2_000, amountInPrimary: 2_000, settled: true, categoryId: 'cat-logement' }),
    tx({ id: 'tr1', accountId: 'cash-1', type: 'transfer', toAccountId: 'wave-1', amountOriginal: 1_000, amountInPrimary: 1_000 }),
  ];
  const advances: Advance[] = [
    {
      id: 'adv1',
      familyId: 'f1',
      partyName: 'Awa',
      subject: 'Commande',
      amount: 3_000,
      receivedOn: '2026-11-05',
      status: 'open',
      createdAt: 0,
      ...sync,
    },
  ];

  const report = buildPeriodReport({
    businessId: 'b1',
    transactions,
    sales,
    purchases,
    products: [product],
    stockMovements: [],
    advances,
    accounts,
    from: '2026-11-01',
    to: '2026-11-30',
    year: 2026,
  });

  it('ne compte jamais un achat deux fois', () => {
    expect(report.purchases).toBe(5_000);
    expect(report.otherExpenses).toBe(2_000);
    expect(report.expensesTotal).toBe(7_000);
    expect(chargesAddUp(report)).toBe(true);
  });

  it('sépare ventes facturées et encaissements réels', () => {
    expect(report.sales).toBe(10_000);
    expect(report.cashIn).toBe(4_000);
    expect(report.cashOut).toBe(4_000); // 2 000 payés sur l'achat + 2 000 de dépense
  });

  it('compte avances et transferts à part', () => {
    expect(report.advancesReceived).toBe(3_000);
    const flows = flowRows(report, purchases, '2026-11-01', '2026-11-30');
    const byKey = Object.fromEntries(flows.map((flow) => [flow.key, flow]));
    expect(byKey.sales).toMatchObject({ amount: 10_000, counted: 'no' });
    expect(byKey.collections).toMatchObject({ amount: 4_000, counted: 'yes' });
    expect(byKey.supplierPayments).toMatchObject({ amount: 2_000, counted: 'yes' });
    expect(byKey.expenses).toMatchObject({ amount: 2_000, counted: 'yes' });
    expect(byKey.advances).toMatchObject({ amount: 3_000, counted: 'yes' });
    expect(byKey.transfers.counted).toBe('neutral');
    // Aucun flux n'est compté deux fois : paiement fournisseur + autres dépenses = sorties réelles.
    expect(byKey.supplierPayments.amount + byKey.expenses.amount).toBe(report.cashOut);
  });

  it('la photographie complète reste cohérente', () => {
    const snapshot = buildTreasurySnapshot({
      businessId: 'b1',
      accounts,
      transactions,
      sales,
      purchases,
      products: [product],
      stockMovements: [],
      advances,
      settlements: [
        settlement({ id: 'st1', amount: 4_000, partyName: 'Awa', documentId: 's1' }),
        settlement({ id: 'st2', amount: 2_000, partyName: 'Grossiste', kind: 'supplier', documentId: 'a1' }),
        settlement({ id: 'st3', amount: 9_000, date: '2026-12-02' }),
      ],
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(snapshot.credits).toMatchObject({ customer: 6_000, supplier: 3_000 });
    expect(snapshot.settlements.map((row) => row.id)).toEqual(['st1', 'st2']);
    expect(snapshot.available).toBe(
      totalAvailable(accountLines(accounts, transactions)),
    );
    expect(snapshot.flows.find((flow) => flow.key === 'transfers')?.amount).toBe(1_000);
  });

  it('impute les paiements fournisseurs depuis les documents, pas depuis le journal', () => {
    expect(purchasePaymentsIn(purchases, '2026-11-01', '2026-11-30')).toBe(2_000);
    expect(purchasePaymentsIn(purchases, '2026-12-01', '2026-12-31')).toBe(0);
  });
});

describe('historique des règlements', () => {
  it('filtre par période et trie du plus récent au plus ancien', () => {
    const rows = [
      settlement({ id: 'a', date: '2026-11-02' }),
      settlement({ id: 'b', date: '2026-11-20' }),
      settlement({ id: 'c', date: '2026-10-31' }),
    ];
    expect(settlementsIn(rows, '2026-11-01', '2026-11-30').map((row) => row.id)).toEqual(['b', 'a']);
  });
});
