-- Réinitialisation de mot de passe : l'administrateur d'un foyer délivre un
-- code à usage unique (30 min) à un membre qui a perdu son mot de passe.
-- Seul le HASH du code est stocké : lire la table ne suffit pas à s'authentifier.

CREATE TABLE IF NOT EXISTS password_resets (
  code_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id, created_at);
