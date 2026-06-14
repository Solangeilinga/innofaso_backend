CREATE TYPE statut_planning AS ENUM (
  'PLANIFIE', 'EN_COURS', 'REALISE', 'EN_RETARD'
);

CREATE TABLE IF NOT EXISTS plannings_maintenance (
  id                  UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  formulaire_type_id  UUID    NOT NULL REFERENCES formulaires_types(id),
  equipement_id       UUID    NOT NULL REFERENCES equipements(id),
  technicien_id       UUID    NOT NULL REFERENCES utilisateurs(id),
  date_prevue         DATE    NOT NULL,
  date_realisee       DATE,
  statut              statut_planning NOT NULL DEFAULT 'PLANIFIE',
  commentaire         TEXT,
  cree_le             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_date       ON plannings_maintenance(date_prevue);
CREATE INDEX IF NOT EXISTS idx_plan_statut     ON plannings_maintenance(statut);
CREATE INDEX IF NOT EXISTS idx_plan_technicien ON plannings_maintenance(technicien_id);
CREATE INDEX IF NOT EXISTS idx_plan_equipement ON plannings_maintenance(equipement_id);