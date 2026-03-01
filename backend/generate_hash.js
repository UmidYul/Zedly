// Generate bcrypt hash for password 'admin123'
const bcrypt = require('bcrypt');

async function generateHash() {
    const password = 'admin123';
    const hash = await bcrypt.hash(password, 10);
    console.log('Password:', password);
    console.log('Hash:', hash);
    console.log('\nUpdate seed_test_users.sql with this hash');
}

generateHash().catch(console.error);
