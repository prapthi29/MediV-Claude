// Per-prescription patient approvals: each approval allows one prescription.
export class PrescriptionApprovalRepository {
  constructor(database) {
    this.database = database;
  }

  async create({ patientUserId, doctorUserId, expiresAt }) {
    const result = await this.database.query(
      `INSERT INTO prescription_approvals (patient_user_id, doctor_user_id, status, expires_at)
       VALUES ($1, $2, 'pending', $3) RETURNING *`,
      [patientUserId, doctorUserId, expiresAt]
    );
    return result.rows[0];
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT a.*, d.name AS doctor_name, d.email AS doctor_email, d.license_id AS doctor_license_id
       FROM prescription_approvals a
       JOIN users d ON d.id = a.doctor_user_id
       WHERE a.patient_user_id = $1
       ORDER BY a.requested_at DESC
       LIMIT 50`,
      [patientUserId]
    );
    return result.rows;
  }

  async listForDoctorPatient(doctorUserId, patientUserId) {
    const result = await this.database.query(
      `SELECT id, status, requested_at, expires_at, decided_at, consumed_at
       FROM prescription_approvals
       WHERE doctor_user_id = $1 AND patient_user_id = $2
       ORDER BY requested_at DESC
       LIMIT 20`,
      [doctorUserId, patientUserId]
    );
    return result.rows;
  }

  async decide({ approvalId, patientUserId, status }) {
    const result = await this.database.query(
      `UPDATE prescription_approvals SET status = $3, decided_at = NOW()
       WHERE id = $1 AND patient_user_id = $2 AND status = 'pending' AND expires_at > NOW()
       RETURNING *`,
      [approvalId, patientUserId, status]
    );
    return result.rows[0] ?? null;
  }

  async revoke({ approvalId, patientUserId }) {
    const result = await this.database.query(
      `UPDATE prescription_approvals SET status = 'revoked', decided_at = NOW()
       WHERE id = $1 AND patient_user_id = $2 AND status = 'approved' AND expires_at > NOW()
       RETURNING *`,
      [approvalId, patientUserId]
    );
    return result.rows[0] ?? null;
  }

  async consume({ approvalId, patientUserId, doctorUserId }) {
    const result = await this.database.query(
      `UPDATE prescription_approvals SET status = 'consumed', consumed_at = NOW()
       WHERE id = $1 AND patient_user_id = $2 AND doctor_user_id = $3
         AND status = 'approved' AND expires_at > NOW()
       RETURNING *`,
      [approvalId, patientUserId, doctorUserId]
    );
    return result.rows[0] ?? null;
  }
}
