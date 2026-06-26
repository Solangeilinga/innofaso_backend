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
        return null;
    }
};

const classifyPanne = async (text, useLlm = false) => {
    try {
        const { data } = await axios.post(
            `${IA_URL}/api/classify`,
            { text, use_llm: useLlm },
            { timeout: 10000 }
        );
        return data;
    } catch (err) {
        console.error('IA classify indisponible:', err.message);
        return null;
    }
};

const botChat = async (message, history = []) => {
    try {
        const { data } = await axios.post(
            `${IA_URL}/api/bot/chat`,
            { message, history },
            { timeout: 15000 }
        );
        return data;
    } catch (err) {
        console.error('IA bot indisponible:', err.message);
        return null;
    }
};

module.exports = { getPredictionsPannes, classifyPanne, botChat };
