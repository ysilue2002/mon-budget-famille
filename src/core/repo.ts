import { db } from '@/db/dexie';
import type { Table } from 'dexie';
import { syncFields as newSyncFields, getActiveFamily } from '@/db/seed';
import { enqueue, enqueueUpsert } from '@/sync/outbox';
import { getRates } from '@/core/exchange';
import { convertMinor } from '@/core/money';
import { uuid } from '@/lib/id';
import type {
  Budget,
  Category,
  Debt,
  DebtKind,
  Family,
  FinancialAccount,
  SavingsGoal,
  SyncFields,
  Transaction,
  TransactionType,
} from '@/core/types';

/**
 * Dépôt métier : chaque écriture met à jour Dexie *et* place une opération
 * idempotente dans la file de synchronisation (mode offline-first).
 */

type SyncedEntity =
  | 'account'
  | 'transaction'
  | 'budget'
  | 'goal'
  | 'debt'
  | 'category';

async function baseSnapshotOf(entity: SyncedEntity, id: string): Promise<Record<string, unknown> | null> {
  const table = (() => {
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
    }
  })();
  const row = await table.get(id);
  return row ? { ...(row as object) } : null;
}

// ----------------------------------------------------------------------------- comptes

export interface AccountInput {
  name: string;
  type: FinancialAccount['type'];
  provider: FinancialAccount['provider'];
  currency: FinancialAccount['currency'];
  initialBalance: number;
  color?: string;
}

export async function createAccount(input: AccountInput): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const account: FinancialAccount = {
    id: uuid(),
    familyId: family.id,
    archived: false,
    ...newSyncFields(),
    ...input,
  };
  await db.accounts.put(account);
  await enqueue('account', account.id, 'upsert', recordOf(account));
  return account.id;
}

export async function updateAccount(id: string, patch: Partial<AccountInput>): Promise<void> {
  const base = await baseSnapshotOf('account', id);
  const current = await db.accounts.get(id);
  if (!current) throw new Error('not-found');
  const updated: FinancialAccount = { ...current, ...patch, ...(updatedSyncFields(current) as object) };
  await db.accounts.put(updated);
  await enqueueUpsert('account', id, recordOf(updated), current.rev, base);
}

export async function deleteAccount(id: string): Promise<void> {
  const related = await db.transactions.where('accountId').equals(id).toArray();
  await db.transaction('rw', db.transactions, db.accounts, async () => {
    await db.transactions.bulkDelete([id, ...related.map((t) => toAccountId(t))].filter(Boolean) as string[]);
    await db.accounts.delete(id);
  });
  await enqueue('account', id, 'delete', null);
  for (const tx of related) {
    await enqueue('transaction', tx.id, 'delete', null);
  }
}

function toAccountId(tx: Transaction): string | undefined {
  return tx.toAccountId;
}

// ----------------------------------------------------------------------------- catégories

export interface CategoryInput {
  nameFr: string;
  nameEn: string;
  type: 'income' | 'expense';
  icon?: string;
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const categoryId = uuid();
  const category: Category = {
    id: categoryId,
    familyId: family.id,
    ...input,
  };
  await db.categories.put(category);
  await enqueue('category', category.id, 'upsert', recordOf(category));
  return categoryId;
}

export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id);
  await enqueue('category', id, 'delete', null);
}

// ----------------------------------------------------------------------------- opérations

export interface TransactionInput {
  type: TransactionType;
  accountId: string;
  toAccountId?: string;
  amountOriginal: number;
  currencyOriginal: Transaction['currencyOriginal'];
  categoryId?: string;
  date: string;
  note?: string;
}

/** Conversion dans la devise du foyer, au taux du moment. */
export async function computePrimary(
  amountMinor: number,
  from: Transaction['currencyOriginal'],
): Promise<{ amountInPrimary: number; exchangeRate: number; primary: Transaction['currencyOriginal'] }> {
  const family = await getActiveFamily();
  const primary = family?.primaryCurrency ?? 'XOF';
  const { snapshot } = await getRates();
  const converted = convertMinor(amountMinor, from, primary, snapshot);
  const rate = convertMinor(1, from, primary, snapshot) ?? 1;
  return { amountInPrimary: converted ?? amountMinor, exchangeRate: Number(rate.toFixed(6)), primary };
}

export async function createTransaction(input: TransactionInput): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const { amountInPrimary, exchangeRate, primary } = await computePrimary(input.amountOriginal, input.currencyOriginal);
  const member = (await db.members.toCollection().first()) ?? null;
  const tx: Transaction = {
    id: uuid(),
    familyId: family.id,
    accountId: input.accountId,
    toAccountId: input.toAccountId,
    authorId: member?.id ?? 'local-user',
    authorName: member?.name ?? '—',
    type: input.type,
    amountOriginal: input.amountOriginal,
    currencyOriginal: input.currencyOriginal,
    exchangeRate,
    amountInPrimary: input.currencyOriginal === primary ? input.amountOriginal : amountInPrimary,
    categoryId: input.categoryId,
    date: input.date,
    note: input.note,
    ...newSyncFields(),
  };
  await db.transactions.put(tx);
  await enqueue('transaction', tx.id, 'upsert', recordOf(tx));
  return tx.id;
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<void> {
  const base = await baseSnapshotOf('transaction', id);
  const current = await db.transactions.get(id);
  if (!current) throw new Error('not-found');
  const { amountInPrimary, exchangeRate, primary } = await computePrimary(input.amountOriginal, input.currencyOriginal);
  const updated: Transaction = {
    ...current,
    ...input,
    exchangeRate,
    amountInPrimary: input.currencyOriginal === primary ? input.amountOriginal : amountInPrimary,
    ...(updatedSyncFields(current) as object),
  };
  await db.transactions.put(updated);
  await enqueueUpsert('transaction', id, recordOf(updated), current.rev, base);
}

/** Corrige le montant crédité à la destination d'un transfert inter-devises. */
export async function updateTransactionToAmount(id: string, toAmount: number): Promise<void> {
  const base = await baseSnapshotOf('transaction', id);
  const current = await db.transactions.get(id);
  if (!current) throw new Error('not-found');
  const updated: Transaction = { ...current, toAmount, ...(updatedSyncFields(current) as object) };
  await db.transactions.put(updated);
  await enqueueUpsert('transaction', id, recordOf(updated), current.rev, base);
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
  await enqueue('transaction', id, 'delete', null);
}

// ----------------------------------------------------------------------------- budgets

export interface BudgetInput {
  period: string;
  categoryId: string;
  amountLimit: number;
  alertThreshold: number;
}

export async function createBudget(input: BudgetInput): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const budget: Budget = {
    id: uuid(),
    familyId: family.id,
    currency: family.primaryCurrency,
    ...newSyncFields(),
    ...input,
  };
  await db.budgets.put(budget);
  await enqueue('budget', budget.id, 'upsert', recordOf(budget));
  return budget.id;
}

export async function updateBudget(id: string, patch: Partial<BudgetInput>): Promise<void> {
  const base = await baseSnapshotOf('budget', id);
  const current = await db.budgets.get(id);
  if (!current) throw new Error('not-found');
  const updated: Budget = { ...current, ...patch, ...(updatedSyncFields(current) as object) };
  await db.budgets.put(updated);
  await enqueueUpsert('budget', id, recordOf(updated), current.rev, base);
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id);
  await enqueue('budget', id, 'delete', null);
}

// ----------------------------------------------------------------------------- épargne

export interface GoalInput {
  name: string;
  targetAmount: number;
  currency: SavingsGoal['currency'];
  targetDate: string | null;
}

export async function createGoal(input: GoalInput): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const goal: SavingsGoal = {
    id: uuid(),
    familyId: family.id,
    currentAmount: 0,
    status: 'active',
    createdAt: Date.now(),
    ...newSyncFields(),
    ...input,
  };
  await db.goals.put(goal);
  await enqueue('goal', goal.id, 'upsert', recordOf(goal));
  return goal.id;
}

export async function updateGoal(id: string, patch: Partial<GoalInput>): Promise<void> {
  const base = await baseSnapshotOf('goal', id);
  const current = await db.goals.get(id);
  if (!current) throw new Error('not-found');
  const updated: SavingsGoal = { ...current, ...patch, ...(updatedSyncFields(current) as object) };
  await db.goals.put(updated);
  await enqueueUpsert('goal', id, recordOf(updated), current.rev, base);
}

/** Contribution directe : augmente l'épargne, bascule le statut si l'objectif est atteint. */
export async function contributeGoal(id: string, amountMinor: number): Promise<void> {
  const base = await baseSnapshotOf('goal', id);
  const current = await db.goals.get(id);
  if (!current) throw new Error('not-found');
  const total = current.currentAmount + amountMinor;
  const status = total >= current.targetAmount ? 'completed' : current.status;
  const updated: SavingsGoal = {
    ...current,
    currentAmount: total,
    status,
    ...(updatedSyncFields(current) as object),
  };
  await db.goals.put(updated);
  await enqueueUpsert('goal', id, recordOf(updated), current.rev, base);
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id);
  await enqueue('goal', id, 'delete', null);
}

// ----------------------------------------------------------------------------- dettes

export interface DebtInput {
  kind: DebtKind;
  partyName: string;
  initialAmount: number;
  currency: Debt['currency'];
  dueDate: string | null;
}

export async function createDebt(input: DebtInput): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const debt: Debt = {
    id: uuid(),
    familyId: family.id,
    remainingAmount: input.initialAmount,
    status: 'open',
    payments: [],
    createdAt: Date.now(),
    ...newSyncFields(),
    ...input,
  };
  await db.debts.put(debt);
  await enqueue('debt', debt.id, 'upsert', recordOf(debt));
  return debt.id;
}

export async function updateDebt(id: string, patch: Partial<DebtInput>): Promise<void> {
  const base = await baseSnapshotOf('debt', id);
  const current = await db.debts.get(id);
  if (!current) throw new Error('not-found');
  const updated: Debt = { ...current, ...patch, ...(updatedSyncFields(current) as object) };
  await db.debts.put(updated);
  await enqueueUpsert('debt', id, recordOf(updated), current.rev, base);
}

export async function deleteDebt(id: string): Promise<void> {
  await db.debts.delete(id);
  await enqueue('debt', id, 'delete', null);
}

/**
 * Remboursement : met à jour la dette, et si un compte est précisé,
 * crée une opération (sortie pour une dette, entrée pour une créance).
 */
export async function repayDebt(
  id: string,
  amountMinor: number,
  date: string,
  accountId?: string,
): Promise<string | null> {
  const base = await baseSnapshotOf('debt', id);
  const current = await db.debts.get(id);
  if (!current) throw new Error('not-found');

  const remaining = Math.max(0, current.remainingAmount - amountMinor);
  const payment = { id: uuid(), amount: amountMinor, date, accountId };
  const updated: Debt = {
    ...current,
    payments: [...current.payments, payment],
    remainingAmount: remaining,
    status: remaining === 0 ? 'settled' : current.status,
    ...(updatedSyncFields(current) as object),
  };
  await db.debts.put(updated);
  await enqueueUpsert('debt', id, recordOf(updated), current.rev, base);

  if (accountId && current.kind === 'payable') {
    await createTransaction({
      type: 'expense',
      accountId,
      amountOriginal: amountMinor,
      currencyOriginal: current.currency,
      categoryId: 'cat-autres',
      date,
      note: `Remboursement — ${current.partyName}`,
    });
    return null;
  }
  if (accountId && current.kind === 'receivable') {
    await createTransaction({
      type: 'income',
      accountId,
      amountOriginal: amountMinor,
      currencyOriginal: current.currency,
      categoryId: 'cat-autres-revenus',
      date,
      note: `Encaissement — ${current.partyName}`,
    });
    return null;
  }
  return payment.id;
}

// ----------------------------------------------------------------------------- foyer

/** Modifie le profil du foyer : nom et/ou devise de consolidation. */
export async function updateFamilyProfile(input: { name?: string; primaryCurrency?: Family['primaryCurrency'] }): Promise<void> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const updated: Family = { ...family, ...input };
  await db.families.put(updated);
}

// ----------------------------------------------------------------------------- utilitaires

function recordOf(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

/** Champs de synchronisation d'une modification locale (new updatedAt). */
export function updatedSyncFields(current: SyncFields): SyncFields {
  return {
    ...current,
    updatedAt: Date.now(),
    syncStatus: 'pending' as const,
  };
}

// ----------------------------------------------------------------------------- conflits

export async function resolveConflict(conflictId: string, keep: 'local' | 'remote'): Promise<void> {
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict || conflict.resolved) return;
  const table: Table<unknown, string> | null = (() => {
    switch (conflict.entity) {
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
      default:
        return null;
    }
  })();
  if (!table) return;

  const record = (await table.get(conflict.entityId)) as (Record<string, unknown> & { rev?: number; baseRev?: number }) | undefined;
  if (record) {
    const rev = record.rev ?? 0;
    if (keep === 'remote') {
      const patched: Record<string, unknown> = { ...record };
      patched[conflict.field] = conflict.remoteValue;
      patched.rev = rev;
      patched.baseRev = rev;
      patched.syncStatus = 'synced';
      await table.put(patched);
    } else {
      const patched: Record<string, unknown> = { ...record, syncStatus: 'pending' };
      const base: Record<string, unknown> = { ...record };
      base[conflict.field] = conflict.remoteValue;
      await table.put(patched);
      await enqueueUpsert(conflict.entity, conflict.entityId, patched, rev, base);
    }
  }
  await db.conflicts.put({ ...conflict, resolved: true });
}

export async function openConflicts(): Promise<number> {
  return db.conflicts.filter((conflict) => !conflict.resolved).count();
}
