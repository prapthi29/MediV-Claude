export class RecordUpdateApprovalRepository {
  constructor(database) { this.database = database; }

  async create({ medicalRecordId, patientUserId, doctorUserId, expiresAt }) {
    const result = await this.database.query(
      `INSERT INTO medical_record_update_approvals
       (medical_record_id, patient_user_id, doctor_user_id, status, expires_at)
       VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
      [medicalRecordId, patientUserId, doctorUserId, expiresAt]
    );
    return result.rows[0];
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT a.id, a.medical_record_id, a.patient_user_id, a.doctor_user_id,
              a.status, a.requested_at, a.expires_at, a.decided_at, a.consumed_at,
              d.name AS doctor_name, d.email AS doctor_email,
              r.title AS record_title, r.original_filename
       FROM medical_record_update_approvals a
       JOIN users d ON d.id = a.doctor_user_id
       JOIN medical_records r ON r.id = a.medical_record_id
       WHERE a.patient_user_id = $1
       ORDER BY a.requested_at DESC`, [patientUserId]
    );
    return result.rows;
  }

  async decide({ approvalId, patientUserId, status }) {
    if (!['approved', 'rejected'].includes(status)) throw new Error('INVALID_UPDATE_APPROVAL_DECISION');
    const result = await this.database.query(
      `UPDATE medical_record_update_approvals
       SET status = $3, decided_at = NOW()
       WHERE id = $1 AND patient_user_id = $2 AND status = 'pending'
         AND expires_at > NOW()
       RETURNING *`, [approvalId, patientUserId, status]
    );
    return result.rows[0] ?? null;
  }

  async revoke({ approvalId, patientUserId }) {
    const result = await this.database.query(
      `UPDATE medical_record_update_approvals SET status = 'revoked', decided_at = NOW()
       WHERE id = $1 AND patient_user_id = $2 AND status = 'approved' AND expires_at > NOW()
       RETURNING *`, [approvalId, patientUserId]
    );
    return result.rows[0] ?? null;
  }

  async consume({ approvalId, medicalRecordId, patientUserId, doctorUserId }) {
    const result = await this.database.query(
      `UPDATE medical_record_update_approvals SET status = 'consumed', consumed_at = NOW()
       WHERE id = $1 AND medical_record_id = $2 AND patient_user_id = $3 AND doctor_user_id = $4
         AND status = 'approved' AND expires_at > NOW()
       RETURNING *`, [approvalId, medicalRecordId, patientUserId, doctorUserId]
    );
    return result.rows[0] ?? null;
  }
}
