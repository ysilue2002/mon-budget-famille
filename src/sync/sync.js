import { db } from '@/db/dexie';
import { apiFetch, isOfflineError } from '@/lib/api';
import { listPending, markFailed, removeOperation, SYNC_META_CURSOR } from './outbox';
/** Tables cibles par entité. */
function tableFor(entity) {
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
        default:
            return null;
    }
}
function hasLocalPending(entity, entityId) {
    return db.outbox.filter((op) => op.entity === entity && op.entityId === entityId).first().then(Boolean);
}
/** Applique un résultat de push : révision, statut, conflits. */
async function applyPushResult(entity, entityId, status, rev, mergedPayload, conflicts) {
    const table = tableFor(entity);
    if (!table)
        return;
    const record = (await table.get(entityId));
    if (!record)
        return;
    if (status === 'conflict') {
        await table.put({
            ...record,
            ...(mergedPayload ? mergedPayload : {}),
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
    const patch = { rev, baseRev: rev, syncStatus: 'synced' };
    if (mergedPayload)
        Object.assign(patch, mergedPayload);
    await table.put({ ...record, ...patch });
}
async function applyPullChange(entity, record) {
    const table = tableFor(entity);
    if (!table)
        return;
    const id = typeof record.id === 'string' ? record.id : String(record.id);
    if (await hasLocalPending(entity, id))
        return;
    const incoming = {
        ...record,
        rev: record.rev ?? 1,
        baseRev: record.rev ?? 1,
        syncStatus: 'synced',
    };
    const local = (await table.get(id));
    const localRev = typeof local?.rev === 'number' ? local.rev : 0;
    const incomingRev = typeof incoming.rev === 'number' ? incoming.rev : 1;
    if (!local || incomingRev >= localRev) {
        await table.put(incoming);
    }
}
/** Cycle complet : push des opérations locales puis pull des modifications serveur. */
export async function runSync() {
    const report = { pushed: 0, pulled: 0, conflicts: 0, offline: false };
    // Le verrou est horodaté : un onglet tué en pleine sync (rechargement, fermeture)
    // laisse un verrou périmé que le prochain cycle peut racheter après 60 s.
    // Ancien format (`true`, sans horodatage) = verrou périmé par définition.
    const lock = await db.meta.get('syncing');
    const lockTs = typeof lock?.value === 'number' ? lock.value : null;
    if (lockTs !== null && Date.now() - lockTs < 60_000)
        return report;
    await db.meta.put({ key: 'syncing', value: Date.now() });
    try {
        // --- PUSH ---
        const pending = await listPending(100);
        if (pending.length > 0) {
            const ops = pending.map((op) => {
                const payload = op.payload;
                if (payload && typeof payload === 'object' && 'record' in payload) {
                    const { record, changedFields, baseSnapshot } = payload;
                    return {
                        opId: op.id,
                        entity: op.entity,
                        entityId: op.entityId,
                        op: op.op,
                        payload: record,
                        baseRev: record.baseRev ?? 0,
                        changedFields,
                        baseSnapshot,
                    };
                }
                const record = payload;
                return {
                    opId: op.id,
                    entity: op.entity,
                    entityId: op.entityId,
                    op: op.op,
                    payload: record,
                    baseRev: record?.baseRev ?? 0,
                };
            });
            try {
                const res = await apiFetch('/api/v1/sync/push', {
                    method: 'POST',
                    body: { ops },
                });
                for (const result of res.results) {
                    const op = pending.find((p) => p.id === result.opId);
                    if (!op)
                        continue;
                    const status = result.status === 'conflict' ? 'conflict' : 'applied';
                    await applyPushResult(op.entity, op.entityId, result.status === 'duplicate' ? 'applied' : status, result.rev, result.mergedPayload, result.conflicts);
                    if (result.status === 'conflict')
                        report.conflicts += 1;
                    else
                        report.pushed += 1;
                    await removeOperation(op.id);
                }
            }
            catch (error) {
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
            const res = await apiFetch(`/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}`);
            for (const change of res.changes) {
                await applyPullChange(change.entity, change.record);
            }
            report.pulled = res.changes.length;
            await db.meta.put({ key: SYNC_META_CURSOR, value: res.cursor });
            await db.meta.put({ key: 'lastSyncAt', value: res.serverTime });
            return report;
        }
        catch (error) {
            report.offline = isOfflineError(error);
            report.error = error instanceof Error ? error.message : 'sync';
            return report;
        }
    }
    finally {
        await db.meta.delete('syncing');
    }
}
