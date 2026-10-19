import bcrypt from 'bcrypt';
import { createDatabase } from '../config/database.js';
import { loadEnv } from '../config/env.js';

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node src/scripts/create-admin.js <email> <password>');
  process.exit(1);
}

if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}

const database = createDatabase(loadEnv());

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await database.query(
    `INSERT INTO users (email, password_hash, role, status)
     VALUES ($1, $2, 'admin', 'active')
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [email.trim().toLowerCase(), passwordHash]
  );
  if (result.rows[0]) {
    console.log(`Admin created: ${result.rows[0].email} (${result.rows[0].id})`);
  } else {
    console.log('A user with that email already exists; nothing changed.');
  }
} finally {
  await database.close();
}
