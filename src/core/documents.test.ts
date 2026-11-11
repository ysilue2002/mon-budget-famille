import { describe, expect, it } from 'vitest';
import {
  amendmentsOf,
  defaultDueDate,
  depositAmount,
  depositsTotal,
  documentLabel,
  isAmendment,
  isOverdue,
  nextDocumentNumber,
  quoteCanConvert,
  quoteIsEditable,
  quoteTotal,
  revisedQuoteTotal,
  yearOf,
} from '@/core/documents';

describe('numérotation des documents', () => {
  it('commence à 0001 pour une année et un type donnés', () => {
    expect(nextDocumentNumber('sale', 2026, [])).toBe('FAC-2026-0001');
    expect(nextDocumentNumber('purchase', 2026, [])).toBe('ACH-2026-0001');
    expect(nextDocumentNumber('quote', 2026, [])).toBe('DEV-2026-0001');
    expect(nextDocumentNumber('amendment', 2026, [])).toBe('AVE-2026-0001');
    expect(nextDocumentNumber('deposit', 2026, [])).toBe('ACO-2026-0001');
  });

  it('continue après le plus grand numéro de l’année', () => {
    expect(nextDocumentNumber('sale', 2026, ['FAC-2026-0001', 'FAC-2026-0007', 'FAC-2026-0003'])).toBe('FAC-2026-0008');
  });

  it('ignore les autres types et les autres années', () => {
    expect(nextDocumentNumber('sale', 2026, ['ACH-2026-0050', 'FAC-2025-0012', 'DEV-2026-0031', undefined])).toBe(
      'FAC-2026-0001',
    );
    expect(nextDocumentNumber('deposit', 2026, ['FAC-2026-0004', 'ACO-2026-0002'])).toBe('ACO-2026-0003');
  });

  it('ignore une valeur qui n’est pas un numéro', () => {
    expect(nextDocumentNumber('quote', 2026, ['devis-1', 'DEV-2026-00a2'])).toBe('DEV-2026-0001');
  });

  it('déduit l’année d’une date ISO', () => {
    expect(yearOf('2026-11-06')).toBe(2026);
    expect(yearOf('2027-01-01')).toBe(2027);
  });
});

describe('devis', () => {
  it('calcule le total des lignes', () => {
    expect(
      quoteTotal([
        { qty: 3, unitPrice: 1_500_000 },
        { qty: 1.5, unitPrice: 200_000 },
      ]),
    ).toBe(4_800_000);
    expect(quoteTotal([])).toBe(0);
  });

  it('ne se transforme qu’une fois et seulement s’il est accepté', () => {
    expect(quoteCanConvert({ status: 'accepted' })).toBe(true);
    expect(quoteCanConvert({ status: 'accepted', convertedSaleId: 'sale-1' })).toBe(false);
    expect(quoteCanConvert({ status: 'draft' })).toBe(false);
    expect(quoteCanConvert({ status: 'refused' })).toBe(false);
    expect(quoteCanConvert({ status: 'converted', convertedSaleId: 'sale-1' })).toBe(false);
  });

  it('reste modifiable tant qu’il n’est pas transformé', () => {
    expect(quoteIsEditable({ status: 'draft' })).toBe(true);
    expect(quoteIsEditable({ status: 'accepted' })).toBe(true);
    expect(quoteIsEditable({ status: 'converted', convertedSaleId: 'sale-1' })).toBe(false);
  });
});

describe('avenants', () => {
  it('reconnaît un avenant et le rattache à son devis', () => {
    const amendment = { kind: 'amendment' as const, parentQuoteId: 'q1', date: '2026-03-02', total: 250_000 };
    const other = { kind: 'amendment' as const, parentQuoteId: 'q2', date: '2026-03-03', total: 90_000 };
    const first = { kind: 'amendment' as const, parentQuoteId: 'q1', date: '2026-03-01', total: 100_000 };
    const quote = { parentQuoteId: 'q1', date: '2026-03-01', total: 1_000_000 };

    expect(isAmendment(amendment)).toBe(true);
    expect(isAmendment({ kind: 'quote' })).toBe(false);
    expect(amendmentsOf([other, amendment, first, quote], 'q1').map((row) => row.total)).toEqual([100_000, 250_000]);
  });

  it('additionne les avenants au total du devis', () => {
    expect(revisedQuoteTotal({ total: 1_000_000 }, [{ total: 100_000 }, { total: 250_000 }])).toBe(1_350_000);
    expect(revisedQuoteTotal({ total: 1_000_000 }, [])).toBe(1_000_000);
  });

  it('ne transforme jamais un avenant seul en vente', () => {
    expect(quoteCanConvert({ status: 'accepted', kind: 'amendment' })).toBe(false);
    expect(quoteCanConvert({ status: 'accepted', kind: 'quote' })).toBe(true);
  });
});

describe('acomptes', () => {
  it('calcule une part du total, arrondie et bornée', () => {
    expect(depositAmount(4_500_000, 30)).toBe(1_350_000);
    expect(depositAmount(4_500_001, 30)).toBe(1_350_000);
    expect(depositAmount(1_000, 0)).toBe(0);
    expect(depositAmount(1_000, 150)).toBe(1_000);
    expect(depositAmount(1_000, Number.NaN)).toBe(0);
  });

  it('additionne les acomptes déjà facturés', () => {
    expect(
      depositsTotal({
        deposits: [
          { saleId: 's1', number: 'ACO-2026-0001', percent: 30, amount: 1_350_000, date: '2026-03-01' },
          { saleId: 's2', number: 'ACO-2026-0002', percent: 10, amount: 450_000, date: '2026-03-05' },
        ],
      }),
    ).toBe(1_800_000);
    expect(depositsTotal({})).toBe(0);
  });
});

describe('échéances', () => {
  it('calcule une échéance à 30 jours', () => {
    expect(defaultDueDate('2026-11-06')).toBe('2026-12-06');
    expect(defaultDueDate('2026-01-31')).toBe('2026-03-02');
  });

  it('signale une facture en retard, jamais une facture soldée', () => {
    expect(isOverdue({ due: 5_000, dueDate: '2026-10-01' }, '2026-11-06')).toBe(true);
    expect(isOverdue({ due: 0, dueDate: '2026-10-01' }, '2026-11-06')).toBe(false);
    expect(isOverdue({ due: 5_000, dueDate: '2026-12-01' }, '2026-11-06')).toBe(false);
    expect(isOverdue({ due: 5_000 }, '2026-11-06')).toBe(false);
  });

  it('compose un libellé lisible', () => {
    expect(documentLabel({ kind: 'sale', number: 'FAC-2026-0001', partyName: 'Awa' })).toBe('FAC-2026-0001 · Awa');
    expect(documentLabel({ kind: 'purchase', number: 'ACH-2026-0002' })).toBe('ACH-2026-0002');
  });
});
