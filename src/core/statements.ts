/**
 * États financiers (bilan de période) — logique PURE, testable sans IndexedDB.
 *
 * Tous les montants agrégés sont exprimés dans la devise de référence du foyer
 * (`amountInPrimary`), sauf les mouvements de compte qui restent dans leur
 * devise d'origine et sont convertis uniquement pour les totaux de patrimoine.
 */
import { computeAccountBalance } from './selectors';
import { convertMinor } from './money';
import type {
  Category,
  CurrencyCode,
  Debt,
  FinancialAccount,
  RateSnapshot,
  SavingsGoal,
  Transaction,
  WealthSnapshot,
} from './types';

export interface StatementCategoryLine {
  id: string;
  label: string;
  total: number;
  count: number;
  /** Part du total de la section, en pourcentage (0 si total nul). */
  share: number;
}

export interface StatementAccountLine {
  id: string;
  name: string;
  currency: CurrencyCode;
  /** Solde d'ouverture dans la devise du compte. */
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
  /** Conversion dans la devise du foyer. */
  openingPrimary: number;
  closingPrimary: number;
}

/** Répartition des revenus et dépenses par membre du foyer. */
export interface StatementMemberLine {
  id: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  /** Nombre d'opérations (hors transferts internes). */
  count: number;
  share: number;
}

/** Ligne de comparaison par catégorie entre la période et la précédente. */
export interface StatementComparisonLine {
  id: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
}

/** Totaux et lignes de la période de comparaison (période précédente). */
export interface StatementComparison {
  from: string;
  to: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
  incomeLines: StatementComparisonLine[];
  expenseLines: StatementComparisonLine[];
}

export interface Statement {
  from: string;
  to: string;
  primary: CurrencyCode;
  income: number;
  expense: number;
  net: number;
  /** Taux d'épargne : résultat net / revenus, en pourcentage. */
  savingsRate: number;
  incomeLines: StatementCategoryLine[];
  expenseLines: StatementCategoryLine[];
  accounts: StatementAccountLine[];
  members: StatementMemberLine[];
  /** Mouvements internes (hors résultat). */
  transferCount: number;
  transactionCount: number;
  /** Patrimoine à la date de fin. */
  accountsTotal: number;
  savings: number;
  receivables: number;
  payables: number;
  netWorth: number;
  /** Date du relevé de patrimoine utilisé (`to` si aucune historique). */
  wealthDate: string;
  /** true si les montants viennent d'un relevé antérieur (patrimoine d'époque). */
  wealthHistorical: boolean;
  /** true si le relevé utilisé est une estimation faute d'historique. */
  wealthEstimated: boolean;
  /** Renseigné seulement si `compare` est demandé. */
  comparison?: StatementComparison;
}

export interface StatementInput {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  categories: Category[];
  goals: Pick<SavingsGoal, 'currentAmount' | 'currency'>[];
  debts: Pick<Debt, 'kind' | 'remainingAmount' | 'currency'>[];
  /** Relevés de patrimoine (montants déjà consolidés dans `primary`). */
  wealth?: Pick<WealthSnapshot, 'date' | 'savings' | 'receivables' | 'payables' | 'estimated'>[];
  from: string;
  to: string;
  primary: CurrencyCode;
  snapshot: RateSnapshot;
  lang: 'fr' | 'en';
  /** Ajoute les totaux de la période précédente. */
  compare?: boolean;
}

function toPrimary(amount: number, from: CurrencyCode, primary: CurrencyCode, snapshot: RateSnapshot): number {
  if (from === primary) return amount;
  return convertMinor(amount, from, primary, snapshot) ?? 0;
}

function categoryLabel(categories: Category[], id: string | undefined, lang: 'fr' | 'en'): string {
  const category = categories.find((c) => c.id === id);
  if (!category) return lang === 'fr' ? 'Sans catégorie' : 'Uncategorised';
  return lang === 'fr' ? category.nameFr : category.nameEn;
}

/** Regroupe les opérations d'une direction par catégorie, du plus lourd au plus léger. */
function groupByCategory(
  transactions: Transaction[],
  type: 'income' | 'expense',
  categories: Category[],
  lang: 'fr' | 'en',
): StatementCategoryLine[] {
  const rows = new Map<string, { total: number; count: number }>();
  for (const tx of transactions) {
    if (tx.type !== type) continue;
    const key = tx.categoryId ?? 'none';
    const row = rows.get(key) ?? { total: 0, count: 0 };
    row.total += tx.amountInPrimary;
    row.count += 1;
    rows.set(key, row);
  }
  const total = [...rows.values()].reduce((acc, row) => acc + row.total, 0);
  return [...rows.entries()]
    .map(([id, row]) => ({
      id,
      label: categoryLabel(categories, id === 'none' ? undefined : id, lang),
      total: row.total,
      count: row.count,
      share: total > 0 ? (row.total / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Regroupe les opérations par membre du foyer. Le champ libre `member` prime sur
 * l'auteur de la saisie (`authorName`) ; les opérations sans attribution sont
 * regroupées sous une ligne dédiée. Les transferts internes sont exclus.
 */
export function groupByMember(transactions: Transaction[], lang: 'fr' | 'en'): StatementMemberLine[] {
  const unassigned = lang === 'fr' ? 'Sans membre' : 'Unassigned';
  const rows = new Map<string, { label: string; income: number; expense: number; count: number }>();
  for (const tx of transactions) {
    if (tx.type === 'transfer') continue;
    const explicit = tx.member?.trim();
    const author = tx.authorName?.trim();
    const key = explicit || (author && author !== '—' ? author : '');
    const row = rows.get(key) ?? { label: key || unassigned, income: 0, expense: 0, count: 0 };
    if (tx.type === 'income') row.income += tx.amountInPrimary;
    else row.expense += tx.amountInPrimary;
    row.count += 1;
    rows.set(key, row);
  }
  const activity = (row: { income: number; expense: number }) => row.income + row.expense;
  const total = [...rows.values()].reduce((acc, row) => acc + activity(row), 0);
  return [...rows.entries()]
    .map(([id, row]) => ({
      id: id || 'unassigned',
      label: row.label,
      income: row.income,
      expense: row.expense,
      net: row.income - row.expense,
      count: row.count,
      share: total > 0 ? (activity(row) / total) * 100 : 0,
    }))
    .sort((a, b) => b.income + b.expense - (a.income + a.expense));
}

// ------------------------------------------------------------------- périodes

function pad(value: number): string {
  return `${value}`.padStart(2, '0');
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Période précédente comparable : mois précédent pour un mois complet, année
 * précédente pour une année complète, sinon une fenêtre de même longueur juste
 * avant `from`.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm && fd === 1 && td === daysInMonth(ty, tm)) {
    const month = fm === 1 ? 12 : fm - 1;
    const year = fm === 1 ? ty - 1 : ty;
    return { from: isoDate(year, month, 1), to: isoDate(year, month, daysInMonth(year, month)) };
  }
  if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) {
    return { from: `${fy - 1}-01-01`, to: `${fy - 1}-12-31` };
  }
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - (span - 1));
  return {
    from: isoDate(previousStart.getFullYear(), previousStart.getMonth() + 1, previousStart.getDate()),
    to: isoDate(previousEnd.getFullYear(), previousEnd.getMonth() + 1, previousEnd.getDate()),
  };
}

function totalsOf(transactions: Transaction[], from: string, to: string) {
  const rows = transactions.filter((tx) => tx.date >= from && tx.date <= to);
  const income = rows.filter((tx) => tx.type === 'income').reduce((acc, tx) => acc + tx.amountInPrimary, 0);
  const expense = rows.filter((tx) => tx.type === 'expense').reduce((acc, tx) => acc + tx.amountInPrimary, 0);
  const net = income - expense;
  return { from, to, income, expense, net, savingsRate: income > 0 ? (net / income) * 100 : 0 };
}

/** Fusionne les catégories de deux périodes, triées par écart décroissant. */
function mergeComparison(
  current: StatementCategoryLine[],
  previous: StatementCategoryLine[],
): StatementComparisonLine[] {
  const rows = new Map<string, StatementComparisonLine>();
  for (const line of current) {
    rows.set(line.id, { id: line.id, label: line.label, current: line.total, previous: 0, delta: 0 });
  }
  for (const line of previous) {
    const row = rows.get(line.id) ?? { id: line.id, label: line.label, current: 0, previous: 0, delta: 0 };
    row.previous = line.total;
    rows.set(line.id, row);
  }
  for (const row of rows.values()) row.delta = row.current - row.previous;
  return [...rows.values()].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.current - a.current,
  );
}

/** Dernier relevé antérieur ou égal à `to`. */
type WealthPointInput = Pick<WealthSnapshot, 'date' | 'savings' | 'receivables' | 'payables' | 'estimated'>;

function pickWealth(wealth: StatementInput['wealth'], to: string): WealthPointInput | null {
  if (!wealth || wealth.length === 0) return null;
  let best: WealthPointInput | null = null;
  for (const point of wealth) {
    if (point.date > to) continue;
    if (!best || point.date > best.date) best = point;
  }
  return best;
}

/**
 * Construit le bilan d'une période. `from` et `to` sont inclusifs (ISO).
 */
export function buildStatement(input: StatementInput): Statement {
  const { accounts, transactions, categories, goals, debts, from, to, primary, snapshot, lang } = input;

  const inPeriod = transactions.filter((tx) => tx.date >= from && tx.date <= to);
  const { income, expense, net, savingsRate } = totalsOf(transactions, from, to);

  const accountLines: StatementAccountLine[] = accounts.map((account) => {
    const before = transactions.filter(
      (tx) => tx.date < from && (tx.accountId === account.id || tx.toAccountId === account.id),
    );
    const until = transactions.filter(
      (tx) => tx.date <= to && (tx.accountId === account.id || tx.toAccountId === account.id),
    );

    let inflow = 0;
    let outflow = 0;
    for (const tx of inPeriod) {
      if (tx.accountId === account.id) {
        if (tx.type === 'income') inflow += tx.amountOriginal;
        else outflow += tx.amountOriginal;
      }
      if (tx.type === 'transfer' && tx.toAccountId === account.id) {
        inflow += tx.toAmount ?? tx.amountOriginal;
      }
    }

    const opening = computeAccountBalance(account, before);
    const closing = computeAccountBalance(account, until);

    return {
      id: account.id,
      name: account.name,
      currency: account.currency,
      opening,
      inflow,
      outflow,
      closing,
      openingPrimary: toPrimary(opening, account.currency, primary, snapshot),
      closingPrimary: toPrimary(closing, account.currency, primary, snapshot),
    };
  });

  const accountsTotal = accountLines.reduce((acc, line) => acc + line.closingPrimary, 0);

  // Patrimoine d'époque si un relevé existe, sinon montants courants.
  const wealth = pickWealth(input.wealth, to);
  let savings: number;
  let receivables = 0;
  let payables = 0;
  if (wealth) {
    savings = wealth.savings;
    receivables = wealth.receivables;
    payables = wealth.payables;
  } else {
    savings = goals.reduce((acc, goal) => acc + toPrimary(goal.currentAmount, goal.currency, primary, snapshot), 0);
    for (const debt of debts) {
      const amount = toPrimary(debt.remainingAmount, debt.currency, primary, snapshot);
      if (debt.kind === 'receivable') receivables += amount;
      else payables += amount;
    }
  }

  const incomeLines = groupByCategory(inPeriod, 'income', categories, lang);
  const expenseLines = groupByCategory(inPeriod, 'expense', categories, lang);

  const previous = input.compare ? previousPeriod(from, to) : null;
  const previousRows = previous
    ? transactions.filter((tx) => tx.date >= previous.from && tx.date <= previous.to)
    : [];
  const comparison: StatementComparison | undefined = previous
    ? {
        ...totalsOf(transactions, previous.from, previous.to),
        incomeLines: mergeComparison(incomeLines, groupByCategory(previousRows, 'income', categories, lang)),
        expenseLines: mergeComparison(expenseLines, groupByCategory(previousRows, 'expense', categories, lang)),
      }
    : undefined;

  return {
    from,
    to,
    primary,
    income,
    expense,
    net,
    savingsRate,
    incomeLines,
    expenseLines,
    accounts: accountLines,
    members: groupByMember(inPeriod, lang),
    transferCount: inPeriod.filter((tx) => tx.type === 'transfer').length,
    transactionCount: inPeriod.length,
    accountsTotal,
    savings,
    receivables,
    payables,
    netWorth: accountsTotal + savings + receivables - payables,
    wealthDate: wealth?.date ?? to,
    wealthHistorical: Boolean(wealth),
    wealthEstimated: Boolean(wealth?.estimated),
    comparison,
  };
}
