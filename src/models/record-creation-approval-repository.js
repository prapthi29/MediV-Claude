
export class RecordCreationApprovalRepository {
  constructor(database) {
    this.database = database;
  }

  async create({ patientUserId, doctorUserId, expiresAt }) {
    const result = await this.database.query(
      `INSERT INTO medical_record_creation_approvals
         (patient_user_id, doctor_user_id, status, expires_at)
       VALUES ($1, $2, 'pending', $3)
       RETURNING *`,
      [patientUserId, doctorUserId, expiresAt]
    );

    return result.rows[0];
  }

  async findById(approvalId) {
    const result = await this.database.query(
      `SELECT *
       FROM medical_record_creation_approvals
       WHERE id = $1`,
      [approvalId]
    );

    return result.rows[0] ?? null;
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT
         a.id,
         a.patient_user_id,
         a.doctor_user_id,
         a.status,
         a.requested_at,
         a.expires_at,
         a.decided_at,
         a.consumed_at,
         u.name AS doctor_name,
         u.email AS doctor_email,
         u.license_id AS doctor_license_id
       FROM medical_record_creation_approvals a
       JOIN users u ON u.id = a.doctor_user_id
       WHERE a.patient_user_id = $1
       ORDER BY a.requested_at DESC`,
      [patientUserId]
    );

    return result.rows;
  }

  async decide({ approvalId, patientUserId, status }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw new Error('INVALID_CREATION_APPROVAL_DECISION');
    }

    const result = await this.database.query(
      `UPDATE medical_record_creation_approvals
       SET status = $3,
           decided_at = NOW()
       WHERE id = $1
         AND patient_user_id = $2
         AND status = 'pending'
         AND expires_at > NOW()
       RETURNING *`,
      [approvalId, patientUserId, status]
    );

    return result.rows[0] ?? null;
  }

  async revoke({ approvalId, patientUserId }) {
    const result = await this.database.query(
      `UPDATE medical_record_creation_approvals
       SET status = 'revoked',
           decided_at = NOW()
       WHERE id = $1
         AND patient_user_id = $2
         AND status = 'approved'
         AND expires_at > NOW()
       RETURNING *`,
      [approvalId, patientUserId]
    );

    return result.rows[0] ?? null;
  }

  async consume({ approvalId, patientUserId, doctorUserId }) {
    const result = await this.database.query(
      `UPDATE medical_record_creation_approvals
       SET status = 'consumed',
           consumed_at = NOW()
       WHERE id = $1
         AND patient_user_id = $2
         AND doctor_user_id = $3
         AND status = 'approved'
         AND expires_at > NOW()
       RETURNING *`,
      [approvalId, patientUserId, doctorUserId]
    );

    return result.rows[0] ?? null;
  }
}
