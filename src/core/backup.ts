import type { Table } from 'dexie';
import { db } from '@/db/dexie';
import { enqueue, enqueueUpsert } from '@/sync/outbox';
import { getActiveFamily } from '@/db/seed';
import { getDeviceId } from '@/lib/id';
import type {
  Budget,
  Business,
  Category,
  Debt,
  Family,
  FinancialAccount,
  HouseholdMember,
  RecurringRule,
  SavingsGoal,
  SyncEntity,
  Transaction,
  WealthSnapshot,
} from '@/core/types';

/**
 * Sauvegarde du foyer : un fichier JSON autonome de toutes les données métier,
 * restaurable sur un autre appareil. Ce n'est pas un rapport (contrairement aux
 * exports XLSX/PDF) mais une archive qu'on peut remettre dans l'application.
 *
 * Ce qui est **volontairement absent** du fichier :
 * - le jeton d'authentification et les métadonnées locales (`meta` : curseur de
 *   synchronisation, appareil) — un fichier de sauvegarde ne doit jamais
 *   contenir de secret ;
 * - la file d'attente (`outbox`) et les conflits (`conflicts`), qui décrivent un
 *   état transitoire propre à un appareil ;
 * - les taux de change (`rates`), qui se retéléchargent et vieillissent mal.
 *
 * La restauration réécrit `familyId` avec le foyer actif et repasse chaque
 * enregistrement par la file de synchronisation : les données remontent au
 * serveur comme une modification ordinaire, sans court-circuiter les révisions.
 */

export const BACKUP_APP = 'mon-budget-famille' as const;
export const BACKUP_VERSION = 1 as const;

export interface BackupTables {
  accounts: FinancialAccount[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: SavingsGoal[];
  debts: Debt[];
  recurring: RecurringRule[];
  wealth: WealthSnapshot[];
  businesses: Business[];
  members: HouseholdMember[];
}

export type BackupTableKey = keyof BackupTables;

export const BACKUP_TABLE_KEYS: BackupTableKey[] = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'goals',
  'debts',
  'recurring',
  'wealth',
  'businesses',
  'members',
];

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  /** ISO 8601, lisible par un humain dans le fichier. */
  exportedAt: string;
  family: Pick<Family, 'id' | 'name' | 'primaryCurrency'>;
  counts: Record<BackupTableKey, number>;
  tables: BackupTables;
}

export interface RestoreReport {
  created: number;
  updated: number;
  skipped: number;
}

/** Champs de synchronisation : jamais comparés ni restaurés tels quels. */
const SYNC_KEYS = new Set(['baseRev', 'rev', 'updatedAt', 'deviceId', 'syncStatus']);

function businessPart(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (!SYNC_KEYS.has(key)) out[key] = record[key];
  }
  return out;
}

function sameBusinessPart(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(businessPart(a)) === JSON.stringify(businessPart(b));
}

/** Construit le contenu du fichier à partir d'un instantané des tables. */
export function buildBackup(input: {
  family: Pick<Family, 'id' | 'name' | 'primaryCurrency'>;
  tables: BackupTables;
  exportedAt?: string;
}): BackupFile {
  const counts = Object.fromEntries(
    BACKUP_TABLE_KEYS.map((key) => [key, input.tables[key].length]),
  ) as Record<BackupTableKey, number>;
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    family: input.family,
    counts,
    tables: input.tables,
  };
}

export class BackupError extends Error {
  constructor(readonly reason: 'invalid-json' | 'not-a-backup' | 'unsupported-version' | 'invalid-content') {
    super(reason);
    this.name = 'BackupError';
  }
}

/**
 * Lit un fichier de sauvegarde. Refuse tout ce qui n'a pas été produit par cette
 * application : mieux vaut une erreur claire qu'une restauration partielle.
 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('invalid-json');
  }
  if (typeof raw !== 'object' || raw === null) throw new BackupError('not-a-backup');
  const candidate = raw as Partial<BackupFile>;
  if (candidate.app !== BACKUP_APP) throw new BackupError('not-a-backup');
  if (candidate.version !== BACKUP_VERSION) throw new BackupError('unsupported-version');
  if (typeof candidate.family !== 'object' || candidate.family === null) throw new BackupError('invalid-content');
  if (typeof candidate.tables !== 'object' || candidate.tables === null) throw new BackupError('invalid-content');

  const tables: Record<BackupTableKey, unknown[]> = {} as Record<BackupTableKey, unknown[]>;
  for (const key of BACKUP_TABLE_KEYS) {
    const rows = (candidate.tables as unknown as Record<string, unknown>)[key];
    // Une table absente vaut table vide : une sauvegarde d'une version
    // antérieure reste restaurable.
    if (rows === undefined) {
      tables[key] = [];
      continue;
    }
    if (!Array.isArray(rows)) throw new BackupError('invalid-content');
    for (const row of rows) {
      if (typeof row !== 'object' || row === null || typeof (row as { id?: unknown }).id !== 'string') {
        throw new BackupError('invalid-content');
      }
    }
    tables[key] = rows;
  }

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : new Date().toISOString(),
    family: {
      id: String(candidate.family.id ?? ''),
      name: String(candidate.family.name ?? ''),
      primaryCurrency: candidate.family.primaryCurrency ?? 'XOF',
    },
    counts: Object.fromEntries(
      BACKUP_TABLE_KEYS.map((key) => [key, tables[key].length]),
    ) as Record<BackupTableKey, number>,
    tables: tables as unknown as BackupTables,
  };
}

/** `budget-2026-11-01.json` — tri lexicographique = tri chronologique. */
export function backupFileName(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `budget-famille-${iso}.json`;
}

export function backupToJson(file: BackupFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Instantané complet des données du foyer actif. */
export async function exportBackup(): Promise<BackupFile> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const [accounts, categories, transactions, budgets, goals, debts, recurring, wealth, businesses, members] =
    await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.goals.toArray(),
      db.debts.toArray(),
      db.recurring.toArray(),
      db.wealth.toArray(),
      db.businesses.toArray(),
      db.members.toArray(),
    ]);
  return buildBackup({
    family: { id: family.id, name: family.name, primaryCurrency: family.primaryCurrency },
    tables: { accounts, categories, transactions, budgets, goals, debts, recurring, wealth, businesses, members },
  });
}

/**
 * Réécrit chaque enregistrement dans Dexie puis le remet en file de
 * synchronisation. Un enregistrement identique (hors champs de synchronisation)
 * est ignoré : restaurer deux fois la même sauvegarde n'engendre pas de trafic.
 */
export async function restoreBackup(file: BackupFile): Promise<RestoreReport> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const report: RestoreReport = { created: 0, updated: 0, skipped: 0 };
  const deviceId = getDeviceId();
  const now = Date.now();

  const restore = async <T extends { id: string }>(
    rows: T[],
    entity: SyncEntity,
    table: Table<T, string>,
  ): Promise<void> => {
    for (const row of rows) {
      const previous = await table.get(row.id);
      if (previous && sameBusinessPart(previous as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>)) {
        report.skipped += 1;
        continue;
      }
      const rev = previous ? (previous as unknown as { rev?: number }).rev ?? 0 : 0;
      const next = {
        ...(row as unknown as Record<string, unknown>),
        familyId: family.id,
        baseRev: rev,
        rev,
        updatedAt: now,
        deviceId,
        syncStatus: 'pending' as const,
      } as unknown as T;
      await table.put(next);
      if (previous) {
        // La base commune est l'état local d'avant restauration : le serveur ne
        // signale un conflit que sur les champs réellement divergents.
        await enqueueUpsert(entity, row.id, next as unknown as Record<string, unknown>, rev, {
          ...(previous as unknown as Record<string, unknown>),
        });
        report.updated += 1;
      } else {
        await enqueue(entity, row.id, 'upsert', next);
        report.created += 1;
      }
    }
  };

  await restore(file.tables.accounts, 'account', db.accounts);
  await restore(file.tables.categories, 'category', db.categories);
  await restore(file.tables.transactions, 'transaction', db.transactions);
  await restore(file.tables.budgets, 'budget', db.budgets);
  await restore(file.tables.goals, 'goal', db.goals);
  await restore(file.tables.debts, 'debt', db.debts);
  await restore(file.tables.recurring, 'recurring', db.recurring);
  await restore(file.tables.wealth, 'wealth', db.wealth);
  await restore(file.tables.businesses, 'business', db.businesses);

  // Les membres ne sont qu'un index local (la vérité est `Transaction.member`) :
  // ils se réécrivent sans passer par la synchronisation.
  for (const member of file.tables.members) {
    const previous = await db.members.get(member.id);
    if (previous && sameBusinessPart(previous as unknown as Record<string, unknown>, member as unknown as Record<string, unknown>)) {
      report.skipped += 1;
      continue;
    }
    await db.members.put({ ...member, familyId: family.id });
    if (previous) report.updated += 1;
    else report.created += 1;
  }

  // Profil du foyer : uniquement s'il s'agit bien du même foyer (sinon on
  // écraserait le nom et la devise d'un autre compte).
  if (file.family.id === family.id && (file.family.name || file.family.primaryCurrency)) {
    await db.families.put({
      ...family,
      name: file.family.name || family.name,
      primaryCurrency: file.family.primaryCurrency || family.primaryCurrency,
    });
  }

  return report;
}
