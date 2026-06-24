-- Réorganiser planning_autre : ajout acteurs, suppression anciens champs
DROP TABLE IF EXISTS planning_autre;

CREATE TABLE planning_autre (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date_planif     DATE NOT NULL,
  heure_planif    TIME,
  executeur_id    UUID REFERENCES utilisateurs(id),
  verificateur_id UUID REFERENCES utilisateurs(id),
  validateur_id   UUID REFERENCES utilisateurs(id),
  formulaire_id   UUID NOT NULL REFERENCES formulaires_types(id),
  statut          VARCHAR(20) NOT NULL DEFAULT 'planifie',
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modifie_le      TIMESTAMPTZ
);

CREATE INDEX idx_planning_autre_date    ON planning_autre(date_planif);
CREATE INDEX idx_planning_autre_exec    ON planning_autre(executeur_id);
