import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/dexie';
import { bootstrapApp } from '@/db/seed';
import { createRecurringRule, updateRecurringRule } from '@/core/repo';
import { materializeDueRecurrences } from '@/core/recurring';

const TODAY = '2026-10-30';

beforeAll(() => {
  // Identifiant d'appareil : localStorage minimal (environnement node).
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  // Réseau coupé : les taux passent par le repli, aucun appel sortant.
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  // TODAY est figé au 30 octobre : on cale l'horloge pour que todayISO()
  // (heure réelle, utilisé à la création de la règle) coïncide avec cette date.
  vi.setSystemTime(new Date('2026-10-30T12:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await bootstrapApp();
});

async function seedRule(startDate: string, extra: { endDate?: string | null } = {}): Promise<string> {
  const account = await db.accounts.toCollection().first();
  if (!account) throw new Error('compte manquant');
  return createRecurringRule({
    name: 'Loyer',
    type: 'expense',
    accountId: account.id,
    categoryId: 'cat-logement',
    amountOriginal: 150_000,
    currency: 'XOF',
    frequency: 'monthly',
    interval: 1,
    startDate,
    endDate: extra.endDate ?? null,
  });
}

describe('materializeDueRecurrences', () => {
  it('génère les échéances dues, avance la règle et ne duplique rien', async () => {
    const ruleId = await seedRule('2026-08-05');
    // Deux échéances en retard (05/08 et 05/09), celle du 05/10 est due aussi.
    await updateRecurringRule(ruleId, { nextDueDate: '2026-08-05' });

    const first = await materializeDueRecurrences(TODAY);
    expect(first.generated).toBe(3);

    const transactions = await db.transactions.toArray();
    expect(transactions.map((tx) => tx.date).sort()).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    expect(transactions.every((tx) => tx.type === 'expense' && tx.amountOriginal === 150_000)).toBe(true);
    expect(transactions.every((tx) => tx.id.startsWith(`rec-${ruleId}-`))).toBe(true);

    const rule = await db.recurring.get(ruleId);
    expect(rule?.nextDueDate).toBe('2026-11-05');
    expect(rule?.lastGeneratedDate).toBe('2026-10-05');

    // Relance le même jour : aucune nouvelle opération.
    const second = await materializeDueRecurrences(TODAY);
    expect(second.generated).toBe(0);
    expect(await db.transactions.count()).toBe(3);
  });

  it('ne génère rien pour une règle en pause', async () => {
    const ruleId = await seedRule('2026-08-05');
    await updateRecurringRule(ruleId, { nextDueDate: '2026-08-05', active: false });

    const run = await materializeDueRecurrences(TODAY);
    expect(run.generated).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect((await db.recurring.get(ruleId))?.nextDueDate).toBe('2026-08-05');
  });

  it('s’arrête à la date de fin', async () => {
    const ruleId = await seedRule('2026-08-05', { endDate: '2026-09-30' });
    await updateRecurringRule(ruleId, { nextDueDate: '2026-08-05' });

    const run = await materializeDueRecurrences(TODAY);
    expect(run.generated).toBe(2);
    const dates = (await db.transactions.toArray()).map((tx) => tx.date).sort();
    expect(dates).toEqual(['2026-08-05', '2026-09-05']);
    expect((await db.recurring.get(ruleId))?.nextDueDate).toBe('2026-10-05');
  });

  it('remplit les échéances dues dès la création (début aujourd’hui)', async () => {
    const ruleId = await seedRule(TODAY);
    const run = await materializeDueRecurrences(TODAY);
    expect(run.generated).toBe(1);
    expect((await db.transactions.toArray())[0]?.date).toBe(TODAY);
    expect((await db.recurring.get(ruleId))?.nextDueDate).toBe('2026-11-30');
  });

  it('ne génère pas de rétroactif pour un début antérieur', async () => {
    // createRecurringRule recale la première échéance à aujourd'hui ou après :
    // ici le 1er du mois suivant (ancre = 1).
    const ruleId = await seedRule('2020-01-01');
    expect((await db.recurring.get(ruleId))?.nextDueDate).toBe('2026-11-01');
    const run = await materializeDueRecurrences(TODAY);
    expect(run.generated).toBe(0);
    expect(await db.transactions.count()).toBe(0);
  });
});
