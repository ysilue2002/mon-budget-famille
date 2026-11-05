-- Ajout de l'entité de synchronisation « advance » (avances reçues des
-- clients, suivies séparément des ventes). On repart de la liste complète.

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_entity_check;

ALTER TABLE records ADD CONSTRAINT records_entity_check
  CHECK (entity IN ('account', 'transaction', 'budget', 'goal', 'debt', 'category', 'recurring', 'wealth', 'business', 'product', 'sale', 'purchase', 'party', 'advance'));
