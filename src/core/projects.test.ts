import { describe, expect, it } from 'vitest';
import {
  projectEntries,
  projectReceivedAdvances,
  projectReportEntries,
  projectSales,
  projectTotals,
  sortedProjects,
} from '@/core/projects';
import type {
  Advance,
  Product,
  Project,
  SyncFields,
  TradeDocument,
  Transaction,
} from '@/core/types';

const sync: SyncFields = {
  baseRev: 0,
  rev: 0,
  updatedAt: 0,
  deviceId: 'test',
  syncStatus: 'synced',
};

function product(id: string, kind: Product['kind'], name = id): Product {
  return {
    id,
    familyId: 'f',
    name,
    kind,
    unit: 'pcs',
    buyPrice: 0,
    sellPrice: 0,
    stockQty: 0,
    alertQty: 0,
    archived: false,
    createdAt: 0,
    ...sync,
  };
}

function project(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    familyId: 'f',
    name: id,
    startDate: '2026-01-01',
    status: 'open',
    archived: false,
    createdAt: 0,
    ...sync,
    ...overrides,
  };
}

function document_(id: string, kind: 'sale' | 'purchase', projectId: string | undefined, lines: [number, number][], total = 0, due = 0): TradeDocument {
  return {
    id,
    familyId: 'f',
    businessId: 'b',
    kind,
    date: '2026-03-01',
    projectId,
    lines: lines.map(([qty, unitPrice], index) => ({
      id: `${id}-${index}`,
      productId: index === 0 ? 'ciment' : 'main',
      label: index === 0 ? 'Ciment' : 'Main d’œuvre',
      qty,
      unitPrice,
      lineTotal: Math.round(qty * unitPrice),
    })),
    total,
    paid: total - due,
    due,
    paymentMethod: 'cash',
    accountId: 'a',
    createdAt: 0,
    ...sync,
  };
}

function expense(id: string, projectId: string | undefined, amount: number): Transaction {
  return {
    id,
    familyId: 'f',
    accountId: 'a',
    authorId: 'u',
    authorName: 'Test',
    type: 'expense',
    amountOriginal: amount,
    currencyOriginal: 'XOF',
    exchangeRate: 1,
    amountInPrimary: amount,
    businessId: 'b',
    projectId,
    settled: true,
    date: '2026-03-02',
    ...sync,
  };
}

function advance(id: string, projectId: string | undefined, amount: number, status: Advance['status']): Advance {
  return {
    id,
    familyId: 'f',
    projectId,
    subject: 'Acompte',
    amount,
    receivedOn: '2026-02-01',
    direction: 'received',
    status,
    createdAt: 0,
    ...sync,
  };
}

describe('projectTotals', () => {
  const books = {
    products: [product('ciment', 'goods'), product('main', 'service')],
    // Vente : 5 sacs à 1 000 + 2 m² de main d'œuvre à 2 500 = 10 000 HT.
    sales: [
      document_('s1', 'sale', 'p1', [
        [5, 1000],
        [2, 2500],
      ], 10_000, 4000),
      document_('s2', 'sale', 'p2', [[1, 99_000]]),
      document_('s3', 'sale', undefined, [[1, 5000]]),
    ],
    purchases: [
      document_('a1', 'purchase', 'p1', [[3, 800]], 2400),
      document_('a2', 'purchase', 'p2', [[1, 50_000]], 50_000),
    ],
    transactions: [
      expense('t1', 'p1', 1000),
      // Opération générée par la vente s1 : déjà comptée comme vente.
      expense('sale-s1', 'p1', 10_000),
      expense('t2', 'p2', 2000),
      expense('t3', undefined, 7000),
    ],
    advances: [
      advance('av1', 'p1', 3000, 'open'),
      advance('av2', 'p1', 2500, 'refunded'),
      advance('av3', 'p2', 11_000, 'open'),
    ],
  };

  it('isole les documents du chantier et sépare main d’œuvre et fournitures', () => {
    const totals = projectTotals('p1', books);
    expect(totals.salesHt).toBe(10_000);
    expect(totals.laborHt).toBe(5000);
    expect(totals.suppliesHt).toBe(5000);
    expect(totals.purchasesHt).toBe(2400);
    expect(totals.due).toBe(4000);
    expect(totals.salesCount).toBe(1);
    expect(totals.purchasesCount).toBe(1);
  });

  it('compte les dépenses rattachées sans doubler la vente du document', () => {
    const totals = projectTotals('p1', books);
    expect(totals.expenses).toBe(1000);
    expect(totals.expenseCount).toBe(1);
    expect(totals.margin).toBe(10_000 - 2400 - 1000);
  });

  it('retient les acomptes reçus non remboursés', () => {
    const totals = projectTotals('p1', books);
    expect(totals.advancesReceived).toBe(3000);
    expect(totals.advanceCount).toBe(1);
  });

  it('ne compte rien pour un chantier vide', () => {
    const totals = projectTotals('inconnu', books);
    expect(totals.salesHt).toBe(0);
    expect(totals.margin).toBe(0);
    expect(totals.advancesReceived).toBe(0);
  });

  it('considère les lignes libres comme des fournitures', () => {
    const totals = projectTotals('p2', books);
    expect(totals.laborHt).toBe(0);
    expect(totals.suppliesHt).toBe(99_000);
  });
});

describe('projectEntries', () => {
  it('liste ventes, achats, dépenses et acomptes du plus récent au plus ancien', () => {
    const books = {
      products: [product('ciment', 'goods'), product('main', 'service')],
      sales: [document_('s1', 'sale', 'p1', [[1, 1000]], 1000)],
      purchases: [document_('a1', 'purchase', 'p1', [[1, 500]], 500)],
      transactions: [expense('t1', 'p1', 250), expense('sale-s1', 'p1', 1000)],
      advances: [advance('av1', 'p1', 300, 'open')],
    };
    const entries = projectEntries('p1', books);
    expect(entries.map((entry) => entry.kind)).toEqual(['expense', 'sale', 'purchase', 'advance']);
    expect(entries.map((entry) => entry.amount)).toEqual([250, 1000, 500, 300]);
  });
});

describe('projectReportEntries', () => {
  it('affiche le numéro du document et son montant hors taxe', () => {
    const books = {
      products: [product('ciment', 'goods'), product('main', 'service')],
      sales: [document_('s1', 'sale', 'p1', [[1, 1000]], 1180)],
      purchases: [document_('a1', 'purchase', 'p1', [[1, 500]], 590)],
      transactions: [expense('t1', 'p1', 250)],
      advances: [advance('av1', 'p1', 300, 'open')],
    };
    books.sales[0] = { ...books.sales[0], number: 'FAC-2026-0007', partyName: 'Diallo' };
    const entries = projectReportEntries('p1', books);
    const sale = entries.find((entry) => entry.kind === 'sale');
    const purchase = entries.find((entry) => entry.kind === 'purchase');
    expect(sale?.amount).toBe(1000);
    expect(sale?.label).toBe('FAC-2026-0007 · Diallo');
    expect(purchase?.amount).toBe(500);
    expect(entries.find((entry) => entry.kind === 'expense')?.amount).toBe(250);
  });
});

describe('sortedProjects', () => {
  it('place les chantiers ouverts et récents en premier', () => {
    const rows = [
      project('vieux-fini', { status: 'done', startDate: '2026-01-01' }),
      project('recent', { startDate: '2026-05-01' }),
      project('archive', { archived: true, startDate: '2026-06-01' }),
    ];
    expect(sortedProjects(rows).map((row) => row.id)).toEqual(['recent', 'vieux-fini', 'archive']);
  });
});

describe('période des états', () => {
  const books = {
    products: [product('ciment', 'goods')],
    sales: [
      { ...document_('s1', 'sale', 'p1', [[1, 1000]], 1000, 400), date: '2026-02-10', number: 'FAC-1' },
      { ...document_('s2', 'sale', 'p1', [[1, 2000]], 2000, 0), date: '2026-03-10', number: 'FAC-2' },
    ],
    purchases: [{ ...document_('a1', 'purchase', 'p1', [[1, 300]]), date: '2026-02-11' }],
    transactions: [
      { ...expense('t1', 'p1', 100), date: '2026-02-12' },
      { ...expense('t2', 'p1', 900), date: '2026-03-12' },
    ],
    advances: [
      { ...advance('av1', 'p1', 500, 'open'), receivedOn: '2026-02-15' },
      { ...advance('av2', 'p1', 700, 'open'), receivedOn: '2026-03-15' },
      { ...advance('av3', 'p1', 800, 'refunded'), receivedOn: '2026-02-16' },
    ],
  };
  const february = { from: '2026-02-01', to: '2026-02-28' };

  it('ne retient que les documents de la période demandée', () => {
    const totals = projectTotals('p1', books, february);
    expect(totals.salesHt).toBe(1000);
    expect(totals.purchasesHt).toBe(300);
    expect(totals.expenses).toBe(100);
    expect(totals.advancesReceived).toBe(500);
    expect(totals.due).toBe(400);
    expect(totals.margin).toBe(600);
    expect(totals.salesCount).toBe(1);
  });

  it('garde tous les documents sans période', () => {
    const totals = projectTotals('p1', books);
    expect(totals.salesHt).toBe(3000);
    expect(totals.expenses).toBe(1000);
    expect(totals.advancesReceived).toBe(1200);
    expect(totals.due).toBe(400);
  });

  it('filtre aussi le journal imprimé', () => {
    const entries = projectReportEntries('p1', books, february);
    expect(entries.map((entry) => entry.kind)).toEqual([
      'advance',
      'advance',
      'expense',
      'purchase',
      'sale',
    ]);
    expect(projectEntries('p1', books)).toHaveLength(8);
  });

  it('liste les ventes avec ce qui est facturé, reçu et dû', () => {
    const sales = projectSales('p1', books);
    expect(sales.map((sale) => sale.label)).toEqual(['FAC-2', 'FAC-1']);
    expect(sales.map((sale) => [sale.total, sale.paid, sale.due])).toEqual([
      [2000, 2000, 0],
      [1000, 600, 400],
    ]);
    expect(projectSales('p1', books, february).map((sale) => sale.id)).toEqual(['s1']);
  });

  it('liste les acomptes reçus de la période, sans les remboursés', () => {
    expect(projectReceivedAdvances('p1', books).map((line) => line.amount)).toEqual([700, 500]);
    expect(projectReceivedAdvances('p1', books, february).map((line) => line.amount)).toEqual([500]);
  });
});
