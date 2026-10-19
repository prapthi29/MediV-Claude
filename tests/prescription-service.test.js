import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { Wallet } from 'ethers';
import { FileEncryptionService } from '../src/encryption/file-encryption-service.js';
import { PrescriptionService } from '../src/services/prescription-service.js';
import { SigningKeyService } from '../src/services/signing-key-service.js';

class Prescriptions {
  constructor() { this.items = []; }
  async create(input) {
    const item = {
      id: 'd0aa0000-0000-4000-8000-000000000011', patient_user_id: input.patientUserId, doctor_user_id: input.doctorUserId,
      storage_key: input.storageKey, original_filename: input.originalFilename, content_type: input.contentType,
      size_bytes: input.sizeBytes, title: input.title, content_sha256: input.contentSha256, doctor_signature: input.doctorSignature, signer_address: input.signerAddress,
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

class SigningKeys {
  constructor() { this.keys = []; }
  async create(input) {
    const key = { id: crypto.randomUUID(), user_id: input.userId, address: input.address, encrypted_private_key: input.encryptedPrivateKey, kdf_salt: input.kdfSalt, key_iv: input.keyIv, key_auth_tag: input.keyAuthTag, status: 'active', created_at: new Date() };
    this.keys.push(key);
    return key;
  }
  async findActiveForUser(userId) { return this.keys.find((k) => k.user_id === userId && k.status === 'active') ?? null; }
  async findByAddress(address) { return this.keys.find((k) => k.address.toLowerCase() === address.toLowerCase()) ?? null; }
}

const PASSWORD = 'Strong#Pass123';
const document = Buffer.from('prescription content');
const file = { buffer: document, originalname: 'prescription.pdf', mimetype: 'application/pdf', size: document.length };

async function setup() {
  const users = {
    doctor: { id: 'doctor', role: 'doctor' },
    other: { id: 'other', role: 'doctor' },
    patient: { id: 'patient', role: 'patient', medical_record_status: 'active', blockchain_address: Wallet.createRandom().address }
  };
  const userRepository = {
    findById: async (id) => users[id],
    updateBlockchainAddress: async (id, address) => { users[id].blockchain_address = address; }
  };
  const signingKeyService = new SigningKeyService({ signingKeyRepository: new SigningKeys(), userRepository });
  await signingKeyService.ensureKey(users.doctor, PASSWORD);
  await signingKeyService.ensureKey(users.other, PASSWORD);
  const prescriptionRepository = new Prescriptions();
  const service = new PrescriptionService({
    prescriptionRepository,
    medicalStorage: new Storage(),
    fileEncryptionService: new FileEncryptionService({ masterKey: Buffer.alloc(32, 5) }),
    userRepository,
    consentService: { assertDoctorAccess: async () => {} },
    recordRegistryClient: {
      registerRecord: async () => ({ blockchainRecordId: `0x${'a'.repeat(64)}`, transactionHash: `0x${'b'.repeat(64)}`, registeredAt: new Date() }),
      verifyRecord: async () => true
    },
    signingKeyService
  });
  return { service, users, prescriptionRepository, signingKeyService };
}

describe('prescription service', () => {
  it('signs with the doctor key after password entry and verifies it for a pharmacy', async () => {
    const { service, users } = await setup();
    const prescription = await service.create('doctor', 'patient', file, { title: 'Amoxicillin', password: PASSWORD });
    expect(prescription.blockchainStatus).toBe('registered');
    await expect(service.verifyForPharmacy(prescription.id)).resolves.toMatchObject({ valid: true, signatureValid: true, contentHashValid: true, blockchainValid: true });
    expect(users.doctor.blockchain_address).toBeTruthy();
  });

  it('refuses to sign with a wrong password', async () => {
    const { service, prescriptionRepository } = await setup();
    await expect(service.create('doctor', 'patient', file, { password: 'Wrong#Pass1234' }))
      .rejects.toMatchObject({ code: 'INVALID_SIGNING_PASSWORD' });
    expect(prescriptionRepository.items).toHaveLength(0);
  });

  it('fails verification when the stored signer key belongs to another doctor', async () => {
    const { service, prescriptionRepository } = await setup();
    const prescription = await service.create('other', 'patient', file, { password: PASSWORD });
    prescriptionRepository.items[0].doctor_user_id = 'doctor';
    await expect(service.verifyForPharmacy(prescription.id)).resolves.toMatchObject({ valid: false, signatureValid: false });
  });
});
