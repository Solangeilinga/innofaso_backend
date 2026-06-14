const express = require('express');
const router = express.Router();
const ctrl = require('./planning.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');

// ── PLANNING SEMAINE ─────────────────────────────────
router.post('/semaine/creer-ou-recuperer', auth, roles('ADMIN','RESP_MAINT'), ctrl.creerOuRecupererPlanningSemaine);
router.get('/semaine/:planningSemaineId',  auth, ctrl.obtenirPlanningSemaine);
router.get('/semaines/lister',             auth, ctrl.listerSemainesPlanifiees);
router.get('/mois',                        auth, ctrl.obtenirPlanningMois);
router.get('/historique',                  auth, ctrl.listerHistorique);

// ── ASSIGNATION QUARTS ──────────────────────────────
router.post('/quart/assigner', auth, roles('ADMIN','RESP_MAINT'), ctrl.assignerMaintenancierQuart);

// ── INTERVENTIONS ────────────────────────────────────
router.post('/intervention/creer-ou-modifier', auth, ctrl.creerOuModifierIntervention);
router.put('/intervention-ligne',              auth, roles('ADMIN','RESP_MAINT'), ctrl.mettreAJourInterventionLigne);
router.put('/ligne-quart',                     auth, roles('ADMIN','RESP_MAINT'), ctrl.mettreAJourLigneQuart);
router.delete('/quart/:planningQuartId',        auth, roles('ADMIN','RESP_MAINT'), ctrl.supprimerPlanningQuart);
router.delete('/intervention/:interventionId',  auth, roles('ADMIN','RESP_MAINT'), ctrl.supprimerIntervention);

// ── DASHBOARD & STATISTIQUES ──────────────────────────
router.get('/dashboard/mensuel',           auth, ctrl.dashboardMaintenanceMensuel);
router.get('/synthese',                    auth, ctrl.dashboardSynthese);  // alias Solange
router.get('/dashboard/synthese',          auth, ctrl.dashboardSynthese);
router.get('/graphiques',                  auth, ctrl.dashboardGraphiques);  // alias Solange
router.get('/dashboard/graphiques',        auth, ctrl.dashboardGraphiques);
router.get('/suivi/equipements',           auth, ctrl.suiviEquipementMaintenance);
router.get('/suivi-equipements',           auth, ctrl.suiviEquipementsParLigne);  // alias Solange
router.get('/suivi/equipements-par-ligne', auth, ctrl.suiviEquipementsParLigne);
router.post('/suivi/action',               auth, roles('ADMIN','RESP_MAINT'), ctrl.enregistrerSuiviAction);
router.post('/suivi-action',               auth, roles('ADMIN','RESP_MAINT'), ctrl.enregistrerSuiviAction);  // alias
router.get('/graphique/evolution',         auth, ctrl.graphiqueEvolutionMaintenance);

// ── UTILITAIRES ─────────────────────────────────────
router.get('/lignes',           auth, ctrl.listerLignes);  // alias Solange
router.get('/lignes/lister',    auth, ctrl.listerLignes);
router.get('/quarts/lister',    auth, ctrl.listerQuarts);
router.get('/maintenanciers/lister', auth, ctrl.listerMaintenanciers);

// ── CRUD BASIQUE (rétro-compatibilité) ───────────────
router.get('/',      auth, (req, res) => res.json([]));
router.post('/',     auth, (req, res) => res.status(201).json({}));
router.patch('/:id/statut', auth, (req, res) => res.json({}));

module.exports = router;
