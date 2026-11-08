/**
 * Calculs de stock — logique PURE, testable sans base ni réseau.
 *
 * Convention : `buyPrice` / `sellPrice` sont des sous-unités de la devise du
 * foyer ; `stockQty` peut être décimal (kg, litre). La valeur du stock se
 * calcule donc au **prix d'achat**, arrondie à la sous-unité.
 */
import type { Product, TradeDocument } from './types';

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
 * Valeur du stock à la fin d'une date donnée, au prix d'achat, reconstituée
 * depuis le stock actuel : les ventes postérieures sont rajoutées (elles sont
 * déjà sorties du stock) et les achats postérieurs retirés. Les documents sans
 * marchandise (ligne libre) ne bougent pas le stock et sont ignorés.
 *
 * Le stock tenu à la main dans la fiche produit sert de point de départ : c'est
 * la seule information disponible hors documents, l'estimation reste donc
 * indicative pour le passé.
 */
export function stockValueAt(
  products: Product[],
  sales: TradeDocument[],
  purchases: TradeDocument[],
  dateISO: string,
): number {
  const moved = (documents: TradeDocument[]) => {
    const byProduct = new Map<string, number>();
    for (const doc of documents) {
      if (doc.date <= dateISO) continue;
      for (const line of doc.lines) {
        if (!line.productId) continue;
        byProduct.set(line.productId, (byProduct.get(line.productId) ?? 0) + line.qty);
      }
    }
    return byProduct;
  };

  const soldAfter = moved(sales);
  const boughtAfter = moved(purchases);
  const endOfDay = Date.parse(`${dateISO}T23:59:59.999Z`);

  return activeProducts(products)
    .filter((product) => !Number.isFinite(endOfDay) || product.createdAt <= endOfDay)
    .reduce((total, product) => {
      const qty = Math.max(
        0,
        product.stockQty + (soldAfter.get(product.id) ?? 0) - (boughtAfter.get(product.id) ?? 0),
      );
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
