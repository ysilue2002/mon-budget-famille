/**
 * Bilans de l'activité — logique PURE, testable sans base ni réseau.
 *
 * Deux notions volontairement séparées :
 *   - le RÉSULTAT (bénéfice estimé) : ventes − achats − autres dépenses, que
 *     les factures soient encaissées ou non (comptabilité d'engagement) ;
 *   - l'ARGENT DISPONIBLE : les soldes réels des comptes (caisse, banque,
 *     mobile money), qui ne bougent qu'aux règlements effectifs.
 *
 * Une avance reçue n'est pas une vente : elle est comptée à part. Un transfert
 * entre moyens de paiement n'est ni une recette ni une dépense.
 */
import { advanceDirection } from './advances';
import { computeAccountBalance } from './selectors';
import type { Advance, FinancialAccount, Product, TradeDocument, Transaction } from './types';

export type PeriodKind = 'month' | 'quarter' | 'year';

export interface PeriodRange {
  from: string;
  to: string;
  year: number;
}

export interface MonthlyPoint {
  /** Mois au format YYYY-MM. */
  month: string;
  sales: number;
  expenses: number;
  result: number;
}

export interface PeriodReport {
  from: string;
  to: string;
  /** Ventes facturées de la période (engagées, réglées ou non). */
  sales: number;
  /** Achats de marchandises de la période (documents d'achat). */
  purchases: number;
  /** Dépenses hors achats de marchandises (loyer, transport, salaires…). */
  otherExpenses: number;
  /** Total des charges de la période (achats + autres dépenses). */
  expensesTotal: number;
  /** Bénéfice estimé de la période. */
  result: number;
  /** Marge en pourcentage du chiffre d'affaires (0 sans vente). */
  margin: number;
  /** Encaissements effectivement reçus (part réglée des ventes). */
  cashIn: number;
  /** Décaissements effectivement payés (part réglée des charges). */
  cashOut: number;
  /** Variation de trésorerie de la période. */
  netCashFlow: number;
  /** Crédits clients restant à encaisser à la fin de la période. */
  customerCredit: number;
  /** Crédits fournisseurs restant à payer à la fin de la période. */
  supplierCredit: number;
  /** Avances reçues pendant la période (hors avances remboursées). */
  advancesReceived: number;
  /** Avances encore en cours à la fin de la période. */
  advancesOpen: number;
  /** Valeur du stock à aujourd'hui (prix d'achat). */
  stockValue: number;
  /** Argent réellement disponible sur tous les comptes (aujourd'hui). */
  cashAvailable: number;
  salesCount: number;
  purchasesCount: number;
  /** Ventes et charges mois par mois de l'année de la période (graphique). */
  monthly: MonthlyPoint[];
}

export interface PeriodReportInput {
  businessId: string;
  transactions: Transaction[];
  sales: TradeDocument[];
  purchases: TradeDocument[];
  products: Product[];
  advances: Advance[];
  accounts: FinancialAccount[];
  /** Bornes inclusives (ISO YYYY-MM-DD). */
  from: string;
  to: string;
  /** Année du graphique mensuel (par défaut celle de `from`). */
  year?: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Borne de période (inclusive) pour un mois `YYYY-MM`, un trimestre `YYYY-Qn` ou une année `YYYY`. */
export function periodRange(kind: PeriodKind, anchor: string): PeriodRange {
  if (kind === 'month') {
    const [year, month] = anchor.split('-').map(Number);
    return {
      from: `${year}-${pad(month)}-01`,
      to: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`,
      year,
    };
  }
  if (kind === 'quarter') {
    const year = Number(anchor.slice(0, 4));
    const quarter = Math.min(4, Math.max(1, Number(anchor.slice(6)) || 1));
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      from: `${year}-${pad(startMonth)}-01`,
      to: `${year}-${pad(endMonth)}-${pad(daysInMonth(year, endMonth))}`,
      year,
    };
  }
  const year = Number(anchor);
  return { from: `${year}-01-01`, to: `${year}-12-31`, year };
}

/** Ancre de la période contenant `dateISO`. */
export function anchorFor(kind: PeriodKind, dateISO: string): string {
  const year = Number(dateISO.slice(0, 4));
  if (kind === 'month') return `${year}-${dateISO.slice(5, 7)}`;
  if (kind === 'quarter') return `${year}-Q${Math.floor((Number(dateISO.slice(5, 7)) - 1) / 3) + 1}`;
  return String(year);
}

/** Décale une ancre de `delta` périodes (négatif = passé). */
export function shiftAnchor(kind: PeriodKind, anchor: string, delta: number): string {
  if (kind === 'month') {
    const year = Number(anchor.slice(0, 4));
    const month = Number(anchor.slice(5, 7));
    const index = year * 12 + (month - 1) + delta;
    return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
  }
  if (kind === 'quarter') {
    const year = Number(anchor.slice(0, 4));
    const quarter = Number(anchor.slice(6));
    const index = year * 4 + (quarter - 1) + delta;
    return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
  }
  return String(Number(anchor) + delta);
}

/** Ancre de la période précédente de même durée. */
export function previousAnchor(kind: PeriodKind, anchor: string): string {
  return shiftAnchor(kind, anchor, -1);
}

/** Part effectivement réglée d'une opération (factures à crédit : part encaissée). */
export function paidAmount(transaction: Pick<Transaction, 'amountInPrimary' | 'settled' | 'settledAmount'>): number {
  if (transaction.settled !== false) return Math.max(0, transaction.amountInPrimary);
  return Math.min(Math.max(0, transaction.settledAmount ?? 0), Math.max(0, transaction.amountInPrimary));
}

/** Reste dû d'une opération non soldée. */
export function unpaidAmount(transaction: Pick<Transaction, 'amountInPrimary' | 'settled' | 'settledAmount'>): number {
  if (transaction.settled !== false) return 0;
  return Math.max(0, transaction.amountInPrimary - paidAmount(transaction));
}

export function buildPeriodReport(input: PeriodReportInput): PeriodReport {
  const { businessId, transactions, sales, purchases, products, advances, accounts, from, to } = input;
  const year = input.year ?? Number(from.slice(0, 4));

  const tagged = transactions.filter((tx) => tx.businessId === businessId && tx.type !== 'transfer');
  const inPeriod = tagged.filter((tx) => tx.date >= from && tx.date <= to);
  const upTo = tagged.filter((tx) => tx.date <= to);

  const sum = (rows: Transaction[], predicate: (tx: Transaction) => boolean) =>
    rows.reduce((total, tx) => total + (predicate(tx) ? tx.amountInPrimary : 0), 0);
  const sumPaid = (rows: Transaction[], predicate: (tx: Transaction) => boolean) =>
    rows.reduce((total, tx) => total + (predicate(tx) ? paidAmount(tx) : 0), 0);

  const salesDocs = sales.filter((doc) => doc.businessId === businessId && doc.date >= from && doc.date <= to);
  const purchaseDocs = purchases.filter((doc) => doc.businessId === businessId && doc.date >= from && doc.date <= to);

  const salesTotal = sum(inPeriod, (tx) => tx.type === 'income');
  const expensesTotal = sum(inPeriod, (tx) => tx.type === 'expense');
  const purchasesTotal = purchaseDocs.reduce((total, doc) => total + Math.max(0, doc.total), 0);
  // Les achats de marchandises créent déjà une opération de dépense : on les
  // isole du reste pour ne jamais les compter deux fois.
  const otherExpenses = Math.max(0, expensesTotal - purchasesTotal);

  const result = salesTotal - expensesTotal;
  const cashIn = sumPaid(inPeriod, (tx) => tx.type === 'income');
  const cashOut = sumPaid(inPeriod, (tx) => tx.type === 'expense');

  const customerCredit = upTo.reduce(
    (total, tx) => total + (tx.type === 'income' ? unpaidAmount(tx) : 0),
    0,
  );
  const supplierCredit = upTo.reduce(
    (total, tx) => total + (tx.type === 'expense' ? unpaidAmount(tx) : 0),
    0,
  );

  // Seuls les acomptes reçus des clients sont de l'argent entré : un acompte
  // versé à un fournisseur est une sortie et ne doit pas gonfler les recettes.
  const advancesReceived = advances
    .filter(
      (advance) =>
        advanceDirection(advance) === 'received' &&
        advance.status !== 'refunded' &&
        advance.receivedOn >= from &&
        advance.receivedOn <= to,
    )
    .reduce((total, advance) => total + Math.max(0, advance.amount), 0);
  const advancesOpen = advances
    .filter(
      (advance) =>
        advanceDirection(advance) === 'received' && advance.status === 'open' && advance.receivedOn <= to,
    )
    .reduce((total, advance) => total + Math.max(0, advance.amount), 0);

  const stockValue = products
    .filter((product) => !product.archived)
    .reduce((total, product) => total + Math.round(Math.max(0, product.stockQty) * Math.max(0, product.buyPrice)), 0);

  const cashAvailable = accounts
    .filter((account) => !account.archived)
    .reduce((total, account) => {
      const related = transactions.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id);
      return total + computeAccountBalance(account, related);
    }, 0);

  const monthly: MonthlyPoint[] = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${pad(index + 1)}`;
    const rows = tagged.filter((tx) => tx.date.slice(0, 7) === month);
    const monthSales = sum(rows, (tx) => tx.type === 'income');
    const monthExpenses = sum(rows, (tx) => tx.type === 'expense');
    return { month, sales: monthSales, expenses: monthExpenses, result: monthSales - monthExpenses };
  });

  return {
    from,
    to,
    sales: salesTotal,
    purchases: purchasesTotal,
    otherExpenses,
    expensesTotal,
    result,
    margin: salesTotal > 0 ? (result / salesTotal) * 100 : 0,
    cashIn,
    cashOut,
    netCashFlow: cashIn - cashOut,
    customerCredit,
    supplierCredit,
    advancesReceived,
    advancesOpen,
    stockValue,
    cashAvailable,
    salesCount: salesDocs.length,
    purchasesCount: purchaseDocs.length,
    monthly,
  };
}

/** Écart absolu entre deux périodes pour une valeur donnée. */
export function changeBetween(current: number, previous: number): number {
  return current - previous;
}

/** Variation en pourcentage (0 si la période précédente est nulle). */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}
