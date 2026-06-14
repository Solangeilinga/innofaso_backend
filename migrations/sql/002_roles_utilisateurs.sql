-- ================================================================
-- ROLES
-- ================================================================
CREATE TABLE IF NOT EXISTS roles (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom         VARCHAR(50) NOT NULL UNIQUE,
  description TEXT
);

-- ================================================================
-- UTILISATEURS
-- ================================================================
CREATE TABLE IF NOT EXISTS utilisateurs (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id             UUID         NOT NULL REFERENCES roles(id),
  nom                 VARCHAR(100) NOT NULL,
  prenom              VARCHAR(100) NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,
  mot_de_passe        TEXT         NOT NULL,           -- Haché bcrypt, jamais en clair
  actif               BOOLEAN      NOT NULL DEFAULT TRUE,
  derniere_connexion  TIMESTAMP,
  token_reset         VARCHAR(255),
  token_reset_expire  TIMESTAMP,
  cree_le             TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_utilisateurs_email  ON utilisateurs(email);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_role   ON utilisateurs(role_id);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_actif  ON utilisateurs(actif);