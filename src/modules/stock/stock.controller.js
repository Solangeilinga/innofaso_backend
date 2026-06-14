const service = require('./stock.service');

const getPieces = async (req, res, next) => {
    try { res.json(await service.getPieces(req.query.equipement_id)); } catch (err) { next(err); }
};

const getPiecesEnAlertes = async (req, res, next) => {
    try { res.json(await service.getPiecesEnAlerte()); } catch (err) { next(err); }
};

const getPieceById = async (req, res, next) => {
    try { res.json(await service.getPieceById(req.params.id)); } catch (err) { next(err); }
};

const getMouvements = async (req, res, next) => {
    try { res.json(await service.getMouvements(req.params.id, req.query)); } catch (err) { next(err); }
};

const creerPiece = async (req, res, next) => {
    try { res.status(201).json(await service.creerPiece(req.body, req.user.id)); } catch (err) { next(err); }
};

const updatePiece = async (req, res, next) => {
    try {
        res.json(await service.updatePiece(req.params.id, req.body, req.user.id, req.ip_client, req.user_agent));
    } catch (err) { next(err); }
};

const enregistrerMouvement = async (req, res, next) => {
    try {
        res.status(201).json(await service.enregistrerMouvement(req.body, req.user.id));
    } catch (err) { next(err); }
};

const supprimerPiece = async (req, res, next) => {
    try {
        await service.supprimerPiece(req.params.id);
        res.json({ message: 'Pièce supprimée.' });
    } catch (err) { next(err); }
};

module.exports = { getPieces, getPiecesEnAlertes, getPieceById, getMouvements, creerPiece, updatePiece, enregistrerMouvement, supprimerPiece };
