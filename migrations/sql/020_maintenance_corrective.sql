CREATE TABLE IF NOT EXISTS maintenance_corrective (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  planning_semaine_id   UUID NOT NULL REFERENCES planning_semaine(id),
  equipement_id         UUID REFERENCES equipements(id),
  equipement_libre      VARCHAR(255),
  executeur_id          UUID NOT NULL REFERENCES utilisateurs(id),
  co_executeur_id       UUID REFERENCES utilisateurs(id),
  verificateur_id       UUID REFERENCES utilisateurs(id),
  validateur_id         UUID REFERENCES utilisateurs(id),
  signalement_panne_id  UUID REFERENCES signalements_pannes(id),
  duree_arret           NUMERIC(6,2) DEFAULT 0,
  duree_maintenance     NUMERIC(6,2) DEFAULT 0,
  cause                 TEXT,
  observations          TEXT,
  statut                VARCHAR(20) NOT NULL DEFAULT 'planifie',
  cree_le               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modifie_le            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mc_semaine     ON maintenance_corrective(planning_semaine_id);
CREATE INDEX IF NOT EXISTS idx_mc_executeur   ON maintenance_corrective(executeur_id);
CREATE INDEX IF NOT EXISTS idx_mc_statut      ON maintenance_corrective(statut);
