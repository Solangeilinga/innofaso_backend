const service = require('./matieres.service');

const getAll       = async (req, res, next) => { try { res.json(await service.getAll(req.query)); } catch (e) { next(e); } };
const getById      = async (req, res, next) => { try { res.json(await service.getById(req.params.id)); } catch (e) { next(e); } };
const creer        = async (req, res, next) => { try { res.status(201).json(await service.creer(req.body)); } catch (e) { next(e); } };
const modifier     = async (req, res, next) => { try { res.json(await service.modifier(req.params.id, req.body)); } catch (e) { next(e); } };
const softDelete   = async (req, res, next) => { try { await service.softDelete(req.params.id); res.json({ message: 'Matière archivée.' }); } catch (e) { next(e); } };
const getCategories = async (req, res, next) => { try { res.json(await service.getCategories()); } catch (e) { next(e); } };
const getMouvements = async (req, res, next) => { try { res.json(await service.getMouvements(req.params.id, req.query)); } catch (e) { next(e); } };
const mouvement    = async (req, res, next) => { try { res.json(await service.enregistrerMouvement(req.body, req.user.id)); } catch (e) { next(e); } };
const getStats     = async (req, res, next) => { try { res.json(await service.getStats()); } catch (e) { next(e); } };

module.exports = { getAll, getById, creer, modifier, softDelete, getCategories, getMouvements, mouvement, getStats };