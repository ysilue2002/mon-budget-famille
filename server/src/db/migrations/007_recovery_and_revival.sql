-- Phrase de secours (récupération de mot de passe sans e-mail ni
-- administrateur disponible) et foyer en attente de récupération après
-- suppression du compte du dernier membre (délai borné).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS recovery_phrase_hash TEXT;

-- La phrase de secours du compte supprimé est déplacée du user (disparaissant)
-- vers le foyer : c'est elle qui prouve la reprise de l'adresse e-mail.
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS recovery_phrase_hash TEXT,
  ADD COLUMN IF NOT EXISTS recovery_email TEXT,
  ADD COLUMN IF NOT EXISTS recovery_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS families_recovery_email_idx ON families(recovery_email)
  WHERE recovery_email IS NOT NULL;
