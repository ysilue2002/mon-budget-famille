/**
 * Documents commerciaux — logique PURE, testable sans base ni réseau.
 *
 * Trois familles de documents, aux effets volontairement différents :
 *   - le DEVIS (DEV-…) propose un prix : aucun chiffre d'affaires, aucun stock ;
 *   - la FACTURE est une vente numérotée (FAC-…) : elle compte dans les ventes,
 *     déplace le stock et porte le crédit client ;
 *   - le bon d'ACHAT (ACH-…) est un achat numéroté, symétrique de la facture.
 *
 * Deux documents s'y ajoutent autour du devis :
 *   - l'AVENANT (AVE-…) modifie un devis existant en ajoutant ses propres
 *     lignes ; le total révisé est la somme du devis et de ses avenants ;
 *   - la FACTURE D'ACOMPTE (ACO-…) est une vraie facture pour une part du
 *     devis ; son montant est déduit du solde quand le devis devient une vente.
 *
 * Un devis accepté devient une vente : c'est cette vente, et elle seule, qui
 * est comptée — le devis reste archivé comme pièce justificative.
 */
import { lineTotal, tradeTotal } from './trade';
import type { Quote, TradeDocument, TradeLine } from './types';

export type QuoteStatus = Quote['status'];
export type NumberedKind = 'sale' | 'purchase' | 'quote' | 'amendment' | 'deposit';

export const DOCUMENT_PREFIX: Record<NumberedKind, string> = {
  sale: 'FAC',
  purchase: 'ACH',
  quote: 'DEV',
  amendment: 'AVE',
  deposit: 'ACO',
};

const NUMBER_PATTERN = /^([A-Z]{3})-(\d{4})-(\d{4})$/;

/** Numéro suivant pour une année donnée : FAC-2026-0007. */
export function nextDocumentNumber(kind: NumberedKind, year: number, existing: (string | undefined)[]): string {
  const prefix = DOCUMENT_PREFIX[kind];
  let highest = 0;
  for (const value of existing) {
    if (!value) continue;
    const match = NUMBER_PATTERN.exec(value);
    if (!match || match[1] !== prefix || Number(match[2]) !== year) continue;
    highest = Math.max(highest, Number(match[3]));
  }
  return `${prefix}-${year}-${String(highest + 1).padStart(4, '0')}`;
}

/** Année d'un document, tirée de sa date ISO. */
export function yearOf(dateISO: string): number {
  const year = Number(dateISO.slice(0, 4));
  return Number.isFinite(year) && year > 2000 ? year : new Date().getFullYear();
}

/** Total d'un devis (somme des lignes, arrondie à la sous-unité). */
export function quoteTotal(lines: Pick<TradeLine, 'qty' | 'unitPrice'>[]): number {
  return tradeTotal(lines.map((line) => ({ lineTotal: lineTotal(line.qty, line.unitPrice) })));
}

/**
 * Un devis ne peut être transformé qu'une fois, et seulement s'il est accepté.
 * Un avenant ne se transforme jamais seul : il suit son devis.
 */
export function quoteCanConvert(quote: Pick<Quote, 'status' | 'convertedSaleId'> & Pick<Partial<Quote>, 'kind'>): boolean {
  if (quote.convertedSaleId) return false;
  if (quote.kind === 'amendment') return false;
  return quote.status === 'accepted';
}

/** Vrai pour un avenant (document qui modifie un devis existant). */
export function isAmendment(quote: Pick<Partial<Quote>, 'kind'>): boolean {
  return quote.kind === 'amendment';
}

/** Avenants rattachés à un devis, dans l'ordre de leur date. */
export function amendmentsOf<T extends Pick<Quote, 'kind' | 'parentQuoteId' | 'date'>>(quotes: T[], parentId: string): T[] {
  return quotes
    .filter((quote) => quote.kind === 'amendment' && quote.parentQuoteId === parentId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Total révisé d'un devis : ses lignes plus celles de ses avenants. */
export function revisedQuoteTotal(
  quote: Pick<Quote, 'total'>,
  amendments: Pick<Quote, 'total'>[],
): number {
  return amendments.reduce((sum, amendment) => sum + Math.max(0, amendment.total), Math.max(0, quote.total));
}

/** Somme des acomptes déjà facturés sur un devis (montants TTC). */
export function depositsTotal(quote: Pick<Partial<Quote>, 'deposits'>): number {
  return (quote.deposits ?? []).reduce((sum, deposit) => sum + Math.max(0, deposit.amount), 0);
}

/**
 * Montant d'un acompte : une part du total, arrondie à la sous-unité et bornée
 * au total. 30 % de 100 000 donnent 30 000.
 */
export function depositAmount(baseTotal: number, percent: number): number {
  const base = Number.isFinite(baseTotal) ? Math.max(0, baseTotal) : 0;
  const rate = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return Math.min(base, Math.round((base * rate) / 100));
}

/** Un devis transformé ou refusé ne se modifie plus (pièce historique). */
export function quoteIsEditable(quote: Pick<Quote, 'status' | 'convertedSaleId'>): boolean {
  return !quote.convertedSaleId && quote.status !== 'converted';
}

/** Clés i18n des statuts de devis. */
export const QUOTE_STATUS_KEY: Record<QuoteStatus, string> = {
  draft: 'quotes.statusDraft',
  sent: 'quotes.statusSent',
  accepted: 'quotes.statusAccepted',
  refused: 'quotes.statusRefused',
  converted: 'quotes.statusConverted',
};

/** Libellé court d'une vente ou d'un achat, utilisé dans les états. */
export function documentLabel(document: Pick<TradeDocument, 'kind' | 'number' | 'partyName'>): string {
  const base = document.number ?? '—';
  return document.partyName ? `${base} · ${document.partyName}` : base;
}

/** Date d'échéance par défaut d'une facture (30 jours après émission). */
export function defaultDueDate(dateISO: string, days = 30): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Vrai si l'échéance est dépassée et qu'il reste quelque chose à payer. */
export function isOverdue(document: Pick<TradeDocument, 'due' | 'dueDate'>, today: string): boolean {
  return document.due > 0 && Boolean(document.dueDate) && String(document.dueDate) < today;
}
