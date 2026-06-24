-- Ajout colonnes pour maintenance corrective (heure, couverture, taux, commentaire)
ALTER TABLE maintenance_corrective ADD COLUMN IF NOT EXISTS heure_intervention TIME;
ALTER TABLE maintenance_corrective ADD COLUMN IF NOT EXISTS temps_couverture NUMERIC(6,2) DEFAULT 8;
ALTER TABLE maintenance_corrective ADD COLUMN IF NOT EXISTS taux_cible NUMERIC(5,2) DEFAULT 90;
ALTER TABLE maintenance_corrective ADD COLUMN IF NOT EXISTS commentaire TEXT;

-- Table pour planning "Autre" (planification libre)
CREATE TABLE IF NOT EXISTS planning_autre (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date_planif   DATE NOT NULL,
  heure_planif  TIME,
  assigne_a_id  UUID NOT NULL REFERENCES utilisateurs(id),
  formulaire_id UUID NOT NULL REFERENCES formulaires_types(id),
  statut        VARCHAR(20) NOT NULL DEFAULT 'planifie',
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modifie_le    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_planning_autre_date     ON planning_autre(date_planif);
CREATE INDEX IF NOT EXISTS idx_planning_autre_assigne   ON planning_autre(assigne_a_id);
