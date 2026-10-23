const SHARE_SELECT = `
  SELECT s.*,
         ph.name AS pharmacy_name, ph.license_id AS pharmacy_license_id,
         pt.name AS patient_name, pt.patient_id AS patient_health_id,
         p.title AS prescription_title, p.created_at AS issued_at,
         -- When the pharmacy dispensed against this share, if it did.
         (SELECT MAX(pd.created_at) FROM prescription_dispenses pd
          WHERE pd.prescription_id = s.prescription_id AND pd.pharmacy_user_id = s.pharmacy_user_id
            AND pd.created_at >= s.created_at AND (s.revoked_at IS NULL OR pd.created_at <= s.revoked_at)) AS dispensed_at,
         d.name AS doctor_name
  FROM prescription_shares s
  JOIN users ph ON ph.id = s.pharmacy_user_id
  JOIN users pt ON pt.id = s.patient_user_id
  JOIN prescriptions p ON p.id = s.prescription_id
  JOIN users d ON d.id = p.doctor_user_id`;

export class PrescriptionShareRepository {
  constructor(database) {
    this.database = database;
  }

  async create({ prescriptionId, patientUserId, pharmacyUserId, expiresAt }) {
    const result = await this.database.query(
      `INSERT INTO prescription_shares (prescription_id, patient_user_id, pharmacy_user_id, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [prescriptionId, patientUserId, pharmacyUserId, expiresAt]
    );
    return this.findById(result.rows[0].id);
  }

  async findById(id) {
    const result = await this.database.query(`${SHARE_SELECT} WHERE s.id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async findActiveForPair(prescriptionId, pharmacyUserId) {
    const result = await this.database.query(
      `${SHARE_SELECT}
       WHERE s.prescription_id = $1 AND s.pharmacy_user_id = $2
         AND s.revoked_at IS NULL AND s.expires_at > NOW()
       ORDER BY s.created_at DESC LIMIT 1`,
      [prescriptionId, pharmacyUserId]
    );
    return result.rows[0] ?? null;
  }

  async findActiveForPharmacy(id, pharmacyUserId) {
    const result = await this.database.query(
      `${SHARE_SELECT}
       WHERE s.id = $1 AND s.pharmacy_user_id = $2
         AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
      [id, pharmacyUserId]
    );
    return result.rows[0] ?? null;
  }

  async listActiveForPharmacy(pharmacyUserId) {
    const result = await this.database.query(
      `${SHARE_SELECT}
       WHERE s.pharmacy_user_id = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
       ORDER BY s.created_at DESC`,
      [pharmacyUserId]
    );
    return result.rows;
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `${SHARE_SELECT} WHERE s.patient_user_id = $1 ORDER BY s.created_at DESC LIMIT 50`,
      [patientUserId]
    );
    return result.rows;
  }

  // Called when a prescription is dispensed: the shares in use end, and the
  // patient can share it again for the next refill.
  async revokeAllForPrescription(prescriptionId) {
    await this.database.query(
      `UPDATE prescription_shares SET revoked_at = NOW()
       WHERE prescription_id = $1 AND revoked_at IS NULL`,
      [prescriptionId]
    );
  }

  async revokeForPatient(id, patientUserId) {
    const result = await this.database.query(
      `UPDATE prescription_shares SET revoked_at = NOW()
       WHERE id = $1 AND patient_user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [id, patientUserId]
    );
    return result.rows[0] ? this.findById(result.rows[0].id) : null;
  }
}
