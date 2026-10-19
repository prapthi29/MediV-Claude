export class EmergencyAccessRepository {
  constructor(database) {
    this.database = database;
  }

  async create({
    patientUserId,
    doctorUserId,
    reason,
    expiresAt,
    blockchainTxHash = null,
  }) {
    const result = await this.database.query(
      `INSERT INTO emergency_access_grants (
         patient_user_id,
         doctor_user_id,
         reason,
         expires_at,
         blockchain_tx_hash
       )
       SELECT $1, $2, $3, $4, $5
       WHERE $4::timestamptz > NOW()
         AND $4::timestamptz <= NOW() + INTERVAL '1 hour'
       RETURNING *`,
      [
        patientUserId,
        doctorUserId,
        reason,
        expiresAt,
        blockchainTxHash,
      ]
    );

    if (!result.rows[0]) {
      throw new Error(
        "Emergency access expiry must be in the future and within one hour."
      );
    }

    return result.rows[0];
  }

  async findActive(patientUserId, doctorUserId) {
    const result = await this.database.query(
      `SELECT *
       FROM emergency_access_grants
       WHERE patient_user_id = $1
         AND doctor_user_id = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [patientUserId, doctorUserId]
    );

    return result.rows[0] ?? null;
  }

  async revoke(id) {
    const result = await this.database.query(
      `UPDATE emergency_access_grants
       SET revoked_at = NOW()
       WHERE id = $1
         AND revoked_at IS NULL
       RETURNING *`,
      [id]
    );

    return result.rows[0] ?? null;
  }
}
