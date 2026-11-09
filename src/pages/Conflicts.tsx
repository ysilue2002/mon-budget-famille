import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { resolveConflict } from '@/core/repo';
import type { SyncConflict } from '@/core/types';
import { Card, EmptyState, Page, Tag, btnGhost } from '@/components/common';

const ENTITY_ICONS: Record<SyncConflict['entity'], string> = {
  account: '🏦',
  transaction: '🧾',
  budget: '🎯',
  goal: '💰',
  debt: '🤝',
  category: '🏷️',
  recurring: '🔁',
  wealth: '📑',
  business: '💼',
  product: 'Marchandise',
  sale: 'Vente',
  purchase: 'Achat',
  party: 'Fiche client/fournisseur',
  advance: 'Avance reçue',
  quote: 'Devis',
  project: 'Chantier',
  settlement: 'Règlement',
  stockMovement: 'Mouvement de stock',
};

function preview(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Conflicts() {
  const { t, i18n } = useTranslation();

  const conflicts = useLiveQuery(
    () => db.conflicts.filter((conflict) => !conflict.resolved).toArray(),
    [],
  ) as SyncConflict[] | undefined;

  return (
    <Page title={t('sync.conflictTitle')}>
      {!conflicts || conflicts.length === 0 ? (
        <EmptyState label={t('sync.synced')} icon="✔" />
      ) : (
        <>
          <p className="mb-4 text-sm text-sage-600">{t('sync.conflictHint')}</p>
          <div className="flex flex-col gap-3">
            {conflicts.map((conflict) => (
              <Card key={conflict.id}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-forest-950">
                    {ENTITY_ICONS[conflict.entity]} {conflict.field}{' '}
                    <span className="text-xs font-normal text-sage-500">{conflict.entityId}</span>
                  </span>
                  <Tag tone="amber">{new Date(conflict.createdAt).toLocaleString(i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US')}</Tag>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-forest-100 bg-forest-50/60 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sage-600">{t('sync.local')}</p>
                    <p className="text-sm text-forest-900">{preview(conflict.localValue)}</p>
                  </div>
                  <div className="rounded-lg border border-forest-100 bg-white p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sage-600">{t('sync.remote')}</p>
                    <p className="text-sm text-forest-900">{preview(conflict.remoteValue)}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" className={btnGhost} onClick={() => void resolveConflict(conflict.id, 'local')}>
                    {t('sync.keepLocal')}
                  </button>
                  <button type="button" className={btnGhost} onClick={() => void resolveConflict(conflict.id, 'remote')}>
                    {t('sync.keepRemote')}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

export default Conflicts;
