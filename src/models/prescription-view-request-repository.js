// A doctor's request to view one prescription once, decided by the patient.
export class PrescriptionViewRequestRepository {
  constructor(database) {
    this.database = database;
  }

  async create({ prescriptionId, patientUserId, doctorUserId }) {
    const result = await this.database.query(
      `INSERT INTO prescription_view_requests
         (prescription_id, patient_user_id, doctor_user_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (prescription_id, doctor_user_id)
       DO UPDATE SET status = 'pending', requested_at = NOW(), decided_at = NULL, used_at = NULL
       WHERE prescription_view_requests.status IN ('rejected', 'revoked', 'used')
       RETURNING *`,
      [prescriptionId, patientUserId, doctorUserId]
    );
    if (result.rows[0]) return result.rows[0];
    const existing = await this.database.query(
      `SELECT * FROM prescription_view_requests WHERE prescription_id = $1 AND doctor_user_id = $2`,
      [prescriptionId, doctorUserId]
    );
    return existing.rows[0] ?? null;
  }

  async listForDoctorPatient(doctorUserId, patientUserId) {
    const result = await this.database.query(
      `SELECT id, prescription_id, status, requested_at, decided_at, used_at
       FROM prescription_view_requests
       WHERE doctor_user_id = $1 AND patient_user_id = $2`,
      [doctorUserId, patientUserId]
    );
    return result.rows;
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT req.id, req.prescription_id, req.doctor_user_id, req.status,
              req.requested_at, req.decided_at,
              p.title AS prescription_title, p.created_at AS prescription_created_at,
              doctor.name AS doctor_name, doctor.email AS doctor_email,
              doctor.license_id AS doctor_license_id
       FROM prescription_view_requests req
       JOIN prescriptions p ON p.id = req.prescription_id
       JOIN users doctor ON doctor.id = req.doctor_user_id
       WHERE req.patient_user_id = $1
       ORDER BY CASE WHEN req.status = 'pending' THEN 0 ELSE 1 END, req.requested_at DESC`,
      [patientUserId]
    );
    return result.rows;
  }

  async decide({ requestId, patientUserId, status }) {
    const result = await this.database.query(
      `UPDATE prescription_view_requests
       SET status = $3, decided_at = NOW()
       WHERE id = $1
         AND patient_user_id = $2
         AND ((status = 'pending' AND $3 IN ('approved', 'rejected'))
           OR (status = 'approved' AND $3 = 'revoked'))
       RETURNING *`,
      [requestId, patientUserId, status]
    );
    return result.rows[0] ?? null;
  }

  // The first view uses the approval up.
  async consumeApproved({ prescriptionId, patientUserId, doctorUserId }) {
    const result = await this.database.query(
      `UPDATE prescription_view_requests
       SET status = 'used', used_at = NOW()
       WHERE prescription_id = $1 AND patient_user_id = $2 AND doctor_user_id = $3
         AND status = 'approved'
       RETURNING *`,
      [prescriptionId, patientUserId, doctorUserId]
    );
    return result.rows[0] ?? null;
  }
}
