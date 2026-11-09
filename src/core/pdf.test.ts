import { describe, expect, it } from 'vitest';
import { pdfSafeText } from '@/core/pdf';

describe('pdfSafeText', () => {
  it('remplace les espaces fines et insécables des montants', () => {
    expect(pdfSafeText('500\u202f000\u00a0FCFA')).toBe('500 000 FCFA');
  });

  it('laisse le texte ordinaire intact', () => {
    expect(pdfSafeText('Toiture Diallo · 2026-11-09')).toBe('Toiture Diallo · 2026-11-09');
  });

  it('remplace la flèche absente de la police WinAnsi', () => {
    expect(pdfSafeText('2026-10-01 → 2026-10-31')).toBe('2026-10-01 - 2026-10-31');
  });
});
