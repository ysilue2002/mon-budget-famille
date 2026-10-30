-- Mon Budget Famille — schéma PostgreSQL initial
-- Données de synchronisation stockées en JSONB par entité
-- (le modèle applicatif évolue sans migration DDL à chaque champ).

CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  primary_currency TEXT NOT NULL CHECK (primary_currency IN ('XOF', 'XAF', 'USD', 'NGN', 'GBP', 'EUR', 'CHF')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL CHECK (position('@' in email) > 1),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'member', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);

CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);

-- État consolidé d'une donnée de synchronisation (device → serveur).
CREATE TABLE IF NOT EXISTS records (
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK (entity IN ('account', 'transaction', 'budget', 'goal', 'debt', 'category')),
  record_id TEXT NOT NULL,
  record JSONB NOT NULL,
  rev BIGINT NOT NULL DEFAULT 1,
  deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, entity, record_id)
);

-- Flux d'événements ordonné pour le pull incrémental par curseur.
CREATE TABLE IF NOT EXISTS change_log (
  id BIGSERIAL PRIMARY KEY,
  family_id UUID NOT NULL,
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record JSONB,
  rev BIGINT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS change_log_family_cursor_idx ON change_log(family_id, id);

-- Idempotence des opérations de push : un opId traité n'est jamais rejoué.
CREATE TABLE IF NOT EXISTS processed_ops (
  op_id TEXT PRIMARY KEY,
  family_id UUID NOT NULL,
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
