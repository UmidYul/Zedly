const bcrypt = require('bcrypt');

const password = process.argv[2] || 'Admin123!';

bcrypt.hash(password, 12, (err, hash) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nSQL to update user:');
  console.log(`UPDATE users SET password_hash = '${hash}' WHERE username = 'admin';`);
});
