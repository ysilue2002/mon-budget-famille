/**
 * Avances reçues — logique PURE.
 *
 * Une avance est de l'argent reçu **avant** la livraison : ce n'est pas une
 * vente. On suit donc séparément le montant reçu, le reste éventuel à recevoir
 * et l'état de la commande, sans jamais l'ajouter au chiffre d'affaires.
 */
import type { Advance } from './types';

/** Reste à recevoir (0 si aucun montant total n'est renseigné, ou si complet). */
export function advanceRemaining(advance: Pick<Advance, 'amount' | 'expected'>): number {
  if (!advance.expected || advance.expected <= 0) return 0;
  return Math.max(0, Math.round(advance.expected) - Math.round(advance.amount));
}

/** Total des avances encore en cours (état « open »). */
export function openAdvancesTotal(advances: Advance[]): number {
  return advances
    .filter((advance) => advance.status === 'open')
    .reduce((sum, advance) => sum + Math.max(0, Math.round(advance.amount)), 0);
}

/** Total restant à recevoir sur les avances en cours. */
export function openAdvancesRemaining(advances: Advance[]): number {
  return advances
    .filter((advance) => advance.status === 'open')
    .reduce((sum, advance) => sum + advanceRemaining(advance), 0);
}

/** Une avance est « complète » quand le montant attendu est atteint. */
export function isAdvanceComplete(advance: Pick<Advance, 'amount' | 'expected'>): boolean {
  return Boolean(advance.expected && advance.expected > 0) && advanceRemaining(advance) === 0;
}
