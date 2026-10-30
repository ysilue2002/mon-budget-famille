import { db } from '@/db/dexie';
import { getDeviceId, uuid } from '@/lib/id';
import { diffFields } from './protocol';
/**
 * File d'attente d'opérations idempotentes (UUID v4) — aucune opération
 * de synchronisation ne peut dupliquer une écriture : l'identifiant du
 * message est mémorisé par le serveur.
 */
export const SYNC_META_CURSOR = 'syncCursor';
export async function enqueue(entity, entityId, op, payload) {
    const operation = {
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
export async function enqueueUpsert(entity, entityId, record, baseRev, baseSnapshot) {
    const changedFields = diffFields(baseSnapshot, record);
    const base = {};
    for (const field of changedFields)
        base[field] = baseSnapshot?.[field];
    const opId = await enqueue(entity, entityId, 'upsert', {
        record,
        changedFields,
        baseSnapshot: base,
        baseRev,
    });
    return opId;
}
export async function pendingCount() {
    return db.outbox.count();
}
export async function listPending(limit = 100) {
    return db.outbox.orderBy('createdAt').limit(limit).toArray();
}
export async function removeOperation(opId) {
    await db.outbox.delete(opId);
}
export async function markFailed(opId, error, retryAfterNs = 0) {
    await db.outbox.where('id').equals(opId).modify((op) => {
        op.status = 'queued';
        op.retryCount = op.retryCount + 1;
        op.lastError = error.slice(0, 300);
        if (retryAfterNs)
            op.createdAt = op.createdAt + retryAfterNs;
    });
}
