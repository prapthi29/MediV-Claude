export class RecordAccessRequestRepository {
  constructor(database) {
    this.database = database;
  }

  async create({ recordId, patientUserId, doctorUserId }) {
    const result = await this.database.query(
      `INSERT INTO medical_record_access_requests
        (record_id, patient_user_id, doctor_user_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (record_id, doctor_user_id)
       DO UPDATE SET
         status = 'pending',
         requested_at = NOW(),
         decided_at = NULL
       WHERE medical_record_access_requests.status
         IN ('rejected', 'revoked')
       RETURNING *`,
      [recordId, patientUserId, doctorUserId]
    );

    if (result.rows[0]) return result.rows[0];

    const existing = await this.findForRecordDoctor(
      recordId,
      doctorUserId
    );

    return existing;
  }

  async findForRecordDoctor(recordId, doctorUserId) {
    const result = await this.database.query(
      `SELECT *
       FROM medical_record_access_requests
       WHERE record_id = $1 AND doctor_user_id = $2`,
      [recordId, doctorUserId]
    );

    return result.rows[0] ?? null;
  }

  async hasApproved({ recordId, patientUserId, doctorUserId }) {
    const result = await this.database.query(
      `SELECT 1
       FROM medical_record_access_requests
       WHERE record_id = $1
         AND patient_user_id = $2
         AND doctor_user_id = $3
         AND status = 'approved'
       LIMIT 1`,
      [recordId, patientUserId, doctorUserId]
    );

    return result.rows.length > 0;
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT
         req.id,
         req.record_id,
         req.patient_user_id,
         req.doctor_user_id,
         req.status,
         req.requested_at,
         req.decided_at,
         rec.original_filename,
         rec.title,
         rec.category,
         rec.created_at AS record_created_at,
         doctor.email AS doctor_email
       FROM medical_record_access_requests req
       JOIN medical_records rec
         ON rec.id = req.record_id
        AND rec.patient_user_id = req.patient_user_id
       JOIN users doctor ON doctor.id = req.doctor_user_id
       WHERE req.patient_user_id = $1
       ORDER BY
         CASE WHEN req.status = 'pending' THEN 0 ELSE 1 END,
         req.requested_at DESC`,
      [patientUserId]
    );

    return result.rows;
  }

  async decide({ requestId, patientUserId, status }) {
    const result = await this.database.query(
      `UPDATE medical_record_access_requests
       SET status = $3, decided_at = NOW()
       WHERE id = $1
         AND patient_user_id = $2
         AND (
           (status = 'pending' AND $3 IN ('approved', 'rejected'))
           OR (status = 'approved' AND $3 = 'revoked')
         )
       RETURNING *`,
      [requestId, patientUserId, status]
    );

    return result.rows[0] ?? null;
  }
}