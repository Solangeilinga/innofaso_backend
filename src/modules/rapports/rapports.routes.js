// src/modules/rapports/rapports.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('./rapports.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');

router.use(auth);

router.get('/journalier-maintenance', roles('ADMIN', 'RESP_MAINT'), ctrl.getJournalierMaintenance);
router.get('/hebdomadaire', roles('ADMIN', 'RESP_MAINT', 'RESP_PROD'), ctrl.getHebdomadaire);
router.get('/equipement/:id', roles('ADMIN', 'RESP_MAINT'), ctrl.getFicheEquipement);
router.get('/export-excel', ctrl.getExportExcel);
router.get('/export-csv', ctrl.getExportCSV);

module.exports = router;