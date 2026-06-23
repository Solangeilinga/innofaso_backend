CREATE TABLE IF NOT EXISTS maintenance_corrective_formulaires (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  maintenance_corrective_id   UUID NOT NULL REFERENCES maintenance_corrective(id) ON DELETE CASCADE,
  formulaire_id               UUID NOT NULL REFERENCES formulaires_types(id) ON DELETE CASCADE,
  cree_le                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(maintenance_corrective_id, formulaire_id)
);

CREATE INDEX IF NOT EXISTS idx_mcf_correctif ON maintenance_corrective_formulaires(maintenance_corrective_id);
CREATE INDEX IF NOT EXISTS idx_mcf_form     ON maintenance_corrective_formulaires(formulaire_id);
