export class ConsentRepository {
  constructor(database) {
    this.database = database;
  }

  async grant({ patientUserId, doctorUserId, expiresAt, transactionHash }) {
    const result = await this.database.query(
      `INSERT INTO patient_doctor_consents
         (patient_user_id, doctor_user_id, expires_at, revoked_at, blockchain_tx_hash)
       VALUES ($1, $2, $3, NULL, $4)
       ON CONFLICT (patient_user_id, doctor_user_id) DO UPDATE SET
         expires_at = EXCLUDED.expires_at,
         revoked_at = NULL,
         blockchain_tx_hash = EXCLUDED.blockchain_tx_hash,
         updated_at = NOW()
       RETURNING *`,
      [patientUserId, doctorUserId, expiresAt, transactionHash]
    );

    return result.rows[0];
  }

  async listActiveForDoctor(doctorUserId) {
    const result = await this.database.query(
      `SELECT consent.patient_user_id, consent.expires_at,
              consent.created_at, consent.updated_at,
              users.name AS patient_name, users.email AS patient_email
       FROM patient_doctor_consents consent
       JOIN users ON users.id = consent.patient_user_id
       WHERE consent.doctor_user_id = $1
         AND consent.revoked_at IS NULL
         AND consent.expires_at > NOW()
       ORDER BY consent.expires_at ASC`,
      [doctorUserId]
    );

    return result.rows;
  }

  async revoke({ patientUserId, doctorUserId, transactionHash }) {
    return this.database.transaction(async (client) => {
      const result = await client.query(
        `UPDATE patient_doctor_consents
         SET revoked_at = NOW(),
             blockchain_tx_hash = $3,
             updated_at = NOW()
         WHERE patient_user_id = $1
           AND doctor_user_id = $2
           AND revoked_at IS NULL
         RETURNING *`,
        [patientUserId, doctorUserId, transactionHash]
      );

      const consent = result.rows[0] ?? null;

      if (!consent) {
        return null;
      }

      // Revoke outstanding permissions in the same transaction.
      // Used approvals remain in the audit history.
      await client.query(
        `UPDATE emergency_profile_access_requests
         SET status = 'rejected',
             decided_at = COALESCE(decided_at, NOW())
         WHERE patient_user_id = $1
           AND doctor_user_id = $2
           AND status IN ('pending', 'approved')
           AND used_at IS NULL`,
        [patientUserId, doctorUserId]
      );

      return consent;
    });
  }

  async findActive(patientUserId, doctorUserId) {
    const result = await this.database.query(
      `SELECT *
       FROM patient_doctor_consents
       WHERE patient_user_id = $1
         AND doctor_user_id = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      [patientUserId, doctorUserId]
    );

    return result.rows[0] ?? null;
  }

  async listActiveForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT consent.doctor_user_id, consent.expires_at,
              consent.created_at, consent.updated_at,
              users.email AS doctor_email,
              users.name AS doctor_name,
              users.license_id
       FROM patient_doctor_consents consent
       JOIN users ON users.id = consent.doctor_user_id
       WHERE consent.patient_user_id = $1
         AND consent.revoked_at IS NULL
         AND consent.expires_at > NOW()
       ORDER BY consent.expires_at ASC`,
      [patientUserId]
    );

    return result.rows;
  }
}
