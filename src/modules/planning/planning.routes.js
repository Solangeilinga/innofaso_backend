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

// ── UTILITAIRES ─────────────────────────────────────
router.get('/lignes',                auth, ctrl.listerLignes);
router.get('/lignes/lister',         auth, ctrl.listerLignes);
router.get('/quarts/lister',         auth, ctrl.listerQuarts);
router.get('/maintenanciers/lister', auth, ctrl.listerMaintenanciers);

// ── CRUD BASIQUE ─────────────────────────────────────
router.get('/',             auth, (req, res) => res.json([]));
router.post('/',            auth, GESTIONNAIRES, (req, res) => res.status(201).json({}));
router.patch('/:id/statut', auth, GESTIONNAIRES, (req, res) => res.json({}));

module.exports = router;