CREATE TYPE statut_soumission AS ENUM ('BROUILLON', 'SOUMIS');
CREATE TYPE source_soumission  AS ENUM ('EN_LIGNE', 'HORS_LIGNE');

-- ================================================================
-- SOUMISSION  — une saisie terrain complète
-- ================================================================
CREATE TABLE IF NOT EXISTS soumissions (
  id                  UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  formulaire_type_id  UUID      NOT NULL REFERENCES formulaires_types(id),
  utilisateur_id      UUID      NOT NULL REFERENCES utilisateurs(id),
  equipement_id       UUID      REFERENCES equipements(id),          -- nullable
  statut              statut_soumission NOT NULL DEFAULT 'BROUILLON',
  date_soumission     TIMESTAMP NOT NULL DEFAULT NOW(),
  date_modification   TIMESTAMP,
  source              source_soumission NOT NULL DEFAULT 'EN_LIGNE',
  id_local            UUID,           -- ID généré côté client en mode offline
  cree_localement_le  TIMESTAMP,      -- Timestamp de création offline
  synchronise_le      TIMESTAMP       -- Timestamp de sync avec le serveur
);

CREATE INDEX IF NOT EXISTS idx_soum_formulaire   ON soumissions(formulaire_type_id);
CREATE INDEX IF NOT EXISTS idx_soum_utilisateur  ON soumissions(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_soum_equipement   ON soumissions(equipement_id);
CREATE INDEX IF NOT EXISTS idx_soum_date         ON soumissions(date_soumission DESC);
CREATE INDEX IF NOT EXISTS idx_soum_statut       ON soumissions(statut);
CREATE INDEX IF NOT EXISTS idx_soum_id_local     ON soumissions(id_local);

-- ================================================================
-- ENTETE  — 1 entête par soumission (émetteur, vérificateur, approbateur)
-- ================================================================
CREATE TABLE IF NOT EXISTS entetes (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  soumission_id          UUID NOT NULL UNIQUE REFERENCES soumissions(id) ON DELETE CASCADE,
  emetteur_nom           VARCHAR(200),
  emetteur_fonction      VARCHAR(200),
  emetteur_date          DATE,
  emetteur_signature     TEXT,
  verificateur_nom       VARCHAR(200),
  verificateur_fonction  VARCHAR(200),
  verificateur_date      DATE,
  verificateur_signature TEXT,
  approbateur_nom        VARCHAR(200),
  approbateur_fonction   VARCHAR(200),
  approbateur_date       DATE,
  approbateur_signature  TEXT
);

-- ================================================================
-- VALEUR_SAISIE  — valeur de chaque champ pour une soumission
-- ================================================================
CREATE TABLE IF NOT EXISTS valeurs_saisies (
  id              UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  soumission_id   UUID    NOT NULL REFERENCES soumissions(id) ON DELETE CASCADE,
  champ_def_id    UUID    NOT NULL REFERENCES champs_definitions(id),
  valeur_texte    TEXT,
  valeur_nombre   DECIMAL(15,4),
  valeur_date     TIMESTAMP,
  valeur_booleen  BOOLEAN,
  valeur_json     JSONB,              -- LISTE, SIGNATURE, PHOTO
  est_conforme    BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_vs_soumission ON valeurs_saisies(soumission_id);
CREATE INDEX IF NOT EXISTS idx_vs_champ      ON valeurs_saisies(champ_def_id);

-- ================================================================
-- PIECE_JOINTE  — photos ou fichiers attachés à une soumission
-- ================================================================
CREATE TABLE IF NOT EXISTS pieces_jointes (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  soumission_id  UUID          NOT NULL REFERENCES soumissions(id) ON DELETE CASCADE,
  nom_fichier    VARCHAR(500)  NOT NULL,
  url_stockage   VARCHAR(1000) NOT NULL,
  type_mime      VARCHAR(100),
  date_upload    TIMESTAMP     NOT NULL DEFAULT NOW()
);