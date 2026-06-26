-- ================================================================
-- MIGRATION 029 : Vue matérialisée ML pour prédiction de pannes
-- Objectif : Consolider toutes les données utiles au ML en une
--            seule vue, agrégée par (mois, équipement).
-- Refresh   : À planifier mensuellement (cron)
-- ================================================================

-- Supprimer l'ancienne version si elle existe
DROP MATERIALIZED VIEW IF EXISTS v_ml_maintenance_mensuel CASCADE;

-- ── Vue matérialisée ML ─────────────────────────────────────────
CREATE MATERIALIZED VIEW v_ml_maintenance_mensuel AS
WITH

-- 1. Données de base : équipements actifs
equip AS (
  SELECT
    e.id           AS equipement_id,
    e.nom          AS equipement_nom,
    e.code_ref     AS equipement_code,
    e.type_equipement,
    e.ligne_id,
    e.date_installation,
    lp.code        AS ligne_code
  FROM equipements e
  LEFT JOIN ligne_production lp ON e.ligne_id = lp.id
  WHERE e.actif = TRUE
),

-- 2. Interventions correctives (maintenance_corrective)
correctif AS (
  SELECT
    mc.equipement_id,
    DATE_TRUNC('month', COALESCE(mc.modifie_le, mc.cree_le))::DATE AS mois,
    COUNT(*)                                           AS nb_correctif,
    COALESCE(SUM(mc.duree_arret), 0)                   AS duree_arret_total,
    COALESCE(AVG(mc.duree_arret), 0)                   AS duree_arret_moyenne,
    COALESCE(SUM(mc.duree_maintenance), 0)             AS duree_maintenance_total,
    COALESCE(AVG(mc.duree_maintenance), 0)             AS duree_maintenance_moyenne,
    STRING_AGG(DISTINCT mc.cause, ' | ')               AS causes
  FROM maintenance_corrective mc
  WHERE mc.statut NOT IN ('annule', 'planifie')
  GROUP BY mc.equipement_id, DATE_TRUNC('month', COALESCE(mc.modifie_le, mc.cree_le))
),

-- 3. Signalements de pannes
signalements AS (
  SELECT
    sp.assigne_a_id,
    DATE_TRUNC('month', sp.date_panne)::DATE AS mois,
    COUNT(*) AS nb_signalements
  FROM signalements_pannes sp
  GROUP BY sp.assigne_a_id, DATE_TRUNC('month', sp.date_panne)
),

-- 4. Maintenance préventive planifiée
preventif AS (
  SELECT
    pm.equipement_id,
    DATE_TRUNC('month', pm.date_prevue)::DATE AS mois,
    COUNT(*)                                             AS nb_preventif_planifie,
    COUNT(*) FILTER (WHERE pm.date_realisee IS NOT NULL) AS nb_preventif_realise,
    COUNT(*) FILTER (WHERE pm.statut = 'EN_RETARD')      AS nb_preventif_en_retard
  FROM plannings_maintenance pm
  GROUP BY pm.equipement_id, DATE_TRUNC('month', pm.date_prevue)
),

-- 5. Interventions par quart (intervention_quart)
interv_quart AS (
  SELECT
    iq.equipement_id,
    DATE_TRUNC('month', iq.modifie_le)::DATE AS mois,
    COUNT(*)                                           AS nb_interv_quart,
    COALESCE(SUM(iq.duree_arret_effectif), 0)          AS duree_arret_quart,
    COALESCE(AVG(iq.taux_disponibilite_calcule), 100)  AS taux_disponibilite_moyen,
    STRING_AGG(DISTINCT iq.cause_indisponibilite, ' | ') AS causes_quart
  FROM intervention_quart iq
  GROUP BY iq.equipement_id, DATE_TRUNC('month', iq.modifie_le)
),

-- 6. Interventions par ligne (intervention_ligne)
interv_ligne AS (
  SELECT
    il.ligne_id,
    DATE_TRUNC('month', il.modifie_le)::DATE AS mois,
    COALESCE(SUM(il.duree_arret_agregee), 0)          AS duree_arret_ligne,
    COALESCE(AVG(il.taux_disponibilite_calcule), 100)  AS taux_dispo_ligne,
    STRING_AGG(DISTINCT il.cause_indisponibilite, ' | ') AS causes_ligne
  FROM intervention_ligne il
  GROUP BY il.ligne_id, DATE_TRUNC('month', il.modifie_le)
),

-- 7. Planning hebdomadaire (nombre de quarts planifiés par mois/ligne)
planning_quarts AS (
  SELECT
    ps.ligne_id,
    ps.annee,
    ps.mois,
    COUNT(DISTINCT pq.id) AS nb_quarts_planifies
  FROM planning_semaine ps
  JOIN planning_jour pj ON pj.planning_semaine_id = ps.id
  JOIN planning_quart pq ON pq.planning_jour_id = pj.id
  GROUP BY ps.ligne_id, ps.annee, ps.mois
),

-- 8. Stock de pièces de rechange par équipement
stock_pieces AS (
  SELECT
    pr.equipement_id,
    COUNT(*)                                          AS nb_pieces_reference,
    SUM(pr.quantite_stock)                            AS stock_total_pieces,
    COUNT(*) FILTER (WHERE pr.quantite_stock <= pr.seuil_alerte) AS nb_pieces_sous_seuil
  FROM pieces_rechange pr
  GROUP BY pr.equipement_id
)

-- ── Assemblage final ────────────────────────────────────────────
SELECT
  -- Identifiants
  e.equipement_id,
  e.equipement_nom,
  e.equipement_code,
  e.type_equipement,
  e.ligne_id,
  e.ligne_code,

  -- Période (toutes les combinaisons équipement × mois)
  mois_series.mois,
  EXTRACT(YEAR  FROM mois_series.mois)  AS annee,
  EXTRACT(MONTH FROM mois_series.mois)  AS mois_num,

  -- Âge de l'équipement au moment du mois
  EXTRACT(YEAR FROM age(mois_series.mois, e.date_installation)) +
  EXTRACT(MONTH FROM age(mois_series.mois, e.date_installation)) / 12.0 AS age_equipement_ans,

  -- Correctif
  COALESCE(c.nb_correctif, 0)              AS nb_correctif,
  COALESCE(c.duree_arret_total, 0)         AS duree_arret_total_h,
  COALESCE(c.duree_arret_moyenne, 0)       AS duree_arret_moyenne_h,
  COALESCE(c.duree_maintenance_total, 0)   AS duree_maintenance_total_h,
  COALESCE(c.duree_maintenance_moyenne, 0) AS duree_maintenance_moyenne_h,

  -- Preventif
  COALESCE(p.nb_preventif_planifie, 0)     AS nb_preventif_planifie,
  COALESCE(p.nb_preventif_realise, 0)      AS nb_preventif_realise,
  COALESCE(p.nb_preventif_en_retard, 0)    AS nb_preventif_en_retard,

  -- Taux de respect du planning préventif
  CASE
    WHEN COALESCE(p.nb_preventif_planifie, 0) > 0
    THEN ROUND(COALESCE(p.nb_preventif_realise, 0)::NUMERIC / p.nb_preventif_planifie * 100, 1)
    ELSE NULL
  END AS taux_respect_preventif_pct,

  -- Disponibilité / Arrêts
  COALESCE(iq.nb_interv_quart, 0)          AS nb_interv_quart,
  COALESCE(iq.duree_arret_quart, 0)        AS duree_arret_quart_h,
  COALESCE(iq.taux_disponibilite_moyen, 100) AS taux_disponibilite_moyen,
  COALESCE(il.duree_arret_ligne, 0)        AS duree_arret_ligne_h,
  COALESCE(il.taux_dispo_ligne, 100)       AS taux_dispo_ligne,

  -- Quarts planifiés
  COALESCE(pq.nb_quarts_planifies, 0)      AS nb_quarts_planifies,

  -- Stock
  COALESCE(s.nb_pieces_reference, 0)       AS nb_pieces_reference,
  COALESCE(s.stock_total_pieces, 0)        AS stock_total_pieces,
  COALESCE(s.nb_pieces_sous_seuil, 0)      AS nb_pieces_sous_seuil,

  -- Causes textuelles (pour NLP)
  COALESCE(c.causes, '')                   AS causes_correctif,
  COALESCE(iq.causes_quart, '')            AS causes_quart,

  -- Métadonnées
  NOW()                                     AS refreshed_at

FROM equip e

-- Générer une série de mois pour chaque équipement (depuis 2020 jusqu'au mois prochain)
CROSS JOIN LATERAL (
  SELECT generate_series(
    '2020-01-01'::DATE,
    DATE_TRUNC('month', NOW() + INTERVAL '1 month')::DATE,
    '1 month'::INTERVAL
  )::DATE AS mois
) mois_series

LEFT JOIN correctif c
  ON c.equipement_id = e.equipement_id
 AND c.mois = mois_series.mois

LEFT JOIN preventif p
  ON p.equipement_id = e.equipement_id
 AND p.mois = mois_series.mois

LEFT JOIN interv_quart iq
  ON iq.equipement_id = e.equipement_id
 AND iq.mois = mois_series.mois

LEFT JOIN interv_ligne il
  ON il.ligne_id = e.ligne_id
 AND il.mois = mois_series.mois

LEFT JOIN planning_quarts pq
  ON pq.ligne_id = e.ligne_id
 AND pq.annee = EXTRACT(YEAR  FROM mois_series.mois)
 AND pq.mois   = EXTRACT(MONTH FROM mois_series.mois)

LEFT JOIN stock_pieces s
  ON s.equipement_id = e.equipement_id

ORDER BY e.equipement_nom, mois_series.mois;

-- ── Index pour accélérer les requêtes ML ────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_v_ml_equipement_mois
  ON v_ml_maintenance_mensuel (equipement_id, mois);

CREATE INDEX IF NOT EXISTS idx_v_ml_mois
  ON v_ml_maintenance_mensuel (mois DESC);

CREATE INDEX IF NOT EXISTS idx_v_ml_ligne
  ON v_ml_maintenance_mensuel (ligne_id);

CREATE INDEX IF NOT EXISTS idx_v_ml_type
  ON v_ml_maintenance_mensuel (type_equipement);

-- ── Commentaire ────────────────────────────────────────────────
COMMENT ON MATERIALIZED VIEW v_ml_maintenance_mensuel IS
  'Vue matérialisée ML : données consolidées par (équipement, mois) pour la prédiction de pannes. Rafraîchir mensuellement.';

-- ── Fonction de refresh (appelable depuis le cron) ──────────────
CREATE OR REPLACE FUNCTION refresh_v_ml_maintenance()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_ml_maintenance_mensuel;
END;
$$ LANGUAGE plpgsql;
