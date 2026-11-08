import { describe, expect, it } from 'vitest';
import {
  boundPaid,
  buildLines,
  dailySalesDetail,
  lineTotal,
  linesSummary,
  paidForMode,
  stockDeltaMap,
  stockMovements,
  tradeDue,
  tradeStatus,
  tradeTotal,
} from './trade';

describe('trade — règlement à l’enregistrement', () => {
  it('comptant : le document est soldé', () => {
    expect(paidForMode('cash', 12000, 0)).toBe(12000);
  });

  it('crédit : rien n’est payé aujourd’hui', () => {
    expect(paidForMode('credit', 12000, 5000)).toBe(0);
  });

  it('versements : la somme saisie est retenue, bornée au total', () => {
    expect(paidForMode('installments', 12000, 4000)).toBe(4000);
    expect(paidForMode('installments', 12000, 99999)).toBe(12000);
    expect(paidForMode('installments', 12000, -5)).toBe(0);
  });
});

describe('trade — totaux', () => {
  it('total ligne = quantité × prix, arrondi', () => {
    expect(lineTotal(3, 700)).toBe(2100);
    expect(lineTotal(2.5, 1000)).toBe(2500);
    expect(lineTotal(0.333, 999)).toBe(333);
  });

  it('ignore les quantités ou prix négatifs', () => {
    expect(lineTotal(-3, 700)).toBe(0);
    expect(lineTotal(3, -700)).toBe(0);
  });

  it('total du document = somme des lignes', () => {
    expect(tradeTotal([{ lineTotal: 2100 }, { lineTotal: 500 }])).toBe(2600);
    expect(tradeTotal([])).toBe(0);
  });
});

describe('trade — paiement et reste dû', () => {
  it('le payé ne dépasse jamais le total', () => {
    expect(boundPaid(5000, 2600)).toBe(2600);
    expect(boundPaid(-100, 2600)).toBe(0);
  });

  it('reste à payer jamais négatif', () => {
    expect(tradeDue(2600, 1000)).toBe(1600);
    expect(tradeDue(2600, 2600)).toBe(0);
    expect(tradeDue(2600, 9000)).toBe(0);
  });

  it('statut : payé, partiel ou crédit', () => {
    expect(tradeStatus(2600, 2600)).toBe('paid');
    expect(tradeStatus(2600, 1000)).toBe('partial');
    expect(tradeStatus(2600, 0)).toBe('credit');
  });
});

describe('trade — stock', () => {
  it('une vente sort du stock, un achat en fait entrer', () => {
    const lines = [{ productId: 'p1', qty: 3, unitPrice: 700 }];
    expect(stockMovements(lines, 'sale')).toEqual([{ productId: 'p1', qty: -3 }]);
    expect(stockMovements(lines, 'purchase')).toEqual([{ productId: 'p1', qty: 3 }]);
  });

  it('les lignes libres ou à quantité nulle ne bougent pas le stock', () => {
    const lines = [
      { productId: undefined, qty: 5, unitPrice: 100 },
      { productId: 'p2', qty: 0, unitPrice: 100 },
      { productId: 'p3', qty: 2, unitPrice: 100 },
    ];
    expect(stockMovements(lines, 'sale')).toEqual([{ productId: 'p3', qty: -2 }]);
  });

  it('cumule deux lignes de la même marchandise', () => {
    const movements = stockMovements(
      [
        { productId: 'p1', qty: 2, unitPrice: 100 },
        { productId: 'p1', qty: 3, unitPrice: 100 },
      ],
      'sale',
    );
    expect(stockDeltaMap(movements).get('p1')).toBe(-5);
  });
});

describe('trade — lignes enregistrées', () => {
  it('complète identifiant, libellé et total', () => {
    const lines = buildLines([
      { id: 'l1', label: ' Riz ', qty: 2, unitPrice: 700, productId: 'p1' },
      { id: 'l2', label: '', qty: 1, unitPrice: 0 },
    ]);
    expect(lines[0]).toEqual({ id: 'l1', productId: 'p1', label: 'Riz', qty: 2, unitPrice: 700, lineTotal: 1400 });
    expect(lines[1].label).toBe('—');
    expect(lines[1].lineTotal).toBe(0);
  });
});

describe('trade — marchandises à l’écran', () => {
  it('résume un document par ses marchandises et leurs quantités', () => {
    const text = linesSummary(
      [
        { label: 'Riz 25 kg', qty: 2 },
        { label: 'Sucre', qty: 3 },
      ],
      'fr-FR',
    );
    expect(text).toBe('Riz 25 kg × 2 · Sucre × 3');
  });

  it('ignore les lignes sans libellé et les quantités nulles', () => {
    expect(linesSummary([{ label: '   ', qty: 1 }, { label: 'Café', qty: 0 }], 'fr-FR')).toBe('Café');
    expect(linesSummary([])).toBe('');
  });

  it('détaille les ventes du jour, marchandise par marchandise', () => {
    const rows = dailySalesDetail(
      [
        {
          date: '2026-11-08',
          lines: [
            { id: 'a', label: 'Riz 25 kg', qty: 2, unitPrice: 12000, lineTotal: 24000 },
            { id: 'b', label: 'Sucre', qty: 3, unitPrice: 700, lineTotal: 2100 },
          ],
        },
        {
          date: '2026-11-07',
          lines: [{ id: 'c', label: 'Thé', qty: 1, unitPrice: 1500, lineTotal: 1500 }],
        },
      ],
      '2026-11-08',
    );
    expect(rows).toEqual([
      { label: 'Riz 25 kg', qty: 2, unitPrice: 12000, amount: 24000 },
      { label: 'Sucre', qty: 3, unitPrice: 700, amount: 2100 },
    ]);
  });

  it('ne renvoie rien pour un jour sans vente', () => {
    expect(dailySalesDetail([], '2026-11-08')).toEqual([]);
  });
});
