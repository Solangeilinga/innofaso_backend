// Wrapper Joi : valide req.body contre un schéma, appelle next(err) si invalide
const validate = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
        abortEarly: false,   // Retourner toutes les erreurs, pas seulement la première
        stripUnknown: true,    // Supprimer les champs non définis dans le schéma
    });

    if (error) {
        error.isJoi = true;
        return next(error);
    }

    req.body = value;        // Remplacer le body par la version validée et nettoyée
    next();
};

module.exports = validate;