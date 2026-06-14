-- ─── Migration 010: soft delete + améliorations ─────────────────────────

BEGIN;

-- 1. Soft delete sur formulaires_types (colonne actif existait déjà)
-- S'assurer que la colonne modifie_le existe
ALTER TABLE formulaires_types
    ADD COLUMN IF NOT EXISTS modifie_le TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Soft delete sur champs_definitions
ALTER TABLE champs_definitions
    ADD COLUMN IF NOT EXISTS actif       BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS modifie_le  TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS placeholder VARCHAR(200),
    ADD COLUMN IF NOT EXISTS aide        TEXT,
    ADD COLUMN IF NOT EXISTS valeur_min  NUMERIC,
    ADD COLUMN IF NOT EXISTS valeur_max  NUMERIC;

-- 3. Statuts étendus sur soumissions (VALIDE / REJETE)
ALTER TABLE soumissions
    DROP CONSTRAINT IF EXISTS soumissions_statut_check;
ALTER TABLE soumissions
    ADD CONSTRAINT soumissions_statut_check
    CHECK (statut IN ('BROUILLON', 'SOUMIS', 'VALIDE', 'REJETE'));

-- 4. Soft delete sur pieces_rechange
ALTER TABLE pieces_rechange
    ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT TRUE;

-- 5. Soft delete sur equipements (si pas déjà fait)
ALTER TABLE equipements
    ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT TRUE;

-- 6. Index sur actif pour performances
CREATE INDEX IF NOT EXISTS idx_champs_def_actif        ON champs_definitions(actif);
CREATE INDEX IF NOT EXISTS idx_formulaires_actif       ON formulaires_types(actif);
CREATE INDEX IF NOT EXISTS idx_soumissions_statut      ON soumissions(statut);
CREATE INDEX IF NOT EXISTS idx_soumissions_date        ON soumissions(date_soumission DESC);

COMMIT;
