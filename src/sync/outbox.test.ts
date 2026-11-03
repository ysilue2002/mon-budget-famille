import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/dexie';
import { listPending, markFailed, retryDelayMs } from '@/sync/outbox';
import type { OutboxOperation } from '@/core/types';

function operation(id: string, createdAt: number, extra: Partial<OutboxOperation> = {}): OutboxOperation {
  return {
    id,
    entity: 'transaction',
    entityId: `tx-${id}`,
    op: 'upsert',
    payload: null,
    deviceId: 'dev',
    createdAt,
    retryCount: 0,
    status: 'queued',
    ...extra,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('file de synchronisation', () => {
  it('écarte temporairement une opération en échec sans bloquer les suivantes', async () => {
    const now = Date.now();
    await db.outbox.bulkPut([
      operation('refusee', now, { nextAttemptAt: now + 60_000 }),
      operation('prete', now + 1),
    ]);

    const ready = await listPending();
    expect(ready.map((op) => op.id)).toEqual(['prete']);
  });

  it('réintègre l’opération une fois le délai écoulé', async () => {
    const now = Date.now();
    await db.outbox.put(operation('refusee', now, { nextAttemptAt: now - 1 }));

    expect((await listPending()).map((op) => op.id)).toEqual(['refusee']);
  });

  it('programme un repli exponentiel enregistré sur l’opération', async () => {
    await db.outbox.put(operation('op1', Date.now()));

    await markFailed('op1', 'operation-failed', retryDelayMs(0));

    const [stored] = await db.outbox.toArray();
    expect(stored.retryCount).toBe(1);
    expect(stored.lastError).toBe('operation-failed');
    expect(stored.nextAttemptAt).toBeGreaterThan(Date.now() + 20_000);
  });

  it('plafonne le délai de repli à quinze minutes', () => {
    expect(retryDelayMs(0)).toBe(30_000);
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(20)).toBe(15 * 60_000);
  });
});
