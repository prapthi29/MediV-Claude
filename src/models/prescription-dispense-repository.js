// What each pharmacy handed over, one row per visit.
export class PrescriptionDispenseRepository {
  constructor(database) {
    this.database = database;
  }

  async create({ prescriptionId, pharmacyUserId, totals, quantities, dispenseSha256, signature, signerAddress, createdAt }) {
    const result = await this.database.query(
      `INSERT INTO prescription_dispenses
         (prescription_id, pharmacy_user_id, totals, quantities, dispense_sha256, signature, signer_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [prescriptionId, pharmacyUserId, JSON.stringify(totals), JSON.stringify(quantities), dispenseSha256, signature, signerAddress, createdAt]
    );
    return result.rows[0];
  }

  async listForPrescription(prescriptionId) {
    const result = await this.database.query(
      `SELECT id, pharmacy_user_id, totals, quantities, created_at
       FROM prescription_dispenses
       WHERE prescription_id = $1
       ORDER BY created_at`,
      [prescriptionId]
    );
    return result.rows;
  }
}
