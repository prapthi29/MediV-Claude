export class MedicalRecordVersionRepository {
  constructor(database) { this.database = database; }

  async create({ medicalRecordId, versionNumber, uploadedByUserId, record, blockchainStatus = 'pending' }) {
    const result = await this.database.query(
      `INSERT INTO medical_record_versions (
        medical_record_id, version_number, uploaded_by_user_id, storage_key,
        original_filename, content_type, size_bytes, title, category, content_sha256,
        encryption_algorithm, encrypted_data_key, data_key_iv, data_key_auth_tag,
        file_iv, file_auth_tag, blockchain_status, blockchain_tx_hash, blockchain_registered_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [medicalRecordId, versionNumber, uploadedByUserId, record.storage_key,
       record.original_filename, record.content_type, record.size_bytes, record.title ?? null,
       record.category ?? null, record.content_sha256, record.encryption_algorithm,
       record.encrypted_data_key, record.data_key_iv, record.data_key_auth_tag,
       record.file_iv, record.file_auth_tag, blockchainStatus,
       record.blockchain_tx_hash ?? null, record.blockchain_registered_at ?? null]
    );
    return result.rows[0];
  }

  async findLatest(medicalRecordId) {
    const result = await this.database.query(
      `SELECT * FROM medical_record_versions WHERE medical_record_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [medicalRecordId]
    );
    return result.rows[0] ?? null;
  }

  async listForRecord(medicalRecordId) {
    const result = await this.database.query(
      `SELECT id, medical_record_id, version_number, uploaded_by_user_id, original_filename,
              content_type, size_bytes, title, category, content_sha256, blockchain_status,
              blockchain_tx_hash, blockchain_registered_at, created_at
       FROM medical_record_versions WHERE medical_record_id = $1 ORDER BY version_number DESC`,
      [medicalRecordId]
    );
    return result.rows;
  }

  async findVersion(medicalRecordId, versionNumber) {
    const result = await this.database.query(
      `SELECT * FROM medical_record_versions WHERE medical_record_id = $1 AND version_number = $2`,
      [medicalRecordId, versionNumber]
    );
    return result.rows[0] ?? null;
  }

  async markBlockchainRegistered(id, { transactionHash, registeredAt }) {
    const result = await this.database.query(
      `UPDATE medical_record_versions SET blockchain_status = 'registered',
       blockchain_tx_hash = COALESCE($2, blockchain_tx_hash),
       blockchain_registered_at = COALESCE($3, blockchain_registered_at)
       WHERE id = $1 RETURNING *`, [id, transactionHash ?? null, registeredAt ?? null]
    );
    return result.rows[0] ?? null;
  }

  async markBlockchainFailed(id) {
    const result = await this.database.query(
      `UPDATE medical_record_versions SET blockchain_status = 'failed'
       WHERE id = $1 AND blockchain_status <> 'registered' RETURNING *`, [id]
    );
    return result.rows[0] ?? null;
  }

  async deletePending(id) {
    await this.database.query(
      `DELETE FROM medical_record_versions WHERE id = $1 AND blockchain_status IN ('pending','failed')`, [id]
    );
  }
}
