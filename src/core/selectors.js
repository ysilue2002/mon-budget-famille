import { convertMinor, percentOf } from './money';
export function sumByType(transactions, type) {
    return transactions
        .filter((tx) => tx.type === type)
        .reduce((acc, tx) => acc + tx.amountInPrimary, 0);
}
/** Solde d'un compte : solde initial + revenus + transferts reçus − dépenses − transferts envoyés. */
export function computeAccountBalance(account, transactions) {
    let total = account.initialBalance;
    for (const tx of transactions) {
        if (tx.accountId === account.id) {
            switch (tx.type) {
                case 'income':
                    total += tx.amountOriginal;
                    break;
                case 'expense':
                    total -= tx.amountOriginal;
                    break;
                case 'transfer':
                    total -= tx.amountOriginal;
                    break;
            }
        }
        if (tx.type === 'transfer' && tx.toAccountId === account.id) {
            total += tx.toAmount ?? tx.amountOriginal;
        }
    }
    return total;
}
export function monthTotalsOf(transactions, transferType) {
    if (transferType !== 'transfer')
        return { income: 0, expense: 0, remaining: 0 };
    const income = sumByType(transactions, 'income');
    const expense = sumByType(transactions, 'expense');
    return { income, expense, remaining: income - expense };
}
/**
 * Résumé du tableau de bord en devise du foyer.
 * - balance : somme des soldes convertis (hors compte archivé)
 * - netDebt : créances − dettes (positif = on est créancier net)
 */
export function buildDashboardSummary(accounts, transactions, goals, debts, primary, snapshot) {
    const income = sumByType(transactions, 'income');
    const expense = sumByType(transactions, 'expense');
    let balance = 0;
    for (const account of accounts) {
        if (account.archived)
            continue;
        const txs = transactions.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id);
        const inAccountCurrency = computeAccountBalance(account, txs);
        const converted = account.currency === primary
            ? inAccountCurrency
            : (convertMinor(inAccountCurrency, account.currency, primary, snapshot) ?? 0);
        balance += converted;
    }
    let savings = 0;
    for (const goal of goals) {
        savings += goal.currency === primary ? goal.currentAmount : (convertMinor(goal.currentAmount, goal.currency, primary, snapshot) ?? 0);
    }
    let netDebt = 0;
    for (const debt of debts) {
        const remaining = debt.kind === 'payable' ? -debt.remainingAmount : debt.remainingAmount;
        netDebt += debt.currency === primary ? remaining : (convertMinor(remaining, debt.currency, primary, snapshot) ?? 0);
    }
    return { balance, income, expense, remaining: income - expense, savings, netDebt };
}
export function budgetStatus(budget, spent) {
    const limit = budget.amountLimit;
    const percent = percentOf(spent, limit);
    return {
        spent,
        limit,
        percent,
        remaining: Math.max(0, limit - spent),
        over: spent > limit,
        alert: budget.alertThreshold > 0 && percent >= budget.alertThreshold,
    };
}
/** Dépense réelle d'une catégorie sur un mois (uniquement les dépenses). */
export function spentByCategory(transactions, categoryId) {
    return transactions
        .filter((tx) => tx.type === 'expense' && 'categoryId' in tx && tx.categoryId === categoryId)
        .reduce((acc, tx) => acc + tx.amountInPrimary, 0);
}
/** Séries pour les graphiques : total par catégorie. */
export function totalsByCategory(transactions, getCategoryKey) {
    const map = new Map();
    for (const tx of transactions) {
        if (tx.type !== 'income' && tx.type !== 'expense')
            continue;
        const key = getCategoryKey(tx);
        if (!key)
            continue;
        map.set(key, (map.get(key) ?? 0) + tx.amountInPrimary);
    }
    return map;
}
// ------------------------------------------------------------------ épargne & dettes
export function savingsPercent(goal) {
    return percentOf(goal.currentAmount, Math.max(1, goal.targetAmount));
}
export function debtRemaining(debt) {
    const paid = debt.payments.reduce((acc, p) => acc + p.amount, 0);
    return Math.max(0, debt.initialAmount - paid);
}
