-- Ajout de l'entité de synchronisation « recurring » (opérations récurrentes).
-- La contrainte CHECK initiale limitait les entités connues à la v1 du modèle.

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_entity_check;

ALTER TABLE records ADD CONSTRAINT records_entity_check
  CHECK (entity IN ('account', 'transaction', 'budget', 'goal', 'debt', 'category', 'recurring'));
