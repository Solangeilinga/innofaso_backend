CREATE TABLE IF NOT EXISTS pieces_rechange (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipement_id   UUID         NOT NULL REFERENCES equipements(id),
  reference       VARCHAR(100) NOT NULL,
  designation     VARCHAR(300) NOT NULL,
  quantite_stock  INTEGER      NOT NULL DEFAULT 0 CHECK (quantite_stock >= 0),
  seuil_alerte    INTEGER      NOT NULL DEFAULT 5,
  unite           VARCHAR(50)  NOT NULL DEFAULT 'pièce',
  cree_le         TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TYPE type_mouvement AS ENUM ('ENTREE', 'SORTIE');

CREATE TABLE IF NOT EXISTS mouvements_stock (
  id              UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  piece_id        UUID      NOT NULL REFERENCES pieces_rechange(id),
  utilisateur_id  UUID      NOT NULL REFERENCES utilisateurs(id),
  type_mouvement  type_mouvement NOT NULL,
  quantite        INTEGER   NOT NULL CHECK (quantite > 0),
  date_mouvement  TIMESTAMP NOT NULL DEFAULT NOW(),
  motif           TEXT
);

CREATE INDEX IF NOT EXISTS idx_mouv_piece ON mouvements_stock(piece_id);
CREATE INDEX IF NOT EXISTS idx_mouv_date  ON mouvements_stock(date_mouvement DESC);