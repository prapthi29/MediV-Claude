import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../config/database.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run database migrations.');
}

const database = createDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: process.env.DATABASE_SSL ?? 'false'
});

const directory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations'
);

try {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const result = await database.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file]
    );

    if (result.rows.length > 0) {
      console.log(`Skipping already applied ${file}`);
      continue;
    }

    const sql = await fs.readFile(path.join(directory, file), 'utf8');

    await database.transaction(async (client) => {
      // Recheck within the transaction to avoid duplicate application.
      const check = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );

      if (check.rows.length > 0) return;

      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
    });

    console.log(`Applied ${file}`);
  }

  console.log('Database migrations completed successfully.');
} finally {
  await database.close();
}
