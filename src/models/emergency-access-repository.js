const GRANT_SELECT = `
  SELECT g.*,
         d.name AS doctor_name, d.license_id AS doctor_license_id,
         p.name AS patient_name, p.patient_id AS patient_health_id
  FROM emergency_access_grants g
  JOIN users d ON d.id = g.doctor_user_id
  JOIN users p ON p.id = g.patient_user_id`;

export class EmergencyAccessRepository {
  constructor(database) {
    this.database = database;
  }

  async create({
    patientUserId,
    doctorUserId,
    reason,
    expiresAt,
    durationMinutes = null,
    requestPayload = null,
    requestSha256 = null,
    doctorSignature = null,
    signerAddress = null,
    blockchainTxHash = null,
  }) {
    const result = await this.database.query(
      `INSERT INTO emergency_access_grants (
         patient_user_id, doctor_user_id, reason, expires_at, blockchain_tx_hash,
         duration_minutes, request_payload, request_sha256, doctor_signature, signer_address
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       WHERE $4::timestamptz > NOW()
         AND $4::timestamptz <= NOW() + INTERVAL '1 hour'
       RETURNING *`,
      [
        patientUserId,
        doctorUserId,
        reason,
        expiresAt,
        blockchainTxHash,
        durationMinutes,
        requestPayload ? JSON.stringify(requestPayload) : null,
        requestSha256,
        doctorSignature,
        signerAddress,
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
      `${GRANT_SELECT}
       WHERE g.patient_user_id = $1
         AND g.doctor_user_id = $2
         AND g.revoked_at IS NULL
         AND g.expires_at > NOW()
       ORDER BY g.created_at DESC
       LIMIT 1`,
      [patientUserId, doctorUserId]
    );

    return result.rows[0] ?? null;
  }

  async listActiveForDoctor(doctorUserId) {
    const result = await this.database.query(
      `${GRANT_SELECT}
       WHERE g.doctor_user_id = $1
         AND g.revoked_at IS NULL
         AND g.expires_at > NOW()
       ORDER BY g.created_at DESC`,
      [doctorUserId]
    );

    return result.rows;
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `${GRANT_SELECT}
       WHERE g.patient_user_id = $1
       ORDER BY g.created_at DESC
       LIMIT 20`,
      [patientUserId]
    );

    return result.rows;
  }

  async revokeForPatient(id, patientUserId) {
    const result = await this.database.query(
      `UPDATE emergency_access_grants
       SET revoked_at = NOW(), revoked_by_user_id = $2
       WHERE id = $1
         AND patient_user_id = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()
       RETURNING *`,
      [id, patientUserId]
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
