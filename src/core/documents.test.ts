import { describe, expect, it } from 'vitest';
import {
  defaultDueDate,
  documentLabel,
  isOverdue,
  nextDocumentNumber,
  quoteCanConvert,
  quoteIsEditable,
  quoteTotal,
  yearOf,
} from '@/core/documents';

describe('numérotation des documents', () => {
  it('commence à 0001 pour une année et un type donnés', () => {
    expect(nextDocumentNumber('sale', 2026, [])).toBe('FAC-2026-0001');
    expect(nextDocumentNumber('purchase', 2026, [])).toBe('ACH-2026-0001');
    expect(nextDocumentNumber('quote', 2026, [])).toBe('DEV-2026-0001');
  });

  it('continue après le plus grand numéro de l’année', () => {
    expect(nextDocumentNumber('sale', 2026, ['FAC-2026-0001', 'FAC-2026-0007', 'FAC-2026-0003'])).toBe('FAC-2026-0008');
  });

  it('ignore les autres types et les autres années', () => {
    expect(nextDocumentNumber('sale', 2026, ['ACH-2026-0050', 'FAC-2025-0012', 'DEV-2026-0031', undefined])).toBe(
      'FAC-2026-0001',
    );
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
