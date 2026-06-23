const express  = require('express');
const router   = express.Router();
const ctrl     = require('./stock.controller');
const auth     = require('../../middleware/auth');
const roles    = require('../../middleware/roles');

const GESTIONNAIRES = roles('ADMIN','RESP_MAINT','RESP_PROD');

router.use(auth);

// ── Pièces ───────────────────────────────────────────────────────
router.get('/',          ctrl.listerPieces);
router.get('/:id',       ctrl.getPiece);
router.post('/',         GESTIONNAIRES, ctrl.creerPiece);
router.put('/:id',       GESTIONNAIRES, ctrl.modifierPiece);
router.delete('/:id',    GESTIONNAIRES, ctrl.supprimerPiece);

// ── Mouvements ───────────────────────────────────────────────────
router.get('/:id/mouvements',  ctrl.getMouvements);
router.post('/:id/entree',     GESTIONNAIRES, ctrl.entree);
router.post('/:id/sortie',     GESTIONNAIRES, ctrl.sortie);

module.exports = router;