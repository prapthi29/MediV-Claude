
export class EmergencyProfileAccessRequestRepository {
  constructor(database) {
    this.database = database;
  }

  /**
   * Creates a permission request only while the patient-doctor
   * connection is active.
   *
   * The consent row is locked inside the transaction. Revocation
   * uses the same row, so request creation and revocation serialize.
   */
  async create({ patientUserId, doctorUserId, operation }) {
    return this.database.transaction(async (client) => {
      // Lock the connection before creating or checking a request.
      const consent = await client.query(
        `SELECT patient_user_id
         FROM patient_doctor_consents
         WHERE patient_user_id = $1
           AND doctor_user_id = $2
           AND revoked_at IS NULL
           AND expires_at > NOW()
         FOR UPDATE`,
        [patientUserId, doctorUserId],
      );

      // No active connection: do not create or return a request.
      if (consent.rows.length !== 1) {
        return null;
      }

      // Create a pending request if one does not already exist.
      const result = await client.query(
        `INSERT INTO emergency_profile_access_requests
           (patient_user_id, doctor_user_id, operation, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (patient_user_id, doctor_user_id, operation)
           WHERE status = 'pending'
         DO NOTHING
         RETURNING *`,
        [patientUserId, doctorUserId, operation],
      );

      if (result.rows[0]) {
        return result.rows[0];
      }

      // Preserve idempotent behavior: return the existing pending
      // request for this patient, doctor, and operation.
      const existing = await client.query(
        `SELECT *
         FROM emergency_profile_access_requests
         WHERE patient_user_id = $1
           AND doctor_user_id = $2
           AND operation = $3
           AND status = 'pending'
         LIMIT 1`,
        [patientUserId, doctorUserId, operation],
      );

      return existing.rows[0] ?? null;
    });
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT
         req.id,
         req.doctor_user_id,
         doctor.name AS doctor_name,
         doctor.license_id,
         req.operation,
         req.status,
         req.requested_at,
         req.decided_at,
         req.used_at
       FROM emergency_profile_access_requests req
       JOIN users doctor ON doctor.id = req.doctor_user_id
       WHERE req.patient_user_id = $1
       ORDER BY
         CASE WHEN req.status = 'pending' THEN 0 ELSE 1 END,
         req.requested_at DESC`,
      [patientUserId],
    );

    return result.rows;
  }

  // Only requests the doctor can still act on: waiting for the patient, or
  // approved and not yet used. Used, rejected and revoked ones are left out.
  async listForDoctor({ patientUserId, doctorUserId }) {
    const result = await this.database.query(
      `SELECT
         id,
         operation,
         status,
         requested_at,
         decided_at,
         used_at
       FROM emergency_profile_access_requests
       WHERE patient_user_id = $1
         AND doctor_user_id = $2
         AND (status = 'pending' OR (status = 'approved' AND used_at IS NULL))
       ORDER BY requested_at DESC`,
      [patientUserId, doctorUserId],
    );

    return result.rows;
  }

  /**
   * Preliminary approval check. This does not consume the approval.
   */
  async isApproved({
    requestId,
    patientUserId,
    doctorUserId,
    operation,
  }) {
    const result = await this.database.query(
      `SELECT 1
       FROM emergency_profile_access_requests req
       JOIN patient_doctor_consents c
         ON c.patient_user_id = req.patient_user_id
        AND c.doctor_user_id = req.doctor_user_id
       WHERE req.id = $1
         AND req.patient_user_id = $2
         AND req.doctor_user_id = $3
         AND req.operation = $4
         AND req.status = 'approved'
         AND req.used_at IS NULL
         AND c.revoked_at IS NULL
         AND c.expires_at > NOW()
       LIMIT 1`,
      [requestId, patientUserId, doctorUserId, operation],
    );

    return result.rows.length === 1;
  }

  /**
   * Consumes an approved request inside the caller's transaction.
   *
   * Locks the consent row first, serializing consumption with
   * consent revocation and request creation.
   */
  async consumeApproved(
    client,
    { requestId, patientUserId, doctorUserId, operation },
  ) {
    const consent = await client.query(
      `SELECT patient_user_id
       FROM patient_doctor_consents
       WHERE patient_user_id = $1
         AND doctor_user_id = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [patientUserId, doctorUserId],
    );

    if (consent.rows.length !== 1) {
      return false;
    }

    const result = await client.query(
      `UPDATE emergency_profile_access_requests
       SET used_at = NOW()
       WHERE id = $1
         AND patient_user_id = $2
         AND doctor_user_id = $3
         AND operation = $4
         AND status = 'approved'
         AND used_at IS NULL
       RETURNING id`,
      [requestId, patientUserId, doctorUserId, operation],
    );

    return result.rows.length === 1;
  }

  async decide({ requestId, patientUserId, status }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new Error(
        'Invalid emergency-profile permission decision.',
      );
    }

    const result = await this.database.query(
      `UPDATE emergency_profile_access_requests
       SET status = $3,
           decided_at = NOW()
       WHERE id = $1
         AND patient_user_id = $2
         AND status = 'pending'
       RETURNING *`,
      [requestId, patientUserId, status],
    );

    return result.rows[0] ?? null;
  }
}
