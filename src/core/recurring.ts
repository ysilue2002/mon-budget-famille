/**
 * Génération des échéances dues des opérations récurrentes.
 *
 * Appelée au démarrage, périodiquement et depuis l'écran Récurrents.
 * L'identifiant de l'opération générée est déterministe
 * (`rec-<ruleId>-<date>`) : une échéance déjà matérialisée n'est jamais
 * dupliquée, même si la génération est relancée (autre onglet, second appareil
 * après synchronisation, rechargement en pleine écriture).
 */
import { db } from '@/db/dexie';
import { createTransaction, updateRecurringRule } from '@/core/repo';
import { todayISO } from '@/lib/date';
import { advanceRecurringDate, dayOfMonth, recurringTransactionId } from '@/lib/recurrence';

/** Garde-fou : nombre maximal d'échéances générées par règle et par passage. */
export const MAX_OCCURRENCES_PER_RUN = 120;

export interface RecurringRun {
  /** Nombre d'opérations réellement créées. */
  generated: number;
  /** Nombre de règles ayant avancé (au moins une échéance traitée). */
  rules: number;
}

export async function materializeDueRecurrences(today = todayISO()): Promise<RecurringRun> {
  const run: RecurringRun = { generated: 0, rules: 0 };
  const rules = await db.recurring.toArray();
  if (rules.length === 0) return run;

  for (const rule of rules) {
    if (!rule.active) continue;
    // Une règle dont le compte a été supprimé ou archivé ne génère rien.
    const account = await db.accounts.get(rule.accountId);
    if (!account || account.archived) continue;
    const category = rule.categoryId ? await db.categories.get(rule.categoryId) : undefined;

    const anchor = dayOfMonth(rule.startDate);
    const note = rule.note?.trim() ? rule.note : rule.name;
    let due = rule.nextDueDate;
    let processed = 0;
    let lastGenerated: string | undefined;

    while (
      due <= today &&
      (!rule.endDate || due <= rule.endDate) &&
      processed < MAX_OCCURRENCES_PER_RUN
    ) {
      const id = recurringTransactionId(rule.id, due);
      const existing = await db.transactions.get(id);
      if (!existing) {
        await createTransaction(
          {
            type: rule.type,
            accountId: rule.accountId,
            amountOriginal: rule.amountOriginal,
            currencyOriginal: rule.currency,
            categoryId: category?.id,
            date: due,
            note,
          },
          id,
        );
        run.generated += 1;
      }
      lastGenerated = due;
      processed += 1;
      const next = advanceRecurringDate(due, rule.frequency, rule.interval, anchor);
      if (next <= due) break; // sécurité : jamais de boucle sur place
      due = next;
    }

    if (processed > 0) {
      await updateRecurringRule(rule.id, { nextDueDate: due, lastGeneratedDate: lastGenerated });
      run.rules += 1;
    }
  }

  return run;
}
