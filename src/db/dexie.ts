import Dexie, { type Table } from 'dexie';
import type {
  AppMeta,
  Budget,
  Category,
  Debt,
  Family,
  FinancialAccount,
  HouseholdMember,
  OutboxOperation,
  RateSnapshot,
  SavingsGoal,
  SyncConflict,
  Transaction,
} from '@/core/types';

/** Document de taux stocké dans IndexedDB (clé fixe). */
export interface RateDoc extends RateSnapshot {
  key: 'latest';
}

export class BudgetFamilyDB extends Dexie {
  families!: Table<Family, string>;
  members!: Table<HouseholdMember, string>;
  accounts!: Table<FinancialAccount, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  goals!: Table<SavingsGoal, string>;
  debts!: Table<Debt, string>;
  rates!: Table<RateDoc, string>;
  outbox!: Table<OutboxOperation, string>;
  conflicts!: Table<SyncConflict, string>;
  meta!: Table<AppMeta, string>;

  constructor() {
    super('mon-budget-famille');
    // Baseline v1 : schéma complet (les variantes intermédiaires en dev n'ont
    // jamais quitté la machine de test). IndexedDB refuse une clé booléenne :
    // jamais d'index sur archived/resolved — filtrage en JS.
    this.version(1).stores({
      families: 'id, name',
      members: 'id, familyId, userId, role',
      accounts: 'id, familyId, currency, type, syncStatus, name',
      categories: 'id, familyId, type',
      transactions:
        'id, familyId, accountId, toAccountId, date, type, categoryId, syncStatus, updatedAt, [familyId+date], [familyId+type]',
      budgets: 'id, familyId, period, categoryId, syncStatus, [familyId+period]',
      goals: 'id, familyId, status, syncStatus, createdAt',
      debts: 'id, familyId, kind, status, syncStatus, createdAt',
      rates: 'key',
      outbox: 'id, entity, entityId, status, createdAt',
      conflicts: 'id, entity, entityId, createdAt',
      meta: 'key',
    });
    // v2 : suppression des index booléens ; filtrage en JS à la place.
    // v3 : index requis par les requêtes (orderBy 'name', 'createdAt').
    this.version(3).stores({
      families: 'id, name',
      members: 'id, familyId, userId, role',
      accounts: 'id, familyId, currency, type, syncStatus, name',
      categories: 'id, familyId, type',
      transactions:
        'id, familyId, accountId, toAccountId, date, type, categoryId, syncStatus, updatedAt, [familyId+date], [familyId+type]',
      budgets: 'id, familyId, period, categoryId, syncStatus, [familyId+period]',
      goals: 'id, familyId, status, syncStatus, createdAt',
      debts: 'id, familyId, kind, status, syncStatus, createdAt',
      rates: 'key',
      outbox: 'id, entity, entityId, status, createdAt',
      conflicts: 'id, entity, entityId, createdAt',
      meta: 'key',
    });
  }
}

export const db = new BudgetFamilyDB();
