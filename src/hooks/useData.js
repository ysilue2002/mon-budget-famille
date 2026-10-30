import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getRates } from '@/core/exchange';
import { db } from '@/db/dexie';
export function useRates() {
    const [snapshot, setSnapshot] = useState(null);
    const [source, setSource] = useState(null);
    const [loading, setLoading] = useState(true);
    const load = useCallback(async (force) => {
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
export function usePrimaryCurrency() {
    const family = useFamily();
    return family?.primaryCurrency ?? null;
}
export function useAccounts() {
    return useLiveQuery(() => db.accounts.orderBy('name').toArray(), []);
}
export function useCategories() {
    return useLiveQuery(() => db.categories.toArray(), []);
}
export function useTransactions() {
    return useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);
}
