const express = require('express');
const router = express.Router();
const ctrl = require('./stock.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');
const validate = require('../../middleware/validate');
const Joi = require('joi');

const pieceSchema = Joi.object({
    equipement_id: Joi.string().uuid().optional().allow(null),
    reference: Joi.string().max(100).required(),
    designation: Joi.string().max(300).required(),
    quantite_stock: Joi.number().integer().min(0).default(0),
    seuil_alerte: Joi.number().integer().min(0).default(5),
    unite: Joi.string().max(50).default('pièce'),
});

const mouvementSchema = Joi.object({
    piece_id: Joi.string().uuid().required(),
    type_mouvement: Joi.string().valid('ENTREE','SORTIE').required(),
    quantite: Joi.number().integer().min(1).required(),
    motif: Joi.string().max(500).optional().allow(null,''),
});

router.use(auth);

// Statiques avant paramétrées
router.get('/alertes-stock',   ctrl.getPiecesEnAlertes);
// Alias pour aligner frontend (/stock/pieces/mouvement) et backend (/stock/mouvements)
router.post('/pieces/mouvement', roles('ADMIN','RESP_MAINT','TECHNICIEN'), validate(mouvementSchema), ctrl.enregistrerMouvement);
router.post('/mouvements',       roles('ADMIN','RESP_MAINT','TECHNICIEN'), validate(mouvementSchema), ctrl.enregistrerMouvement);

router.get('/pieces',           ctrl.getPieces);
router.get('/pieces/:id',       ctrl.getPieceById);
router.get('/pieces/:id/mouvements', ctrl.getMouvements);
router.post('/pieces',          roles('ADMIN','RESP_MAINT'), validate(pieceSchema), ctrl.creerPiece);
router.put('/pieces/:id',       roles('ADMIN','RESP_MAINT'), ctrl.updatePiece);
router.delete('/pieces/:id',    roles('ADMIN'), ctrl.supprimerPiece);

module.exports = router;
