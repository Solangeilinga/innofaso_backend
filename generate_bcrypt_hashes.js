// generate_bcrypt_hashes.js
const bcrypt = require('bcrypt');

const password = 'admin123';
const saltRounds = 10; // Standard pour bcrypt

// Générer le hash
bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) throw err;
    console.log('Mot de passe :', password);
    console.log('Hash bcrypt :', hash);
    console.log('\n--- SQL à utiliser ---');
    console.log(`UPDATE utilisateurs SET mot_de_passe = '${hash}';`);
});