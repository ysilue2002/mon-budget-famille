-- Ajout de l'entité de synchronisation « product » (marchandises et stock de
-- l'assistant Activité). On repart de la liste complète des entités.

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_entity_check;

ALTER TABLE records ADD CONSTRAINT records_entity_check
  CHECK (entity IN ('account', 'transaction', 'budget', 'goal', 'debt', 'category', 'recurring', 'wealth', 'business', 'product'));
