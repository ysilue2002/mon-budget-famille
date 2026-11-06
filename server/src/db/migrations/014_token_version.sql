-- Révocation des sessions : un mot de passe réinitialisé invalide les jetons
-- déjà émis. `token_version` est embarqué dans le JWT (`tv`) et comparé à
-- chaque requête authentifiée ; un ancien jeton (sans `tv`) vaut la version 1,
-- donc aucune déconnexion de masse n'est nécessaire lors de cette migration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
