-- Deux entités manquaient à la liste blanche de la synchronisation :
--   « project »       : les chantiers (regroupement de documents, sans écriture) ;
--   « stockMovement » : le journal daté du stock, déjà produit par le client.
-- Sans elles, le serveur refusait ces opérations et elles restaient en attente.

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_entity_check;

ALTER TABLE records ADD CONSTRAINT records_entity_check
  CHECK (entity IN ('account', 'transaction', 'budget', 'goal', 'debt', 'category', 'recurring', 'wealth', 'business', 'product', 'sale', 'purchase', 'party', 'advance', 'settlement', 'quote', 'project', 'stockMovement'));
