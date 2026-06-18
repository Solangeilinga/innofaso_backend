DO $$ BEGIN
  CREATE TYPE action_audit AS ENUM ('INSERT', 'UPDATE', 'DELETE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS audit_logs (
  id                UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  utilisateur_id    UUID      REFERENCES utilisateurs(id),
  table_cible       VARCHAR(100) NOT NULL,
  enregistrement_id UUID         NOT NULL,
  action            action_audit NOT NULL,
  ancienne_valeur   JSONB,
  nouvelle_valeur   JSONB,
  "timestamp"       TIMESTAMP NOT NULL DEFAULT NOW(),
  adresse_ip        INET,
  appareil          TEXT
);

-- Rattrapage si la table existait déjà sans certaines colonnes
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "timestamp"     TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS adresse_ip      INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS appareil        TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_logs(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_audit_table     ON audit_logs(table_cible);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs("timestamp" DESC);

-- Journal non modifiable : interdire UPDATE et DELETE
CREATE OR REPLACE RULE audit_no_update
  AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_no_delete
  AS ON DELETE TO audit_logs DO INSTEAD NOTHING;