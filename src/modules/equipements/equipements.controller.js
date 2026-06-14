const service = require('./equipements.service');

const getAll = async (req, res, next) => { try { res.json(await service.getAll(req.query)); } catch (e) { next(e); } };
const getById = async (req, res, next) => { try { res.json(await service.getById(req.params.id)); } catch (e) { next(e); } };
const getHistorique = async (req, res, next) => { try { res.json(await service.getHistorique(req.params.id, req.query)); } catch (e) { next(e); } };
const create = async (req, res, next) => { try { res.status(201).json(await service.create(req.body, req.user.id, req.ip_client, req.user_agent)); } catch (e) { next(e); } };
const update = async (req, res, next) => { try { res.json(await service.update(req.params.id, req.body, req.user.id, req.ip_client, req.user_agent)); } catch (e) { next(e); } };
const updateEtat = async (req, res, next) => { try { await service.updateEtat(req.params.id, req.body.etat, req.user.id, req.ip_client, req.user_agent); res.json({ message: 'État mis à jour.' }); } catch (e) { next(e); } };

module.exports = { getAll, getById, getHistorique, create, update, updateEtat };