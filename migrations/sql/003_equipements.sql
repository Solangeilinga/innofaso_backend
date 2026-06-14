CREATE TYPE etat_equipement AS ENUM (
  'OPERATIONNEL', 'EN_PANNE', 'EN_MAINTENANCE'
);

CREATE TABLE IF NOT EXISTS equipements (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  code_ref              VARCHAR(50)  NOT NULL UNIQUE,
  nom                   VARCHAR(200) NOT NULL,
  ligne_production      VARCHAR(100),
  localisation          VARCHAR(200),
  type_equipement       VARCHAR(100),
  etat                  etat_equipement NOT NULL DEFAULT 'OPERATIONNEL',
  date_installation     DATE,
  actif                 BOOLEAN      NOT NULL DEFAULT TRUE,
  prochaine_maintenance DATE,
  cree_le               TIMESTAMP    NOT NULL DEFAULT NOW(),
  modifie_le            TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipements_etat  ON equipements(etat);
CREATE INDEX IF NOT EXISTS idx_equipements_ligne ON equipements(ligne_production);
CREATE INDEX IF NOT EXISTS idx_equipements_actif ON equipements(actif);