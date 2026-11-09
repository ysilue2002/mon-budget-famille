/**
 * Calculs de stock — logique PURE, testable sans base ni réseau.
 *
 * Convention : `buyPrice` / `sellPrice` sont des sous-unités de la devise du
 * foyer ; `stockQty` peut être décimal (kg, litre). La valeur du stock se
 * calcule donc au **prix d'achat**, arrondie à la sous-unité.
 *
 * Une **prestation** (`kind: 'service'`) est vendue sans stock : main d'œuvre
 * d'un maçon, pose d'un menuisier, réparation d'un mécanicien, location de
 * matériel. Elle se facture comme un article, mais ne pèse ni sur la valeur du
 * stock, ni sur les alertes de réapprovisionnement, ni dans le journal.
 */
import type { Product, StockMovement, StockMovementReason } from './types';

/** Une fiche de prestation (pas de stock à suivre). */
export function isService(product: Product): boolean {
  return product.kind === 'service';
}

/** Produits actifs (les archivés sortent des totaux et des alertes). */
export function activeProducts(products: Product[]): Product[] {
  return products.filter((product) => !product.archived);
}

/** Articles réellement stockés : actifs et non prestations. */
export function stockProducts(products: Product[]): Product[] {
  return products.filter((product) => !product.archived && !isService(product));
}

/** Valeur estimée du stock au prix d'achat, en sous-unités. */
export function stockValue(products: Product[]): number {
  return stockProducts(products).reduce(
    (total, product) => total + Math.round(Math.max(0, product.stockQty) * product.buyPrice),
    0,
  );
}

/**
 * Valeur du stock à la fin d'une date donnée, au prix d'achat, d'après le
 * journal daté des mouvements : entrées des achats, sorties des ventes,
 * inventaires et quantité de départ. Rien n'est reconstitué, la valeur d'un
 * mois passé ne bouge donc plus quand le stock d'aujourd'hui change.
 *
 * Une ligne libre (sans marchandise) et une prestation ne produisent pas de
 * mouvement : elles ne pèsent pas sur le stock.
 */
export function stockValueAt(
  products: Product[],
  movements: StockMovement[],
  dateISO: string,
): number {
  const qtyByProduct = new Map<string, number>();
  for (const movement of movements) {
    if (movement.date > dateISO) continue;
    qtyByProduct.set(movement.productId, (qtyByProduct.get(movement.productId) ?? 0) + movement.qty);
  }

  return stockProducts(products).reduce((total, product) => {
    const qty = Math.max(0, qtyByProduct.get(product.id) ?? 0);
    return total + Math.round(qty * Math.max(0, product.buyPrice));
  }, 0);
}

/** Quantité totale en stock (toutes unités confondues, indicatif). */
export function totalUnits(products: Product[]): number {
  return stockProducts(products).reduce((total, product) => total + Math.max(0, product.stockQty), 0);
}

/**
 * Produit « presque épuisé » : quantité au niveau du seuil d'alerte ou en
 * dessous. Un seuil à 0 désactive l'alerte (sauf rupture totale).
 */
export function isLowStock(product: Product): boolean {
  if (product.archived || isService(product)) return false;
  if (product.stockQty <= 0) return true;
  return product.alertQty > 0 && product.stockQty <= product.alertQty;
}

export function lowStockProducts(products: Product[]): Product[] {
  return activeProducts(products).filter(isLowStock);
}

/** Marge par unité au prix de vente (sous-unités). Négative = vente à perte. */
export function unitMargin(product: Product): number {
  return product.sellPrice - product.buyPrice;
}

/** Ligne de l'état « Journal du stock », article par article. */
export interface StockLedgerLine {
  productId: string;
  name: string;
  unit: string;
  buyPrice: number;
  /** Quantité en stock juste avant la période. */
  openingQty: number;
  /** Quantités entrées sur la période (achats, inventaires positifs). */
  inQty: number;
  /** Quantités sorties sur la période (ventes, inventaires négatifs). */
  outQty: number;
  /** Quantité en stock à la fin de la période. */
  closingQty: number;
  /** Valeur du stock de fin au prix d'achat. */
  value: number;
}

/** Mouvement du journal, avec la quantité restante après lui. */
export interface StockLedgerEntry {
  id: string;
  date: string;
  productId: string;
  name: string;
  reason: StockMovementReason;
  inQty: number;
  outQty: number;
  /** Stock de l'article après ce mouvement. */
  balance: number;
}

/** État imprimable du journal : stock de début, mouvements, stock de fin. */
export interface StockLedger {
  from: string;
  to: string;
  lines: StockLedgerLine[];
  entries: StockLedgerEntry[];
  /** Valeur du stock au premier jour de la période. */
  openingValue: number;
  /** Valeur des entrées de la période, au prix d'achat. */
  inValue: number;
  /** Valeur des sorties de la période, au prix d'achat. */
  outValue: number;
  /** Valeur du stock au dernier jour de la période. */
  closingValue: number;
}

/**
 * Construit l'état du journal du stock sur une période, à partir des
 * mouvements datés : le stock de début vient des mouvements antérieurs, le
 * stock de fin de tout ce qui précède la fin de période. Aucune reconstitution
 * depuis le stock d'aujourd'hui.
 *
 * Les mouvements sont ceux du journal ; une ligne facturée sans article
 * (prestation ou ligne libre) n'y figure pas.
 */
export function buildStockLedger(
  products: Product[],
  movements: StockMovement[],
  from: string,
  to: string,
): StockLedger {
  const tracked = stockProducts(products);

  const lines: StockLedgerLine[] = [];
  const entries: StockLedgerEntry[] = [];

  for (const product of tracked) {
    const own = movements
      .filter((movement) => movement.productId === product.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    let openingQty = 0;
    let inQty = 0;
    let outQty = 0;
    let balance = 0;
    for (const movement of own) {
      if (movement.date < from) {
        openingQty += movement.qty;
        balance += movement.qty;
        continue;
      }
      if (movement.date > to) continue;
      balance += movement.qty;
      if (movement.qty >= 0) inQty += movement.qty;
      else outQty += -movement.qty;
      entries.push({
        id: movement.id,
        date: movement.date,
        productId: product.id,
        name: product.name,
        reason: movement.reason,
        inQty: Math.max(0, movement.qty),
        outQty: Math.max(0, -movement.qty),
        balance,
      });
    }
    const closingQty = openingQty + inQty - outQty;
    lines.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      buyPrice: product.buyPrice,
      openingQty,
      inQty,
      outQty,
      closingQty,
      value: Math.round(Math.max(0, closingQty) * Math.max(0, product.buyPrice)),
    });
  }

  lines.sort((a, b) => a.name.localeCompare(b.name));
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const valueOf = (qty: number, buyPrice: number) => Math.round(Math.max(0, qty) * Math.max(0, buyPrice));
  return {
    from,
    to,
    lines,
    entries,
    openingValue: lines.reduce((total, line) => total + valueOf(line.openingQty, line.buyPrice), 0),
    inValue: lines.reduce((total, line) => total + valueOf(line.inQty, line.buyPrice), 0),
    outValue: lines.reduce((total, line) => total + valueOf(line.outQty, line.buyPrice), 0),
    closingValue: lines.reduce((total, line) => total + line.value, 0),
  };
}
