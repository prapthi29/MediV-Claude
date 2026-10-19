import { describe, expect, it } from 'vitest';
import { Wallet, getBytes } from 'ethers';
import { FileEncryptionService } from '../src/encryption/file-encryption-service.js';
import { PrescriptionService } from '../src/services/prescription-service.js';

class Prescriptions {
  constructor() { this.items = []; }
  async create(input) {
    const item = {
      id: 'd0aa0000-0000-4000-8000-000000000011', patient_user_id: input.patientUserId, doctor_user_id: input.doctorUserId,
      storage_key: input.storageKey, original_filename: input.originalFilename, content_type: input.contentType,
      size_bytes: input.sizeBytes, title: input.title, content_sha256: input.contentSha256, doctor_signature: input.doctorSignature,
      encryption_algorithm: input.encryption.encryptionAlgorithm, encrypted_data_key: input.encryption.encryptedDataKey,
      data_key_iv: input.encryption.dataKeyIv, data_key_auth_tag: input.encryption.dataKeyAuthTag,
      file_iv: input.encryption.fileIv, file_auth_tag: input.encryption.fileAuthTag, blockchain_status: 'pending', created_at: new Date()
    };
    this.items.push(item);
    return item;
  }
  async findById(id) { return this.items.find((item) => item.id === id) ?? null; }
  async markBlockchainRegistered(id, registration) {
    const item = await this.findById(id);
    Object.assign(item, { blockchain_status: 'registered', blockchain_record_id: registration.blockchainRecordId, blockchain_tx_hash: registration.transactionHash });
    return item;
  }
  async markBlockchainFailed(id) { (await this.findById(id)).blockchain_status = 'failed'; }
}

class Storage {
  async put({ key, body }) { this.key = key; this.body = Buffer.from(body); }
  async get() { return this.body; }
  async delete() { this.body = null; }
}

describe('prescription service', () => {
  it('creates a doctor-signed encrypted prescription and verifies it for a pharmacy', async () => {
    const doctorWallet = Wallet.createRandom();
    const users = {
      doctor: { id: 'doctor', role: 'doctor', blockchain_address: doctorWallet.address },
      patient: { id: 'patient', role: 'patient', blockchain_address: Wallet.createRandom().address }
    };
    const service = new PrescriptionService({
      prescriptionRepository: new Prescriptions(),
      medicalStorage: new Storage(),
      fileEncryptionService: new FileEncryptionService({ masterKey: Buffer.alloc(32, 5) }),
      userRepository: { findById: async (id) => users[id] },
      consentService: { assertDoctorAccess: async () => {} },
      recordRegistryClient: {
        registerRecord: async () => ({ blockchainRecordId: `0x${'a'.repeat(64)}`, transactionHash: `0x${'b'.repeat(64)}`, registeredAt: new Date() }),
        verifyRecord: async () => true
      }
    });
    const document = Buffer.from('prescription content');
    const digest = service.createSha256(document);
    const signature = await doctorWallet.signMessage(getBytes(`0x${digest}`));
    const prescription = await service.create('doctor', 'patient', {
      buffer: document, originalname: 'prescription.pdf', mimetype: 'application/pdf', size: document.length
    }, { title: 'Amoxicillin', signature });
    expect(prescription.blockchainStatus).toBe('registered');
    await expect(service.verifyForPharmacy(prescription.id)).resolves.toMatchObject({ valid: true, signatureValid: true, contentHashValid: true, blockchainValid: true });
  });

  it('rejects a signature that was not made by the issuing doctor', async () => {
    const doctorWallet = Wallet.createRandom();
    const otherWallet = Wallet.createRandom();
    const service = new PrescriptionService({
      prescriptionRepository: new Prescriptions(), medicalStorage: new Storage(),
      fileEncryptionService: new FileEncryptionService({ masterKey: Buffer.alloc(32, 5) }),
      userRepository: { findById: async (id) => id === 'doctor' ? { role: 'doctor', blockchain_address: doctorWallet.address } : { blockchain_address: Wallet.createRandom().address } },
      consentService: { assertDoctorAccess: async () => {} }, recordRegistryClient: {}
    });
    const document = Buffer.from('prescription content');
    const signature = await otherWallet.signMessage(getBytes(`0x${service.createSha256(document)}`));
    await expect(service.create('doctor', 'patient', {
      buffer: document, originalname: 'prescription.pdf', mimetype: 'application/pdf', size: document.length
    }, { signature })).rejects.toMatchObject({ code: 'INVALID_PRESCRIPTION_SIGNATURE' });
  });
});
