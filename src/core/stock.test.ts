import { describe, expect, it } from 'vitest';
import { isLowStock, lowStockProducts, stockValue, totalUnits, unitMargin } from './stock';
import type { Product } from './types';

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
