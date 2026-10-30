import { db } from '@/db/dexie';
import { syncFields as newSyncFields, getActiveFamily } from '@/db/seed';
import { enqueue, enqueueUpsert } from '@/sync/outbox';
import { getRates } from '@/core/exchange';
import { convertMinor } from '@/core/money';
import { uuid } from '@/lib/id';
async function baseSnapshotOf(entity, id) {
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
    return row ? { ...row } : null;
}
export async function createAccount(input) {
    const family = await getActiveFamily();
    if (!family)
        throw new Error('no-family');
    const account = {
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
export async function updateAccount(id, patch) {
    const base = await baseSnapshotOf('account', id);
    const current = await db.accounts.get(id);
    if (!current)
        throw new Error('not-found');
    const updated = { ...current, ...patch, ...updatedSyncFields(current) };
    await db.accounts.put(updated);
    await enqueueUpsert('account', id, recordOf(updated), current.rev, base);
}
export async function deleteAccount(id) {
    const related = await db.transactions.where('accountId').equals(id).toArray();
    await db.transaction('rw', db.transactions, db.accounts, async () => {
        await db.transactions.bulkDelete([id, ...related.map((t) => toAccountId(t))].filter(Boolean));
        await db.accounts.delete(id);
    });
    await enqueue('account', id, 'delete', null);
    for (const tx of related) {
        await enqueue('transaction', tx.id, 'delete', null);
    }
}
function toAccountId(tx) {
    return tx.toAccountId;
}
export async function createCategory(input) {
    const family = await getActiveFamily();
    if (!family)
        throw new Error('no-family');
    const categoryId = uuid();
    const category = {
        id: categoryId,
        familyId: family.id,
        ...input,
    };
    await db.categories.put(category);
    await enqueue('category', category.id, 'upsert', recordOf(category));
    return categoryId;
}
export async function deleteCategory(id) {
    await db.categories.delete(id);
    await enqueue('category', id, 'delete', null);
}
/** Conversion dans la devise du foyer, au taux du moment. */
export async function computePrimary(amountMinor, from) {
    const family = await getActiveFamily();
    const primary = family?.primaryCurrency ?? 'XOF';
    const { snapshot } = await getRates();
    const converted = convertMinor(amountMinor, from, primary, snapshot);
    const rate = convertMinor(1, from, primary, snapshot) ?? 1;
    return { amountInPrimary: converted ?? amountMinor, exchangeRate: Number(rate.toFixed(6)), primary };
}
export async function createTransaction(input) {
    const family = await getActiveFamily();
    if (!family)
        throw new Error('no-family');
    const { amountInPrimary, exchangeRate, primary } = await computePrimary(input.amountOriginal, input.currencyOriginal);
    const member = (await db.members.toCollection().first()) ?? null;
    const tx = {
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
export async function updateTransaction(id, input) {
    const base = await baseSnapshotOf('transaction', id);
    const current = await db.transactions.get(id);
    if (!current)
        throw new Error('not-found');
    const { amountInPrimary, exchangeRate, primary } = await computePrimary(input.amountOriginal, input.currencyOriginal);
    const updated = {
        ...current,
        ...input,
        exchangeRate,
        amountInPrimary: input.currencyOriginal === primary ? input.amountOriginal : amountInPrimary,
        ...updatedSyncFields(current),
    };
    await db.transactions.put(updated);
    await enqueueUpsert('transaction', id, recordOf(updated), current.rev, base);
}
/** Corrige le montant crédité à la destination d'un transfert inter-devises. */
export async function updateTransactionToAmount(id, toAmount) {
    const base = await baseSnapshotOf('transaction', id);
    const current = await db.transactions.get(id);
    if (!current)
        throw new Error('not-found');
    const updated = { ...current, toAmount, ...updatedSyncFields(current) };
    await db.transactions.put(updated);
    await enqueueUpsert('transaction', id, recordOf(updated), current.rev, base);
}
export async function deleteTransaction(id) {
    await db.transactions.delete(id);
    await enqueue('transaction', id, 'delete', null);
}
export async function createBudget(input) {
    const family = await getActiveFamily();
    if (!family)
        throw new Error('no-family');
    const budget = {
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
export async function updateBudget(id, patch) {
    const base = await baseSnapshotOf('budget', id);
    const current = await db.budgets.get(id);
    if (!current)
        throw new Error('not-found');
    const updated = { ...current, ...patch, ...updatedSyncFields(current) };
    await db.budgets.put(updated);
    await enqueueUpsert('budget', id, recordOf(updated), current.rev, base);
}
export async function deleteBudget(id) {
    await db.budgets.delete(id);
    await enqueue('budget', id, 'delete', null);
}
export async function createGoal(input) {
    const family = await getActiveFamily();
    if (!family)
        throw new Error('no-family');
    const goal = {
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
export async function updateGoal(id, patch) {
    const base = await baseSnapshotOf('goal', id);
    const current = await db.goals.get(id);
    if (!current)
        throw new Error('not-found');
    const updated = { ...current, ...patch, ...updatedSyncFields(current) };
    await db.goals.put(updated);
    await enqueueUpsert('goal', id, recordOf(updated), current.rev, base);
}
/** Contribution directe : augmente l'épargne, bascule le statut si l'objectif est atteint. */
export async function contributeGoal(id, amountMinor) {
    const base = await baseSnapshotOf('goal', id);
    const current = await db.goals.get(id);
    if (!current)
        throw new Error('not-found');
    const total = current.currentAmount + amountMinor;
    const status = total >= current.targetAmount ? 'completed' : current.status;
    const updated = {
        ...current,
        currentAmount: total,
        status,
        ...updatedSyncFields(current),
    };
    await db.goals.put(updated);
    await enqueueUpsert('goal', id, recordOf(updated), current.rev, base);
}
export async function deleteGoal(id) {
    await db.goals.delete(id);
    await enqueue('goal', id, 'delete', null);
}
export async function createDebt(input) {
    const family = await getActiveFamily();
    if (!family)
        throw new Error('no-family');
    const debt = {
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
export async function updateDebt(id, patch) {
    const base = await baseSnapshotOf('debt', id);
    const current = await db.debts.get(id);
    if (!current)
        throw new Error('not-found');
    const updated = { ...current, ...patch, ...updatedSyncFields(current) };
    await db.debts.put(updated);
    await enqueueUpsert('debt', id, recordOf(updated), current.rev, base);
}
export async function deleteDebt(id) {
    await db.debts.delete(id);
    await enqueue('debt', id, 'delete', null);
}
/**
 * Remboursement : met à jour la dette, et si un compte est précisé,
 * crée une opération (sortie pour une dette, entrée pour une créance).
 */
export async function repayDebt(id, amountMinor, date, accountId) {
    const base = await baseSnapshotOf('debt', id);
    const current = await db.debts.get(id);
    if (!current)
        throw new Error('not-found');
    const remaining = Math.max(0, current.remainingAmount - amountMinor);
    const payment = { id: uuid(), amount: amountMinor, date, accountId };
    const updated = {
        ...current,
        payments: [...current.payments, payment],
        remainingAmount: remaining,
        status: remaining === 0 ? 'settled' : current.status,
        ...updatedSyncFields(current),
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
export async function updateFamilyProfile(input) {
    const family = await getActiveFamily();
    if (!family)
        throw new Error('no-family');
    const updated = { ...family, ...input };
    await db.families.put(updated);
}
// ----------------------------------------------------------------------------- utilitaires
function recordOf(value) {
    return value;
}
/** Champs de synchronisation d'une modification locale (new updatedAt). */
export function updatedSyncFields(current) {
    return {
        ...current,
        updatedAt: Date.now(),
        syncStatus: 'pending',
    };
}
// ----------------------------------------------------------------------------- conflits
export async function resolveConflict(conflictId, keep) {
    const conflict = await db.conflicts.get(conflictId);
    if (!conflict || conflict.resolved)
        return;
    const table = (() => {
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
    if (!table)
        return;
    const record = (await table.get(conflict.entityId));
    if (record) {
        const rev = record.rev ?? 0;
        if (keep === 'remote') {
            const patched = { ...record };
            patched[conflict.field] = conflict.remoteValue;
            patched.rev = rev;
            patched.baseRev = rev;
            patched.syncStatus = 'synced';
            await table.put(patched);
        }
        else {
            const patched = { ...record, syncStatus: 'pending' };
            const base = { ...record };
            base[conflict.field] = conflict.remoteValue;
            await table.put(patched);
            await enqueueUpsert(conflict.entity, conflict.entityId, patched, rev, base);
        }
    }
    await db.conflicts.put({ ...conflict, resolved: true });
}
export async function openConflicts() {
    return db.conflicts.filter((conflict) => !conflict.resolved).count();
}
