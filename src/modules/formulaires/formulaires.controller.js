const service = require('./formulaires.service');

const getAll      = async (req, res, next) => { try { res.json(await service.getAll(req.query)); } catch (e) { next(e); } };
const getById     = async (req, res, next) => { try { res.json(await service.getById(req.params.id)); } catch (e) { next(e); } };
const creer       = async (req, res, next) => { try { res.status(201).json(await service.creer(req.body)); } catch (e) { next(e); } };
const modifier    = async (req, res, next) => { try { res.json(await service.modifier(req.params.id, req.body)); } catch (e) { next(e); } };
const softDelete  = async (req, res, next) => { try { await service.softDelete(req.params.id); res.json({ message: 'Formulaire archivé.' }); } catch (e) { next(e); } };

const getChamps       = async (req, res, next) => { try { res.json(await service.getChampsBySection(req.params.id)); } catch (e) { next(e); } };
const addChamp        = async (req, res, next) => { try { res.status(201).json(await service.addChamp(req.params.id, req.body)); } catch (e) { next(e); } };
const updateChamp     = async (req, res, next) => { try { res.json(await service.updateChamp(req.params.champId, req.body)); } catch (e) { next(e); } };
const softDeleteChamp = async (req, res, next) => { try { await service.softDeleteChamp(req.params.champId); res.json({ message: 'Champ archivé.' }); } catch (e) { next(e); } };
const reordonner      = async (req, res, next) => { try { await service.reordonner(req.params.id, req.body.ordres); res.json({ message: 'Ordre mis à jour.' }); } catch (e) { next(e); } };
const typesChamps     = (req, res) => res.json(service.typesChamps());
const restore = async (req, res, next) => { 
    try { 
        await service.restore(req.params.id); 
        res.json({ message: 'Formulaire désarchivé avec succès.' }); 
    } catch (e) { next(e); } 
};

const restoreChamp = async (req, res, next) => { 
    try { 
        await service.restoreChamp(req.params.champId); 
        res.json({ message: 'Champ désarchivé avec succès.' }); 
    } catch (e) { next(e); } 
};


const getSections           = async (req, res, next) => { try { res.json(await service.getSections(req.params.id)); } catch (e) { next(e); } };
const addSection            = async (req, res, next) => { try { res.status(201).json(await service.addSection(req.params.id, req.body)); } catch (e) { next(e); } };
const updateSection         = async (req, res, next) => { try { res.json(await service.updateSection(req.params.sectionId, req.body)); } catch (e) { next(e); } };
const deleteSection         = async (req, res, next) => { try { await service.deleteSection(req.params.sectionId); res.json({ message: 'Section archivée.' }); } catch (e) { next(e); } };
const reordonnerSections    = async (req, res, next) => { try { await service.reordonnerSections(req.params.id, req.body.ordres); res.json({ message: 'Ordre des sections mis à jour.' }); } catch (e) { next(e); } };

module.exports = { getAll, getById, creer, modifier, softDelete, getChamps, addChamp, updateChamp, softDeleteChamp, reordonner, typesChamps, restore, restoreChamp, getSections, addSection, updateSection, deleteSection, reordonnerSections };
