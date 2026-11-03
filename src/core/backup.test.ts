import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/dexie';
import { bootstrapApp } from '@/db/seed';
import {
  BACKUP_APP,
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  backupToJson,
  buildBackup,
  exportBackup,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from '@/core/backup';
import { pendingCount } from '@/sync/outbox';
import type { FinancialAccount, Transaction } from '@/core/types';

const sync = {
  baseRev: 0,
  rev: 0,
  updatedAt: 0,
  deviceId: 'dev',
  syncStatus: 'synced' as const,
};

function account(partial: Partial<FinancialAccount> & { id: string; familyId: string }): FinancialAccount {
  return {
    name: partial.id,
    type: 'bank',
    provider: null,
    currency: 'XOF',
    initialBalance: 0,
    archived: false,
    ...sync,
    ...partial,
  };
}

function transaction(partial: Partial<Transaction> & { id: string; accountId: string; familyId: string }): Transaction {
  return {
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

async function activeFamily() {
  const family = await db.families.toCollection().first();
  if (!family) throw new Error('foyer manquant');
  return family;
}

async function seedLocalData(): Promise<string> {
  const family = await activeFamily();
  await db.accounts.put(account({ id: 'a1', familyId: family.id, name: 'Wave', initialBalance: 5000 }));
  await db.transactions.put(transaction({ id: 't1', familyId: family.id, accountId: 'a1' }));
  await db.wealth.put({
    id: 'wealth-2026-01-31',
    familyId: family.id,
    date: '2026-01-31',
    primary: 'XOF',
    savings: 1000,
    receivables: 0,
    payables: 0,
    estimated: false,
    createdAt: 0,
    ...sync,
  });
  return family.id;
}

describe('fichier de sauvegarde', () => {
  it('contient toutes les tables métier et aucun secret ni état transitoire', async () => {
    const family = await activeFamily();
    await seedLocalData();
    const backup = await exportBackup();

    expect(backup.app).toBe(BACKUP_APP);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.family).toEqual({ id: family.id, name: family.name, primaryCurrency: family.primaryCurrency });
    expect(backup.counts.accounts).toBeGreaterThanOrEqual(2); // compte amorcé + a1
    expect(backup.counts.transactions).toBe(1);
    expect(backup.counts.wealth).toBe(1);

    const serialized = backupToJson(backup);
    // Ni jeton, ni file d'attente, ni curseur de synchronisation.
    expect(serialized).not.toMatch(/token|password|authorization/i);
    expect(Object.keys(backup)).not.toContain('outbox');
    expect(Object.keys(backup)).not.toContain('meta');
    expect(Object.keys(backup)).not.toContain('rates');
  });

  it('se relit à l’identique après passage en JSON', async () => {
    await seedLocalData();
    const backup = await exportBackup();
    const parsed = parseBackup(backupToJson(backup));
    expect(parsed.counts).toEqual(backup.counts);
    expect(parsed.tables.accounts).toEqual(backup.tables.accounts);
    expect(parsed.family).toEqual(backup.family);
  });

  it('nomme le fichier par date, triable chronologiquement', () => {
    expect(backupFileName(new Date('2026-03-09T10:00:00Z'))).toBe('budget-famille-2026-03-09.json');
  });

  it('refuse un JSON invalide, un fichier étranger et une version future', () => {
    expect(() => parseBackup('{ pas du json')).toThrow(BackupError);
    expect(() => parseBackup('"texte"')).toThrow(/not-a-backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'autre-app', version: 1 }))).toThrow(/not-a-backup/);
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 99 }))).toThrow(/unsupported-version/);
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, tables: { accounts: [{ name: 'sans id' }] } }))).toThrow(
      /invalid-content/,
    );
  });

  it('tolère une table absente (sauvegarde d’une version antérieure)', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        version: 1,
        family: { id: 'f1', name: 'Foyer', primaryCurrency: 'XOF' },
        tables: { accounts: [] },
      }),
    );
    expect(parsed.tables.transactions).toEqual([]);
    expect(parsed.counts.transactions).toBe(0);
  });
});

describe('restauration', () => {
  it('réinsère les enregistrements perdus et les remet en file de synchronisation', async () => {
    await seedLocalData();
    const backup = await exportBackup();
    const total = Object.values(backup.counts).reduce((n, c) => n + c, 0);

    // Perte totale des données locales, puis nouvel amorçage (autre foyer).
    await db.delete();
    await db.open();
    const newFamily = (await bootstrapApp()).family;
    expect(newFamily.id).not.toBe(backup.family.id);
    expect(await db.transactions.count()).toBe(0);

    const report = await restoreBackup(parseBackup(backupToJson(backup)));
    expect(report.created + report.updated).toBe(total);
    expect(report.skipped).toBe(0);

    // Les enregistrements reviennent, rattachés au foyer actif.
    const restored = await db.transactions.get('t1');
    expect(restored?.id).toBe('t1');
    expect(restored?.familyId).toBe(newFamily.id);
    expect(restored?.amountOriginal).toBe(1000);
    expect(restored?.syncStatus).toBe('pending');
    expect(await db.wealth.get('wealth-2026-01-31')).toBeTruthy();

    // Un upsert par enregistrement, avec une base nulle (rien de connu du serveur).
    expect(await pendingCount()).toBe(total);
    const ops = await db.outbox.toArray();
    expect(ops.every((op) => op.op === 'upsert')).toBe(true);
    expect((ops[0].payload as { baseRev?: number }).baseRev ?? 0).toBe(0);
  });

  it('ignore les enregistrements identiques et n’empile pas d’opérations', async () => {
    await seedLocalData();
    const backup = await exportBackup();
    const before = await pendingCount();

    const report = await restoreBackup(parseBackup(backupToJson(backup)));
    expect(report.created).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.skipped).toBeGreaterThan(0);
    expect(await pendingCount()).toBe(before);
  });

  it('met à jour une ligne existante en conservant sa révision comme base', async () => {
    const familyId = await seedLocalData();
    await db.accounts.put(account({ id: 'a1', familyId, name: 'Version serveur', rev: 4, baseRev: 4 }));
    const backup = buildBackup({
      family: { id: familyId, name: 'Foyer', primaryCurrency: 'XOF' },
      tables: {
        accounts: [account({ id: 'a1', familyId, name: 'Version sauvegardée' })],
        categories: [],
        transactions: [],
        budgets: [],
        goals: [],
        debts: [],
        recurring: [],
        wealth: [],
        businesses: [],
        members: [],
      },
    });

    const report = await restoreBackup(backup);
    expect(report.updated).toBe(1);
    const restored = await db.accounts.get('a1');
    expect(restored?.name).toBe('Version sauvegardée');
    expect(restored?.rev).toBe(4);
    expect(restored?.baseRev).toBe(4);

    const op = await db.outbox.toArray();
    const upsert = op.find((entry) => entry.entity === 'account' && entry.entityId === 'a1');
    expect(upsert).toBeTruthy();
    const payload = upsert!.payload as { baseRev: number; changedFields: string[]; baseSnapshot: Record<string, unknown> };
    expect(payload.baseRev).toBe(4);
    expect(payload.changedFields).toContain('name');
    expect(payload.baseSnapshot.name).toBe('Version serveur');
  });

  it('ne touche pas au profil quand la sauvegarde vient d’un autre foyer', async () => {
    const family = await activeFamily();
    const backup: BackupFile = buildBackup({
      family: { id: 'autre-foyer', name: 'Autre', primaryCurrency: 'EUR' },
      tables: {
        accounts: [],
        categories: [],
        transactions: [],
        budgets: [],
        goals: [],
        debts: [],
        recurring: [],
        wealth: [],
        businesses: [],
        members: [],
      },
    });
    await restoreBackup(backup);
    const after = await db.families.get(family.id);
    expect(after?.name).toBe(family.name);
    expect(after?.primaryCurrency).toBe(family.primaryCurrency);
  });

  it('reprend le profil du foyer quand c’est le même', async () => {
    const family = await activeFamily();
    const backup = buildBackup({
      family: { id: family.id, name: 'Foyer restauré', primaryCurrency: 'EUR' },
      tables: {
        accounts: [],
        categories: [],
        transactions: [],
        budgets: [],
        goals: [],
        debts: [],
        recurring: [],
        wealth: [],
        businesses: [],
        members: [],
      },
    });
    await restoreBackup(backup);
    const after = await db.families.get(family.id);
    expect(after?.name).toBe('Foyer restauré');
    expect(after?.primaryCurrency).toBe('EUR');
  });
});
