-- Invitations de foyer : un code à usage unique (8 caractères sans ambiguïté)
-- permet à un compte existant ou à une nouvelle inscription de rejoindre un foyer
-- en tant que membre. La vérité du rattachement reste la table memberships.

CREATE TABLE IF NOT EXISTS invitations (
  code TEXT PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member', 'readonly')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS invitations_family_idx ON invitations(family_id, created_at);
