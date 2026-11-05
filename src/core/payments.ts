/**
 * Répartition des encaissements/paiements — logique PURE.
 *
 * Un règlement sur une fiche client (ou fournisseur) s'impute aux documents
 * encore dus, **du plus ancien au plus récent** : la dette la plus vieille
 * disparaît d'abord. Aucun document n'est payé au-delà de son reste dû, et le
 * surplus éventuel n'est pas perdu : l'appelant décide (refus ou avance).
 */
export interface PayableDocument {
  id: string;
  /** Reste dû en sous-unités (>= 0). */
  due: number;
  /** Date ISO (YYYY-MM-DD), sert à l'ordre d'imputation. */
  date: string;
}

export interface PaymentAllocation {
  id: string;
  amount: number;
}

/** Répartit `amount` sur les documents dus, du plus ancien au plus récent. */
export function allocatePayment(documents: PayableDocument[], amount: number): PaymentAllocation[] {
  let remaining = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  const ordered = documents
    .filter((document) => document.due > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const allocations: PaymentAllocation[] = [];
  for (const document of ordered) {
    if (remaining <= 0) break;
    const amountForDocument = Math.min(Math.round(document.due), remaining);
    allocations.push({ id: document.id, amount: amountForDocument });
    remaining -= amountForDocument;
  }
  return allocations;
}

/** Montant effectivement imputable (plafonné au total dû). */
export function allocatablePayment(documents: PayableDocument[], amount: number): number {
  return allocatePayment(documents, amount).reduce((sum, allocation) => sum + allocation.amount, 0);
}

/** Total dû des documents d'une fiche. */
export function partyBalance(documents: Pick<PayableDocument, 'due'>[]): number {
  return documents.reduce((sum, document) => sum + Math.max(0, document.due), 0);
}
