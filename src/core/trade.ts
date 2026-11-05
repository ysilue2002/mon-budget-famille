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

/** Montant payé borné à [0, total]. */
export function boundPaid(paid: number, total: number): number {
  return Math.min(Math.max(0, Math.round(paid)), Math.max(0, Math.round(total)));
}

/** Reste à payer (jamais négatif). */
export function tradeDue(total: number, paid: number): number {
  return Math.max(0, Math.round(total) - boundPaid(paid, total));
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
