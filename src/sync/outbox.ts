import { db } from '@/db/dexie';
import { getDeviceId, uuid } from '@/lib/id';
import { diffFields } from './protocol';
import type { OutboxOperation, SyncEntity } from '@/core/types';

/**
 * File d'attente d'opérations idempotentes (UUID v4) — aucune opération
 * de synchronisation ne peut dupliquer une écriture : l'identifiant du
 * message est mémorisé par le serveur.
 */

export const SYNC_META_CURSOR = 'syncCursor';

export async function enqueue(entity: SyncEntity, entityId: string, op: 'upsert' | 'delete', payload: unknown): Promise<string> {
  const operation: OutboxOperation = {
    id: uuid(),
    entity,
    entityId,
    op,
    payload,
    deviceId: getDeviceId(),
    createdAt: Date.now(),
    retryCount: 0,
    status: 'queued',
  };
  await db.outbox.put(operation);
  return operation.id;
}

/** Prépare un op upsert : liste des champs modifiés + snapshot de base. */
export async function enqueueUpsert(
  entity: SyncEntity,
  entityId: string,
  record: Record<string, unknown>,
  baseRev: number,
  baseSnapshot: Record<string, unknown> | null,
): Promise<string> {
  const changedFields = diffFields(baseSnapshot, record);
  const base: Record<string, unknown> = {};
  for (const field of changedFields) base[field] = baseSnapshot?.[field];
  const opId = await enqueue(entity, entityId, 'upsert', {
    record,
    changedFields,
    baseSnapshot: base,
    baseRev,
  });
  return opId;
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}

/** Délai avant nouvel essai : 30 s, doublé à chaque échec, plafonné à 15 min. */
export function retryDelayMs(retryCount: number): number {
  return Math.min(30_000 * 2 ** Math.min(retryCount, 5), 15 * 60_000);
}

/**
 * Opérations prêtes à être poussées. Les opérations en repli exponentiel sont
 * ignorées sans bloquer les suivantes : une seule opération refusée ne fige
 * plus la file entière.
 */
export async function listPending(limit = 100): Promise<OutboxOperation[]> {
  const now = Date.now();
  // On lit au-delà de `limit` pour ne pas affamer la file derrière des
  // opérations en attente de nouvel essai.
  const scanned = await db.outbox.orderBy('createdAt').limit(limit * 5).toArray();
  return scanned.filter((op) => (op.nextAttemptAt ?? 0) <= now).slice(0, limit);
}

export async function removeOperation(opId: string): Promise<void> {
  await db.outbox.delete(opId);
}

export async function markFailed(opId: string, error: string, retryAfterMs = 0): Promise<void> {
  await db.outbox.where('id').equals(opId).modify((op: OutboxOperation) => {
    op.status = 'queued';
    op.retryCount = op.retryCount + 1;
    op.lastError = error.slice(0, 300);
    if (retryAfterMs > 0) op.nextAttemptAt = Date.now() + retryAfterMs;
    else delete op.nextAttemptAt;
  });
}
