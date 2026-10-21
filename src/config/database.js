import pg from 'pg';

// client marks where a write comes from. The database refuses changes from
// connections that are not the API, a migration or an admin script.
export function createDatabase(config, { client: source = 'api' } = {}) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    application_name: `medivault-${source}`,
    ssl: config.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined
  });

  // Times are stored with their time zone; this makes the database show and
  // compute them in India Standard Time.
  pool.on('connect', (client) => {
    client
      .query(`SET TIME ZONE 'Asia/Kolkata'; SET medivault.client = '${source}'`)
      .catch(() => {});
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
