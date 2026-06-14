const express = require('express');
const router = express.Router();
const ctrl = require('./alertes.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');

router.use(auth);

// Statiques AVANT les paramétrées
router.get('/non-lues/count',                ctrl.countNonLues);
router.patch('/toutes/lues',                 ctrl.marquerToutesLues);  // aligné frontend

router.get('/',         ctrl.getAll);
router.get('/:id',      ctrl.getById);
router.patch('/:id/lue',    ctrl.marquerLue);
router.patch('/:id/traitee', roles('ADMIN','RESP_MAINT','RESP_PROD'), ctrl.marquerTraitee);
router.delete('/:id',   roles('ADMIN'), ctrl.supprimer);

module.exports = router;
