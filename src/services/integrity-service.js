import crypto from 'node:crypto';

const SEAL_LOCK = 7036001;
const SEAL_BATCH = 5000;
const APP_CLIENTS = ['api', 'migrate', 'script'];
const ANCHORS_TO_VERIFY = 50;

const ENTRY_COLUMNS = `id::text AS id,
  (extract(epoch FROM occurred_at) * 1000000)::bigint::text AS occurred_us,
  db_user, client, application_name, table_name, row_key, operation, row_sha256, detail`;

export function chainHash(previousHash, entry) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([
      previousHash ?? '',
      entry.id,
      entry.occurred_us,
      entry.db_user,
      entry.client,
      entry.application_name,
      entry.table_name,
      entry.row_key,
      entry.operation,
      entry.row_sha256,
      entry.detail
    ]))
    .digest('hex');
}

// Seals the database change log into a hash chain, anchors the chain head on
// the blockchain, and checks that the stored data still matches both.
export class IntegrityService {
  constructor({ database, recordRegistryClient }) {
    this.database = database;
    this.recordRegistryClient = recordRegistryClient;
  }

  async seal() {
    return this.database.transaction(async (client) => {
      const locked = await client.query('SELECT pg_try_advisory_xact_lock($1) AS ok', [SEAL_LOCK]);
      if (!locked.rows[0].ok) return 0;

      const head = await client.query(
        `SELECT chain_seq::text AS seq, chain_hash FROM data_change_log
         WHERE chain_seq IS NOT NULL ORDER BY chain_seq DESC LIMIT 1`
      );
      let seq = Number(head.rows[0]?.seq ?? 0);
      let previous = head.rows[0]?.chain_hash ?? null;

      const pending = await client.query(
        `SELECT ${ENTRY_COLUMNS} FROM data_change_log
         WHERE chain_seq IS NULL ORDER BY id LIMIT ${SEAL_BATCH} FOR UPDATE`
      );
      if (!pending.rows.length) return 0;

      const ids = [];
      const seqs = [];
      const hashes = [];
      for (const entry of pending.rows) {
        seq += 1;
        previous = chainHash(previous, entry);
        ids.push(entry.id);
        seqs.push(seq);
        hashes.push(previous);
      }

      await client.query(
        `UPDATE data_change_log l SET chain_seq = s.seq, chain_hash = s.hash
         FROM unnest($1::bigint[], $2::bigint[], $3::text[]) AS s(id, seq, hash)
         WHERE l.id = s.id`,
        [ids, seqs, hashes]
      );

      return pending.rows.length;
    });
  }

  async anchor() {
    const head = await this.database.query(
      `SELECT chain_seq::text AS seq, chain_hash FROM data_change_log
       WHERE chain_seq IS NOT NULL ORDER BY chain_seq DESC LIMIT 1`
    );
    const latest = head.rows[0];
    if (!latest) return null;

    const anchored = await this.database.query(
      'SELECT COALESCE(MAX(up_to_seq), 0)::text AS seq FROM data_change_anchors'
    );
    if (Number(anchored.rows[0].seq) >= Number(latest.seq)) return null;

    const registration = await this.recordRegistryClient.anchorDigest({
      anchorId: `change-log:${latest.seq}`,
      sha256: latest.chain_hash
    });

    const result = await this.database.query(
      `INSERT INTO data_change_anchors (up_to_seq, chain_hash, blockchain_record_id, blockchain_tx_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (up_to_seq) DO NOTHING
       RETURNING *`,
      [latest.seq, latest.chain_hash, registration?.blockchainRecordId ?? null, registration?.transactionHash ?? null]
    );
    return result.rows[0] ?? null;
  }

  async sealAndAnchor() {
    // Seal everything that is waiting, then anchor the new head once.
    while ((await this.seal()) === SEAL_BATCH) { /* keep sealing */ }
    return this.anchor();
  }

  async check() {
    const problems = [];
    let checkedEntries = 0;
    let checkedRows = 0;

    // 1. The protections are still switched on.
    const tables = (await this.database.query('SELECT unnest(mv_guarded_tables()) AS name')).rows.map((r) => r.name);
    const triggers = await this.database.query(
      `SELECT c.relname AS table_name, t.tgname, t.tgenabled
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND t.tgname LIKE 'mv\\_%' AND NOT t.tgisinternal`
    );
    const rls = await this.database.query(
      `SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`
    );
    for (const table of tables) {
      for (const name of ['mv_00_require_app', 'mv_10_refuse_delete', 'mv_90_log_change']) {
        const trigger = triggers.rows.find((t) => t.table_name === table && t.tgname === name);
        if (!trigger || trigger.tgenabled === 'D') {
          problems.push({
            kind: 'protection_off',
            table,
            message: `Protection "${name}" is missing or switched off on ${table}.`
          });
        }
      }
    }
    for (const row of rls.rows) {
      if (!row.relrowsecurity && row.relname !== 'schema_migrations') {
        problems.push({ kind: 'rls_off', table: row.relname, message: `Row level security is off on ${row.relname}.` });
      }
    }

    // 2. The change log chain is unbroken.
    let expectedSeq = 1;
    let previous = null;
    const sealedHashes = new Map();
    let lastId = '0';
    for (;;) {
      const page = await this.database.query(
        `SELECT ${ENTRY_COLUMNS}, chain_seq::text AS seq, chain_hash FROM data_change_log
         WHERE chain_seq IS NOT NULL AND chain_seq > $1 ORDER BY chain_seq LIMIT 5000`,
        [lastId]
      );
      if (!page.rows.length) break;
      for (const entry of page.rows) {
        checkedEntries += 1;
        const seq = Number(entry.seq);
        if (seq !== expectedSeq) {
          problems.push({
            kind: 'log_gap',
            message: `Change log entries ${expectedSeq} to ${seq - 1} are missing.`
          });
        }
        const recomputed = chainHash(previous, entry);
        if (recomputed !== entry.chain_hash) {
          problems.push({ kind: 'log_altered', message: `Change log entry ${seq} was altered.` });
        }
        sealedHashes.set(seq, entry.chain_hash);
        previous = entry.chain_hash;
        expectedSeq = seq + 1;
      }
      lastId = page.rows[page.rows.length - 1].seq;
    }

    // 3. The anchors match the log and the blockchain.
    const anchors = await this.database.query(
      `SELECT up_to_seq::text AS seq, chain_hash FROM data_change_anchors
       ORDER BY up_to_seq DESC LIMIT ${ANCHORS_TO_VERIFY}`
    );
    for (const anchor of anchors.rows) {
      const seq = Number(anchor.seq);
      if (sealedHashes.has(seq) && sealedHashes.get(seq) !== anchor.chain_hash) {
        problems.push({ kind: 'anchor_mismatch', message: `The change log no longer matches anchor ${seq}.` });
      }
      try {
        const onChain = await this.recordRegistryClient.getRegisteredRecord({ recordId: `change-log:${seq}` });
        const chainValue = String(onChain?.contentHash ?? '').replace(/^0x/i, '').toLowerCase();
        if (!onChain && this.recordRegistryClient.isMock) {
          continue;
        } else if (!onChain) {
          problems.push({ kind: 'anchor_missing', message: `Anchor ${seq} was not found on the blockchain.` });
        } else if (chainValue !== anchor.chain_hash) {
          problems.push({ kind: 'anchor_mismatch', message: `Anchor ${seq} does not match the blockchain.` });
        }
      } catch (error) {
        problems.push({
          kind: 'chain_unreachable',
          message: `Could not reach the blockchain to verify anchor ${seq}: ${error?.shortMessage || error?.message || error}`
        });
        break;
      }
    }

    // 4. Every row matches its last logged state.
    for (const table of tables) {
      const result = await this.database.query(
        `WITH cur AS (SELECT * FROM mv_table_row_hashes($1)),
              last AS (
                SELECT DISTINCT ON (row_key) row_key, operation, row_sha256
                FROM data_change_log
                WHERE table_name = $1 AND operation <> 'DDL'
                ORDER BY row_key, id DESC
              )
         SELECT
           (SELECT COUNT(*) FROM cur)::int AS rows,
           ARRAY(SELECT l.row_key FROM last l WHERE l.operation <> 'DELETE'
                 AND NOT EXISTS (SELECT 1 FROM cur c WHERE c.row_key = l.row_key) LIMIT 20) AS removed,
           ARRAY(SELECT c.row_key FROM cur c JOIN last l ON l.row_key = c.row_key
                 WHERE l.operation <> 'DELETE' AND l.row_sha256 IS DISTINCT FROM c.row_sha256 LIMIT 20) AS changed,
           ARRAY(SELECT c.row_key FROM cur c WHERE NOT EXISTS (
                 SELECT 1 FROM last l WHERE l.row_key = c.row_key AND l.operation <> 'DELETE') LIMIT 20) AS added`,
        [table]
      );
      const { rows, removed, changed, added } = result.rows[0];
      checkedRows += rows;
      for (const key of removed) {
        problems.push({ kind: 'row_removed', table, rowKey: key, message: `A row in ${table} was removed without a log entry.` });
      }
      for (const key of changed) {
        problems.push({ kind: 'row_changed', table, rowKey: key, message: `A row in ${table} was changed without a log entry.` });
      }
      for (const key of added) {
        problems.push({ kind: 'row_added', table, rowKey: key, message: `A row in ${table} was added without a log entry.` });
      }
    }

    // 5. Changes that did not come through the app or a migration.
    const outside = await this.database.query(
      `SELECT id::text AS id, occurred_at, db_user, client, application_name, table_name, operation, detail
       FROM data_change_log
       WHERE (client IS NULL OR client <> ALL($1::text[]))
          OR (operation = 'DDL' AND client IS DISTINCT FROM 'migrate')
       ORDER BY id DESC LIMIT 50`,
      [APP_CLIENTS]
    );
    for (const entry of outside.rows) {
      problems.push({
        kind: entry.operation === 'DDL' ? 'schema_changed' : 'outside_change',
        table: entry.table_name,
        at: entry.occurred_at,
        message: entry.operation === 'DDL'
          ? `Schema changed outside a migration: ${entry.detail} ${entry.table_name} (by ${entry.db_user}).`
          : `${entry.operation} on ${entry.table_name} did not come through the app (by ${entry.db_user}).`
      });
    }

    const saved = await this.database.query(
      `INSERT INTO integrity_checks (status, checked_rows, checked_entries, problems)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [problems.length ? 'problems' : 'ok', checkedRows, checkedEntries, JSON.stringify(problems)]
    );
    return publicCheck(saved.rows[0]);
  }

  async run() {
    let anchorError = null;
    try {
      await this.sealAndAnchor();
    } catch (error) {
      anchorError = error;
      console.error('[Integrity] Anchoring failed:', error?.shortMessage || error?.message || error);
    }
    const result = await this.check();
    return anchorError
      ? { ...result, anchorError: anchorError?.shortMessage || anchorError?.message || String(anchorError) }
      : result;
  }

  async status() {
    const [latest, anchor, unsealed] = await Promise.all([
      this.database.query('SELECT * FROM integrity_checks ORDER BY id DESC LIMIT 1'),
      this.database.query('SELECT * FROM data_change_anchors ORDER BY up_to_seq DESC LIMIT 1'),
      this.database.query(
        `SELECT COUNT(*) FILTER (WHERE chain_seq IS NULL)::int AS unsealed,
                COUNT(*)::int AS total FROM data_change_log`
      )
    ]);
    const lastAnchor = anchor.rows[0];
    return {
      lastCheck: latest.rows[0] ? publicCheck(latest.rows[0]) : null,
      lastAnchor: lastAnchor
        ? {
            upToEntry: Number(lastAnchor.up_to_seq),
            transactionHash: lastAnchor.blockchain_tx_hash,
            anchoredAt: lastAnchor.anchored_at
          }
        : null,
      logEntries: unsealed.rows[0].total,
      waitingToSeal: unsealed.rows[0].unsealed
    };
  }

  // Seals and anchors every few minutes, and runs the full check once a day.
  start({ anchorEveryMs = 10 * 60 * 1000, checkEveryMs = 24 * 60 * 60 * 1000 } = {}) {
    const anchorTimer = setInterval(() => {
      this.sealAndAnchor().catch((error) =>
        console.error('[Integrity] Anchoring failed:', error?.shortMessage || error?.message || error));
    }, anchorEveryMs);
    const checkTimer = setInterval(() => {
      this.run()
        .then((result) => console.log(`[Integrity] Daily check: ${result.status} (${result.problems.length} problems)`))
        .catch((error) => console.error('[Integrity] Check failed:', error?.message || error));
    }, checkEveryMs);
    const firstRun = setTimeout(() => {
      this.run().catch((error) => console.error('[Integrity] Check failed:', error?.message || error));
    }, 30 * 1000);
    for (const timer of [anchorTimer, checkTimer, firstRun]) timer.unref?.();
    return () => {
      clearInterval(anchorTimer);
      clearInterval(checkTimer);
      clearTimeout(firstRun);
    };
  }
}

function publicCheck(row) {
  return {
    id: Number(row.id),
    ranAt: row.ran_at,
    status: row.status,
    checkedRows: row.checked_rows,
    checkedEntries: row.checked_entries,
    problems: row.problems ?? []
  };
}
