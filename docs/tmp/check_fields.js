require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
});

async function check() {
  const codes = [
    'PS-ME-EN-CAQ-A','PS-ME-EN-FDV-A','PS-ME-EN-FVE-A',
    'PS-ME-EN-MCI-A','PS-ME-EN-MCI-B','PS-ME-EN-NPE-A',
    'PS-ME-EN-REM-A','PS-ME-EN-CAA-A',
    'PO-AP-EN-CDP-A','PO-AP-EN-CDP-B',
    'PO-AP-EN-CPE-B','PO-QS-EN-DCP-B',
    'PO-AP-EN-DLD-B','PO-AP-EN-DRP-B'
  ];
  for (const code of codes) {
    const { rows } = await pool.query(
      `SELECT ft.code, ft.titre, COUNT(cd.id) AS nb_champs
       FROM formulaires_types ft
       LEFT JOIN champs_definitions cd ON cd.formulaire_type_id = ft.id AND cd.actif = TRUE
       WHERE ft.code = $1
       GROUP BY ft.id, ft.code, ft.titre`,
      [code]
    );
    if (rows.length > 0) {
      console.log(`${String(rows[0].code).padEnd(25)} ${String(rows[0].titre).padEnd(45)} ${rows[0].nb_champs} champs`);
    } else {
      console.log(`${code.padEnd(25)} NON TROUVÉ`);
    }
  }
  await pool.end();
}
check().catch(e => { console.error(e.message); process.exit(1); });
