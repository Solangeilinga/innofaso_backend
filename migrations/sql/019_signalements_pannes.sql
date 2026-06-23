CREATE TABLE IF NOT EXISTS signalements_pannes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signale_par_id  UUID NOT NULL REFERENCES utilisateurs(id),
  assigne_a_id    UUID NOT NULL REFERENCES utilisateurs(id),
  observation     TEXT,
  date_panne      DATE NOT NULL DEFAULT CURRENT_DATE,
  heure_panne     TIME NOT NULL DEFAULT CURRENT_TIME,
  statut          VARCHAR(20) NOT NULL DEFAULT 'signale',
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_assigne    ON signalements_pannes(assigne_a_id);
CREATE INDEX IF NOT EXISTS idx_sp_statut     ON signalements_pannes(statut);
