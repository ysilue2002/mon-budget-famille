import { db } from '@/db/dexie';
import { apiFetch, isOfflineError } from '@/lib/api';
import { listPending, markFailed, removeOperation, retryDelayMs, SYNC_META_CURSOR } from './outbox';
import type { Table } from 'dexie';
import type { PullChange, PullResponse, PushOp, PushResponse } from './protocol';
import type { SyncEntity } from '@/core/types';

/** Tables cibles par entité. */
function tableFor(entity: SyncEntity): Table<unknown, string> | null {
  switch (entity) {
    case 'account':
      return db.accounts;
    case 'transaction':
      return db.transactions;
    case 'budget':
      return db.budgets;
    case 'goal':
      return db.goals;
    case 'debt':
      return db.debts;
    case 'category':
      return db.categories;
    case 'recurring':
      return db.recurring;
    case 'wealth':
      return db.wealth;
    case 'business':
      return db.businesses;
    case 'product':
      return db.products;
    case 'sale':
      return db.sales;
    case 'purchase':
      return db.purchases;
    case 'party':
      return db.parties;
    default:
      return null;
  }
}

function hasLocalPending(entity: SyncEntity, entityId: string): Promise<boolean> {
  return db.outbox.filter((op) => op.entity === entity && op.entityId === entityId).first().then(Boolean);
}

/** Applique un résultat de push : révision, statut, conflits. */
async function applyPushResult(
  entity: SyncEntity,
  entityId: string,
  status: 'applied' | 'conflict' | 'duplicate',
  rev: number,
  mergedPayload: unknown,
  conflicts: { field: string; remoteValue: unknown }[] | undefined,
  deleted = false,
): Promise<void> {
  const table = tableFor(entity);
  if (!table) return;
  const record = (await table.get(entityId)) as Record<string, unknown> | undefined;
  if (!record) return;

  if (deleted) {
    // Le serveur a supprimé la ligne après la base de l'opération : l'édition
    // locale est abandonnée (et signalée), jamais ressuscitée sur les autres
    // appareils.
    for (const conflict of conflicts ?? []) {
      await db.conflicts.add({
        id: crypto.randomUUID(),
        entity,
        entityId,
        field: conflict.field,
        localValue: record[conflict.field],
        remoteValue: null,
        createdAt: Date.now(),
        resolved: false,
      });
    }
    await table.delete(entityId);
    return;
  }

  if (status === 'conflict') {
    await table.put({
      ...record,
      ...(mergedPayload ? (mergedPayload as object) : {}),
      rev,
      syncStatus: 'conflict',
    });
    for (const conflict of conflicts ?? []) {
      await db.conflicts.add({
        id: crypto.randomUUID(),
        entity,
        entityId,
        field: conflict.field,
        localValue: record[conflict.field],
        remoteValue: conflict.remoteValue,
        createdAt: Date.now(),
        resolved: false,
      });
    }
    return;
  }

  const patch: Record<string, unknown> = { rev, baseRev: rev, syncStatus: 'synced' };
  if (mergedPayload) Object.assign(patch, mergedPayload);
  await table.put({ ...record, ...patch });
}

/**
 * Applique une modification distante : écriture, ou suppression d'un tombstone.
 * Une opération locale en attente prime et reste gérée par le cycle de push.
 */
export async function applyPullChange(change: PullChange): Promise<void> {
  const table = tableFor(change.entity);
  if (!table) return;
  const id =
    change.recordId ??
    (change.record && typeof change.record.id === 'string' ? change.record.id : '');
  if (!id) return;
  if (await hasLocalPending(change.entity, id)) return;

  const local = (await table.get(id)) as Record<string, unknown> | undefined;
  const localRev = typeof local?.rev === 'number' ? local.rev : 0;
  const incomingRev = typeof change.rev === 'number' ? change.rev : 1;

  if (change.deleted) {
    // Le serveur ne renvoie pas le contenu d'une suppression : l'identifiant
    // stable (`recordId`) est indispensable pour retirer la ligne locale.
    if (incomingRev >= localRev) await table.delete(id);
    return;
  }

  if (!change.record) return;
  const incoming: Record<string, unknown> = {
    ...change.record,
    rev: incomingRev,
    baseRev: incomingRev,
    syncStatus: 'synced',
  };
  if (!local || incomingRev >= localRev) {
    await table.put(incoming);
  }
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts: number;
  offline: boolean;
  error?: string;
}

/** Cycle complet : push des opérations locales puis pull des modifications serveur. */
export async function runSync(): Promise<SyncReport> {
  const report: SyncReport = { pushed: 0, pulled: 0, conflicts: 0, offline: false };
  // Le verrou est horodaté : un onglet tué en pleine sync (rechargement, fermeture)
  // laisse un verrou périmé que le prochain cycle peut racheter après 60 s.
  // Ancien format (`true`, sans horodatage) = verrou périmé par définition.
  const lock = await db.meta.get('syncing');
  const lockTs = typeof lock?.value === 'number' ? (lock.value as number) : null;
  if (lockTs !== null && Date.now() - lockTs < 60_000) return report;

  await db.meta.put({ key: 'syncing', value: Date.now() });
  try {
    // --- PUSH ---
    const pending = await listPending(100);
    if (pending.length > 0) {
      const ops: PushOp[] = pending.map((op) => {
        const payload = op.payload as Record<string, unknown> | null;
        if (payload && typeof payload === 'object' && 'record' in payload) {
          const { record, changedFields, baseSnapshot, baseRev } = payload as {
            record: Record<string, unknown>;
            changedFields: string[];
            baseSnapshot?: Record<string, unknown>;
            baseRev?: number;
          };
          return {
            opId: op.id,
            entity: op.entity,
            entityId: op.entityId,
            op: op.op,
            payload: record,
            // La base de l'opération est celle enregistrée à l'enfilement :
            // c'est elle qui permet au serveur de détecter une édition
            // construite avant une suppression distante.
            baseRev: typeof baseRev === 'number' ? baseRev : ((record.baseRev as number) ?? 0),
            changedFields,
            baseSnapshot,
          };
        }
        const record = payload as Record<string, unknown> | null;
        return {
          opId: op.id,
          entity: op.entity,
          entityId: op.entityId,
          op: op.op,
          payload: record,
          baseRev: (record?.baseRev as number) ?? 0,
        };
      });

      try {
        const res = await apiFetch<PushResponse>('/api/v1/sync/push', {
          method: 'POST',
          body: { ops },
        });
        for (const result of res.results) {
          const op = pending.find((p) => p.id === result.opId);
          if (!op) continue;
          if (result.status === 'failed') {
            // Refus isolé : seule cette opération recule, les suivantes passent.
            await markFailed(op.id, result.error ?? 'operation-failed', retryDelayMs(op.retryCount));
            continue;
          }
          const status = result.status === 'conflict' ? 'conflict' : 'applied';
          await applyPushResult(
            op.entity,
            op.entityId,
            result.status === 'duplicate' ? 'applied' : status,
            result.rev,
            result.mergedPayload,
            result.conflicts,
            result.deleted ?? false,
          );
          if (result.status === 'conflict') report.conflicts += 1;
          else report.pushed += 1;
          await removeOperation(op.id);
        }
      } catch (error) {
        if (isOfflineError(error) || (error instanceof Error && error.message === 'API 0')) {
          report.offline = true;
        }
        for (const op of pending) {
          await markFailed(op.id, error instanceof Error ? error.message : String(error));
        }
        return { ...report, error: error instanceof Error ? error.message : 'sync' };
      }
    }

    // --- PULL ---
    const cursorRow = await db.meta.get(SYNC_META_CURSOR);
    const cursor = cursorRow && typeof cursorRow.value === 'string' ? cursorRow.value : '';
    try {
      const res = await apiFetch<PullResponse>(`/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}`);
      for (const change of res.changes) {
        await applyPullChange(change);
      }
      report.pulled = res.changes.length;
      await db.meta.put({ key: SYNC_META_CURSOR, value: res.cursor });
      await db.meta.put({ key: 'lastSyncAt', value: res.serverTime });
      return report;
    } catch (error) {
      report.offline = isOfflineError(error);
      report.error = error instanceof Error ? error.message : 'sync';
      return report;
    }
  } finally {
    await db.meta.delete('syncing');
  }
}
