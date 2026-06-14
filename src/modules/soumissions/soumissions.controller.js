const service = require('./soumissions.service');

const getAll    = async (req, res, next) => { try { res.json(await service.getAll(req.query)); } catch (e) { next(e); } };
const getById   = async (req, res, next) => { try { res.json(await service.getById(req.params.id)); } catch (e) { next(e); } };
const create    = async (req, res, next) => {
    try { res.status(201).json(await service.create(req.body, req.user.id, req.ip_client, req.user_agent)); } catch (e) { next(e); }
};
const updateStatut = async (req, res, next) => {
    try {
        await service.updateStatut(req.params.id, req.body.statut, req.user.id, req.user.role, req.ip_client, req.user_agent, req.body.commentaire);
        res.json({ message: 'Statut mis à jour.' });
    } catch (e) { next(e); }
};
const uploadPieceJointe = async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
        res.status(201).json(await service.addPieceJointe(req.params.id, req.file));
    } catch (e) { next(e); }
};
const deletePieceJointe = async (req, res, next) => {
    try { await service.deletePieceJointe(req.params.pjId); res.json({ message: 'Pièce jointe supprimée.' }); } catch (e) { next(e); }
};
const sync = async (req, res, next) => {
    try {
        const results = await service.sync(req.body.soumissions, req.user.id, req.ip_client, req.user_agent);
        res.json({ results });
    } catch (e) { next(e); }
};

const exportExcel = async (req, res, next) => {
    try {
        const { buffer, filename } = await service.exportExcel(req.query);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (e) { next(e); }
};

module.exports = { getAll, getById, create, updateStatut, uploadPieceJointe, deletePieceJointe, sync, exportExcel };
