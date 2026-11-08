import { useEffect } from 'react';
import { ensureStockLedger } from '@/core/repo';

/**
 * Journal daté du stock : repris une seule fois depuis les documents déjà
 * saisis, puis tenu à jour à chaque vente, achat ou inventaire. Aucun rendu :
 * le composant ne sert qu'à cet effet de bord.
 */
export function StockLedgerTracker() {
  useEffect(() => {
    void ensureStockLedger().catch((error) => console.error('stock ledger error', error));
  }, []);
  return null;
}
