BEGIN;

-- ── Matières premières ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matieres_premieres (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference        VARCHAR(100) NOT NULL UNIQUE,
  designation      VARCHAR(300) NOT NULL,
  categorie        VARCHAR(100),               -- ex: Sucre, Huile, Emballage…
  fournisseur      VARCHAR(200),
  unite            VARCHAR(50)  NOT NULL DEFAULT 'kg',
  quantite_stock   NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantite_stock >= 0),
  seuil_alerte     NUMERIC(12,3) NOT NULL DEFAULT 50,
  prix_unitaire    NUMERIC(10,2),              -- optionnel pour valorisation stock
  emplacement      VARCHAR(200),               -- ex: Entrepôt A, Zone 2
  actif            BOOLEAN      NOT NULL DEFAULT TRUE,
  cree_le          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  modifie_le       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TYPE type_mouvement_mp AS ENUM ('ENTREE', 'SORTIE', 'AJUSTEMENT');

CREATE TABLE IF NOT EXISTS mouvements_matieres (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  matiere_id       UUID         NOT NULL REFERENCES matieres_premieres(id),
  utilisateur_id   UUID         NOT NULL REFERENCES utilisateurs(id),
  type_mouvement   type_mouvement_mp NOT NULL,
  quantite         NUMERIC(12,3) NOT NULL CHECK (quantite > 0),
  date_mouvement   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  motif            TEXT,
  bon_livraison    VARCHAR(100),               -- N° BL pour les entrées
  lot              VARCHAR(100)                -- N° lot pour traçabilité
);

CREATE INDEX IF NOT EXISTS idx_mouv_mp_matiere ON mouvements_matieres(matiere_id);
CREATE INDEX IF NOT EXISTS idx_mouv_mp_date    ON mouvements_matieres(date_mouvement DESC);
CREATE INDEX IF NOT EXISTS idx_mp_actif        ON matieres_premieres(actif);
CREATE INDEX IF NOT EXISTS idx_mp_categorie    ON matieres_premieres(categorie);

-- ── Étendre le type_alerte pour inclure STOCK_MP_BAS ────────────────
ALTER TYPE type_alerte ADD VALUE IF NOT EXISTS 'STOCK_MP_BAS';

-- ── Soft delete sur pieces_rechange si pas encore fait ──────────────
ALTER TABLE pieces_rechange
    ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
-- Ajouter le type NOUVELLE_SOUMISSION à l'enum
ALTER TYPE type_alerte ADD VALUE IF NOT EXISTS 'NOUVELLE_SOUMISSION';
