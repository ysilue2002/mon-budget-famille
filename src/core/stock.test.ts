import { describe, expect, it } from 'vitest';
import { buildStockLedger, isLowStock, lowStockProducts, stockValue, totalUnits, unitMargin } from './stock';
import type { Product, StockMovement } from './types';

function product(partial: Partial<Product>): Product {
  return {
    id: 'p1',
    familyId: 'f1',
    name: 'Riz',
    unit: 'kg',
    buyPrice: 500,
    sellPrice: 700,
    stockQty: 10,
    alertQty: 3,
    archived: false,
    createdAt: 0,
    baseRev: 0,
    rev: 0,
    updatedAt: 0,
    deviceId: 'd',
    syncStatus: 'synced',
    ...partial,
  };
}

describe('stock — valeur et quantités', () => {
  it('valorisé au prix d\'achat et arrondi à la sous-unité', () => {
    const rows = [product({ stockQty: 10, buyPrice: 500 }), product({ id: 'p2', stockQty: 2.5, buyPrice: 1000 })];
    expect(stockValue(rows)).toBe(10 * 500 + Math.round(2.5 * 1000));
    expect(totalUnits(rows)).toBe(12.5);
  });

  it('ignore les produits archivés', () => {
    const rows = [product({ stockQty: 5 }), product({ id: 'p2', archived: true, stockQty: 100 })];
    expect(stockValue(rows)).toBe(5 * 500);
    expect(totalUnits(rows)).toBe(5);
  });

  it('une quantité négative saisie ne fausse pas la valeur', () => {
    expect(stockValue([product({ stockQty: -4 })])).toBe(0);
  });
});

describe('stock — alertes', () => {
  it('alerte au niveau du seuil ou en dessous', () => {
    expect(isLowStock(product({ stockQty: 3, alertQty: 3 }))).toBe(true);
    expect(isLowStock(product({ stockQty: 4, alertQty: 3 }))).toBe(false);
  });

  it('rupture signalée même sans seuil', () => {
    expect(isLowStock(product({ stockQty: 0, alertQty: 0 }))).toBe(true);
  });

  it('seuil à 0 désactive l\'alerte tant qu\'il reste du stock', () => {
    expect(isLowStock(product({ stockQty: 1, alertQty: 0 }))).toBe(false);
  });

  it('les archivés ne remontent jamais en alerte', () => {
    const rows = [product({ stockQty: 0 }), product({ id: 'p2', archived: true, stockQty: 0 })];
    expect(lowStockProducts(rows).map((row) => row.id)).toEqual(['p1']);
  });
});

describe('stock — marge', () => {
  it('marge unitaire = prix de vente − prix d\'achat', () => {
    expect(unitMargin(product({ buyPrice: 500, sellPrice: 700 }))).toBe(200);
    expect(unitMargin(product({ buyPrice: 800, sellPrice: 700 }))).toBe(-100);
  });
});

describe('stock — prestations', () => {
  it('une prestation ne compte ni en valeur ni en alertes', () => {
    const labour = product({ id: 'm1', kind: 'service', buyPrice: 0, sellPrice: 5000, stockQty: 0, alertQty: 0 });
    expect(stockValue([labour])).toBe(0);
    expect(totalUnits([labour])).toBe(0);
    expect(isLowStock(labour)).toBe(false);
    expect(lowStockProducts([labour])).toHaveLength(0);
  });
});

describe('stock — journal daté sur une période', () => {
  const movement = (id: string, date: string, qty: number, reason: StockMovement['reason']) => ({
    id,
    familyId: 'f1',
    productId: 'p1',
    date,
    qty,
    reason,
    createdAt: 0,
    baseRev: 0,
    rev: 0,
    updatedAt: 0,
    deviceId: 'd',
    syncStatus: 'synced' as const,
  });

  it('stock de début, entrées, sorties et stock de fin', () => {
    const rows = [product({ id: 'p1', stockQty: 12, buyPrice: 1000 })];
    const movements: StockMovement[] = [
      movement('m0', '2026-09-30', 10, 'initial'),
      movement('m1', '2026-10-05', 20, 'purchase'),
      movement('m2', '2026-10-20', -8, 'sale'),
      movement('m3', '2026-11-02', 5, 'inventory'),
    ];
    const ledger = buildStockLedger(rows, movements, '2026-10-01', '2026-10-31');
    expect(ledger.lines[0]).toMatchObject({ openingQty: 10, inQty: 20, outQty: 8, closingQty: 22 });
    expect(ledger.openingValue).toBe(10_000);
    expect(ledger.closingValue).toBe(22_000);
    expect(ledger.entries.map((entry) => [entry.date, entry.inQty, entry.outQty, entry.balance])).toEqual([
      ['2026-10-05', 20, 0, 30],
      ['2026-10-20', 0, 8, 22],
    ]);
  });

  it('le passé ne bouge plus quand le stock d’aujourd’hui change', () => {
    const rows = [product({ id: 'p1', stockQty: 999, buyPrice: 1000 })];
    const movements: StockMovement[] = [movement('m1', '2026-10-05', 4, 'purchase')];
    const ledger = buildStockLedger(rows, movements, '2026-10-01', '2026-10-31');
    expect(ledger.lines[0].closingQty).toBe(4);
    expect(ledger.closingValue).toBe(4_000);
  });

  it('les prestations et les archivés sortent du journal', () => {
    const rows = [
      product({ id: 'p1', kind: 'service', stockQty: 0 }),
      product({ id: 'p2', archived: true, stockQty: 5 }),
    ];
    const ledger = buildStockLedger(rows, [movement('m1', '2026-10-05', 2, 'purchase')], '2026-10-01', '2026-10-31');
    expect(ledger.lines).toHaveLength(0);
    expect(ledger.entries).toHaveLength(0);
    expect(ledger.closingValue).toBe(0);
  });
});
