import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/dexie';
import { applyPullChange } from '@/sync/sync';
import type { Transaction } from '@/core/types';

function transaction(partial: Partial<Transaction> & { id: string }): Transaction {
  return {
    familyId: 'f1',
    accountId: 'a1',
    authorId: 'u1',
    authorName: 'Awa',
    type: 'expense',
    amountOriginal: 1000,
    currencyOriginal: 'XOF',
    exchangeRate: 1,
    amountInPrimary: 1000,
    date: '2026-02-01',
    baseRev: 1,
    rev: 1,
    updatedAt: 0,
    deviceId: 'dev',
    syncStatus: 'synced',
    ...partial,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('applyPullChange', () => {
  it('applique un enregistrement reçu du serveur', async () => {
    await applyPullChange({
      entity: 'transaction',
      recordId: 'tx1',
      record: { ...transaction({ id: 'tx1', note: 'Serveur' }) },
      rev: 3,
      deleted: false,
    });

    const row = await db.transactions.get('tx1');
    expect(row?.note).toBe('Serveur');
    expect(row?.rev).toBe(3);
    expect(row?.syncStatus).toBe('synced');
  });

  it('supprime la ligne locale sur un tombstone, sans contenu d’enregistrement', async () => {
    await db.transactions.put(transaction({ id: 'tx1' }));

    await applyPullChange({ entity: 'transaction', recordId: 'tx1', record: null, rev: 4, deleted: true });

    expect(await db.transactions.get('tx1')).toBeUndefined();
  });

  it('ignore un tombstone plus ancien que la révision locale', async () => {
    await db.transactions.put(transaction({ id: 'tx1', rev: 5 }));

    await applyPullChange({ entity: 'transaction', recordId: 'tx1', record: null, rev: 4, deleted: true });

    expect(await db.transactions.get('tx1')).toBeDefined();
  });

  it('préserve une modification locale encore en file d’attente', async () => {
    await db.transactions.put(transaction({ id: 'tx1', note: 'Local', syncStatus: 'pending' }));
    await db.outbox.put({
      id: 'op1',
      entity: 'transaction',
      entityId: 'tx1',
      op: 'upsert',
      payload: null,
      deviceId: 'dev',
      createdAt: Date.now(),
      retryCount: 0,
      status: 'queued',
    });

    await applyPullChange({ entity: 'transaction', recordId: 'tx1', record: null, rev: 9, deleted: true });

    expect((await db.transactions.get('tx1'))?.note).toBe('Local');
  });

  it('ignore une modification sans identifiant exploitable', async () => {
    await applyPullChange({ entity: 'transaction', record: null, deleted: true });
    expect(await db.transactions.count()).toBe(0);
  });
});
