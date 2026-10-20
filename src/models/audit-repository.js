
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

  // Dispensing history only: the patient's MV- ID and the medicines, never
  // the patient's or the doctor's name.
  async listForPharmacy(pharmacyUserId) {
    const result = await this.database.query(
      `SELECT a.id, u.patient_id,
              COALESCE(NULLIF(a.metadata->>'medication_summary', ''), 'Prescription dispensed') AS medication_summary,
              a.created_at AS at
       FROM audit_events a
       LEFT JOIN users u ON u.id = a.subject_user_id
       WHERE a.actor_user_id = $1 AND a.event_type = 'prescription_dispensed'
       ORDER BY a.created_at DESC LIMIT 200`,
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