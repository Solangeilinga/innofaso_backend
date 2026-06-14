-- ================================================================
-- MIGRATION: Planification maintenance complète - v3.0
-- Date: 2026-06-03
-- Objectif: Enrichir le système de planning avec gestion des quarts,
--           lignes de production, et données complètes de maintenance
-- ================================================================

-- ── 1. TABLE LIGNE_PRODUCTION ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ligne_production (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(20) NOT NULL UNIQUE,
  nom         VARCHAR(100) NOT NULL,
  description TEXT,
  actif       BOOLEAN NOT NULL DEFAULT TRUE,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ligne_production (code, nom) VALUES
  ('L1', 'Ligne de production 1'),
  ('L2', 'Ligne de production 2'),
  ('L4', 'Ligne de production 4')
ON CONFLICT (code) DO NOTHING;

-- ── 2. AJOUTER ligne_id À EQUIPEMENT ───────────────────────────
ALTER TABLE equipement 
ADD COLUMN IF NOT EXISTS ligne_id UUID REFERENCES ligne_production(id);

-- Mettre à jour les équipements existants avec ligne_production VARCHAR
UPDATE equipement e
SET ligne_id = lp.id
FROM ligne_production lp
WHERE e.ligne_production IS NOT NULL 
  AND e.ligne_production ILIKE lp.code
  AND e.ligne_id IS NULL;

-- ── 3. TABLE QUART_MAINTENANCE ────────────────────────────────
CREATE TABLE IF NOT EXISTS quart_maintenance (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom       VARCHAR(50) NOT NULL,
  heure_debut INTEGER NOT NULL,
  heure_fin   INTEGER NOT NULL,
  description VARCHAR(100),
  CONSTRAINT quart_valide CHECK (heure_debut >= 0 AND heure_fin <= 24)
);

INSERT INTO quart_maintenance (nom, heure_debut, heure_fin, description) VALUES
  ('Quart A', 6, 14, 'Matin: 06h - 14h'),
  ('Quart B', 14, 22, 'Après-midi: 14h - 22h'),
  ('Quart C', 22, 6, 'Nuit: 22h - 06h (lendemain)')
ON CONFLICT DO NOTHING;

-- ── 4. TABLE PLANNING_SEMAINE ─────────────────────────────────
-- Une semaine de planning par entrée (plutôt que par jour)
CREATE TABLE IF NOT EXISTS planning_semaine (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ligne_id             UUID NOT NULL REFERENCES ligne_production(id),
  date_debut_semaine   DATE NOT NULL,
  date_fin_semaine     DATE NOT NULL,
  semaine_num          INTEGER NOT NULL,
  annee                INTEGER NOT NULL,
  admin_id             UUID NOT NULL REFERENCES utilisateur(id),
  statut               VARCHAR(50) NOT NULL DEFAULT 'BROUILLON',
  notes                TEXT,
  cree_le              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modifie_le           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ligne_id, annee, semaine_num)
);

CREATE INDEX IF NOT EXISTS idx_planning_semaine_ligne ON planning_semaine(ligne_id);
CREATE INDEX IF NOT EXISTS idx_planning_semaine_dates ON planning_semaine(date_debut_semaine, date_fin_semaine);

-- ── 5. TABLE PLANNING_JOUR ───────────────────────────────────
-- Jour spécifique dans une semaine
CREATE TABLE IF NOT EXISTS planning_jour (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  planning_semaine_id UUID NOT NULL REFERENCES planning_semaine(id) ON DELETE CASCADE,
  date_jour          DATE NOT NULL,
  jour_semaine       VARCHAR(20) NOT NULL,
  cree_le            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planning_jour_semaine ON planning_jour(planning_semaine_id);
CREATE INDEX IF NOT EXISTS idx_planning_jour_date ON planning_jour(date_jour);

-- ── 6. TABLE PLANNING_QUART ──────────────────────────────────
-- Quart spécifique d'un jour avec maintenanciers assignés
CREATE TABLE IF NOT EXISTS planning_quart (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  planning_jour_id   UUID NOT NULL REFERENCES planning_jour(id) ON DELETE CASCADE,
  quart_id           UUID NOT NULL REFERENCES quart_maintenance(id),
  maintenancier_id   UUID NOT NULL REFERENCES utilisateur(id),
  co_maintenancier_id UUID REFERENCES utilisateur(id),
  cree_le            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(planning_jour_id, quart_id)
);

CREATE INDEX IF NOT EXISTS idx_planning_quart_jour ON planning_quart(planning_jour_id);
CREATE INDEX IF NOT EXISTS idx_planning_quart_maintenancier ON planning_quart(maintenancier_id);

-- ── 7. TABLE INTERVENTION_QUART ──────────────────────────────
-- Les données de maintenance corrective saisies pour un quart
CREATE TABLE IF NOT EXISTS intervention_quart (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  planning_quart_id  UUID NOT NULL REFERENCES planning_quart(id) ON DELETE CASCADE,
  equipement_id      UUID NOT NULL REFERENCES equipement(id),
  duree_arret_effectif DECIMAL(10,2) NOT NULL DEFAULT 0,
  cause_indisponibilite VARCHAR(500),
  observations       TEXT,
  temps_couverture   DECIMAL(10,2) NOT NULL DEFAULT 8.0,
  taux_disponibilite_calcule DECIMAL(5,2),
  taux_cible         DECIMAL(5,2) NOT NULL DEFAULT 90.0,
  statut             VARCHAR(50) NOT NULL DEFAULT 'EN_ATTENTE',
  cree_le            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modifie_le         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intervention_quart_quart ON intervention_quart(planning_quart_id);
CREATE INDEX IF NOT EXISTS idx_intervention_quart_equipement ON intervention_quart(equipement_id);

-- TRIGGER: Calculer le taux de disponibilité
CREATE OR REPLACE FUNCTION calculer_taux_disponibilite()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.temps_couverture > 0 THEN
    NEW.taux_disponibilite_calcule := 
      ROUND(((NEW.temps_couverture - NEW.duree_arret_effectif) / NEW.temps_couverture * 100)::NUMERIC, 2);
  ELSE
    NEW.taux_disponibilite_calcule := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_taux_disponibilite ON intervention_quart;
CREATE TRIGGER trg_calc_taux_disponibilite
  BEFORE INSERT OR UPDATE ON intervention_quart
  FOR EACH ROW EXECUTE FUNCTION calculer_taux_disponibilite();

-- ── 8. ENRICHIR planning_maintenance (table existante) ────────
ALTER TABLE planning_maintenance
ADD COLUMN IF NOT EXISTS ligne_id UUID REFERENCES ligne_production(id),
ADD COLUMN IF NOT EXISTS quart_id UUID REFERENCES quart_maintenance(id),
ADD COLUMN IF NOT EXISTS co_maintenancier_id UUID REFERENCES utilisateur(id),
ADD COLUMN IF NOT EXISTS duree_arret DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS cause_indisponibilite VARCHAR(500),
ADD COLUMN IF NOT EXISTS observations TEXT,
ADD COLUMN IF NOT EXISTS temps_couverture DECIMAL(10,2) DEFAULT 8.0,
ADD COLUMN IF NOT EXISTS taux_disponibilite DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS taux_cible DECIMAL(5,2) DEFAULT 90.0,
ADD COLUMN IF NOT EXISTS source_soumission_id UUID REFERENCES soumission(id);

CREATE INDEX IF NOT EXISTS idx_planning_ligne ON planning_maintenance(ligne_id);
CREATE INDEX IF NOT EXISTS idx_planning_quart ON planning_maintenance(quart_id);

-- ── 9. VUE: Dashboard maintenance par mois ─────────────────────
CREATE OR REPLACE VIEW v_maintenance_dashboard_mensuel AS
SELECT 
  DATE_TRUNC('month', i.modifie_le)::DATE AS mois,
  pq.maintenancier_id,
  u.nom || ' ' || u.prenom AS maintenancier_nom,
  e.id AS equipement_id,
  e.nom AS equipement_nom,
  e.code_ref AS equipement_code,
  lp.code AS ligne_code,
  COUNT(*) AS nb_interventions,
  SUM(i.duree_arret_effectif) AS total_duree_arret,
  AVG(i.taux_disponibilite_calcule) AS avg_taux_disponibilite,
  MAX(i.taux_disponibilite_calcule) AS max_taux_disponibilite,
  MIN(i.taux_disponibilite_calcule) AS min_taux_disponibilite,
  STRING_AGG(DISTINCT i.cause_indisponibilite, ' | ') AS causes
FROM intervention_quart i
JOIN planning_quart pq ON i.planning_quart_id = pq.id
JOIN utilisateur u ON pq.maintenancier_id = u.id
JOIN equipement e ON i.equipement_id = e.id
LEFT JOIN ligne_production lp ON e.ligne_id = lp.id
GROUP BY DATE_TRUNC('month', i.modifie_le), pq.maintenancier_id, u.nom, u.prenom,
         e.id, e.nom, e.code_ref, lp.code;

-- ── 10. VUE: Suivi maintenance par équipement ──────────────────
CREATE OR REPLACE VIEW v_maintenance_equipement_suivi AS
SELECT 
  DATE_TRUNC('month', i.modifie_le)::DATE AS mois_annee,
  e.id AS equipement_id,
  e.nom AS equipement_nom,
  e.code_ref AS equipement_code,
  lp.code AS ligne_code,
  SUM(i.duree_arret_effectif) AS total_maintenance_corrective,
  COUNT(*) AS nb_interventions,
  AVG(i.taux_disponibilite_calcule) AS avg_disponibilite,
  STRING_AGG(DISTINCT i.observations, ' | ') AS remarques
FROM intervention_quart i
JOIN equipement e ON i.equipement_id = e.id
LEFT JOIN ligne_production lp ON e.ligne_id = lp.id
GROUP BY DATE_TRUNC('month', i.modifie_le), e.id, e.nom, e.code_ref, lp.code;

-- ── 11. Ajouter commentaires ─────────────────────────────────
COMMENT ON TABLE planning_semaine IS 'Planning hebdomadaire par ligne de production';
COMMENT ON TABLE planning_jour IS 'Jours individuels dans une semaine';
COMMENT ON TABLE planning_quart IS 'Quarts de travail assignés avec maintenanciers';
COMMENT ON TABLE intervention_quart IS 'Interventions de maintenance corrective effectuées durant un quart';
COMMENT ON COLUMN intervention_quart.taux_disponibilite_calcule IS 'Calculé automatiquement: ((temps_couverture - duree_arret) / temps_couverture) * 100';

-- ── 12. AUDIT ──────────────────────────────────────────────────
-- Les modifications de planning et interventions seront tracées par les triggers d'audit existants
