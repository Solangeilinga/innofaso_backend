// Retourne offset et métadonnées de pagination
const paginate = (page, limit, total) => {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (p - 1) * l;

    return {
        offset,
        meta: {
            page: p,
            limit: l,
            total,
            total_pages: Math.ceil(total / l),
            has_next: p * l < total,
            has_prev: p > 1,
        },
    };
};

module.exports = paginate;