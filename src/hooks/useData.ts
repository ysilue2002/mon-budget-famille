import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getRates } from '@/core/exchange';
import type { RatesSource } from '@/core/exchange';
import { db } from '@/db/dexie';
import type { CurrencyCode, RateSnapshot } from '@/core/types';

export function useRates(): {
  snapshot: RateSnapshot | null;
  source: RatesSource | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<RateSnapshot | null>(null);
  const [source, setSource] = useState<RatesSource | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    const result = await getRates({ forceRefresh: force });
    setSnapshot(result.snapshot);
    setSource(result.source);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  return { snapshot, source, loading, refresh };
}

export function useFamily() {
  return useLiveQuery(() => db.families.toCollection().first(), []);
}

/** Devise du foyer (consolidation), null tant que non amorcé. */
export function usePrimaryCurrency(): CurrencyCode | null {
  const family = useFamily();
  return family?.primaryCurrency ?? null;
}

export function useAccounts() {
  return useLiveQuery(() => db.accounts.orderBy('name').toArray(), []);
}

/** Activités professionnelles : les actives d'abord, puis les archivées. */
export function useBusinesses() {
  return useLiveQuery(async () => {
    const rows = await db.businesses.toArray();
    return rows.sort(
      (a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name),
    );
  }, []);
}

/** Ventes, les plus récentes d'abord. */
export function useSales() {
  return useLiveQuery(() => db.sales.orderBy('date').reverse().toArray(), []);
}

/** Achats, les plus récents d'abord. */
export function usePurchases() {
  return useLiveQuery(() => db.purchases.orderBy('date').reverse().toArray(), []);
}

/** Avances reçues, les plus récentes d'abord. */
export function useAdvances() {
  return useLiveQuery(() => db.advances.orderBy('receivedOn').reverse().toArray(), []);
}

/** Fiches clients et fournisseurs, actives d'abord, triées par nom. */
export function useParties() {
  return useLiveQuery(async () => {
    const rows = await db.parties.toArray();
    return rows.sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  }, []);
}

/** Marchandises : les actives d'abord, triées par nom. */
export function useProducts() {
  return useLiveQuery(async () => {
    const rows = await db.products.toArray();
    return rows.sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  }, []);
}

/** Devis, les plus récents d'abord. */
export function useQuotes() {
  return useLiveQuery(() => db.quotes.orderBy('date').reverse().toArray(), []);
}

/** Historique des règlements, les plus récents d'abord. */
export function useSettlements() {
  return useLiveQuery(() => db.settlements.orderBy('date').reverse().toArray(), []);
}

export function useCategories() {
  return useLiveQuery(() => db.categories.toArray(), []);
}

export function useTransactions() {
  return useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);
}

/** Règles récurrentes, triées par prochaine échéance. */
export function useRecurringRules() {
  return useLiveQuery(() => db.recurring.orderBy('nextDueDate').toArray(), []);
}
