import { isService } from '@/core/stock';
import type { Advance, Product, Project, TradeDocument, Transaction } from '@/core/types';

/**
 * Rentabilité d'un chantier.
 *
 * Un chantier ne crée aucun mouvement : il regroupe des documents déjà saisis
 * (ventes, achats, dépenses, acomptes) par leur `projectId`. Tout est calculé
 * hors taxe pour les ventes et les achats (les prix des lignes sont HT), et au
 * montant saisi pour les dépenses.
 */

/** Bornes de dates (incluses) pour restreindre un état à une période. */
export interface ProjectRange {
  from: string;
  to: string;
}

function inRange(date: string, range?: ProjectRange | null): boolean {
  if (!range) return true;
  return date >= range.from && date <= range.to;
}

export interface ProjectBooks {
  sales: TradeDocument[];
  purchases: TradeDocument[];
  transactions: Transaction[];
  advances: Advance[];
  products: Product[];
}

export interface ProjectTotals {
  /** Ventes du chantier, hors taxe. */
  salesHt: number;
  /** Part « main d'œuvre » des ventes : lignes de prestations. */
  laborHt: number;
  /** Part « fournitures » : lignes d'articles et lignes libres. */
  suppliesHt: number;
  /** Achats du chantier, hors taxe. */
  purchasesHt: number;
  /** Dépenses rattachées, telles que saisies. */
  expenses: number;
  /** Acomptes reçus des clients pour ce chantier (hors remboursés). */
  advancesReceived: number;
  /** Reste à encaisser sur les ventes du chantier. */
  due: number;
  /** Ventes HT − achats HT − dépenses. */
  margin: number;
  salesCount: number;
  purchasesCount: number;
  expenseCount: number;
  advanceCount: number;
}

/**
 * Une opération de journal générée par une vente ou un achat porte l'identifiant
 * `sale-<id>` / `purchase-<id>`. Elle est déjà comptée par le document : la
 * compter aussi comme dépense doublerait les achats.
 */
export function isDocumentTransaction(transaction: Transaction): boolean {
  return transaction.id.startsWith('sale-') || transaction.id.startsWith('purchase-');
}

/** Montant hors taxe d'un document (somme des lignes). */
export function documentSubtotal(document: TradeDocument): number {
  return document.lines.reduce((sum, line) => sum + line.lineTotal, 0);
}

/**
 * Totaux d'un chantier. Les documents d'un autre chantier, ou sans chantier,
 * sont ignorés.
 */
export function projectTotals(
  projectId: string,
  books: ProjectBooks,
  range?: ProjectRange | null,
): ProjectTotals {
  const serviceIds = new Set(
    books.products.filter((product) => isService(product)).map((product) => product.id),
  );

  const sales = books.sales.filter(
    (document) => document.projectId === projectId && inRange(document.date, range),
  );
  const purchases = books.purchases.filter(
    (document) => document.projectId === projectId && inRange(document.date, range),
  );
  const expenses = books.transactions.filter(
    (transaction) =>
      transaction.projectId === projectId &&
      transaction.type === 'expense' &&
      !isDocumentTransaction(transaction) &&
      inRange(transaction.date, range),
  );
  const advances = receivedAdvances(projectId, books, range);

  let laborHt = 0;
  let salesHt = 0;
  for (const document of sales) {
    for (const line of document.lines) {
      salesHt += line.lineTotal;
      if (line.productId && serviceIds.has(line.productId)) laborHt += line.lineTotal;
    }
  }

  const purchasesHt = purchases.reduce((sum, document) => sum + documentSubtotal(document), 0);
  const expenseTotal = expenses.reduce((sum, transaction) => sum + transaction.amountInPrimary, 0);

  return {
    salesHt,
    laborHt,
    suppliesHt: salesHt - laborHt,
    purchasesHt,
    expenses: expenseTotal,
    advancesReceived: advances.reduce((sum, advance) => sum + advance.amount, 0),
    due: sales.reduce((sum, document) => sum + document.due, 0),
    margin: salesHt - purchasesHt - expenseTotal,
    salesCount: sales.length,
    purchasesCount: purchases.length,
    expenseCount: expenses.length,
    advanceCount: advances.length,
  };
}

/**
 * Acomptes réellement reçus du client pour un chantier (les acomptes versés à un
 * fournisseur et les acomptes remboursés sont écartés).
 */
function receivedAdvances(
  projectId: string,
  books: ProjectBooks,
  range?: ProjectRange | null,
): Advance[] {
  return books.advances.filter(
    (advance) =>
      advance.projectId === projectId &&
      (advance.direction ?? 'received') === 'received' &&
      advance.status !== 'refunded' &&
      inRange(advance.receivedOn, range),
  );
}

/** Ligne de détail affichée sous un chantier (document, dépense ou acompte). */
export interface ProjectEntry {
  id: string;
  kind: 'sale' | 'purchase' | 'expense' | 'advance';
  date: string;
  label: string;
  amount: number;
}

/** Tout ce qui est rattaché à un chantier, du plus récent au plus ancien. */
export function projectEntries(
  projectId: string,
  books: ProjectBooks,
  range?: ProjectRange | null,
): ProjectEntry[] {
  const entries: ProjectEntry[] = [];
  for (const document of books.sales) {
    if (document.projectId !== projectId || !inRange(document.date, range)) continue;
    entries.push({
      id: document.id,
      kind: 'sale',
      date: document.date,
      label: document.partyName || document.number || '',
      amount: document.total,
    });
  }
  for (const document of books.purchases) {
    if (document.projectId !== projectId || !inRange(document.date, range)) continue;
    entries.push({
      id: document.id,
      kind: 'purchase',
      date: document.date,
      label: document.partyName || document.number || '',
      amount: document.total,
    });
  }
  for (const transaction of books.transactions) {
    if (transaction.projectId !== projectId || transaction.type !== 'expense') continue;
    if (isDocumentTransaction(transaction)) continue;
    if (!inRange(transaction.date, range)) continue;
    entries.push({
      id: transaction.id,
      kind: 'expense',
      date: transaction.date,
      label: transaction.note || '',
      amount: transaction.amountInPrimary,
    });
  }
  for (const advance of books.advances) {
    if (advance.projectId !== projectId || !inRange(advance.receivedOn, range)) continue;
    entries.push({
      id: advance.id,
      kind: 'advance',
      date: advance.receivedOn,
      label: advance.subject,
      amount: advance.amount,
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Détail d'un chantier pour l'état imprimé : mêmes lignes que `projectEntries`,
 * mais les ventes et les achats y portent leur montant hors taxe (celui des
 * totaux) et leur numéro, pour retrouver le document papier.
 */
export function projectReportEntries(
  projectId: string,
  books: ProjectBooks,
  range?: ProjectRange | null,
): ProjectEntry[] {
  const documents = new Map<string, TradeDocument>();
  for (const document of [...books.sales, ...books.purchases]) documents.set(document.id, document);

  return projectEntries(projectId, books, range).map((entry) => {
    const document = documents.get(entry.id);
    if (!document) return entry;
    return {
      ...entry,
      amount: documentSubtotal(document),
      label: [document.number, document.partyName].filter(Boolean).join(' · '),
    };
  });
}

/** Vente d'un chantier avec ce qui a été facturé, reçu et ce qui reste à encaisser. */
export interface ProjectSaleLine {
  id: string;
  date: string;
  /** Numéro du document et client, quand ils existent. */
  label: string;
  /** Montant facturé (TTC, tel que compté par la trésorerie). */
  total: number;
  /** Montant déjà encaissé. */
  paid: number;
  /** Reste à encaisser sur cette vente. */
  due: number;
}

/** Ventes d'un chantier, la plus récente d'abord, avec leur reste à encaisser. */
export function projectSales(
  projectId: string,
  books: ProjectBooks,
  range?: ProjectRange | null,
): ProjectSaleLine[] {
  return books.sales
    .filter((document) => document.projectId === projectId && inRange(document.date, range))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((document) => ({
      id: document.id,
      date: document.date,
      label: [document.number, document.partyName].filter(Boolean).join(' · '),
      total: document.total,
      paid: document.paid,
      due: document.due,
    }));
}

/** Acomptes reçus pour un chantier, du plus récent au plus ancien. */
export function projectReceivedAdvances(
  projectId: string,
  books: ProjectBooks,
  range?: ProjectRange | null,
): ProjectEntry[] {
  return receivedAdvances(projectId, books, range)
    .map((advance) => ({
      id: advance.id,
      kind: 'advance' as const,
      date: advance.receivedOn,
      label: advance.subject,
      amount: advance.amount,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Chantiers ouverts d'abord, puis les plus récents. */
export function sortedProjects(projects: Project[]): Project[] {
  return [...projects].sort(
    (a, b) =>
      Number(a.archived) - Number(b.archived) ||
      Number(a.status === 'done') - Number(b.status === 'done') ||
      b.startDate.localeCompare(a.startDate),
  );
}
