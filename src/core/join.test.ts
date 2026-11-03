import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/dexie';
import { bootstrapApp } from '@/db/seed';
import { adoptInvitedFamily, joinFailureReason } from '@/core/join';

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

describe('adoptInvitedFamily', () => {
  it('repart sur une base neuve autour du foyer distant', async () => {
    // Des données locales (amorce) existent ; adhésion : tout est abandonné.
    const family = {
      id: 'famille-serveur',
      name: 'Foyer partagé',
      primaryCurrency: 'EUR' as const,
    };

    await adoptInvitedFamily(family);

    expect((await db.accounts.count()) + (await db.categories.count())).toBe(0);
    expect(await db.families.count()).toBe(1);
    const adopted = await db.families.get(family.id);
    expect(adopted?.name).toBe('Foyer partagé');
    expect(adopted?.primaryCurrency).toBe('EUR');
    // Ni file d'attente résiduelle ni curseur : le pull repart du début.
    expect(await db.outbox.count()).toBe(0);
    expect(await db.meta.get('syncCursor')).toBeUndefined();
    expect((await db.meta.get('familyId'))?.value).toBe(family.id);
  });

  it('peut être suivie d’un nouvel amorçage standard si l’utilisateur recrée un foyer', async () => {
    await adoptInvitedFamily({ id: 'f2', name: 'Partagé', primaryCurrency: 'EUR' });
    // Après deconnexion volontaire du foyer partagé etc. : l'amorce idempotente
    // n'écrase pas le foyer adopté.
    const outcome = await bootstrapApp();
    expect(outcome.family.id).toBe('f2');
    expect(outcome.changed).toBe(false);
  });
});

describe('joinFailureReason', () => {
  it('traduit les erreurs du serveur', () => {
    expect(joinFailureReason(410, { error: 'invitation-expired' })).toBe('invitation-expired');
    expect(joinFailureReason(410, { error: 'invitation-used' })).toBe('invitation-used');
    expect(joinFailureReason(410, { error: 'invitation-unknown' })).toBe('invalid-invitation');
    expect(joinFailureReason(404, { error: 'not-found' })).toBe('invalid-invitation');
    expect(joinFailureReason(500, { error: 'internal' })).toBeNull();
  });
});
