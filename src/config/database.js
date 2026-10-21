import pg from 'pg';

export function createDatabase(config) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined
  });

  // Times are stored with their time zone; this makes the database show and
  // compute them in India Standard Time.
  pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'Asia/Kolkata'").catch(() => {});
  });

  return {
    query: (text, values) => pool.query(text, values),

    async transaction(callback) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Database rollback failed:', rollbackError);
        }
        throw error;
      } finally {
        client.release();
      }
    },

    close: () => pool.end()
  };
}
