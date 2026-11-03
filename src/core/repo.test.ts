import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/dexie';
import { bootstrapApp } from '@/db/seed';
import { deleteAccount } from '@/core/repo';
import type { FinancialAccount, Transaction } from '@/core/types';

const sync = {
  baseRev: 0,
  rev: 0,
  updatedAt: 0,
  deviceId: 'dev',
  syncStatus: 'pending' as const,
};

function account(id: string, familyId: string): FinancialAccount {
  return {
    id,
    familyId,
    name: id,
    type: 'bank',
    provider: null,
    currency: 'XOF',
    initialBalance: 0,
    archived: false,
    ...sync,
  };
}

function transaction(partial: Partial<Transaction> & { id: string; accountId: string }): Transaction {
  return {
    familyId: 'f1',
    authorId: 'u1',
    authorName: 'Awa',
    type: 'expense',
    amountOriginal: 1000,
    currencyOriginal: 'XOF',
    exchangeRate: 1,
    amountInPrimary: 1000,
    date: '2026-02-01',
    ...sync,
    ...partial,
  };
}

beforeAll(() => {
  // Identifiant d'appareil : localStorage minimal (environnement node).
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
  await bootstrapApp();
});

describe('deleteAccount', () => {
  it('supprime le compte et toutes les opérations qui le touchent', async () => {
    const family = await db.families.toCollection().first();
    if (!family) throw new Error('foyer manquant');
    await db.accounts.bulkPut([account('a1', family.id), account('a2', family.id)]);
    await db.transactions.bulkPut([
      transaction({ id: 'tx-out', accountId: 'a1' }),
      transaction({ id: 'tx-in', accountId: 'a2', toAccountId: 'a1', type: 'transfer' }),
      transaction({ id: 'tx-both', accountId: 'a1', toAccountId: 'a2', type: 'transfer' }),
      transaction({ id: 'tx-other', accountId: 'a2' }),
    ]);

    await deleteAccount('a1');

    expect(await db.accounts.get('a1')).toBeUndefined();
    expect((await db.transactions.toArray()).map((tx) => tx.id)).toEqual(['tx-other']);
    const deletes = await db.outbox.filter((op) => op.entity === 'transaction' && op.op === 'delete').toArray();
    expect(deletes.map((op) => op.entityId).sort()).toEqual(['tx-both', 'tx-in', 'tx-out']);
    expect(await db.outbox.filter((op) => op.entity === 'account' && op.op === 'delete').count()).toBe(1);
  });
});
