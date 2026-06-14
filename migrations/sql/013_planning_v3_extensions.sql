-- Extensions planning maintenance v3.1
-- Mois/semaines 01-04, sync soumissions, agrégation ligne, suivi actions

ALTER TABLE planning_semaine
  ADD COLUMN IF NOT EXISTS mois INTEGER;

ALTER TABLE planning_semaine
  ADD COLUMN IF NOT EXISTS semaine_index INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'planning_semaine_semaine_index_check'
  ) THEN
    ALTER TABLE planning_semaine
      ADD CONSTRAINT planning_semaine_semaine_index_check
      CHECK (semaine_index IS NULL OR (semaine_index BETWEEN 1 AND 4));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_semaine_mois
  ON planning_semaine (ligne_id, annee, mois, semaine_index)
  WHERE mois IS NOT NULL AND semaine_index IS NOT NULL;

ALTER TABLE intervention_quart
  ADD COLUMN IF NOT EXISTS soumission_id UUID REFERENCES soumission(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS intervention_ligne (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  planning_quart_id         UUID NOT NULL UNIQUE REFERENCES planning_quart(id) ON DELETE CASCADE,
  ligne_id                  UUID NOT NULL REFERENCES ligne_production(id),
  duree_arret_agregee       DECIMAL(10,2) NOT NULL DEFAULT 0,
  temps_couverture          DECIMAL(10,2) NOT NULL DEFAULT 8.0,
  taux_disponibilite_calcule DECIMAL(5,2),
  taux_cible                DECIMAL(5,2) NOT NULL DEFAULT 90.0,
  cause_indisponibilite     VARCHAR(500),
  observations              TEXT,
  soumission_id             UUID REFERENCES soumission(id) ON DELETE SET NULL,
  cree_le                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modifie_le                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION calculer_taux_intervention_ligne()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.temps_couverture > 0 THEN
    NEW.taux_disponibilite_calcule :=
      ROUND(((NEW.temps_couverture - NEW.duree_arret_agregee) / NEW.temps_couverture * 100)::NUMERIC, 2);
  ELSE
    NEW.taux_disponibilite_calcule := 0;
  END IF;
  NEW.modifie_le := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_taux_ligne ON intervention_ligne;
CREATE TRIGGER trg_calc_taux_ligne
  BEFORE INSERT OR UPDATE ON intervention_ligne
  FOR EACH ROW EXECUTE FUNCTION calculer_taux_intervention_ligne();

CREATE TABLE IF NOT EXISTS suivi_equipement_action (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipement_id   UUID NOT NULL REFERENCES equipement(id) ON DELETE CASCADE,
  mois            DATE NOT NULL,
  difficulte      TEXT,
  action          TEXT,
  responsable     VARCHAR(200),
  delai           DATE,
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modifie_le      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (equipement_id, mois)
);

-- Formulaire maintenance corrective (sync planning)
INSERT INTO formulaire_type (code, titre, module, frequence)
VALUES (
  'PS-ME-MC-A',
  'Maintenance corrective — intervention quart',
  'MAINTENANCE',
  'AU_BESOIN'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO champ_definition (formulaire_type_id, nom_champ, type_champ, section, obligatoire, ordre, options_liste)
SELECT ft.id, v.nom, v.type::type_champ_enum, v.section, v.obligatoire, v.ordre,
       CASE WHEN v.options IS NULL THEN NULL ELSE v.options::jsonb END
FROM formulaire_type ft
CROSS JOIN (VALUES
  ('Date intervention', 'DATE', 'Contexte', TRUE, 1, NULL::text),
  ('Quart', 'LISTE', 'Contexte', TRUE, 2, '["Quart A (06h-14h)","Quart B (14h-22h)","Quart C (22h-06h)"]'),
  ('Ligne de production', 'LISTE', 'Contexte', TRUE, 3, '["L1","L2","L4"]'),
  ('Équipement', 'TEXTE', 'Intervention', TRUE, 4, NULL::text),
  ('Durée d''arrêt effectif (heures)', 'NOMBRE', 'Intervention', TRUE, 5, NULL::text),
  ('Cause d''indisponibilité', 'TEXTE', 'Intervention', TRUE, 6, NULL::text),
  ('Observations', 'TEXTE', 'Observations', FALSE, 7, NULL::text)
) AS v(nom, type, section, obligatoire, ordre, options)
WHERE ft.code = 'PS-ME-MC-A'
  AND NOT EXISTS (
    SELECT 1 FROM champ_definition cd
    WHERE cd.formulaire_type_id = ft.id AND cd.nom_champ = v.nom
  );

-- Vues dashboard enrichies (recréation complète)
DROP VIEW IF EXISTS v_maintenance_dashboard_mensuel CASCADE;
DROP VIEW IF EXISTS v_maintenance_equipement_suivi CASCADE;

CREATE VIEW v_maintenance_dashboard_mensuel AS
SELECT
  DATE_TRUNC('month', COALESCE(i.modifie_le, il.modifie_le))::DATE AS mois,
  pq.maintenancier_id,
  u.nom || ' ' || u.prenom AS maintenancier_nom,
  lp.code AS ligne_code,
  COUNT(DISTINCT COALESCE(i.id, il.id)) AS nb_interventions,
  COALESCE(SUM(i.duree_arret_effectif), SUM(il.duree_arret_agregee), 0) AS total_duree_arret,
  AVG(COALESCE(i.taux_disponibilite_calcule, il.taux_disponibilite_calcule)) AS avg_taux_disponibilite,
  MAX(COALESCE(i.taux_disponibilite_calcule, il.taux_disponibilite_calcule)) AS max_taux_disponibilite,
  MIN(COALESCE(i.taux_disponibilite_calcule, il.taux_disponibilite_calcule)) AS min_taux_disponibilite,
  STRING_AGG(DISTINCT COALESCE(i.cause_indisponibilite, il.cause_indisponibilite), ' | ') AS causes,
  STRING_AGG(DISTINCT COALESCE(i.observations, il.observations), ' | ') AS commentaires
FROM planning_quart pq
JOIN planning_jour pj ON pq.planning_jour_id = pj.id
JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
JOIN ligne_production lp ON ps.ligne_id = lp.id
JOIN utilisateur u ON pq.maintenancier_id = u.id
LEFT JOIN intervention_quart i ON i.planning_quart_id = pq.id
LEFT JOIN intervention_ligne il ON il.planning_quart_id = pq.id
WHERE i.id IS NOT NULL OR il.id IS NOT NULL
GROUP BY DATE_TRUNC('month', COALESCE(i.modifie_le, il.modifie_le)),
         pq.maintenancier_id, u.nom, u.prenom, lp.code;

CREATE VIEW v_maintenance_equipement_suivi AS
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
