const express = require('express');
const router = express.Router();
const ctrl = require('./processus.controller');
const auth = require('../../middleware/auth');

router.get('/',                    auth, ctrl.lister);
router.get('/counts',              auth, ctrl.compterTaches);
router.get('/:id',                 auth, ctrl.getUne);
router.post('/',                   auth, ctrl.creer);
router.patch('/:id/assigner',      auth, ctrl.assigner);
router.patch('/:id/executer',      auth, ctrl.executer);
router.patch('/:id/verifier',      auth, ctrl.verifier);
router.patch('/:id/valider',       auth, ctrl.valider);

module.exports = router;
