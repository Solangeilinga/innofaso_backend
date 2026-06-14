CREATE TYPE type_alerte AS ENUM (
  'MAINTENANCE_PREVENTIVE',
  'FORMULAIRE_EN_RETARD',
  'PANNE_CRITIQUE',
  'STOCK_BAS'
);
CREATE TYPE statut_alerte AS ENUM ('NON_LUE', 'LUE', 'TRAITEE');

CREATE TABLE IF NOT EXISTS alertes (
  id              UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  soumission_id   UUID      REFERENCES soumissions(id),    -- nullable
  equipement_id   UUID      REFERENCES equipements(id),    -- nullable
  utilisateur_id  UUID      NOT NULL REFERENCES utilisateurs(id),
  type_alerte     type_alerte   NOT NULL,
  message         TEXT          NOT NULL,
  statut          statut_alerte NOT NULL DEFAULT 'NON_LUE',
  date_creation   TIMESTAMP     NOT NULL DEFAULT NOW(),
  date_envoi      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alertes_utilisateur ON alertes(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_alertes_statut      ON alertes(statut);
CREATE INDEX IF NOT EXISTS idx_alertes_type        ON alertes(type_alerte);
CREATE INDEX IF NOT EXISTS idx_alertes_date        ON alertes(date_creation DESC);