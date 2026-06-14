const axios = require('axios');

const IA_URL = process.env.IA_SERVICE_URL || 'http://localhost:5001';

const getPredictionsPannes = async (annee, mois) => {
    try {
        const { data } = await axios.get(
            `${IA_URL}/api/predict/${annee}/${mois}`,
            { timeout: 10000 }
        );
        return data;
    } catch (err) {
        console.error('IA service indisponible:', err.message);
        return null; // non bloquant
    }
};

module.exports = { getPredictionsPannes };