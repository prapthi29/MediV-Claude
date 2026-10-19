import { describe, expect, it } from 'vitest';
import { FileEncryptionService } from '../src/encryption/file-encryption-service.js';
import { MedicalRecordService } from '../src/services/medical-record-service.js';

class RecordRepository {
  constructor() { this.records = []; }
  async create(input) {
    const record = {
      id: 'd0aa0000-0000-4000-8000-000000000009', patient_user_id: input.patientUserId,
      storage_key: input.storageKey, original_filename: input.originalFilename, content_type: input.contentType,
      size_bytes: input.sizeBytes, title: input.title, category: input.category, content_sha256: input.contentSha256,
      blockchain_status: 'pending', encryption_algorithm: input.encryption.encryptionAlgorithm,
      encrypted_data_key: input.encryption.encryptedDataKey, data_key_iv: input.encryption.dataKeyIv,
      data_key_auth_tag: input.encryption.dataKeyAuthTag, file_iv: input.encryption.fileIv,
      file_auth_tag: input.encryption.fileAuthTag, created_at: new Date()
    };
    this.records.push(record);
    return record;
  }
  async markBlockchainRegistered(id, registration) {
    const record = this.records.find((item) => item.id === id);
    Object.assign(record, { blockchain_status: 'registered', blockchain_record_id: registration.blockchainRecordId, blockchain_tx_hash: registration.transactionHash, blockchain_registered_at: registration.registeredAt });
    return record;
  }
  async markBlockchainFailed(id) { this.records.find((item) => item.id === id).blockchain_status = 'failed'; }
  async findByIdForPatient(id, patientId) { return this.records.find((item) => item.id === id && item.patient_user_id === patientId) ?? null; }
}

class Storage {
  async put({ body }) { this.body = body; }
  async get() { return this.body; }
  async delete() {}
}

describe('blockchain record registration', () => {
  it('registers the plaintext SHA-256 hash with an opaque ID after encrypted upload', async () => {
    const calls = [];
    const service = new MedicalRecordService({
      medicalRecordRepository: new RecordRepository(),
      medicalStorage: new Storage(),
      fileEncryptionService: new FileEncryptionService({ masterKey: Buffer.alloc(32, 2) }),
      userRepository: { findById: async () => ({ blockchain_address: '0x1111111111111111111111111111111111111111' }) },
      recordRegistryClient: {
        registerRecord: async (input) => {
          calls.push(input);
          return { blockchainRecordId: `0x${'a'.repeat(64)}`, transactionHash: `0x${'b'.repeat(64)}`, registeredAt: new Date('2026-01-01') };
        }
      }
    });
    const result = await service.uploadRecord({ patientUserId: 'patient-1', uploadedByUserId: 'doctor-1', file: {
      buffer: Buffer.from('medical document'), originalname: 'record.pdf', mimetype: 'application/pdf', size: 16
    }, metadata: {} });
    expect(result.blockchainStatus).toBe('registered');
    expect(calls).toEqual([{
      recordId: 'd0aa0000-0000-4000-8000-000000000009',
      contentSha256: '219913d03351a1ff9b9e3a98b1c71951824dd526aa021877c087ff7a423f70f2',
      patientAddress: '0x1111111111111111111111111111111111111111'
    }]);
  });
});

