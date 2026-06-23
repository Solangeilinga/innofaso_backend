DO $$ BEGIN
  CREATE TYPE etape_processus AS ENUM ('PLANIFICATION', 'EXECUTION', 'VERIFICATION', 'VALIDATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE statut_etape AS ENUM ('EN_ATTENTE', 'EN_COURS', 'TERMINEE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS processus_taches (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  formulaire_id         UUID NOT NULL REFERENCES formulaires_types(id),
  planning_quart_id     UUID REFERENCES planning_quart(id),
  planning_quart_formulaire_id UUID REFERENCES planning_quart_formulaires(id),

  planificateur_id      UUID REFERENCES utilisateurs(id),
  executeur_id          UUID NOT NULL REFERENCES utilisateurs(id),
  verificateur_id       UUID NOT NULL REFERENCES utilisateurs(id),
  validateur_id         UUID NOT NULL REFERENCES utilisateurs(id),

  statut_planification  statut_etape NOT NULL DEFAULT 'TERMINEE',
  statut_execution      statut_etape NOT NULL DEFAULT 'EN_ATTENTE',
  statut_verification   statut_etape NOT NULL DEFAULT 'EN_ATTENTE',
  statut_validation     statut_etape NOT NULL DEFAULT 'EN_ATTENTE',

  etape_courante        etape_processus NOT NULL DEFAULT 'EXECUTION',

  soumission_id         UUID REFERENCES soumissions(id),

  commentaire_verification TEXT,
  commentaire_validation TEXT,

  cree_le               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modifie_le            TIMESTAMPTZ,
  termine_le            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pt_executeur      ON processus_taches(executeur_id);
CREATE INDEX IF NOT EXISTS idx_pt_verificateur    ON processus_taches(verificateur_id);
CREATE INDEX IF NOT EXISTS idx_pt_validateur      ON processus_taches(validateur_id);
CREATE INDEX IF NOT EXISTS idx_pt_etape           ON processus_taches(etape_courante);
CREATE INDEX IF NOT EXISTS idx_pt_formulaire      ON processus_taches(formulaire_id);
CREATE INDEX IF NOT EXISTS idx_pt_soumission      ON processus_taches(soumission_id);
