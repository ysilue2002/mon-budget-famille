import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { db } from '@/db/dexie';
import { runSync } from './sync';

interface SyncState {
  online: boolean;
  pending: number;
  conflicts: number;
  lastSyncAt: number | null;
  syncing: boolean;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('SyncProvider manquant');
  return ctx;
}

const SYNC_DELAY_MS = 1_500;

/** Détecte (re)connexion, numérote la file, déclenche runSync avec anti-rebond. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pending = useLiveQuery(() => db.outbox.filter((op) => op.status !== 'failed').count(), []) ?? 0;
  const conflicts = useLiveQuery(() => db.conflicts.filter((conflict) => !conflict.resolved).count(), []) ?? 0;
  const lastSyncRow = useLiveQuery(async () => {
    const doc = await db.meta.get('lastSyncAt');
    return typeof doc?.value === 'number' ? doc.value : null;
  }, []);
  const lastSyncAt = lastSyncRow ?? null;

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await runSync();
    } finally {
      setSyncing(false);
    }
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void syncNow();
    }, SYNC_DELAY_MS);
  }, [syncNow]);

  // Déclenchement : en ligne et soit des opérations en file, soit premier cycle pour le pull
  useEffect(() => {
    if (online && (pending > 0 || conflicts === 0)) schedule();
  }, [online, pending, conflicts, schedule]);

  // Événements réseau
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      schedule();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = setInterval(() => {
      if (navigator.onLine) schedule();
    }, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, [schedule]);

  const value = useMemo<SyncState>(
    () => ({ online, pending, conflicts, lastSyncAt, syncing, syncNow }),
    [online, pending, conflicts, lastSyncAt, syncing, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** Badge mono-ligne pour la barre de navigation. */
export function SyncBadge() {
  const { online, pending, conflicts, syncing, syncNow, lastSyncAt } = useSync();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = conflicts > 0
    ? `⚠ ${t('sync.conflictTitle')} (${conflicts})`
    : !online
      ? `📴 ${t('sync.offline')}`
      : pending > 0
        ? `⏳ ${t('sync.pending', { count: pending })}`
        : syncing
          ? t('sync.syncing')
          : `${t('sync.synced')} ✔`;
  return (
    <button
      type="button"
      title={conflicts > 0 ? t('sync.conflictHint') : t('sync.syncNow')}
      onClick={() => {
        if (conflicts > 0) {
          void navigate('/conflicts');
        } else {
          void syncNow();
        }
      }}
      className="rounded-full border border-forest-200 bg-white px-3 py-1 text-xs font-semibold text-forest-800 hover:bg-forest-50"
    >
      {label}
      {lastSyncAt && <span className="ml-2 hidden text-sage-500 sm:inline">{new Date(lastSyncAt).toLocaleTimeString()}</span>}
    </button>
  );
}
