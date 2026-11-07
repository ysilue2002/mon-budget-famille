/**
 * Avances et acomptes — logique PURE.
 *
 * Une avance est de l'argent versé **avant** la livraison. Deux sens :
 * un acompte reçu d'un client (ce n'est pas encore une vente) ou un acompte
 * versé à un fournisseur (ce n'est pas encore un achat). On suit donc
 * séparément le montant, le reste éventuel et l'état de la commande, sans
 * jamais l'ajouter au chiffre d'affaires.
 */
import type { Advance } from './types';

export type AdvanceDirection = 'received' | 'paid';

/** Sens de l'acompte : reçu d'un client (défaut) ou versé à un fournisseur. */
export function advanceDirection(advance: Pick<Advance, 'direction'>): AdvanceDirection {
  return advance.direction === 'paid' ? 'paid' : 'received';
}

/** Reste à recevoir (ou à payer) : 0 sans montant attendu, ou si complet. */
export function advanceRemaining(advance: Pick<Advance, 'amount' | 'expected'>): number {
  if (!advance.expected || advance.expected <= 0) return 0;
  return Math.max(0, Math.round(advance.expected) - Math.round(advance.amount));
}

function inDirection(advances: Advance[], direction?: AdvanceDirection): Advance[] {
  if (!direction) return advances;
  return advances.filter((advance) => advanceDirection(advance) === direction);
}

/** Total des avances encore en cours (état « open »), éventuellement d'un seul sens. */
export function openAdvancesTotal(advances: Advance[], direction?: AdvanceDirection): number {
  return inDirection(advances, direction)
    .filter((advance) => advance.status === 'open')
    .reduce((sum, advance) => sum + Math.max(0, Math.round(advance.amount)), 0);
}

/** Total restant à recevoir (ou à payer) sur les avances en cours. */
export function openAdvancesRemaining(advances: Advance[], direction?: AdvanceDirection): number {
  return inDirection(advances, direction)
    .filter((advance) => advance.status === 'open')
    .reduce((sum, advance) => sum + advanceRemaining(advance), 0);
}

/** Une avance est « complète » quand le montant attendu est atteint. */
export function isAdvanceComplete(advance: Pick<Advance, 'amount' | 'expected'>): boolean {
  return Boolean(advance.expected && advance.expected > 0) && advanceRemaining(advance) === 0;
}
