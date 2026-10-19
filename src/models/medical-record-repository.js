
export class MedicalRecordRepository {
  constructor(database) {
    this.database = database;
  }

  async create({
    patientUserId,
    uploadedByUserId,
    storageKey,
    originalFilename,
    contentType,
    sizeBytes,
    title,
    category,
    contentSha256,
    encryption
  }) {
    const result = await this.database.query(
      `INSERT INTO medical_records (
        patient_user_id,
        uploaded_by_user_id,
        storage_key,
        original_filename,
        content_type,
        size_bytes,
        title,
        category,
        content_sha256,
        encryption_algorithm,
        encrypted_data_key,
        data_key_iv,
        data_key_auth_tag,
        file_iv,
        file_auth_tag
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        patientUserId,
        uploadedByUserId,
        storageKey,
        originalFilename,
        contentType,
        sizeBytes,
        title,
        category,
        contentSha256,
        encryption.encryptionAlgorithm,
        encryption.encryptedDataKey,
        encryption.dataKeyIv,
        encryption.dataKeyAuthTag,
        encryption.fileIv,
        encryption.fileAuthTag
      ]
    );

    return result.rows[0];
  }

  async findByIdForPatient(recordId, patientUserId) {
    const result = await this.database.query(
      `SELECT *
       FROM medical_records
       WHERE id = $1
         AND patient_user_id = $2`,
      [recordId, patientUserId]
    );

    return result.rows[0] ?? null;
  }

  async listForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT
         id,
         original_filename,
         content_type,
         size_bytes,
         title,
         category,
         blockchain_status,
         created_at
       FROM medical_records
       WHERE patient_user_id = $1
       ORDER BY created_at DESC`,
      [patientUserId]
    );

    return result.rows;
  }

  async listEssentialForPatient(patientUserId) {
    const result = await this.database.query(
      `SELECT
         id,
         original_filename,
         content_type,
         size_bytes,
         title,
         category,
         blockchain_status,
         created_at
       FROM medical_records
       WHERE patient_user_id = $1
         AND is_emergency_essential = TRUE
       ORDER BY created_at DESC`,
      [patientUserId]
    );

    return result.rows;
  }

  async setEmergencyEssential(
    recordId,
    patientUserId,
    isEmergencyEssential
  ) {
    const result = await this.database.query(
      `UPDATE medical_records
       SET is_emergency_essential = $3
       WHERE id = $1
         AND patient_user_id = $2
       RETURNING *`,
      [recordId, patientUserId, isEmergencyEssential]
    );

    return result.rows[0] ?? null;
  }

  async markBlockchainRegistered(recordId, registration) {
    const result = await this.database.query(
      `UPDATE medical_records
       SET blockchain_status = 'registered',
           blockchain_record_id = $2,
           blockchain_tx_hash = COALESCE($3, blockchain_tx_hash),
           blockchain_registered_at = COALESCE(
             blockchain_registered_at,
             $4
           )
       WHERE id = $1
       RETURNING *`,
      [
        recordId,
        registration.blockchainRecordId,
        registration.transactionHash ?? null,
        registration.registeredAt ?? null
      ]
    );

    return result.rows[0] ?? null;
  }

  async markBlockchainFailed(recordId) {
    await this.database.query(
      `UPDATE medical_records
       SET blockchain_status = 'failed'
       WHERE id = $1
         AND blockchain_status <> 'registered'`,
      [recordId]
    );
  }
  async promoteVersion(recordId, version, registration) {
    const result = await this.database.query(
      `UPDATE medical_records r
       SET storage_key = v.storage_key,
           original_filename = v.original_filename,
           content_type = v.content_type,
           size_bytes = v.size_bytes,
           title = v.title,
           category = v.category,
           content_sha256 = v.content_sha256,
           encryption_algorithm = v.encryption_algorithm,
           encrypted_data_key = v.encrypted_data_key,
           data_key_iv = v.data_key_iv,
           data_key_auth_tag = v.data_key_auth_tag,
           file_iv = v.file_iv,
           file_auth_tag = v.file_auth_tag,
           blockchain_status = 'registered',
           blockchain_tx_hash = COALESCE($3, r.blockchain_tx_hash),
           blockchain_registered_at = COALESCE($4, NOW())
       FROM medical_record_versions v
       WHERE r.id = $1 AND v.medical_record_id = r.id AND v.version_number = $2
       RETURNING r.*`,
      [recordId, version, registration?.transactionHash ?? null, registration?.registeredAt ?? null]
    );
    return result.rows[0] ?? null;
  }

}
