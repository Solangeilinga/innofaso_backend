const { query, transaction } = require('../../config/db');
const { logAudit } = require('../../middleware/auditLogger');
const alertesService = require('../alertes/alertes.service');

const getPieces = async (equipementId) => {
    const where = equipementId ? 'WHERE pr.equipement_id = $1' : '';
    const params = equipementId ? [equipementId] : [];
    const { rows } = await query(
        `SELECT pr.*, e.nom AS equipement_nom,
             pr.quantite_stock <= pr.seuil_alerte AS stock_bas
         FROM pieces_rechange pr
         JOIN equipements e ON e.id = pr.equipement_id
         ${where}
         ORDER BY e.nom, pr.designation`,
        params
    );
    return rows;
};

const getPiecesEnAlerte = async () => {
    const { rows } = await query(
        `SELECT pr.*, e.nom AS equipement_nom, e.code_ref AS equipement_code
         FROM pieces_rechange pr
         JOIN equipements e ON e.id = pr.equipement_id
         WHERE pr.quantite_stock <= pr.seuil_alerte
         ORDER BY (pr.quantite_stock::float / NULLIF(pr.seuil_alerte, 0)) ASC`
    );
    return rows;
};

const getPieceById = async (id) => {
    const { rows } = await query(
        `SELECT pr.*, e.nom AS equipement_nom, e.code_ref
         FROM pieces_rechange pr
         JOIN equipements e ON e.id = pr.equipement_id
         WHERE pr.id = $1`,
        [id]
    );
    if (rows.length === 0) {
        const err = new Error('Pièce non trouvée.'); err.statusCode = 404; throw err;
    }
    return rows[0];
};

const getMouvements = async (pieceId, { page = 1, limit = 20 }) => {
    const { rows } = await query(
        `SELECT ms.*, u.nom AS operateur_nom, u.prenom AS operateur_prenom
         FROM mouvements_stock ms
         JOIN utilisateurs u ON u.id = ms.utilisateur_id
         WHERE ms.piece_id = $1
         ORDER BY ms.date_mouvement DESC
         LIMIT $2 OFFSET $3`,
        [pieceId, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]
    );
    return rows;
};

const creerPiece = async (data, actorId) => {
    const { rows } = await query(
        `INSERT INTO pieces_rechange (equipement_id, reference, designation, quantite_stock, seuil_alerte, unite)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [data.equipement_id, data.reference, data.designation,
            data.quantite_stock || 0, data.seuil_alerte || 5, data.unite || 'pièce']
    );
    return rows[0];
};

const updatePiece = async (id, data, actorId, ip, appareil) => {
    const ancien = await getPieceById(id);

    const sets = [];
    const params = [];
    const allowed = ['reference', 'designation', 'seuil_alerte', 'unite'];

    for (const field of allowed) {
        if (data[field] !== undefined) {
            params.push(data[field]);
            sets.push(`${field} = $${params.length}`);
        }
    }

    if (sets.length === 0) return ancien;

    params.push(id);
    const { rows } = await query(
        `UPDATE pieces_rechange SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
    );

    await logAudit({
        utilisateur_id: actorId, table_cible: 'pieces_rechange',
        enregistrement_id: id, action: 'UPDATE',
        ancienne_valeur: ancien, nouvelle_valeur: data,
        adresse_ip: ip, appareil,
    });

    return rows[0];
};

const enregistrerMouvement = async ({ piece_id, type_mouvement, quantite, motif }, utilisateurId) => {
    return transaction(async (client) => {
        const { rows: piece } = await client.query(
            'SELECT * FROM pieces_rechange WHERE id = $1 FOR UPDATE', [piece_id]
        );
        if (piece.length === 0) {
            const err = new Error('Pièce non trouvée.'); err.statusCode = 404; throw err;
        }

        const pieceData = piece[0];
        let nouvQuantite = pieceData.quantite_stock;

        if (type_mouvement === 'ENTREE') {
            nouvQuantite += quantite;
        } else {
            if (pieceData.quantite_stock < quantite) {
                const err = new Error(`Stock insuffisant : ${pieceData.quantite_stock} disponible(s)`);
                err.statusCode = 400; throw err;
            }
            nouvQuantite -= quantite;
        }

        await client.query(
            'UPDATE pieces_rechange SET quantite_stock = $1 WHERE id = $2',
            [nouvQuantite, piece_id]
        );

        const { rows: mouvement } = await client.query(
            `INSERT INTO mouvements_stock (piece_id, utilisateur_id, type_mouvement, quantite, motif)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [piece_id, utilisateurId, type_mouvement, quantite, motif || null]
        );

        // Générer alerte si le stock passe sous le seuil après une sortie
        if (type_mouvement === 'SORTIE' && nouvQuantite <= pieceData.seuil_alerte) {
            await alertesService.verifierStocksBas();
        }

        return { ...mouvement[0], nouveau_stock: nouvQuantite };
    });
};

const supprimerPiece = async (id) => {
    const { rowCount } = await query('DELETE FROM pieces_rechange WHERE id = $1', [id]);
    if (rowCount === 0) {
        const err = new Error('Pièce non trouvée.'); err.statusCode = 404; throw err;
    }
};

module.exports = { getPieces, getPiecesEnAlerte, getPieceById, getMouvements, creerPiece, updatePiece, enregistrerMouvement, supprimerPiece };
