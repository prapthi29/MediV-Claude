import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../config/database.js';

// Migrations change the schema, so they may use an owner login while the API
// runs on the restricted one.
const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run database migrations.');
}

const database = createDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: process.env.DATABASE_SSL ?? 'false'
}, { client: 'migrate' });

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

  let applied = 0;
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
    applied += 1;
  }

  // A migration that adds or changes columns changes every row's hash, so
  // record the new state as the trusted baseline for the integrity check.
  if (applied > 0) {
    const guarded = await database.query("SELECT to_regproc('mv_rebaseline') IS NOT NULL AS ok");
    if (guarded.rows[0].ok) {
      const result = await database.query('SELECT mv_rebaseline() AS added');
      console.log(`Recorded ${result.rows[0].added} rows as the new integrity baseline.`);
    }
  }

  console.log('Database migrations completed successfully.');
} finally {
  await database.close();
}
