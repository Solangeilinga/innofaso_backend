-- ================================================================
-- Migration 014 : Champs des formulaires (Maintenance & Production)
-- ================================================================

DROP FUNCTION IF EXISTS _inserer_champs;
DROP TYPE IF EXISTS _champ_insert;

-- ================================================================
-- Helper function : insérer un champ pour un formulaire
-- ================================================================
CREATE OR REPLACE FUNCTION _inserer_champ(
  p_code VARCHAR, p_nom VARCHAR, p_label VARCHAR, p_type VARCHAR,
  p_section VARCHAR, p_ordre INT, p_oblig BOOLEAN, p_options JSONB,
  p_unite VARCHAR, p_placeholder VARCHAR
) RETURNS void AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM formulaires_types WHERE code = p_code;
  IF v_id IS NULL THEN
    RAISE WARNING 'Formulaire % non trouvé', p_code;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM champs_definitions WHERE formulaire_type_id = v_id AND ordre = p_ordre) THEN
    INSERT INTO champs_definitions (formulaire_type_id, nom_champ, label, type_champ, section, ordre, obligatoire, options_liste, unite, placeholder)
    VALUES (v_id, p_nom, p_label, p_type::type_champ, p_section, p_ordre, p_oblig, p_options, p_unite, p_placeholder);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 1. PS-ME-EN-CAQ-A — Enregistrement quotidien compresseur d'air
-- ================================================================
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'date', 'Date', 'DATE', 'Général', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'quart', 'Quart', 'LISTE', 'Général', 2, TRUE, '[{"value":"QUART_A","label":"Quart A (06h-14h)"},{"value":"QUART_B","label":"Quart B (14h-22h)"},{"value":"QUART_C","label":"Quart C (22h-06h)"}]', NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'etat_equipement', 'Etat equipement', 'LISTE', 'Général', 3, TRUE, '[{"value":"NORMAL","label":"Normal"},{"value":"ANORMAL","label":"Anormal"}]', NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'niveau_huile', 'Niveau d huile', 'TEXTE', 'Général', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'filtre_air', 'Filtre a air', 'LISTE', 'Général', 5, FALSE, '[{"value":"BON","label":"Bon"},{"value":"A_REMPLACER","label":"A remplacer"}]', NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'etat_condensateur', 'Etat condensateur', 'TEXTE', 'Général', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'pression', 'Pression compresseur', 'NOMBRE', 'Général', 7, FALSE, NULL, 'bar', NULL);
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'etat_general', 'Etat general', 'TEXTE', 'Général', 8, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'observations', 'Observations', 'TEXTE', 'Général', 9, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAQ-A', 'signature', 'Signature operateur', 'SIGNATURE', 'Général', 10, TRUE, NULL, NULL, NULL);

-- ================================================================
-- 2. PS-ME-EN-FDV-A — Fiche de vie des equipements
-- ================================================================
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'designation', 'Designation', 'TEXTE', 'Materiel', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'marque', 'Marque', 'TEXTE', 'Materiel', 2, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'type_modele', 'Type / Modele', 'TEXTE', 'Materiel', 3, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'numero_serie', 'N de serie', 'TEXTE', 'Materiel', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'date_reception', 'Date de reception', 'DATE', 'Materiel', 5, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'date_mise_service', 'Date de mise en service', 'DATE', 'Materiel', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'garantie_jusque', 'Garantie jusqu au', 'DATE', 'Materiel', 7, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'date_reforme', 'Date de reforme', 'DATE', 'Materiel', 8, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'localisation', 'Localisation', 'TEXTE', 'Materiel', 9, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'code_identification', 'Code identification', 'TEXTE', 'Materiel', 10, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'fournisseur', 'Fournisseur', 'TEXTE', 'Materiel', 11, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'contact_nom', 'Contact technique - Nom', 'TEXTE', 'Materiel', 12, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'contact_tel', 'Contact technique - Tel', 'TEXTE', 'Materiel', 13, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'contact_fax', 'Contact technique - Fax', 'TEXTE', 'Materiel', 14, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'contact_adresse', 'Contact technique - Adresse', 'TEXTE', 'Materiel', 15, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'contrat_entretien', 'Contrat entretien', 'BOOLEEN', 'Contrat', 16, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'contrat_numero', 'N du contrat', 'TEXTE', 'Contrat', 17, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'contrat_societe', 'Societe', 'TEXTE', 'Contrat', 18, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'contrat_periode', 'Periode d effet', 'TEXTE', 'Contrat', 19, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'contrat_conditions', 'Conditions du contrat', 'TEXTE', 'Contrat', 20, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'resp_nom', 'Responsable - Nom', 'TEXTE', 'Responsable', 21, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'resp_prenom', 'Responsable - Prenom', 'TEXTE', 'Responsable', 22, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'resp_poste', 'Responsable - N poste', 'TEXTE', 'Responsable', 23, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'supp_nom', 'Suppleant - Nom', 'TEXTE', 'Suppleant', 24, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'supp_prenom', 'Suppleant - Prenom', 'TEXTE', 'Suppleant', 25, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'supp_poste', 'Suppleant - N poste', 'TEXTE', 'Suppleant', 26, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FDV-A', 'observations', 'Observations', 'TEXTE', 'Observations', 27, FALSE, NULL, NULL, NULL);

-- ================================================================
-- 3. PS-ME-EN-FVE-A — Intervention fiche de vie des equipements
-- ================================================================
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'equipement', 'Equipement', 'TEXTE', 'Intervention', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'date_intervention', 'Date intervention', 'DATE', 'Intervention', 2, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'heure_debut', 'Heure de debut', 'HEURE', 'Intervention', 3, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'heure_fin', 'Heure de fin', 'HEURE', 'Intervention', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'signature_intervenant', 'Signature intervenant', 'SIGNATURE', 'Intervention', 5, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'nature_intervention', 'Nature intervention', 'LISTE', 'Intervention', 6, TRUE, '[{"value":"CORRECTIVE","label":"Maintenance corrective"},{"value":"PREVENTIVE","label":"Maintenance preventive"},{"value":"AMELIORATIVE","label":"Maintenance ameliorative"}]', NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'description', 'Description', 'TEXTE', 'Intervention', 7, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'actions_menées', 'Actions menees', 'TEXTE', 'Intervention', 8, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'observations_amelio', 'Observations / Ameliorations', 'TEXTE', 'Intervention', 9, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'piece_designation', 'Designation piece', 'TEXTE', 'Pieces remplacees', 10, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'piece_reference', 'Reference', 'TEXTE', 'Pieces remplacees', 11, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'piece_quantite', 'Quantite', 'NOMBRE', 'Pieces remplacees', 12, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'piece_origine', 'Origine', 'TEXTE', 'Pieces remplacees', 13, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'date_cloture', 'Date cloture', 'DATE', 'Cloture', 14, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'cloture_heure_debut', 'Heure debut intervention', 'HEURE', 'Cloture', 15, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'cloture_heure_fin', 'Heure fin intervention', 'HEURE', 'Cloture', 16, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'duree_intervention', 'Duree', 'NOMBRE', 'Cloture', 17, FALSE, NULL, 'heures', NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'signature_technicien', 'Signature technicien', 'SIGNATURE', 'Cloture', 18, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-FVE-A', 'evaluation', 'Evaluation', 'TEXTE', 'Cloture', 19, FALSE, NULL, NULL, NULL);

-- ================================================================
-- 4. MCI-A : Renommer en conditionneuse simple
--    MCI-B : Creer Maintenance conditionneuse IMANPACK
-- ================================================================
UPDATE formulaires_types
SET titre = 'Maintenance de conditionneuse simple',
    modifie_le = NOW()
WHERE code = 'PS-ME-EN-MCI-A';

INSERT INTO formulaires_types (code, titre, module, frequence)
SELECT 'PS-ME-EN-MCI-B', 'Maintenance conditionneuse IMANPACK', 'MAINTENANCE', 'JOURNALIER'
WHERE NOT EXISTS (SELECT 1 FROM formulaires_types WHERE code = 'PS-ME-EN-MCI-B');

SELECT _inserer_champ('PS-ME-EN-MCI-B', 'date', 'Date', 'DATE', 'General', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'heure_debut', 'Heure de debut', 'HEURE', 'General', 2, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'etat_machines', 'Etat des machines', 'LISTE', 'General', 3, TRUE, '[{"value":"BON","label":"Bon"},{"value":"FONCTIONNEMENT","label":"En fonctionnement"},{"value":"ANORMAL","label":"Anormal"}]', NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'assurance_securite', 'Assurance / Securite', 'TEXTE', 'Securite', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'cadenas_etat', 'Etat cadenas', 'TEXTE', 'Securite', 5, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'moteur_chaine_secu', 'Moteur / Chaine securite', 'TEXTE', 'Controle mecanique', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'senseur_securite', 'Senseur de securite', 'TEXTE', 'Controle mecanique', 7, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'courroies_conduite', 'Etat des courroies', 'TEXTE', 'Controle mecanique', 8, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'garniture_conduite', 'Garniture et conduite', 'TEXTE', 'Controle mecanique', 9, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'filtre_air', 'Filtre a air', 'TEXTE', 'Controle mecanique', 10, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'reduction', 'Reduction', 'TEXTE', 'Controle mecanique', 11, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'chaine_securite', 'Chaine de securite', 'TEXTE', 'Securite', 12, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'observations', 'Observations', 'TEXTE', 'General', 13, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'reparation', 'Reparation si necessaire', 'TEXTE', 'Cloture', 14, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-MCI-B', 'signature', 'Signature', 'SIGNATURE', 'Cloture', 15, TRUE, NULL, NULL, NULL);

-- ================================================================
-- 5. PS-ME-EN-NPE-A — Nettoyage des pieces a la laverie
-- ================================================================
SELECT _inserer_champ('PS-ME-EN-NPE-A', 'date', 'Date', 'DATE', 'General', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-NPE-A', 'pieces_nettoyees', 'Pieces nettoyees', 'TEXTE', 'General', 2, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-NPE-A', 'origine_destination', 'Origine / Destination', 'TEXTE', 'General', 3, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-NPE-A', 'quantites', 'Quantites', 'NOMBRE', 'General', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-NPE-A', 'visa', 'Visa / Signature', 'SIGNATURE', 'General', 5, TRUE, NULL, NULL, NULL);

-- ================================================================
-- 6. PS-ME-EN-REM-A — Rapport journalier de maintenance
-- ================================================================
SELECT _inserer_champ('PS-ME-EN-REM-A', 'quart', 'Quart', 'LISTE', 'General', 1, TRUE, '[{"value":"QUART_A","label":"Quart A (06h-14h)"},{"value":"QUART_B","label":"Quart B (14h-22h)"},{"value":"QUART_C","label":"Quart C (22h-06h)"}]', NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'date', 'Date', 'DATE', 'General', 2, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'nom_responsable', 'Nom responsable', 'TEXTE', 'General', 3, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'observateurs', 'Observateurs', 'TEXTE', 'General', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'zone', 'Zone / N carre', 'TEXTE', 'Activites', 5, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'ref_carnet', 'Ref. carnet compresseurs', 'TEXTE', 'Activites', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'operations_effectuees', 'Operations effectuees', 'TEXTE', 'Activites', 7, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'engagements', 'Engagements', 'TEXTE', 'Activites', 8, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'pannes_alarmes', 'Panne moteur / alarme', 'TEXTE', 'Activites', 9, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'problemes_trouves', 'Problemes trouves', 'TEXTE', 'Activites', 10, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'reparations', 'Reparations effectuees', 'TEXTE', 'Activites', 11, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-REM-A', 'signature', 'Signature', 'SIGNATURE', 'General', 12, TRUE, NULL, NULL, NULL);

-- ================================================================
-- 7. PS-ME-EN-CAA-A — Compresseur a air (ANNUEL)
-- ================================================================
SELECT _inserer_champ('PS-ME-EN-CAA-A', 'date', 'Date', 'DATE', 'General', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAA-A', 'etat_equipement', 'Etat equipement', 'LISTE', 'General', 2, TRUE, '[{"value":"NORMAL","label":"Normal"},{"value":"ANORMAL","label":"Anormal"}]', NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAA-A', 'pression', 'Pression (bar)', 'NOMBRE', 'General', 3, FALSE, NULL, 'bar', NULL);
SELECT _inserer_champ('PS-ME-EN-CAA-A', 'niveau_huile', 'Niveau huile', 'TEXTE', 'General', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAA-A', 'filtres_etat', 'Etat des filtres', 'TEXTE', 'General', 5, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAA-A', 'observations', 'Observations', 'TEXTE', 'General', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAA-A', 'intervention_prevue', 'Intervention prevue', 'TEXTE', 'General', 7, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PS-ME-EN-CAA-A', 'signature', 'Signature', 'SIGNATURE', 'General', 8, TRUE, NULL, NULL, NULL);

-- ================================================================
-- 8. PO-AP-EN-CDP-A / CDP-B — Cahier de passation chef de quart
-- ================================================================
SELECT _inserer_champ('PO-AP-EN-CDP-A', 'quart', 'Quart', 'LISTE', 'General', 1, TRUE, '[{"value":"QUART_A","label":"Quart A (06h-14h)"},{"value":"QUART_B","label":"Quart B (14h-22h)"},{"value":"QUART_C","label":"Quart C (22h-06h)"}]', NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-A', 'date', 'Date', 'DATE', 'General', 2, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-A', 'equipe', 'Equipe', 'TEXTE', 'General', 3, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-A', 'poste_travail', 'Poste de travail', 'TEXTE', 'Production', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-A', 'produit', 'Produit', 'TEXTE', 'Production', 5, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-A', 'evenements', 'Evenements / Anomalies', 'TEXTE', 'Production', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-A', 'consignes', 'Consignes prochain quart', 'TEXTE', 'Production', 7, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-A', 'signature_emetteur', 'Signature emetteur', 'SIGNATURE', 'General', 8, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-A', 'signature_receveur', 'Signature receveur', 'SIGNATURE', 'General', 9, TRUE, NULL, NULL, NULL);

SELECT _inserer_champ('PO-AP-EN-CDP-B', 'quart', 'Quart', 'LISTE', 'General', 1, TRUE, '[{"value":"QUART_A","label":"Quart A (06h-14h)"},{"value":"QUART_B","label":"Quart B (14h-22h)"},{"value":"QUART_C","label":"Quart C (22h-06h)"}]', NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-B', 'date', 'Date', 'DATE', 'General', 2, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-B', 'equipe', 'Equipe', 'TEXTE', 'General', 3, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-B', 'poste_travail', 'Poste de travail', 'TEXTE', 'Production', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-B', 'produit', 'Produit', 'TEXTE', 'Production', 5, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-B', 'evenements', 'Evenements / Anomalies', 'TEXTE', 'Production', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-B', 'consignes', 'Consignes prochain quart', 'TEXTE', 'Production', 7, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-B', 'signature_emetteur', 'Signature emetteur', 'SIGNATURE', 'General', 8, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CDP-B', 'signature_receveur', 'Signature receveur', 'SIGNATURE', 'General', 9, TRUE, NULL, NULL, NULL);

-- ================================================================
-- 9. PO-AP-EN-CPE-B — Changement de produit (meme equipement)
-- ================================================================
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'produit_precedent', 'Produit precedent', 'TEXTE', 'Informations', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nouveau_produit', 'Nouveau produit', 'TEXTE', 'Informations', 2, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'lot_nouveau_produit', 'N de lot nouveau produit', 'TEXTE', 'Informations', 3, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'vider_premelange', 'Vider le pre-melange', 'BOOLEEN', 'Vider pre-melange', 4, FALSE, NULL, NULL, 'Fait en fin de production du lot precedent');
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'vider_premelange_qte', 'Quantite recuperee (kg)', 'NOMBRE', 'Vider pre-melange', 5, FALSE, NULL, 'kg', NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'vider_premelange_init', 'Initiales', 'TEXTE', 'Vider pre-melange', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'vider_melangeur', 'Vider le melangeur', 'BOOLEEN', 'Vider melangeur', 7, FALSE, NULL, NULL, 'Faire tourner pour vider completement');
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'vider_melangeur_init', 'Initiales', 'TEXTE', 'Vider melangeur', 8, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_surfaces', 'Nettoyage surfaces et exterieurs', 'BOOLEEN', 'Nettoyage surfaces', 9, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_surfaces_init', 'Initiales', 'TEXTE', 'Nettoyage surfaces', 10, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'sechage_surfaces', 'Sechage des surfaces', 'BOOLEEN', 'Nettoyage surfaces', 11, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'sechage_surfaces_init', 'Initiales', 'TEXTE', 'Nettoyage surfaces', 12, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'desinfection_surfaces', 'Desinfection des surfaces', 'BOOLEEN', 'Nettoyage surfaces', 13, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'desinfection_surfaces_init', 'Initiales', 'TEXTE', 'Nettoyage surfaces', 14, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'purge_pretraitement', 'Purge et pre-nettoyage', 'BOOLEEN', 'Nettoyage interieur', 15, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'purge_pretraitement_init', 'Initiales', 'TEXTE', 'Nettoyage interieur', 16, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_melangeur', 'Nettoyage melangeur et tremié', 'BOOLEEN', 'Nettoyage interieur', 17, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_melangeur_init', 'Initiales', 'TEXTE', 'Nettoyage interieur', 18, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_broyeurs', 'Nettoyage des broyeurs', 'BOOLEEN', 'Nettoyage interieur', 19, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_broyeurs_init', 'Initiales', 'TEXTE', 'Nettoyage interieur', 20, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_fondoir', 'Nettoyage du fondoir', 'BOOLEEN', 'Nettoyage interieur', 21, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_fondoir_init', 'Initiales', 'TEXTE', 'Nettoyage interieur', 22, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_doseuses', 'Nettoyage tremies et doseuses', 'BOOLEEN', 'Nettoyage interieur', 23, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_doseuses_init', 'Initiales', 'TEXTE', 'Nettoyage interieur', 24, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_cuves', 'Nettoyage cuves', 'BOOLEEN', 'Nettoyage interieur', 25, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_cuves_init', 'Initiales', 'TEXTE', 'Nettoyage interieur', 26, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_pompes', 'Nettoyage des pompes', 'BOOLEEN', 'Nettoyage interieur', 27, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_pompes_init', 'Initiales', 'TEXTE', 'Nettoyage interieur', 28, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_echangeur', 'Nettoyage echangeur de chaleur', 'BOOLEEN', 'Nettoyage interieur', 29, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'nettoyage_echangeur_init', 'Initiales', 'TEXTE', 'Nettoyage interieur', 30, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'pousse_produit', 'Pousse de produit', 'BOOLEEN', 'Pousses pre-melange', 31, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'pousse_produit_init', 'Initiales', 'TEXTE', 'Pousses pre-melange', 32, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'qte_recuperee_l1', 'Quantite recuperee Ligne 1 (kg)', 'NOMBRE', 'Nouvelle production', 33, FALSE, NULL, 'kg', NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'sachets_l1', 'Nombre de sachets Ligne 1', 'NOMBRE', 'Nouvelle production', 34, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'qte_recuperee_l2', 'Quantite recuperee Ligne 2 (kg)', 'NOMBRE', 'Nouvelle production', 35, FALSE, NULL, 'kg', NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'sachets_l2', 'Nombre de sachets Ligne 2', 'NOMBRE', 'Nouvelle production', 36, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'qte_recuperee_l4a', 'Quantite recuperee Ligne 4A (kg)', 'NOMBRE', 'Nouvelle production', 37, FALSE, NULL, 'kg', NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'sachets_l4a', 'Nombre de sachets Ligne 4A', 'NOMBRE', 'Nouvelle production', 38, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'qte_recuperee_l4b', 'Quantite recuperee Ligne 4B (kg)', 'NOMBRE', 'Nouvelle production', 39, FALSE, NULL, 'kg', NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'sachets_l4b', 'Nombre de sachets Ligne 4B', 'NOMBRE', 'Nouvelle production', 40, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'rangement_matieres', 'Matieres specifiques evacuees', 'BOOLEEN', 'Rangement ligne', 41, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'rangement_premix', 'Premix specifique evacue', 'BOOLEEN', 'Rangement ligne', 42, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'rangement_complexe', 'Complexe specifique evacue', 'BOOLEEN', 'Rangement ligne', 43, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'rangement_cartons', 'Cartons et fiches evacues', 'BOOLEEN', 'Rangement ligne', 44, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'rangement_documents', 'Documents qualite evacues', 'BOOLEEN', 'Rangement ligne', 45, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'parametrage_presse', 'Parametrage presse sachet', 'BOOLEEN', 'Rangement ligne', 46, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'rangement_init', 'Initiales', 'TEXTE', 'Rangement ligne', 47, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'visa_dt', 'Visa Direction Technique', 'SIGNATURE', 'Signatures', 48, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'date_visa_dt', 'Date visa DT', 'DATE', 'Signatures', 49, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'visa_dq', 'Visa Direction Qualite', 'SIGNATURE', 'Signatures', 50, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-CPE-B', 'date_visa_dq', 'Date visa DQ', 'DATE', 'Signatures', 51, FALSE, NULL, NULL, NULL);

-- ================================================================
-- 10. PO-QS-EN-DCP-B — Demande de changement de produit
-- ================================================================
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'motifs_changement', 'Motifs du changement de produit', 'TEXTE', 'Motifs', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'produit_a', 'Produit A', 'TEXTE', 'Produits', 2, TRUE, NULL, NULL, 'Produit actuel');
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'produit_b', 'Produit B', 'TEXTE', 'Produits', 3, TRUE, NULL, NULL, 'Nouveau produit');
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'date_production_b', 'Date production B souhaitee', 'DATE', 'Produits', 4, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'op_nettoyage_profond', 'Nettoyage profond realise', 'BOOLEEN', 'Operations realisees', 5, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'op_changement_suivi', 'Changement de produit suivi et transmis', 'BOOLEEN', 'Operations realisees', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'op_mp_exclusives', 'MP exclusives du A evacuees', 'BOOLEEN', 'Operations realisees', 7, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'op_emballages_exclusifs', 'Emballages exclusifs du A evacues', 'BOOLEEN', 'Operations realisees', 8, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'op_enregistrements', 'Enregistrements du A evacues', 'BOOLEEN', 'Operations realisees', 9, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'op_mp_b_dispo', 'MP et emballages B disponibles', 'BOOLEEN', 'Operations realisees', 10, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'op_origyn_config', 'Origyn configure pour produit B', 'BOOLEEN', 'Operations realisees', 11, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'signature_production', 'Signature Departement Production', 'SIGNATURE', 'Operations realisees', 12, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'date_signature_prod', 'Date signature Production', 'DATE', 'Operations realisees', 13, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'ct_nettoyage_profond', 'Nettoyage profond verifie', 'BOOLEEN', 'Controles effectues', 14, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'ct_changement_suivi', 'Changement suivi verifie', 'BOOLEEN', 'Controles effectues', 15, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'ct_mp_exclusives', 'MP exclusives verifiees', 'BOOLEEN', 'Controles effectues', 16, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'ct_emballages', 'Emballages exclusifs verifies', 'BOOLEEN', 'Controles effectues', 17, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'ct_enregistrements', 'Enregistrements verifies', 'BOOLEEN', 'Controles effectues', 18, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'ct_mp_b_dispo', 'MP B disponibles verifiees', 'BOOLEEN', 'Controles effectues', 19, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'ct_origyn_config', 'Origyn configure verifie', 'BOOLEEN', 'Controles effectues', 20, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'ct_environnement', 'Controle environnement satisfaisant', 'BOOLEEN', 'Controles effectues', 21, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'ct_pousse', 'Controle pousse satisfaisant', 'BOOLEEN', 'Controles effectues', 22, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'decision', 'Decision', 'TEXTE', 'Decision', 23, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'signature_qualite', 'Signature Departement Qualite', 'SIGNATURE', 'Decision', 24, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-QS-EN-DCP-B', 'date_signature_qualite', 'Date signature Qualite', 'DATE', 'Decision', 25, FALSE, NULL, NULL, NULL);

-- ================================================================
-- 11. PO-AP-EN-DLD-B — Demande de liberation par derogation MP
-- ================================================================
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'date_demande', 'Date de la demande', 'DATE', 'Informations', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'produit_concerne', 'Produit / Matiere concerne(e)', 'TEXTE', 'Informations', 2, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'lot_concerne', 'N de lot', 'TEXTE', 'Informations', 3, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'fournisseur', 'Fournisseur', 'TEXTE', 'Informations', 4, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'motif_derogation', 'Motif de la derogation', 'TEXTE', 'Informations', 5, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'quantite_concernee', 'Quantite concernee', 'NOMBRE', 'Informations', 6, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_reception', 'Controle reception', 'BOOLEEN', 'Controle Qualite', 7, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_reception_resultat', 'Resultat controle reception', 'LISTE', 'Controle Qualite', 8, FALSE, '[{"value":"CONFORME","label":"Conforme"},{"value":"NON_CONFORME","label":"Non conforme"}]', NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_reception_validation', 'Validation controle reception', 'BOOLEEN', 'Controle Qualite', 9, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_physico_chimiques', 'Analyses physico-chimiques', 'BOOLEEN', 'Controle Qualite', 10, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_physico_resultat', 'Resultat analyses physico-chimiques', 'LISTE', 'Controle Qualite', 11, FALSE, '[{"value":"CONFORME","label":"Conforme"},{"value":"NON_CONFORME","label":"Non conforme"}]', NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_physico_validation', 'Validation analyses physico-chimiques', 'BOOLEEN', 'Controle Qualite', 12, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_microbiologie', 'Analyses microbiologiques', 'BOOLEEN', 'Controle Qualite', 13, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_microbio_resultat', 'Resultat analyses microbiologiques', 'LISTE', 'Controle Qualite', 14, FALSE, '[{"value":"CONFORME","label":"Conforme"},{"value":"NON_CONFORME","label":"Non conforme"}]', NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_microbio_validation', 'Validation analyses microbiologiques', 'BOOLEEN', 'Controle Qualite', 15, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_organoleptique', 'Analyses organoleptiques', 'BOOLEEN', 'Controle Qualite', 16, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_organo_resultat', 'Resultat analyses organoleptiques', 'LISTE', 'Controle Qualite', 17, FALSE, '[{"value":"CONFORME","label":"Conforme"},{"value":"NON_CONFORME","label":"Non conforme"}]', NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'ct_organo_validation', 'Validation analyses organoleptiques', 'BOOLEEN', 'Controle Qualite', 18, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'autres_analyses', 'Autres analyses', 'TEXTE', 'Controle Qualite', 19, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'decision_qualite', 'Decision Qualite', 'TEXTE', 'Decision', 20, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'signature_qualite', 'Signature Responsable Qualite', 'SIGNATURE', 'Decision', 21, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'date_signature_qualite', 'Date signature Qualite', 'DATE', 'Decision', 22, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'signature_logistique', 'Signature Responsable Logistique/Production', 'SIGNATURE', 'Decision', 23, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DLD-B', 'date_signature_logistique', 'Date signature Logistique', 'DATE', 'Decision', 24, FALSE, NULL, NULL, NULL);

-- ================================================================
-- 12. PO-AP-EN-DRP-B — Demande de reprise de production
-- ================================================================
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'motif_arret', 'Motif de l arret', 'TEXTE', 'Arret', 1, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'date_arret', 'Date de l arret', 'DATE', 'Arret', 2, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'heure_arret', 'Heure de l arret', 'HEURE', 'Arret', 3, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'operations_realisees', 'Operations realisees pour la reprise', 'TEXTE', 'Production', 4, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'date_production', 'Date', 'DATE', 'Production', 5, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'signature_production', 'Signature Departement Production', 'SIGNATURE', 'Production', 6, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'controles_effectues', 'Controles effectues', 'TEXTE', 'Qualite', 7, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'decision', 'Decision', 'TEXTE', 'Qualite', 8, TRUE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'date_qualite', 'Date', 'DATE', 'Qualite', 9, FALSE, NULL, NULL, NULL);
SELECT _inserer_champ('PO-AP-EN-DRP-B', 'signature_qualite', 'Signature Departement Qualite', 'SIGNATURE', 'Qualite', 10, TRUE, NULL, NULL, NULL);

-- ================================================================
-- Nettoyage
-- ================================================================
DROP FUNCTION IF EXISTS _inserer_champ;
