/**
 * Calculs de stock — logique PURE, testable sans base ni réseau.
 *
 * Convention : `buyPrice` / `sellPrice` sont des sous-unités de la devise du
 * foyer ; `stockQty` peut être décimal (kg, litre). La valeur du stock se
 * calcule donc au **prix d'achat**, arrondie à la sous-unité.
 */
import type { Product, StockMovement } from './types';

/** Produits actifs (les archivés sortent des totaux et des alertes). */
export function activeProducts(products: Product[]): Product[] {
  return products.filter((product) => !product.archived);
}

/** Valeur estimée du stock au prix d'achat, en sous-unités. */
export function stockValue(products: Product[]): number {
  return activeProducts(products).reduce(
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
 * Une ligne libre (sans marchandise) ne produit pas de mouvement : elle ne
 * pèse pas sur le stock.
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

  return activeProducts(products).reduce((total, product) => {
    const qty = Math.max(0, qtyByProduct.get(product.id) ?? 0);
    return total + Math.round(qty * Math.max(0, product.buyPrice));
  }, 0);
}

/** Quantité totale en stock (toutes unités confondues, indicatif). */
export function totalUnits(products: Product[]): number {
  return activeProducts(products).reduce((total, product) => total + Math.max(0, product.stockQty), 0);
}

/**
 * Produit « presque épuisé » : quantité au niveau du seuil d'alerte ou en
 * dessous. Un seuil à 0 désactive l'alerte (sauf rupture totale).
 */
export function isLowStock(product: Product): boolean {
  if (product.archived) return false;
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
