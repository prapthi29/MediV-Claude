
const ACCOUNT_EVENT_TYPES = ['user_approved', 'user_rejected', 'signing_key_created'];

export class AuditRepository {
  constructor(database) {
    this.database = database;
  }

  async create({
    eventType,
    actorUserId,
    subjectUserId,
    resourceType,
    resourceId,
    metadata,
    blockchainTxHash,
  }) {
    // Normalize the blockchain transaction hash.
    const txHash =
      typeof blockchainTxHash === "string"
        ? blockchainTxHash.trim()
        : null;

    // Validate the hash length before inserting.
    if (txHash && txHash.length > 66) {
      throw new Error(
        "Invalid blockchain transaction hash: expected at most 66 characters."
      );
    }

    const result = await this.database.query(
      `INSERT INTO audit_events (
        event_type,
        actor_user_id,
        subject_user_id,
        resource_type,
        resource_id,
        metadata,
        blockchain_tx_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        eventType,
        actorUserId,
        subjectUserId,
        resourceType,
        resourceId,
        JSON.stringify(metadata ?? {}),
        txHash || null,
      ]
    );

    return result.rows[0];
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT
        id,
        event_type,
        actor_user_id,
        subject_user_id,
        resource_type,
        resource_id,
        metadata,
        created_at
      FROM audit_events
      WHERE subject_user_id = $1
      ORDER BY created_at DESC
      LIMIT 200`,
      [patientUserId]
    );

    return result.rows;
  }

  async listForPharmacy(pharmacyUserId) {
    const result = await this.database.query(
      `SELECT id, resource_id AS prescription_id,
              CASE WHEN metadata->>'valid' = 'true' THEN 'verified' ELSE 'failed' END AS result,
              COALESCE(metadata->>'medication_summary', 'Prescription verification') AS medication_summary,
              created_at AS at
       FROM audit_events
       WHERE actor_user_id = $1 AND event_type = 'prescription_verified'
       ORDER BY created_at DESC LIMIT 200`,
      [pharmacyUserId]
    );
    return result.rows;
  }

  // Admin view: account events about doctors, pharmacies and admins only.
  // Events whose subject is a patient never reach the admin.
  async listAccountEvents({ limit = 200 } = {}) {
    const safeLimit = Math.max(
      1,
      Math.min(Number.parseInt(limit, 10) || 200, 1000)
    );

    const result = await this.database.query(
      `SELECT
        id,
        event_type,
        actor_user_id,
        subject_user_id,
        resource_type,
        resource_id,
        metadata,
        blockchain_tx_hash,
        created_at
      FROM audit_events
      WHERE event_type = ANY($2)
        AND subject_user_id IN (SELECT id FROM users WHERE role <> 'patient')
      ORDER BY created_at DESC
      LIMIT $1`,
      [safeLimit, ACCOUNT_EVENT_TYPES]
    );

    return result.rows;
  }
}