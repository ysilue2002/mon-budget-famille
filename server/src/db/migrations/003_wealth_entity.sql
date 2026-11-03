-- Ajout de l'entité de synchronisation « wealth » (valorisations du patrimoine).
-- Chaque relevé est daté et identifié par `wealth-<date>` : la contrainte CHECK
-- initiale doit donc accepter la nouvelle entité. On repart de la liste
-- complète pour ne rien perdre de la migration 002.

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_entity_check;

ALTER TABLE records ADD CONSTRAINT records_entity_check
  CHECK (entity IN ('account', 'transaction', 'budget', 'goal', 'debt', 'category', 'recurring', 'wealth'));
