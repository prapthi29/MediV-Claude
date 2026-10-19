import { describe, expect, it } from 'vitest';
import { FileEncryptionService } from '../src/encryption/file-encryption-service.js';
import { MedicalRecordService } from '../src/services/medical-record-service.js';

class Records {
  constructor() { this.records = []; }
  async create(input) {
    const record = {
      id: 'd0aa0000-0000-4000-8000-000000000001', patient_user_id: input.patientUserId,
      storage_key: input.storageKey, content_sha256: input.contentSha256,
      encryption_algorithm: input.encryption.encryptionAlgorithm, encrypted_data_key: input.encryption.encryptedDataKey,
      data_key_iv: input.encryption.dataKeyIv, data_key_auth_tag: input.encryption.dataKeyAuthTag,
      file_iv: input.encryption.fileIv, file_auth_tag: input.encryption.fileAuthTag
    };
    this.records.push(record);
    return { ...record, original_filename: input.originalFilename, content_type: input.contentType, size_bytes: input.sizeBytes, title: null, category: null, created_at: new Date() };
  }
  async findByIdForPatient(id, patientId) { return this.records.find((record) => record.id === id && record.patient_user_id === patientId) ?? null; }
}

class Storage {
  async put({ key, body }) { this.key = key; this.body = body; }
  async get() { return this.body; }
  async delete() {}
}

describe('record integrity', () => {
  it('reports false when the stored SHA-256 digest does not match', async () => {
    const repository = new Records();
    const service = new MedicalRecordService({
      medicalRecordRepository: repository,
      medicalStorage: new Storage(),
      fileEncryptionService: new FileEncryptionService({ masterKey: Buffer.alloc(32, 3) })
    });
    await service.uploadRecord({ patientUserId: 'patient-1', uploadedByUserId: 'doctor-1', file: { buffer: Buffer.from('medical document'), originalname: 'record.pdf', mimetype: 'application/pdf', size: 16 }, metadata: {} });
    repository.records[0].content_sha256 = '0'.repeat(64);
    await expect(service.verifyOwnRecord('patient-1', repository.records[0].id)).resolves.toEqual({
      recordId: repository.records[0].id, valid: false, localValid: false, blockchainValid: null
    });
  });
});

