/**
 * Trésorerie de l'activité — logique PURE, testable sans base ni réseau.
 *
 * Trois questions distinctes, volontairement séparées :
 *   - OÙ EST L'ARGENT : les soldes réels des caisses, banques et portefeuilles
 *     mobiles (Wave, Orange Money, MTN, Moov…) ;
 *   - CE QUI A BOUGÉ : ventes facturées, encaissements, achats, paiements,
 *     dépenses, avances et transferts — chaque flux compté une seule fois ;
 *   - CE QUI RESTE : crédits clients, crédits fournisseurs, avances en cours.
 *
 * Les formules de période viennent de `reports.ts` : une seule source de
 * vérité, donc aucun risque qu'un achat soit compté deux fois (une fois comme
 * achat, une fois comme dépense).
 */
import { computeAccountBalance } from './selectors';
import { convertMinor } from './money';
import { buildPeriodReport, type PeriodReport } from './reports';
import type {
  AccountType,
  Advance,
  CurrencyCode,
  FinancialAccount,
  Product,
  RateSnapshot,
  Settlement,
  TradeDocument,
  Transaction,
} from './types';

export interface AccountLine {
  account: FinancialAccount;
  balance: number;
  /** Nombre d'opérations qui touchent ce compte (toutes périodes). */
  movements: number;
}

export interface AccountGroupSummary {
  group: AccountType;
  lines: AccountLine[];
  total: number;
}

const GROUP_ORDER: AccountType[] = ['cash', 'bank', 'mobile', 'other'];

/** Solde réel de chaque compte actif, avec son nombre de mouvements. */
export function accountLines(accounts: FinancialAccount[], transactions: Transaction[]): AccountLine[] {
  return accounts
    .filter((account) => !account.archived)
    .map((account) => {
      const related = transactions.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id);
      return { account, balance: computeAccountBalance(account, related), movements: related.length };
    })
    .sort((a, b) => a.account.name.localeCompare(b.account.name));
}

/** Regroupe les comptes : caisse, banques, mobile money, autres. */
export function groupAccounts(lines: AccountLine[]): AccountGroupSummary[] {
  return GROUP_ORDER.map((group) => {
    const rows = lines.filter((line) => line.account.type === group);
    return { group, lines: rows, total: rows.reduce((sum, line) => sum + line.balance, 0) };
  }).filter((summary) => summary.lines.length > 0);
}

/** Argent réellement disponible, tous comptes confondus (même devise). */
export function totalAvailable(lines: AccountLine[]): number {
  return lines.reduce((sum, line) => sum + line.balance, 0);
}

/**
 * Total disponible ramené dans la devise du foyer : un compte en dollars ou en
 * naira ne doit pas être additionné tel quel à une caisse en CFA.
 */
export function totalInPrimary(lines: AccountLine[], primary: CurrencyCode, snapshot: RateSnapshot): number {
  return lines.reduce((sum, line) => {
    if (line.account.currency === primary) return sum + line.balance;
    return sum + (convertMinor(line.balance, line.account.currency, primary, snapshot) ?? 0);
  }, 0);
}

/** Règlements de la période, les plus récents d'abord. */
export function settlementsIn(settlements: Settlement[], from: string, to: string): Settlement[] {
  return settlements
    .filter((settlement) => settlement.date >= from && settlement.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export interface CreditSummary {
  /** Reste à encaisser sur les ventes à la fin de la période. */
  customer: number;
  /** Reste à payer sur les achats à la fin de la période. */
  supplier: number;
  customers: number;
  suppliers: number;
}

function distinctCreditors(documents: TradeDocument[]): number {
  const keys = new Set<string>();
  for (const document of documents) {
    if (document.due <= 0) continue;
    keys.add(document.partyId ?? document.partyName ?? document.id);
  }
  return keys.size;
}

/** Crédits encore ouverts à la date `to` (bornes incluses). */
export function creditsAt(sales: TradeDocument[], purchases: TradeDocument[], to: string): CreditSummary {
  const customerDocs = sales.filter((document) => document.date <= to);
  const supplierDocs = purchases.filter((document) => document.date <= to);
  return {
    customer: customerDocs.reduce((sum, document) => sum + Math.max(0, document.due), 0),
    supplier: supplierDocs.reduce((sum, document) => sum + Math.max(0, document.due), 0),
    customers: distinctCreditors(customerDocs),
    suppliers: distinctCreditors(supplierDocs),
  };
}

export interface TransferSummary {
  count: number;
  total: number;
}

/** Transferts de la période : ils déplacent l'argent, sans recette ni dépense. */
export function transfersIn(transactions: Transaction[], from: string, to: string): TransferSummary {
  const rows = transactions.filter((tx) => tx.type === 'transfer' && tx.date >= from && tx.date <= to);
  return { count: rows.length, total: rows.reduce((sum, tx) => sum + tx.amountInPrimary, 0) };
}

/** Part déjà payée des achats de la période (pour ne pas la compter en dépense). */
export function purchasePaymentsIn(purchases: TradeDocument[], from: string, to: string): number {
  return purchases
    .filter((document) => document.date >= from && document.date <= to)
    .reduce((sum, document) => sum + Math.min(Math.max(0, document.paid), document.total), 0);
}

export type FlowKey = 'sales' | 'collections' | 'purchases' | 'supplierPayments' | 'expenses' | 'advances' | 'transfers';

export interface FlowRow {
  key: FlowKey;
  amount: number;
  /**
   * `yes` : l'argent bouge réellement sur un compte ;
   * `no` : engagement seulement (facture émise ou reçue) ;
   * `neutral` : transfert interne, sans effet sur le total.
   */
  counted: 'yes' | 'no' | 'neutral';
}

/** Les sept flux de la trésorerie, calculés une seule fois chacun. */
export function flowRows(report: PeriodReport, purchases: TradeDocument[], from: string, to: string): FlowRow[] {
  const supplierPayments = purchasePaymentsIn(purchases, from, to);
  const otherPaid = Math.max(0, report.cashOut - supplierPayments);
  return [
    { key: 'sales', amount: report.sales, counted: 'no' },
    { key: 'collections', amount: report.cashIn, counted: 'yes' },
    { key: 'purchases', amount: report.purchases, counted: 'no' },
    { key: 'supplierPayments', amount: supplierPayments, counted: 'yes' },
    { key: 'expenses', amount: otherPaid, counted: 'yes' },
    { key: 'advances', amount: report.advancesReceived, counted: 'yes' },
    { key: 'transfers', amount: transfersIn([], from, to).total, counted: 'neutral' },
  ];
}

export interface TreasuryInput {
  businessId: string;
  accounts: FinancialAccount[];
  transactions: Transaction[];
  sales: TradeDocument[];
  purchases: TradeDocument[];
  products: Product[];
  advances: Advance[];
  settlements: Settlement[];
  /** Bornes incluses (ISO YYYY-MM-DD). */
  from: string;
  to: string;
  year?: number;
}

export interface TreasurySnapshot {
  report: PeriodReport;
  lines: AccountLine[];
  groups: AccountGroupSummary[];
  available: number;
  credits: CreditSummary;
  transfers: TransferSummary;
  flows: FlowRow[];
  settlements: Settlement[];
}

/** Photographie complète de la trésorerie pour une période. */
export function buildTreasurySnapshot(input: TreasuryInput): TreasurySnapshot {
  const report = buildPeriodReport({
    businessId: input.businessId,
    transactions: input.transactions,
    sales: input.sales,
    purchases: input.purchases,
    products: input.products,
    advances: input.advances,
    accounts: input.accounts,
    from: input.from,
    to: input.to,
    year: input.year,
  });
  const lines = accountLines(input.accounts, input.transactions);
  const transfers = transfersIn(input.transactions, input.from, input.to);
  const flows = flowRows(report, input.purchases, input.from, input.to).map((flow) =>
    flow.key === 'transfers' ? { ...flow, amount: transfers.total } : flow,
  );
  return {
    report,
    lines,
    groups: groupAccounts(lines),
    available: totalAvailable(lines),
    credits: creditsAt(input.sales, input.purchases, input.to),
    transfers,
    flows,
    settlements: settlementsIn(input.settlements, input.from, input.to),
  };
}

/**
 * Invariant anti-double-comptage : le total des charges est exactement la somme
 * des achats de marchandises et des autres dépenses. Vérifié par les tests.
 */
export function chargesAddUp(report: PeriodReport): boolean {
  return report.expensesTotal === report.purchases + report.otherExpenses;
}
