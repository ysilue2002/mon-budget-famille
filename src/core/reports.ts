/**
 * Bilans de l'activité — logique PURE, testable sans base ni réseau.
 *
 * Trois notions volontairement séparées :
 *   - le RÉSULTAT (bénéfice estimé) : ventes hors taxe − coût des marchandises
 *     vendues − autres dépenses, que les factures soient encaissées ou non
 *     (comptabilité d'engagement). Le coût des marchandises vendues vaut les
 *     achats hors taxe moins les marchandises encore en stock à la fin de la
 *     période : un achat qui reste en magasin n'est pas encore une charge ;
 *   - la TVA : collectée sur les ventes, déductible sur les achats, et ce qui
 *     reste à reverser ; elle n'est jamais un gain ;
 *   - l'ARGENT DISPONIBLE : les soldes réels des comptes (caisse, banque,
 *     mobile money), qui ne bougent qu'aux règlements effectifs (TTC).
 *
 * Une avance reçue n'est pas une vente : elle est comptée à part. Un transfert
 * entre moyens de paiement n'est ni une recette ni une dépense.
 */
import { advanceDirection } from './advances';
import { computeAccountBalance } from './selectors';
import { stockValueAt } from './stock';
import { taxBreakdown } from './trade';
import type {
  Advance,
  FinancialAccount,
  Product,
  StockMovement,
  TradeDocument,
  Transaction,
} from './types';

export type PeriodKind = 'month' | 'quarter' | 'year';

export interface PeriodRange {
  from: string;
  to: string;
  year: number;
}

export interface MonthlyPoint {
  /** Mois au format YYYY-MM. */
  month: string;
  /** Ventes hors taxe du mois. */
  sales: number;
  /** Charges hors taxe du mois (achats de marchandises et autres dépenses). */
  expenses: number;
  result: number;
}

/**
 * TVA contenue dans une liste de documents (ventes ou achats). Recalculée à
 * partir des lignes et du taux, comme à l'enregistrement : le montant est donc
 * exact, sans arrondi cumulé.
 */
export function documentsTax(documents: Pick<TradeDocument, 'lines' | 'taxRate'>[]): number {
  return documents.reduce((total, doc) => total + taxBreakdown(doc.lines, doc.taxRate).tax, 0);
}

export interface PeriodReport {
  from: string;
  to: string;
  /** Ventes facturées de la période, TVA incluse (engagées, réglées ou non). */
  sales: number;
  /** Achats de marchandises de la période, TVA incluse (documents d'achat). */
  purchases: number;
  /** Ventes hors taxe de la période, ce qui sert au bénéfice. */
  salesNet: number;
  /** Achats de marchandises hors taxe de la période. */
  purchasesNet: number;
  /** Valeur du stock au début de la période, au prix d'achat. */
  stockStart: number;
  /** Valeur du stock à la fin de la période, au prix d'achat. */
  stockEnd: number;
  /** Variation du stock : positive quand des achats restent en magasin. */
  stockChange: number;
  /** Coût des marchandises réellement vendues (achats hors taxe − variation). */
  goodsCost: number;
  /** TVA collectée sur les ventes de la période. */
  salesTax: number;
  /** TVA déductible sur les achats de la période. */
  purchasesTax: number;
  /** TVA à reverser sur la période (négatif = crédit de TVA). */
  taxDue: number;
  /** Dépenses hors achats de marchandises (loyer, transport, salaires…). */
  otherExpenses: number;
  /** Total des charges de la période, TVA incluse (achats + autres dépenses). */
  expensesTotal: number;
  /** Charges retenues dans le résultat, hors taxe (marchandises vendues + autres). */
  netExpenses: number;
  /** Bénéfice estimé de la période, hors taxe. */
  result: number;
  /** Marge en pourcentage du chiffre d'affaires hors taxe (0 sans vente). */
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
  /** Journal daté du stock : il donne la valeur du stock aux deux bornes. */
  stockMovements: StockMovement[];
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

/** Veille d'une date ISO (pour « le stock à la fin de la veille »). */
function previousDay(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
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
  const {
    businessId,
    transactions,
    sales,
    purchases,
    products,
    stockMovements,
    advances,
    accounts,
    from,
    to,
  } = input;
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

  // La TVA n'est pas un gain : le bénéfice se calcule hors taxe, et la TVA
  // collectée moins la TVA déductible reste à reverser.
  const salesTax = documentsTax(salesDocs);
  const purchasesTax = documentsTax(purchaseDocs);
  const salesNet = Math.max(0, salesTotal - salesTax);
  const purchasesNet = Math.max(0, purchasesTotal - purchasesTax);
  const taxDue = salesTax - purchasesTax;

  // Les marchandises encore en stock à la fin de la période ne sont pas encore
  // une charge : on retire des achats ce qui n'a pas été vendu.
  const stockEnd = stockValueAt(products, stockMovements, to);
  const stockStart = stockValueAt(products, stockMovements, previousDay(from));
  const stockChange = stockEnd - stockStart;
  const goodsCost = Math.max(0, purchasesNet - stockChange);
  const netExpenses = goodsCost + otherExpenses;

  const result = salesNet - netExpenses;
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
    const inMonth = (doc: TradeDocument) => doc.businessId === businessId && doc.date.slice(0, 7) === month;
    const monthPurchases = purchases.filter(inMonth).reduce((total, doc) => total + Math.max(0, doc.total), 0);
    const monthSales = sum(rows, (tx) => tx.type === 'income') - documentsTax(sales.filter(inMonth));
    const monthOther =
      sum(rows, (tx) => tx.type === 'expense') - monthPurchases;
    // Même règle que la période : seules les marchandises vendues sont une charge.
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${pad(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7))))}`;
    const monthStockChange =
      stockValueAt(products, stockMovements, monthEnd) -
      stockValueAt(products, stockMovements, previousDay(monthStart));
    const monthPurchasesNet = Math.max(0, monthPurchases - documentsTax(purchases.filter(inMonth)));
    const monthGoods = Math.max(0, monthPurchasesNet - monthStockChange);
    const monthExpenses = monthGoods + monthOther;
    return { month, sales: monthSales, expenses: monthExpenses, result: monthSales - monthExpenses };
  });

  return {
    from,
    to,
    sales: salesTotal,
    purchases: purchasesTotal,
    salesNet,
    purchasesNet,
    stockStart,
    stockEnd,
    stockChange,
    goodsCost,
    salesTax,
    purchasesTax,
    taxDue,
    otherExpenses,
    expensesTotal,
    netExpenses,
    result,
    margin: salesNet > 0 ? (result / salesNet) * 100 : 0,
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

/**
 * Les achats de marchandises créent une opération de dépense dont l'identifiant
 * commence par `purchase-` (voir `repo.createTrade`) : c'est ce qui permet de
 * les isoler des autres charges sans compter deux fois le même argent.
 */
const PURCHASE_TRANSACTION_PREFIX = 'purchase-';

/** Ligne de charge du compte de résultat (« achats » ou une catégorie). */
export interface StatementLine {
  /** Identifiant de catégorie, vide pour les charges sans catégorie. */
  id: string;
  total: number;
}

export interface IncomeStatement {
  from: string;
  to: string;
  /** Produits hors taxe de la période (ventes facturées). */
  revenue: number;
  /** Achats de marchandises hors taxe de la période. */
  goods: number;
  /** Valeur du stock au début de la période, au prix d'achat. */
  stockStart: number;
  /** Valeur du stock à la fin de la période, au prix d'achat. */
  stockEnd: number;
  /** Variation du stock : déduite des achats quand des marchandises restent. */
  stockChange: number;
  /** Coût des marchandises vendues (achats hors taxe − variation du stock). */
  goodsCost: number;
  /** TVA collectée sur les ventes de la période. */
  salesTax: number;
  /** TVA déductible sur les achats de la période. */
  purchasesTax: number;
  /** TVA à reverser (négatif = crédit de TVA). */
  taxDue: number;
  /** Autres charges, regroupées par catégorie et triées de la plus forte à la plus faible. */
  otherExpenses: StatementLine[];
  /** Total des charges (marchandises + autres). */
  expenses: number;
  /** Résultat net de la période (produits − charges). */
  result: number;
  /** Marge en pourcentage des produits (0 sans vente). */
  margin: number;
}

export interface IncomeStatementInput {
  businessId: string;
  transactions: Transaction[];
  sales: TradeDocument[];
  purchases: TradeDocument[];
  products: Product[];
  /** Journal daté du stock (voir `StockMovement`). */
  stockMovements: StockMovement[];
  /** Bornes inclusives (ISO YYYY-MM-DD). */
  from: string;
  to: string;
}

/**
 * Compte de résultat détaillé d'une période : produits, achats de marchandises
 * et autres charges catégorie par catégorie. Tout vient des opérations locales,
 * donc l'écran fonctionne hors connexion.
 */
export function buildIncomeStatement(input: IncomeStatementInput): IncomeStatement {
  const { businessId, transactions, sales, purchases, products, stockMovements, from, to } = input;
  const rows = transactions.filter(
    (tx) => tx.businessId === businessId && tx.type !== 'transfer' && tx.date >= from && tx.date <= to,
  );
  const inPeriod = (doc: TradeDocument) =>
    doc.businessId === businessId && doc.date >= from && doc.date <= to;

  const salesTax = documentsTax(sales.filter(inPeriod));
  const purchasesTax = documentsTax(purchases.filter(inPeriod));

  const grossRevenue = rows
    .filter((tx) => tx.type === 'income')
    .reduce((total, tx) => total + Math.max(0, tx.amountInPrimary), 0);
  const revenue = Math.max(0, grossRevenue - salesTax);

  const expenseRows = rows.filter((tx) => tx.type === 'expense');
  const grossGoods = expenseRows
    .filter((tx) => tx.id.startsWith(PURCHASE_TRANSACTION_PREFIX))
    .reduce((total, tx) => total + Math.max(0, tx.amountInPrimary), 0);
  const goods = Math.max(0, grossGoods - purchasesTax);

  const byCategory = new Map<string, number>();
  for (const tx of expenseRows) {
    if (tx.id.startsWith(PURCHASE_TRANSACTION_PREFIX)) continue;
    const key = tx.categoryId ?? '';
    byCategory.set(key, (byCategory.get(key) ?? 0) + Math.max(0, tx.amountInPrimary));
  }
  const otherExpenses = [...byCategory.entries()]
    .map(([id, total]) => ({ id, total }))
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));

  const otherTotal = otherExpenses.reduce((total, line) => total + line.total, 0);

  // Ce qui reste en stock n'est pas encore une charge : seules les
  // marchandises sorties (vendues) comptent dans le résultat.
  const stockEnd = stockValueAt(products, stockMovements, to);
  const stockStart = stockValueAt(products, stockMovements, previousDay(from));
  const stockChange = stockEnd - stockStart;
  const goodsCost = Math.max(0, goods - stockChange);
  const expenses = goodsCost + otherTotal;
  const result = revenue - expenses;

  return {
    from,
    to,
    revenue,
    goods,
    stockStart,
    stockEnd,
    stockChange,
    goodsCost,
    otherExpenses,
    expenses,
    result,
    margin: revenue > 0 ? (result / revenue) * 100 : 0,
    salesTax,
    purchasesTax,
    taxDue: salesTax - purchasesTax,
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
