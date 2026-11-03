import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { useFamily, useRates } from '@/hooks/useData';
import { convertMinor } from '@/core/money';
import { ensureMonthEndValuations, recordWealthSnapshot } from '@/core/repo';
import { toISODate } from '@/lib/date';
import type { CurrencyCode } from '@/core/types';

/**
 * Relevé du patrimoine : épargne + créances − dettes, consolidés dans la devise
 * du foyer. Écrit à chaque ouverture de l'application (au plus une ligne par
 * jour, id `wealth-<date>`), ce qui permet aux bilans des périodes passées de
 * retrouver le patrimoine de l'époque au lieu des montants actuels.
 *
 * Aucun rendu : le composant ne sert qu'à cet effet de bord.
 */
export function WealthTracker() {
  const family = useFamily();
  const { snapshot } = useRates();
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const debts = useLiveQuery(() => db.debts.toArray(), []);

  useEffect(() => {
    if (!family || !goals || !debts || !snapshot) return;
    const primary: CurrencyCode = family.primaryCurrency;
    const toPrimary = (amount: number, currency: CurrencyCode) =>
      currency === primary ? amount : convertMinor(amount, currency, primary, snapshot) ?? 0;

    const savings = goals.reduce((acc, goal) => acc + toPrimary(goal.currentAmount, goal.currency), 0);
    let receivables = 0;
    let payables = 0;
    for (const debt of debts) {
      const amount = toPrimary(debt.remainingAmount, debt.currency);
      if (debt.kind === 'receivable') receivables += amount;
      else payables += amount;
    }

    // Les fins de mois non couvertes (application fermée ce jour-là) sont
    // complétées ici : report du dernier relevé, ou estimation marquée.
    const created = [...goals.map((goal) => goal.createdAt), ...debts.map((debt) => debt.createdAt)]
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    const startISO = created.length > 0 ? toISODate(new Date(created[0])) : undefined;

    void (async () => {
      await recordWealthSnapshot({ savings, receivables, payables, primary });
      await ensureMonthEndValuations({ savings, receivables, payables, primary, startISO });
    })().catch((error) => console.error('wealth snapshot error', error));
  }, [family, goals, debts, snapshot]);

  return null;
}
