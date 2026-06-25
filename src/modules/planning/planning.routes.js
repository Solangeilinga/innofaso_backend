const express = require('express');
const router = express.Router();
const ctrl = require('./planning.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');

const GESTIONNAIRES = roles('ADMIN','RESP_MAINT','RESP_PROD');

// ── PLANNING SEMAINE ─────────────────────────────────
router.post('/semaine/creer-ou-recuperer', auth, GESTIONNAIRES, ctrl.creerOuRecupererPlanningSemaine);
router.get('/semaine/:planningSemaineId',  auth, ctrl.obtenirPlanningSemaine);
router.get('/semaines/lister',             auth, ctrl.listerSemainesPlanifiees);
router.get('/mois',                        auth, ctrl.obtenirPlanningMois);
router.get('/historique',                  auth, ctrl.listerHistorique);

// ── ASSIGNATION QUARTS ──────────────────────────────
router.post('/quart/assigner', auth, GESTIONNAIRES, ctrl.assignerMaintenancierQuart);

// ── INTERVENTIONS ────────────────────────────────────
router.post('/intervention/creer-ou-modifier', auth, GESTIONNAIRES, ctrl.creerOuModifierIntervention);
router.put('/intervention-ligne',              auth, GESTIONNAIRES, ctrl.mettreAJourInterventionLigne);
router.put('/ligne-quart',                     auth, GESTIONNAIRES, ctrl.mettreAJourLigneQuart);
router.delete('/quart/:planningQuartId',        auth, GESTIONNAIRES, ctrl.supprimerPlanningQuart);
router.delete('/intervention/:interventionId',  auth, GESTIONNAIRES, ctrl.supprimerIntervention);

// ── DASHBOARD & STATISTIQUES ──────────────────────────
router.get('/dashboard/mensuel',           auth, ctrl.dashboardMaintenanceMensuel);
router.get('/synthese',                    auth, ctrl.dashboardSynthese);
router.get('/dashboard/synthese',          auth, ctrl.dashboardSynthese);
router.get('/graphiques',                  auth, ctrl.dashboardGraphiques);
router.get('/dashboard/graphiques',        auth, ctrl.dashboardGraphiques);
router.get('/suivi/equipements',           auth, ctrl.suiviEquipementMaintenance);
router.get('/suivi-equipements',           auth, ctrl.suiviEquipementsParLigne);
router.get('/suivi/equipements-par-ligne', auth, ctrl.suiviEquipementsParLigne);
router.post('/suivi/action',               auth, GESTIONNAIRES, ctrl.enregistrerSuiviAction);
router.post('/suivi-action',               auth, GESTIONNAIRES, ctrl.enregistrerSuiviAction);
router.get('/graphique/evolution',         auth, ctrl.graphiqueEvolutionMaintenance);

// ── FORMULAIRES PLANNING ─────────────────────────────
router.get('/formulaires/disponibles',          auth, ctrl.listerFormulairesDisponibles);
router.get('/quart/:planningQuartId/formulaires', auth, ctrl.getFormulairesQuart);
router.post('/quart/formulaire/toggle',         auth, GESTIONNAIRES, ctrl.toggleFormulaireQuart);

// ── UTILITAIRES ─────────────────────────────────────
router.get('/lignes',                auth, ctrl.listerLignes);
router.get('/lignes/lister',         auth, ctrl.listerLignes);
router.get('/quarts/lister',         auth, ctrl.listerQuarts);
router.get('/maintenanciers/lister', auth, ctrl.listerMaintenanciers);

// ── SIGNALEMENTS DE PANNES ────────────────────────────
router.post('/signalement/creer', auth, ctrl.creerSignalementPanne);
router.get('/signalements/lister', auth, ctrl.listerSignalements);

// ── MAINTENANCE CORRECTIVE ────────────────────────────
router.get('/correctif/semaine/:planning_semaine_id', auth, ctrl.obtenirCorrectifSemaine);
router.post('/correctif/sauvegarder', auth, GESTIONNAIRES, ctrl.sauvegarderCorrectif);
router.post('/correctif/toggle-formulaire', auth, GESTIONNAIRES, ctrl.toggleFormulaireCorrectif);
router.get('/correctif/historique', auth, ctrl.listerHistoriqueCorrectif);
router.get('/correctif/semaine-par-date', auth, ctrl.obtenirSemaineParDate);
router.get('/equipements-et-lignes', auth, ctrl.listerEquipementsEtLignes);
router.get('/equipement/:id/detail', auth, ctrl.detailEquipementMaintenance);
router.get('/equipements/courbe-correctives', auth, ctrl.courbeCorrectivesEquipements);

// ── PLANNING AUTRE ────────────────────────────────────
router.post('/autre/creer', auth, GESTIONNAIRES, ctrl.creerPlanningAutre);
router.put('/autre/:id',    auth, GESTIONNAIRES, ctrl.modifierPlanningAutre);
router.get('/autre/lister', auth, ctrl.listerPlanningAutre);
router.get('/autre/historique', auth, ctrl.listerHistoriqueAutre);
router.delete('/autre/:id', auth, GESTIONNAIRES, ctrl.supprimerPlanningAutre);

// ── CRUD BASIQUE ─────────────────────────────────────
router.get('/',             auth, (req, res) => res.json([]));
router.post('/',            auth, GESTIONNAIRES, (req, res) => res.status(201).json({}));
router.patch('/:id/statut', auth, GESTIONNAIRES, (req, res) => res.json({}));

module.exports = router;