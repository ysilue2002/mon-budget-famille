import { describe, expect, it } from 'vitest';
import { normalizeTaxRate, taxBreakdown } from '@/core/trade';

describe('TVA et totaux HT / TTC', () => {
  it('sans taux, le total égale la somme des lignes', () => {
    const lines = [{ lineTotal: 500_000 }, { lineTotal: 600_000 }];
    expect(taxBreakdown(lines, 0)).toEqual({ subtotal: 1_100_000, rate: 0, tax: 0, total: 1_100_000 });
    expect(taxBreakdown(lines, undefined).total).toBe(1_100_000);
  });

  it('applique un taux de 20 % sur les prix hors taxe', () => {
    const result = taxBreakdown([{ lineTotal: 500_000 }, { lineTotal: 600_000 }, { lineTotal: 450_000 }], 20);
    expect(result).toEqual({ subtotal: 1_550_000, rate: 20, tax: 310_000, total: 1_860_000 });
  });

  it('arrondit la TVA à la sous-unité', () => {
    // 3 333 × 20 % = 666,6 → 667
    expect(taxBreakdown([{ lineTotal: 3_333 }], 20)).toMatchObject({ subtotal: 3_333, tax: 667, total: 4_000 });
  });

  it('borne le taux entre 0 et 100 et refuse les valeurs illisibles', () => {
    expect(normalizeTaxRate(-5)).toBe(0);
    expect(normalizeTaxRate(150)).toBe(100);
    expect(normalizeTaxRate(Number.NaN)).toBe(0);
    expect(normalizeTaxRate(undefined)).toBe(0);
    expect(normalizeTaxRate(18.456)).toBe(18.46);
  });

  it('gère un devis vide sans erreur', () => {
    expect(taxBreakdown([], 20)).toEqual({ subtotal: 0, rate: 20, tax: 0, total: 0 });
  });
});
