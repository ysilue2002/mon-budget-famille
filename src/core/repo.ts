import { db } from '@/db/dexie';
import type { Table } from 'dexie';
import { syncFields as newSyncFields, getActiveFamily } from '@/db/seed';
import { enqueue, enqueueUpsert } from '@/sync/outbox';
import { getRates } from '@/core/exchange';
import { monthEndsSince, planMonthEndValuations } from '@/core/wealth';
import { defaultMemberFor } from '@/core/members';
import { getAuth } from '@/lib/api';
import { convertMinor } from '@/core/money';
import { uuid } from '@/lib/id';
import { todayISO } from '@/lib/date';
import { firstRecurringDue } from '@/lib/recurrence';
import type {
  Budget,
  Business,
  Category,
  CurrencyCode,
  Debt,
  DebtKind,
  Family,
  FinancialAccount,
  HouseholdMember,
  Product,
  RecurrenceFrequency,
  RecurringRule,
  SavingsGoal,
  SyncFields,
  Transaction,
  TransactionType,
  WealthSnapshot,
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
  | 'category'
  | 'recurring'
  | 'wealth'
  | 'business'
  | 'product';

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
      case 'recurring':
        return db.recurring;
      case 'wealth':
        return db.wealth;
      case 'business':
        return db.businesses;
      case 'product':
        return db.products;
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

/**
 * Supprime un compte **et toutes les opérations qui le touchent** : celles qui
 * en partent et les transferts qui y arrivent. Laisser des opérations orphelines
 * fausserait les soldes et le bilan, localement comme sur le serveur.
 */
export async function deleteAccount(id: string): Promise<void> {
  const [outgoing, incoming] = await Promise.all([
    db.transactions.where('accountId').equals(id).toArray(),
    db.transactions.where('toAccountId').equals(id).toArray(),
  ]);
  const related = [...new Map([...outgoing, ...incoming].map((tx) => [tx.id, tx])).values()];
  await db.transaction('rw', db.transactions, db.accounts, async () => {
    await db.transactions.bulkDelete(related.map((tx) => tx.id));
    await db.accounts.delete(id);
  });
  await enqueue('account', id, 'delete', null);
  for (const tx of related) {
    await enqueue('transaction', tx.id, 'delete', null);
  }
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
  /** Membre du foyer à qui l'opération est attribuée (facultatif). */
  member?: string;
  /** Activité professionnelle rattachée (ignorée pour un transfert). */
  businessId?: string;
  /** Facture professionnelle non encore encaissée / payée. */
  settled?: boolean;
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

/** Crée une opération ; `id` est imposé par la génération des récurrences. */
export async function createTransaction(input: TransactionInput, id?: string): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const { amountInPrimary, exchangeRate, primary } = await computePrimary(input.amountOriginal, input.currencyOriginal);
  const user = getAuth()?.user ?? null;
  // Un membre par défaut est repris de l'utilisateur connecté s'il est reconnu.
  const memberName =
    input.member?.trim() || (input.type === 'transfer' ? undefined : await defaultMemberName());
  // Un transfert interne n'appartient pas à une activité ; sinon le règlement
  // vaut réglé par défaut (les factures en attente sont marquées explicitement).
  const businessId = input.type === 'transfer' ? undefined : input.businessId;
  const settled = businessId ? input.settled ?? true : undefined;
  const tx: Transaction = {
    id: id ?? uuid(),
    familyId: family.id,
    accountId: input.accountId,
    toAccountId: input.toAccountId,
    authorId: user?.id ?? 'local-user',
    authorName: user?.name ?? '—',
    type: input.type,
    amountOriginal: input.amountOriginal,
    currencyOriginal: input.currencyOriginal,
    exchangeRate,
    amountInPrimary: input.currencyOriginal === primary ? input.amountOriginal : amountInPrimary,
    categoryId: input.categoryId,
    member: memberName,
    businessId,
    settled,
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

// ----------------------------------------------------------------------------- récurrences

export interface RecurringInput {
  name: string;
  type: RecurringRule['type'];
  accountId: string;
  categoryId: string;
  amountOriginal: number;
  currency: RecurringRule['currency'];
  note?: string;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
}

/** Champs mis à jour par l'écran ou par la génération automatique. */
export type RecurringPatch = Partial<RecurringInput> & {
  active?: boolean;
  nextDueDate?: string;
  lastGeneratedDate?: string;
};

/**
 * Crée une règle. La première échéance traitée est celle du jour ou la suivante :
 * le passé n'est jamais généré rétroactivement (pas de fausse dette historique).
 */
export async function createRecurringRule(input: RecurringInput): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const rule: RecurringRule = {
    id: uuid(),
    familyId: family.id,
    ...input,
    nextDueDate: firstRecurringDue(input.startDate, input.frequency, input.interval, todayISO()),
    active: true,
    createdAt: Date.now(),
    ...newSyncFields(),
  };
  await db.recurring.put(rule);
  await enqueue('recurring', rule.id, 'upsert', recordOf(rule));
  return rule.id;
}

/**
 * Modifie une règle. Si le calendrier change (début, fréquence, intervalle),
 * la prochaine échéance est recalculée à partir d'aujourd'hui.
 */
export async function updateRecurringRule(id: string, patch: RecurringPatch): Promise<void> {
  const base = await baseSnapshotOf('recurring', id);
  const current = await db.recurring.get(id);
  if (!current) throw new Error('not-found');
  const updated: RecurringRule = { ...current, ...patch };
  if (patch.startDate !== undefined || patch.frequency !== undefined || patch.interval !== undefined) {
    updated.nextDueDate = firstRecurringDue(updated.startDate, updated.frequency, updated.interval, todayISO());
  }
  const final: RecurringRule = { ...updated, ...(updatedSyncFields(current) as object) };
  await db.recurring.put(final);
  await enqueueUpsert('recurring', id, recordOf(final), current.rev, base);
}

/** Supprime la règle ; les opérations déjà générées restent dans l'historique. */
export async function deleteRecurringRule(id: string): Promise<void> {
  await db.recurring.delete(id);
  await enqueue('recurring', id, 'delete', null);
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

// ----------------------------------------------------------------------------- activités professionnelles

export interface BusinessInput {
  name: string;
  activity: string;
  taxId?: string;
  notes?: string;
}

export async function createBusiness(input: BusinessInput): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const business: Business = {
    id: uuid(),
    familyId: family.id,
    name: input.name.trim(),
    activity: input.activity.trim(),
    taxId: input.taxId?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    archived: false,
    createdAt: Date.now(),
    ...newSyncFields(),
  };
  await db.businesses.put(business);
  await enqueue('business', business.id, 'upsert', recordOf(business));
  return business.id;
}

export async function updateBusiness(id: string, patch: Partial<BusinessInput>): Promise<void> {
  const base = await baseSnapshotOf('business', id);
  const current = await db.businesses.get(id);
  if (!current) throw new Error('not-found');
  const updated: Business = { ...current, ...patch, ...(updatedSyncFields(current) as object) };
  await db.businesses.put(updated);
  await enqueueUpsert('business', id, recordOf(updated), current.rev, base);
}

/**
 * Archive une activité : elle disparaît des écrans mais son historique reste
 * intact (les opérations conservent leur rattachement).
 */
export async function archiveBusiness(id: string): Promise<void> {
  const base = await baseSnapshotOf('business', id);
  const current = await db.businesses.get(id);
  if (!current) throw new Error('not-found');
  const updated: Business = { ...current, archived: true, ...(updatedSyncFields(current) as object) };
  await db.businesses.put(updated);
  await enqueueUpsert('business', id, recordOf(updated), current.rev, base);
}

// ----------------------------------------------------------------------------- marchandises

export interface ProductInput {
  name: string;
  unit: string;
  /** Prix en sous-unités de la devise du foyer. */
  buyPrice: number;
  sellPrice: number;
  stockQty: number;
  alertQty: number;
}

export async function createProduct(input: ProductInput): Promise<string> {
  const family = await getActiveFamily();
  if (!family) throw new Error('no-family');
  const product: Product = {
    id: uuid(),
    familyId: family.id,
    name: input.name.trim(),
    unit: input.unit.trim() || 'pcs',
    buyPrice: Math.max(0, Math.round(input.buyPrice)),
    sellPrice: Math.max(0, Math.round(input.sellPrice)),
    stockQty: Math.max(0, input.stockQty),
    alertQty: Math.max(0, input.alertQty),
    archived: false,
    createdAt: Date.now(),
    ...newSyncFields(),
  };
  await db.products.put(product);
  await enqueue('product', product.id, 'upsert', recordOf(product));
  return product.id;
}

export async function updateProduct(id: string, patch: Partial<ProductInput>): Promise<void> {
  const base = await baseSnapshotOf('product', id);
  const current = await db.products.get(id);
  if (!current) throw new Error('not-found');
  const updated: Product = {
    ...current,
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.stockQty !== undefined ? { stockQty: Math.max(0, patch.stockQty) } : {}),
    ...(updatedSyncFields(current) as object),
  };
  await db.products.put(updated);
  await enqueueUpsert('product', id, recordOf(updated), current.rev, base);
}

/**
 * Mouvement de stock (entrée positive, sortie négative), borné à zéro :
 * une vente ne peut pas rendre la quantité négative (donnée de départ fausse
 * plutôt qu'un stock impossible à afficher).
 */
export async function adjustProductStock(id: string, delta: number): Promise<void> {
  const current = await db.products.get(id);
  if (!current) return;
  await updateProduct(id, { stockQty: Math.max(0, current.stockQty + delta) });
}

export async function deleteProduct(id: string): Promise<void> {
  await db.products.delete(id);
  await enqueue('product', id, 'delete', null);
}

/** Marque une opération professionnelle comme réglée (ou en attente). */
export async function setTransactionSettled(id: string, settled: boolean): Promise<void> {
  await patchTransaction(id, { settled });
}

// ----------------------------------------------------------------------------- membres

/**
 * Liste locale des membres du foyer, utilisée pour attribuer les opérations.
 * La vérité reste portée par `Transaction.member` (nom, synchronisé) : la table
 * `members` n'est qu'un index alimenté par `syncMemberNames()`.
 */

/**
 * Membre correspondant à l'utilisateur connecté (identifiant serveur, e-mail
 * puis nom) : sert à pré-remplir l'attribution des nouvelles opérations.
 */
export async function defaultMemberName(): Promise<string | undefined> {
  const user = getAuth()?.user ?? null;
  if (!user) return undefined;
  const members = await db.members.toArray();
  return defaultMemberFor(members, user)?.name;
}

export async function createMember(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const family = await getActiveFamily();
  if (!family) return null;
  const existing = await db.members
    .filter((member) => member.name.toLowerCase() === trimmed.toLowerCase())
    .first();
  if (existing) return existing.id;
  // Le membre créé pour l'utilisateur connecté lui est rattaché, ce qui rend
  // l'attribution par défaut insensible à un futur renommage.
  const user = getAuth()?.user ?? null;
  const isSelf = Boolean(user && user.name.trim().toLowerCase() === trimmed.toLowerCase());
  const member: HouseholdMember = {
    id: uuid(),
    familyId: family.id,
    userId: isSelf ? user!.id : '',
    name: trimmed,
    email: isSelf ? user!.email : '',
    role: 'member',
  };
  await db.members.put(member);
  return member.id;
}

/** Applique un correctif à une opération (et l'envoie à la synchronisation). */
async function patchTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
  const current = await db.transactions.get(id);
  if (!current) return;
  const base = await baseSnapshotOf('transaction', id);
  const updated: Transaction = { ...current, ...patch, ...(updatedSyncFields(current) as object) };
  await db.transactions.put(updated);
  await enqueueUpsert('transaction', id, recordOf(updated), current.rev, base);
}

/** Renomme un membre et reporte le nouveau nom sur ses opérations. */
export async function renameMember(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const member = await db.members.get(id);
  if (!member || member.name === trimmed) return;
  await db.members.put({ ...member, name: trimmed });
  const transactions = await db.transactions.filter((tx) => tx.member === member.name).toArray();
  for (const tx of transactions) await patchTransaction(tx.id, { member: trimmed });
}

/** Retire un membre et désattribue ses opérations. */
export async function deleteMember(id: string): Promise<void> {
  const member = await db.members.get(id);
  if (!member) return;
  const transactions = await db.transactions.filter((tx) => tx.member === member.name).toArray();
  for (const tx of transactions) await patchTransaction(tx.id, { member: undefined });
  await db.members.delete(id);
}

/** Attribue une opération à un membre (`undefined` pour la désattribuer). */
export async function assignTransactionMember(transactionId: string, member: string | undefined): Promise<void> {
  await patchTransaction(transactionId, { member: member?.trim() || undefined });
}

/**
 * Crée la ligne membre de chaque nom déjà utilisé par une opération, plus celle
 * de l'utilisateur connecté (pour qu'il soit proposé par défaut).
 */
export async function syncMemberNames(): Promise<void> {
  const transactions = await db.transactions.toArray();
  const names = new Set(transactions.map((tx) => tx.member?.trim()).filter(Boolean) as string[]);
  for (const name of names) await createMember(name);
  const user = getAuth()?.user;
  if (user?.name.trim()) await createMember(user.name);
}

// ----------------------------------------------------------------------------- patrimoine

export interface WealthInput {
  /** Épargne, créances et dettes **déjà consolidées** dans `primary`. */
  savings: number;
  receivables: number;
  payables: number;
  primary: CurrencyCode;
  /** Date de la valorisation (aujourd'hui par défaut). */
  date?: string;
  /** Marquage d'une valeur estimée (repli sans relevé antérieur). */
  estimated?: boolean;
}

/**
 * Enregistre la valorisation du jour (id déterministe `wealth-<date>`).
 * Idempotent : rien n'est écrit si les montants sont inchangés, ce qui évite de
 * saturer la file de synchronisation à chaque rendu. Un relevé par jour suffit :
 * le bilan d'une période utilise le dernier relevé antérieur à sa clôture.
 */
export async function recordWealthSnapshot(input: WealthInput): Promise<void> {
  const family = await getActiveFamily();
  if (!family) return;
  const date = input.date ?? todayISO();
  const id = `wealth-${date}`;
  const existing = await db.wealth.get(id);
  if (
    existing &&
    existing.savings === input.savings &&
    existing.receivables === input.receivables &&
    existing.payables === input.payables &&
    existing.primary === input.primary &&
    Boolean(existing.estimated) === Boolean(input.estimated)
  ) {
    return;
  }
  const base = existing ? await baseSnapshotOf('wealth', id) : null;
  const row: WealthSnapshot = {
    id,
    familyId: family.id,
    date,
    primary: input.primary,
    savings: input.savings,
    receivables: input.receivables,
    payables: input.payables,
    estimated: input.estimated,
    createdAt: existing?.createdAt ?? Date.now(),
    ...(existing ? updatedSyncFields(existing) : newSyncFields()),
  };
  await db.wealth.put(row);
  if (existing) await enqueueUpsert('wealth', id, recordOf(row), existing.rev, base);
  else await enqueue('wealth', id, 'upsert', recordOf(row));
}

/**
 * Complète les valorisations de fin de mois manquantes (voir `wealth.ts`).
 * Appelé à chaque ouverture : l'application n'a pas besoin d'être ouverte le
 * dernier jour du mois pour que ce jour soit valorisé.
 */
export async function ensureMonthEndValuations(
  input: WealthInput & { startISO?: string },
): Promise<number> {
  const existing = await db.wealth.orderBy('date').toArray();
  const today = todayISO();
  const start = input.startISO ?? existing[0]?.date ?? `${today.slice(0, 7)}-01`;
  const ends = monthEndsSince(start, today).slice(-24);
  const plan = planMonthEndValuations(existing, ends, input);
  for (const item of plan) {
    await recordWealthSnapshot({
      savings: item.savings,
      receivables: item.receivables,
      payables: item.payables,
      primary: input.primary,
      date: item.date,
      estimated: item.estimated,
    });
  }
  return plan.length;
}

function recordOf(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

/**
 * Champs de synchronisation d'une modification locale (new updatedAt).
 * Ne renvoie QUE les champs de synchronisation : étalé après un patch, il ne
 * doit jamais réinjecter l'ancienne valeur des champs métier.
 */
export function updatedSyncFields(current: SyncFields): SyncFields {
  return {
    baseRev: current.baseRev,
    rev: current.rev,
    deviceId: current.deviceId,
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
      case 'recurring':
        return db.recurring;
      case 'business':
        return db.businesses;
      case 'product':
        return db.products;
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
