export class PrescriptionRepository {
  constructor(database) { this.database = database; }

  async create(input) {
    const result = await this.database.query(
      `INSERT INTO prescriptions (
        patient_user_id, doctor_user_id, storage_key, original_filename, content_type, size_bytes, title,
        content_sha256, doctor_signature, encryption_algorithm, encrypted_data_key, data_key_iv,
        data_key_auth_tag, file_iv, file_auth_tag, signer_address, format, medications_sha256,
        clinical_sha256, approval_id, follow_up_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING *`,
      [input.patientUserId, input.doctorUserId, input.storageKey, input.originalFilename, input.contentType,
        input.sizeBytes, input.title, input.contentSha256, input.doctorSignature, input.encryption.encryptionAlgorithm,
        input.encryption.encryptedDataKey, input.encryption.dataKeyIv, input.encryption.dataKeyAuthTag,
        input.encryption.fileIv, input.encryption.fileAuthTag, input.signerAddress ?? null,
        input.format ?? 'file', input.medicationsSha256 ?? null, input.clinicalSha256 ?? null,
        input.approvalId ?? null, input.followUpDate ?? null]
    );
    return result.rows[0];
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT p.*, u.email AS doctor_email, u.name AS doctor_name,
              (SELECT MAX(pd.created_at) FROM prescription_dispenses pd WHERE pd.prescription_id = p.id) AS last_dispensed_at
       FROM prescriptions p
       JOIN users u ON u.id = p.doctor_user_id
       WHERE p.patient_user_id = $1 ORDER BY p.created_at DESC`,
      [patientUserId]
    );
    return result.rows;
  }

  async findById(id) {
    const result = await this.database.query(
      `SELECT p.*, u.name AS doctor_name,
              (SELECT MAX(pd.created_at) FROM prescription_dispenses pd WHERE pd.prescription_id = p.id) AS last_dispensed_at
       FROM prescriptions p
       JOIN users u ON u.id = p.doctor_user_id WHERE p.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async markBlockchainRegistered(id, registration) {
    const result = await this.database.query(
      `UPDATE prescriptions SET blockchain_status = 'registered', blockchain_record_id = $2,
       blockchain_tx_hash = $3, blockchain_registered_at = $4 WHERE id = $1 RETURNING *`,
      [id, registration.blockchainRecordId, registration.transactionHash, registration.registeredAt]
    );
    return result.rows[0];
  }

  // Records the first dispense; later refills are in prescription_dispenses.
  async markDispensed(id, { pharmacyUserId, dispensedAt, signature, signerAddress }) {
    const result = await this.database.query(
      `UPDATE prescriptions
       SET dispensed_at = $2, dispensed_by_user_id = $3, dispense_signature = $4, dispense_signer_address = $5
       WHERE id = $1 AND dispensed_at IS NULL
       RETURNING *`,
      [id, dispensedAt, pharmacyUserId, signature, signerAddress]
    );
    return result.rows[0] ?? null;
  }

  async markBlockchainFailed(id) {
    await this.database.query("UPDATE prescriptions SET blockchain_status = 'failed' WHERE id = $1", [id]);
  }
}
