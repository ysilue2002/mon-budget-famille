import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/dexie';
import { enqueue } from '@/sync/outbox';
import { runSync } from '@/sync/sync';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  isOfflineError: () => false,
}));

beforeAll(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.mocked(apiFetch).mockReset();
});

describe('runSync', () => {
  it('poursuit la file et le pull quand une opération est refusée isolément', async () => {
    const refused = await enqueue('transaction', 'tx-refusee', 'upsert', {
      record: { id: 'tx-refusee' },
      changedFields: ['note'],
      baseSnapshot: {},
      baseRev: 0,
    });
    const accepted = await enqueue('transaction', 'tx-supprimee', 'delete', null);

    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path === '/api/v1/sync/push') {
        return {
          results: [
            { opId: refused, status: 'failed', rev: 0, error: 'operation-failed' },
            { opId: accepted, status: 'applied', rev: 3 },
          ],
          serverTime: 1,
        };
      }
      return { cursor: '7', changes: [], serverTime: 2 };
    }) as never);

    const report = await runSync();

    expect(report.pushed).toBe(1);
    const remaining = await db.outbox.toArray();
    expect(remaining.map((op) => op.id)).toEqual([refused]);
    expect(remaining[0].retryCount).toBe(1);
    expect(remaining[0].nextAttemptAt).toBeGreaterThan(Date.now());
    // Le pull a bien eu lieu malgré l'échec : le curseur avance.
    expect((await db.meta.get('syncCursor'))?.value).toBe('7');
  });

  it("abandonne l'édition locale quand la ligne a été supprimée à distance", async () => {
    await db.accounts.put({ id: 'acc-supprime', familyId: 'f', name: 'Édité hors ligne', rev: 2 } as never);
    const op = await enqueue('account', 'acc-supprime', 'upsert', {
      record: { id: 'acc-supprime', name: 'Édité hors ligne', rev: 2 },
      changedFields: ['name'],
      baseSnapshot: { name: 'Ancien nom' },
      baseRev: 2,
    });

    vi.mocked(apiFetch).mockImplementation((async (path: string) => {
      if (path === '/api/v1/sync/push') {
        return {
          results: [
            {
              opId: op,
              status: 'conflict',
              rev: 5,
              mergedPayload: null,
              deleted: true,
              conflicts: [{ field: 'name', remoteValue: null, localValue: 'Édité hors ligne' }],
            },
          ],
          serverTime: 1,
        };
      }
      return { cursor: '9', changes: [], serverTime: 2 };
    }) as never);

    const report = await runSync();

    // La ligne locale disparaît au lieu de ressusciter sur les autres appareils.
    expect(await db.accounts.get('acc-supprime')).toBeUndefined();
    expect(await db.outbox.get(op)).toBeUndefined();
    expect(report.conflicts).toBe(1);
    const conflicts = await db.conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ field: 'name', localValue: 'Édité hors ligne', resolved: false });
    expect((await db.meta.get('syncCursor'))?.value).toBe('9');
  });
});
