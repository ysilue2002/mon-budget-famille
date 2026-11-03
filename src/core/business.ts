/**
 * États financiers d'une activité professionnelle — logique PURE.
 *
 * Les opérations rattachées à une activité (`businessId`) forment son journal.
 * Chaque opération est soit réglée, soit en attente (`settled === false`) :
 *   - compte de résultat (engagement) : recettes − charges de la période ;
 *   - trésorerie : encaissements − décaissements effectivement réglés ;
 *   - bilan simplifié : actif (trésorerie + créances clients) = passif
 *     (dettes fournisseurs + situation nette).
 *
 * Les montants sont ceux déjà consolidés dans la devise du foyer
 * (`amountInPrimary`), comme pour les états du foyer.
 */
import type { Category, Transaction } from './types';

export type BusinessLanguage = 'fr' | 'en';

export interface BusinessLine {
  id: string;
  label: string;
  total: number;
  count: number;
}

export interface BusinessStatement {
  businessId: string;
  from: string;
  to: string;
  /** Recettes de la période (facturées, réglées ou non). */
  revenue: number;
  /** Charges de la période (facturées, réglées ou non). */
  expense: number;
  result: number;
  /** Résultat / recettes, en pourcentage (0 si aucune recette). */
  margin: number;
  revenueByCategory: BusinessLine[];
  expenseByCategory: BusinessLine[];
  /** Trésorerie à l'ouverture de la période (flux réglés avant `from`). */
  openingCash: number;
  /** Encaissements réglés de la période. */
  cashIn: number;
  /** Décaissements réglés de la période. */
  cashOut: number;
  /** Variation de trésorerie de la période (encaissements − décaissements). */
  cashChange: number;
  /** Trésorerie à la clôture (jusqu'à `to` inclus). */
  closingCash: number;
  /** Recettes facturées non encaissées (à la clôture). */
  receivables: number;
  /** Charges facturées non payées (à la clôture). */
  payables: number;
  /** Résultat cumulé depuis l'origine (jusqu'à `to`). */
  equity: number;
  totalAssets: number;
  totalLiabilities: number;
}

export interface BusinessStatementInput {
  businessId: string;
  transactions: Transaction[];
  categories: Category[];
  /** Bornes inclusives (ISO). */
  from: string;
  to: string;
  lang: BusinessLanguage;
}

function isSettled(tx: Transaction): boolean {
  return tx.settled !== false;
}

function categoryLabel(categories: Category[], id: string | undefined, lang: BusinessLanguage): string {
  const category = categories.find((c) => c.id === id);
  if (!category) return lang === 'fr' ? 'Sans catégorie' : 'Uncategorised';
  return lang === 'fr' ? category.nameFr : category.nameEn;
}

function groupByCategory(
  rows: Transaction[],
  type: 'income' | 'expense',
  categories: Category[],
  lang: BusinessLanguage,
): BusinessLine[] {
  const grouped = new Map<string, { total: number; count: number }>();
  for (const tx of rows) {
    if (tx.type !== type) continue;
    const key = tx.categoryId ?? 'none';
    const line = grouped.get(key) ?? { total: 0, count: 0 };
    line.total += tx.amountInPrimary;
    line.count += 1;
    grouped.set(key, line);
  }
  return [...grouped.entries()]
    .map(([id, line]) => ({
      id,
      label: categoryLabel(categories, id === 'none' ? undefined : id, lang),
      total: line.total,
      count: line.count,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Opérations rattachées à une activité (les transferts internes en sont exclus). */
export function businessTransactions(transactions: Transaction[], businessId: string): Transaction[] {
  return transactions.filter((tx) => tx.businessId === businessId && tx.type !== 'transfer');
}

/**
 * Compte de résultat, bilan simplifié et tableau de trésorerie de l'activité
 * sur la période `from` → `to` (bornes incluses).
 */
export function buildBusinessStatement(input: BusinessStatementInput): BusinessStatement {
  const { businessId, transactions, categories, from, to, lang } = input;
  const tagged = businessTransactions(transactions, businessId);
  const inPeriod = tagged.filter((tx) => tx.date >= from && tx.date <= to);
  const upTo = tagged.filter((tx) => tx.date <= to);
  const before = tagged.filter((tx) => tx.date < from);

  const sum = (rows: Transaction[], predicate: (tx: Transaction) => boolean) =>
    rows.reduce((acc, tx) => acc + (predicate(tx) ? tx.amountInPrimary : 0), 0);

  const revenue = sum(inPeriod, (tx) => tx.type === 'income');
  const expense = sum(inPeriod, (tx) => tx.type === 'expense');
  const result = revenue - expense;
  const margin = revenue > 0 ? (result / revenue) * 100 : 0;

  const cashIn = sum(inPeriod, (tx) => tx.type === 'income' && isSettled(tx));
  const cashOut = sum(inPeriod, (tx) => tx.type === 'expense' && isSettled(tx));
  const cashChange = cashIn - cashOut;
  const signedCash = (rows: Transaction[]) =>
    rows.reduce((acc, tx) => {
      if (!isSettled(tx)) return acc;
      return acc + (tx.type === 'income' ? tx.amountInPrimary : -tx.amountInPrimary);
    }, 0);
  const openingCash = signedCash(before);
  const closingCash = signedCash(upTo);

  const receivables = sum(upTo, (tx) => tx.type === 'income' && !isSettled(tx));
  const payables = sum(upTo, (tx) => tx.type === 'expense' && !isSettled(tx));
  const equity = upTo.reduce(
    (acc, tx) => acc + (tx.type === 'income' ? tx.amountInPrimary : -tx.amountInPrimary),
    0,
  );

  return {
    businessId,
    from,
    to,
    revenue,
    expense,
    result,
    margin,
    revenueByCategory: groupByCategory(inPeriod, 'income', categories, lang),
    expenseByCategory: groupByCategory(inPeriod, 'expense', categories, lang),
    openingCash,
    cashIn,
    cashOut,
    cashChange,
    closingCash,
    receivables,
    payables,
    equity,
    totalAssets: closingCash + receivables,
    totalLiabilities: payables + equity,
  };
}
