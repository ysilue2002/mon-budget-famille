import { convertMinor, percentOf } from './money';
import type { Budget, Debt, FinancialAccount, SavingsGoal, Transaction, CurrencyCode, RateSnapshot } from './types';

/**
 * Agrégations PURES du domaine — testables sans IndexedDB.
 * Les quantités sont exprimées en sous-unités.
 */

export type WithAmountPrimary = Pick<Transaction, 'type' | 'amountInPrimary'>;

export function sumByType(transactions: WithAmountPrimary[], type: Transaction['type']): number {
  return transactions
    .filter((tx) => tx.type === type)
    .reduce((acc, tx) => acc + tx.amountInPrimary, 0);
}

/** Solde d'un compte : solde initial + revenus + transferts reçus − dépenses − transferts envoyés. */
export function computeAccountBalance(
  account: Pick<FinancialAccount, 'id' | 'initialBalance'>,
  transactions: (Pick<Transaction, 'accountId' | 'toAccountId' | 'type' | 'amountOriginal'> & {
    toAmount?: number;
    /** Facture d'activité non encaissée (créance) : pas encore de l'argent. */
    settled?: boolean;
    /** Part déjà encaissée d'une facture non soldée. */
    settledAmount?: number;
  })[],
): number {
  let total = account.initialBalance;
  for (const tx of transactions) {
    // Une facture non soldée entre au résultat pour son montant total, mais
    // seul ce qui a déjà été encaissé entre dans le solde du compte. Les
    // opérations du foyer n'ont pas ce champ et restent comptées normalement.
    if (tx.settled === false) {
      const received = Math.max(0, Math.round(tx.settledAmount ?? 0));
      if (tx.accountId === account.id) {
        if (tx.type === 'income') total += received;
        else if (tx.type === 'expense') total -= received;
      }
      continue;
    }
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

export interface MonthTotals {
  income: number;
  expense: number;
  remaining: number;
}

export function monthTotalsOf(
  transactions: WithAmountPrimary[],
  transferType: Transaction['type'],
): MonthTotals {
  if (transferType !== 'transfer') return { income: 0, expense: 0, remaining: 0 };
  const income = sumByType(transactions, 'income');
  const expense = sumByType(transactions, 'expense');
  return { income, expense, remaining: income - expense };
}

export interface DashboardSummary extends MonthTotals {
  balance: number;
  savings: number;
  netDebt: number;
}

/**
 * Résumé du tableau de bord en devise du foyer.
 * - balance : somme des soldes convertis (hors compte archivé)
 * - netDebt : créances − dettes (positif = on est créancier net)
 */
export function buildDashboardSummary(
  accounts: Pick<FinancialAccount, 'id' | 'initialBalance' | 'currency' | 'archived'>[],
  transactions: Transaction[],
  goals: Pick<SavingsGoal, 'currentAmount' | 'currency'>[],
  debts: Pick<Debt, 'kind' | 'remainingAmount' | 'currency'>[],
  primary: CurrencyCode,
  snapshot: RateSnapshot,
): DashboardSummary {
  const income = sumByType(transactions, 'income');
  const expense = sumByType(transactions, 'expense');

  let balance = 0;
  for (const account of accounts) {
    if (account.archived) continue;
    const txs = transactions.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id);
    const inAccountCurrency = computeAccountBalance(account, txs);
    const converted =
      account.currency === primary
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

// ------------------------------------------------------------------ budgets

export interface BudgetStatus {
  spent: number;
  limit: number;
  percent: number;
  remaining: number;
  over: boolean;
  alert: boolean;
}

export function budgetStatus(budget: Pick<Budget, 'amountLimit' | 'alertThreshold'>, spent: number): BudgetStatus {
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
export function spentByCategory(
  transactions: WithAmountPrimary[],
  categoryId: string,
): number {
  return transactions
    .filter((tx) => tx.type === 'expense' && 'categoryId' in tx && (tx as { categoryId?: string }).categoryId === categoryId)
    .reduce((acc, tx) => acc + tx.amountInPrimary, 0);
}

/** Séries pour les graphiques : total par catégorie. */
export function totalsByCategory(
  transactions: (WithAmountPrimary & { categoryId?: string })[],
  getCategoryKey: (tx: WithAmountPrimary & { categoryId?: string }) => string | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const key = getCategoryKey(tx);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + tx.amountInPrimary);
  }
  return map;
}

// ------------------------------------------------------------------ épargne & dettes

export function savingsPercent(goal: Pick<SavingsGoal, 'currentAmount' | 'targetAmount'>): number {
  return percentOf(goal.currentAmount, Math.max(1, goal.targetAmount));
}

export function debtRemaining(debt: Pick<Debt, 'initialAmount' | 'payments'>): number {
  const paid = debt.payments.reduce((acc, p) => acc + p.amount, 0);
  return Math.max(0, debt.initialAmount - paid);
}
