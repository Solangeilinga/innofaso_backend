-- 004_formulaires.sql (version améliorée)
CREATE TYPE type_champ AS ENUM (
  'TEXTE', 'NOMBRE', 'DATE', 'HEURE',
  'BOOLEEN', 'LISTE', 'SIGNATURE', 'CALCULE', 'PHOTO'
);

-- ================================================================
-- FORMULAIRE_TYPE — définition statique de chaque formulaire
-- ================================================================
CREATE TABLE IF NOT EXISTS formulaires_types (
  id          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(60)  NOT NULL UNIQUE,
  titre       VARCHAR(300) NOT NULL,
  module      module_formulaire    NOT NULL,
  frequence   frequence_formulaire NOT NULL,
  description TEXT,
  version     INTEGER     NOT NULL DEFAULT 1,
  actif       BOOLEAN     NOT NULL DEFAULT TRUE,
  cree_le     TIMESTAMP   NOT NULL DEFAULT NOW(),
  modifie_le  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ft_module    ON formulaires_types(module);
CREATE INDEX IF NOT EXISTS idx_ft_frequence ON formulaires_types(frequence);
CREATE INDEX IF NOT EXISTS idx_ft_code      ON formulaires_types(code);

-- ================================================================
-- CHAMP_DEFINITION — champs de chaque formulaire
-- ================================================================
CREATE TABLE IF NOT EXISTS champs_definitions (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  formulaire_type_id  UUID         NOT NULL REFERENCES formulaires_types(id) ON DELETE CASCADE,
  champ_source_id     UUID         REFERENCES champs_definitions(id) ON DELETE SET NULL,
  
  -- Identification du champ
  nom_champ           VARCHAR(300) NOT NULL,
  label               VARCHAR(300) NOT NULL,
  type_champ          type_champ   NOT NULL,
  
  -- Organisation
  section             VARCHAR(200),
  ordre               INTEGER      NOT NULL DEFAULT 0,
  taille_colonne      INTEGER      DEFAULT 12,  -- 1-12 pour grid responsive
  
  -- Validation
  obligatoire         BOOLEAN      NOT NULL DEFAULT FALSE,
  validation_regex    VARCHAR(500),
  valeur_min          DECIMAL(15,4),
  valeur_max          DECIMAL(15,4),
  longueur_max        INTEGER,
  
  -- Affichage
  placeholder         VARCHAR(200),
  aide                TEXT,
  unite               VARCHAR(50),
  options_liste       JSONB,  -- Pour LISTE: [{"value":"opt1","label":"Option 1"},...]
  
  -- Pour les champs calculés
  formule             TEXT,
  dependances         JSONB,  -- ["champ_1", "champ_2"] pour recalcul automatique
  
  -- Conditions d'affichage
  condition_affichage JSONB,  -- {"champ": "type_panne", "operateur": "eq", "valeur": "CRITIQUE"}
  
  -- Métadonnées
  est_visible         BOOLEAN  NOT NULL DEFAULT TRUE,
  est_modifiable      BOOLEAN  NOT NULL DEFAULT TRUE,
  version             INTEGER  NOT NULL DEFAULT 1,
  cree_le             TIMESTAMP NOT NULL DEFAULT NOW(),
  modifie_le          TIMESTAMP,
  
  -- Contrainte d'unicité sur l'ordre par formulaire
  UNIQUE(formulaire_type_id, ordre)
);

CREATE INDEX IF NOT EXISTS idx_cd_formulaire ON champs_definitions(formulaire_type_id);
CREATE INDEX IF NOT EXISTS idx_cd_ordre      ON champs_definitions(formulaire_type_id, ordre);
CREATE INDEX IF NOT EXISTS idx_cd_type       ON champs_definitions(type_champ);