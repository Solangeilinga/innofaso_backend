-- 016_planning_formulaires.sql
-- Table de liaison entre planning_quart et formulaires_types
CREATE TABLE IF NOT EXISTS planning_quart_formulaires (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  planning_quart_id UUID        NOT NULL REFERENCES planning_quart(id) ON DELETE CASCADE,
  formulaire_id     UUID        NOT NULL REFERENCES formulaires_types(id) ON DELETE CASCADE,
  cree_le           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(planning_quart_id, formulaire_id)
);

CREATE INDEX IF NOT EXISTS idx_pqf_quart       ON planning_quart_formulaires(planning_quart_id);
CREATE INDEX IF NOT EXISTS idx_pqf_formulaire  ON planning_quart_formulaires(formulaire_id);
