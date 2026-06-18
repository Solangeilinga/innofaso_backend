-- ================================================================
-- Migration 015 : Gestion des sections de formulaires
-- ================================================================

-- 1. Création de la table formulaire_sections
CREATE TABLE IF NOT EXISTS formulaire_sections (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    formulaire_type_id  UUID         NOT NULL REFERENCES formulaires_types(id) ON DELETE CASCADE,
    titre               VARCHAR(200) NOT NULL,
    ordre               INTEGER      NOT NULL DEFAULT 0,
    description         TEXT,
    actif               BOOLEAN      NOT NULL DEFAULT TRUE,
    cree_le             TIMESTAMP    NOT NULL DEFAULT NOW(),
    modifie_le          TIMESTAMP,
    UNIQUE(formulaire_type_id, ordre)
);

CREATE INDEX IF NOT EXISTS idx_fs_formulaire ON formulaire_sections(formulaire_type_id);
CREATE INDEX IF NOT EXISTS idx_fs_ordre      ON formulaire_sections(formulaire_type_id, ordre);

-- 2. Ajout de la colonne section_id dans champs_definitions
ALTER TABLE champs_definitions ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES formulaire_sections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cd_section_id ON champs_definitions(section_id);

-- 3. Migration des sections existantes
INSERT INTO formulaire_sections (formulaire_type_id, titre, ordre)
SELECT DISTINCT
    cd.formulaire_type_id,
    cd.section,
    ROW_NUMBER() OVER (PARTITION BY cd.formulaire_type_id ORDER BY MIN(cd.ordre)) AS ordre_calc
FROM champs_definitions cd
WHERE cd.section IS NOT NULL AND cd.section != ''
  AND cd.actif = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM formulaire_sections fs
      WHERE fs.formulaire_type_id = cd.formulaire_type_id
        AND fs.titre = cd.section
  )
GROUP BY cd.formulaire_type_id, cd.section;

-- 4. Lier les champs existants à leur section
UPDATE champs_definitions cd
SET section_id = fs.id
FROM formulaire_sections fs
WHERE fs.formulaire_type_id = cd.formulaire_type_id
  AND fs.titre = cd.section
  AND cd.section_id IS NULL;

-- ================================================================
-- Fin migration 015
-- ================================================================
