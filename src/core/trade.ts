/**
 * Calculs des ventes et des achats — logique PURE, testable sans base.
 *
 * Montants en sous-unités de la devise du foyer, quantités éventuellement
 * décimales. Un document (vente ou achat) produit trois choses :
 *   - un total et un reste à payer ;
 *   - une opération de journal (revenu ou dépense) du montant total ;
 *   - un mouvement de stock par ligne rattachée à une marchandise.
 */
import type { TradeLine } from './types';

export type TradeKind = 'sale' | 'purchase';
export type TradeStatus = 'paid' | 'partial' | 'credit';

export interface TradeLineDraft {
  productId?: string;
  qty: number;
  unitPrice: number;
}

function safe(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Total d'une ligne, arrondi à la sous-unité. */
export function lineTotal(qty: number, unitPrice: number): number {
  return Math.round(safe(qty) * safe(unitPrice));
}

/** Total du document (somme des lignes). */
export function tradeTotal(lines: { lineTotal: number }[]): number {
  return lines.reduce((sum, line) => sum + safe(line.lineTotal), 0);
}

/** Quantité lisible : deux décimales au plus, séparateur local. */
export function formatQty(qty: number, locale?: string): string {
  const value = Number.isFinite(qty) ? qty : 0;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

/**
 * « Riz 25 kg × 2 · Sucre × 3 » : les marchandises d'un document, en clair.
 * Les lignes sans libellé sont ignorées ; le séparateur reste modifiable.
 */
export function linesSummary(
  lines: { label?: string; qty: number }[],
  locale?: string,
  separator = ' · ',
): string {
  return lines
    .map((line) => {
      const label = (line.label ?? '').trim();
      if (!label) return '';
      const qty = Number.isFinite(line.qty) ? line.qty : 0;
      return qty > 0 ? `${label} × ${formatQty(qty, locale)}` : label;
    })
    .filter(Boolean)
    .join(separator);
}

/** Une marchandise vendue dans la journée, telle qu'elle apparaît à l'état. */
export interface DailySaleRow {
  label: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

/**
 * Détail des ventes d'un jour : une ligne par marchandise vendue, dans l'ordre
 * des documents. Les prix restent hors taxe, comme sur le document d'origine.
 */
export function dailySalesDetail(
  sales: { date: string; lines: TradeLine[] }[],
  day: string,
): DailySaleRow[] {
  return sales
    .filter((sale) => sale.date === day)
    .flatMap((sale) =>
      sale.lines.map((line) => ({
        label: line.label,
        qty: Number.isFinite(line.qty) ? line.qty : 0,
        unitPrice: line.unitPrice,
        amount: lineTotal(line.qty, line.unitPrice),
      })),
    );
}

/** Taux de TVA normalisé : entre 0 et 100, arrondi à deux décimales. */
export function normalizeTaxRate(rate: number | undefined): number {
  if (!Number.isFinite(rate ?? NaN)) return 0;
  const value = Math.min(100, Math.max(0, rate as number));
  return Math.round(value * 100) / 100;
}

export interface TaxBreakdown {
  /** Somme des lignes, hors taxe. */
  subtotal: number;
  /** Taux appliqué, en pourcentage (0 = aucune taxe). */
  rate: number;
  /** Montant de la TVA, arrondi à la sous-unité. */
  tax: number;
  /** Total toutes taxes comprises : c'est le montant facturé et compté. */
  total: number;
}

/**
 * Décomposition HT / TVA / TTC d'un document.
 *
 * Les prix saisis sont **hors taxe** ; le montant compté (ventes, crédits,
 * règlements) reste le total TTC. À 0 %, le total égale la somme des lignes :
 * les documents sans taxe gardent exactement leurs anciens montants.
 */
export function taxBreakdown(lines: { lineTotal: number }[], rate?: number): TaxBreakdown {
  const subtotal = tradeTotal(lines);
  const normalized = normalizeTaxRate(rate);
  const tax = Math.round((subtotal * normalized) / 100);
  return { subtotal, rate: normalized, tax, total: subtotal + tax };
}

/** Montant payé borné à [0, total]. */
export function boundPaid(paid: number, total: number): number {
  return Math.min(Math.max(0, Math.round(paid)), Math.max(0, Math.round(total)));
}

/** Reste à payer (jamais négatif). */
export function tradeDue(total: number, paid: number): number {
  return Math.max(0, Math.round(total) - boundPaid(paid, total));
}

/** Mode de règlement choisi à la création d'un achat. */
export type PaymentEntryMode = 'cash' | 'credit' | 'installments';

/**
 * Montant payé à l'enregistrement selon le mode choisi : le comptant solde le
 * document, le crédit ne paie rien aujourd'hui, les versements retiennent la
 * somme saisie (bornée au total). Le reste dû se règle ensuite sur la fiche du
 * fournisseur, qui accepte plusieurs paiements.
 */
export function paidForMode(mode: PaymentEntryMode, total: number, entered: number): number {
  if (mode === 'cash') return boundPaid(total, total);
  if (mode === 'credit') return 0;
  return boundPaid(entered, total);
}

/** Statut lisible d'un document selon ce qui reste dû. */
export function tradeStatus(total: number, paid: number): TradeStatus {
  const due = tradeDue(total, paid);
  if (due === 0) return 'paid';
  return boundPaid(paid, total) > 0 ? 'partial' : 'credit';
}

/**
 * Mouvement de stock par marchandise : négatif pour une vente (sortie),
 * positif pour un achat (entrée). Les lignes libres (sans marchandise)
 * n'ont aucun effet sur le stock.
 */
export function stockMovements(
  lines: TradeLineDraft[],
  kind: TradeKind,
): { productId: string; qty: number }[] {
  return lines
    .filter((line): line is TradeLineDraft & { productId: string } => Boolean(line.productId))
    .filter((line) => safe(line.qty) > 0)
    .map((line) => ({
      productId: line.productId,
      qty: kind === 'sale' ? -safe(line.qty) : safe(line.qty),
    }));
}

/**
 * Différence entre deux versions d'un document, par marchandise (pour une
 * correction : on rétablit l'ancien mouvement puis on applique le nouveau).
 */
export function stockDeltaMap(movements: { productId: string; qty: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const movement of movements) {
    map.set(movement.productId, (map.get(movement.productId) ?? 0) + movement.qty);
  }
  return map;
}

/** Lignes du document prêtes à être enregistrées (identifiants + totaux). */
export function buildLines(
  drafts: (TradeLineDraft & { id: string; label: string })[],
): TradeLine[] {
  return drafts.map((draft) => ({
    id: draft.id,
    productId: draft.productId,
    label: draft.label.trim() || '—',
    qty: safe(draft.qty),
    unitPrice: Math.round(safe(draft.unitPrice)),
    lineTotal: lineTotal(draft.qty, draft.unitPrice),
  }));
}
