import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { Wallet, getBytes, verifyMessage } from 'ethers';
import { prescriptionRootSha256, medicationsSha256 } from '../src/services/prescription-document.js';
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
      file_iv: input.encryption.fileIv, file_auth_tag: input.encryption.fileAuthTag, blockchain_status: 'pending', created_at: new Date(),
      format: input.format, medications_sha256: input.medicationsSha256, clinical_sha256: input.clinicalSha256
    };
    this.items.push(item);
    return item;
  }
  async findById(id) { return this.items.find((item) => item.id === id) ?? null; }
  async listForPatient(patientId) { return this.items.filter((item) => item.patient_user_id === patientId); }
  async markDispensed(id, { pharmacyUserId, dispensedAt, signature, signerAddress }) {
    const item = await this.findById(id);
    if (!item || item.dispensed_at) return null;
    Object.assign(item, { dispensed_at: dispensedAt, dispensed_by_user_id: pharmacyUserId, dispense_signature: signature, dispense_signer_address: signerAddress });
    return item;
  }
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

class Shares {
  constructor(prescriptions) { this.items = []; this.prescriptions = prescriptions; }
  decorate(share) {
    const p = this.prescriptions.items.find((x) => x.id === share.prescription_id);
    return share && { ...share, patient_name: 'Ravi Patient', patient_health_id: 'MV-1234ABCD', dispensed_at: p?.dispensed_at ?? null };
  }
  async create(input) {
    const share = { id: crypto.randomUUID(), prescription_id: input.prescriptionId, patient_user_id: input.patientUserId, pharmacy_user_id: input.pharmacyUserId, expires_at: input.expiresAt, revoked_at: null, created_at: new Date() };
    this.items.push(share);
    return this.decorate(share);
  }
  live(s) { return !s.revoked_at && s.expires_at > new Date(); }
  async findActiveForPair(prescriptionId, pharmacyId) { const s = this.items.find((x) => x.prescription_id === prescriptionId && x.pharmacy_user_id === pharmacyId && this.live(x)); return s ? this.decorate(s) : null; }
  async findActiveForPharmacy(id, pharmacyId) { const s = this.items.find((x) => x.id === id && x.pharmacy_user_id === pharmacyId && this.live(x)); return s ? this.decorate(s) : null; }
  async revokeAllForPrescription(prescriptionId) { for (const s of this.items) if (s.prescription_id === prescriptionId && !s.revoked_at) s.revoked_at = new Date(); }
  async revokeForPatient(id, patientId) { const s = this.items.find((x) => x.id === id && x.patient_user_id === patientId && this.live(x)); if (!s) return null; s.revoked_at = new Date(); return this.decorate(s); }
}

class Approvals {
  constructor() { this.items = []; }
  async create(input) {
    const item = { id: crypto.randomUUID(), patient_user_id: input.patientUserId, doctor_user_id: input.doctorUserId, status: 'pending', expires_at: input.expiresAt };
    this.items.push(item);
    return item;
  }
  async decide({ approvalId, status }) {
    const item = this.items.find((a) => a.id === approvalId && a.status === 'pending');
    if (!item) return null;
    item.status = status;
    return item;
  }
  async consume({ approvalId, patientUserId, doctorUserId }) {
    const item = this.items.find((a) => a.id === approvalId && a.patient_user_id === patientUserId && a.doctor_user_id === doctorUserId && a.status === 'approved');
    if (!item) return null;
    item.status = 'consumed';
    return item;
  }
}

class ViewRequests {
  constructor() { this.items = []; }
  async create({ prescriptionId, patientUserId, doctorUserId }) {
    const item = { id: crypto.randomUUID(), prescription_id: prescriptionId, patient_user_id: patientUserId, doctor_user_id: doctorUserId, status: 'pending', requested_at: new Date() };
    this.items.push(item);
    return item;
  }
  async listForDoctorPatient(doctorId, patientId) { return this.items.filter((r) => r.doctor_user_id === doctorId && r.patient_user_id === patientId); }
  async listForPatient(patientId) { return this.items.filter((r) => r.patient_user_id === patientId); }
  async decide({ requestId, patientUserId, status }) {
    const item = this.items.find((r) => r.id === requestId && r.patient_user_id === patientUserId && r.status === 'pending');
    if (!item) return null;
    item.status = status;
    return item;
  }
  async consumeApproved({ prescriptionId, patientUserId, doctorUserId }) {
    const item = this.items.find((r) => r.prescription_id === prescriptionId && r.patient_user_id === patientUserId && r.doctor_user_id === doctorUserId && r.status === 'approved');
    if (!item) return null;
    item.status = 'used';
    return item;
  }
}

class Dispenses {
  constructor() { this.items = []; }
  async create(input) {
    const item = { id: crypto.randomUUID(), prescription_id: input.prescriptionId, pharmacy_user_id: input.pharmacyUserId, totals: input.totals, quantities: input.quantities, created_at: input.createdAt };
    this.items.push(item);
    return item;
  }
  async listForPrescription(id) { return this.items.filter((d) => d.prescription_id === id); }
}

const PASSWORD = 'Strong#Pass123';
const form = {
  title: 'Chest infection',
  medications: [{ name: 'Amoxicillin', dose: '500 mg', frequency: 'Three times a day', duration: '5 days', instructions: 'After food' }],
  diagnosis: 'Lower respiratory tract infection',
  notes: 'Return if fever persists'
};

// Patient approves one prescription for the given doctor.
async function approved(service, doctorId) {
  const approval = await service.requestApproval(doctorId, 'patient');
  await service.decideApproval('patient', approval.id, 'approved');
  return approval.id;
}

async function setup() {
  const users = {
    doctor: { id: 'doctor', role: 'doctor' },
    other: { id: 'other', role: 'doctor' },
    pharmacy: { id: 'pharmacy', role: 'pharmacy', license_id: 'PH-001' },
    pharmacy2: { id: 'pharmacy2', role: 'pharmacy', license_id: 'PH-002' },
    patient: { id: 'patient', role: 'patient', medical_record_status: 'active', blockchain_address: Wallet.createRandom().address }
  };
  const userRepository = {
    findById: async (id) => users[id],
    findActivePharmacyByLicenseId: async (license) => Object.values(users).find((u) => u.role === 'pharmacy' && u.license_id === license) ?? null,
    updateBlockchainAddress: async (id, address) => { users[id].blockchain_address = address; }
  };
  const signingKeyService = new SigningKeyService({ signingKeyRepository: new SigningKeys(), userRepository });
  await signingKeyService.ensureKey(users.doctor, PASSWORD);
  await signingKeyService.ensureKey(users.other, PASSWORD);
  await signingKeyService.ensureKey(users.pharmacy, PASSWORD);
  const prescriptionRepository = new Prescriptions();
  const storage = new Storage();
  const service = new PrescriptionService({
    prescriptionRepository,
    prescriptionApprovalRepository: new Approvals(),
    prescriptionShareRepository: new Shares(prescriptionRepository),
    prescriptionViewRequestRepository: new ViewRequests(),
    prescriptionDispenseRepository: new Dispenses(),
    medicalStorage: storage,
    fileEncryptionService: new FileEncryptionService({ masterKey: Buffer.alloc(32, 5) }),
    userRepository,
    consentService: { assertDoctorAccess: async () => {} },
    recordRegistryClient: {
      registerRecord: async () => ({ blockchainRecordId: `0x${'a'.repeat(64)}`, transactionHash: `0x${'b'.repeat(64)}`, registeredAt: new Date() }),
      verifyRecord: async () => true
    },
    signingKeyService
  });
  return { service, users, prescriptionRepository, signingKeyService, storage };
}

async function integrityOf(service, repository, id) {
  return (await service.open(await repository.findById(id))).integrity;
}

describe('prescription service', () => {
  it('signs with the doctor key after password entry and verifies it for a pharmacy', async () => {
    const { service, users, prescriptionRepository } = await setup();
    const approvalId = await approved(service, 'doctor');
    const prescription = await service.create('doctor', 'patient', { ...form, approvalId, password: PASSWORD });
    expect(prescription.blockchainStatus).toBe('registered');
    expect(prescription.format).toBe('form');
    await expect(integrityOf(service, prescriptionRepository, prescription.id)).resolves.toMatchObject({ valid: true, signatureValid: true, contentHashValid: true, blockchainValid: true });
    const view = await service.viewForPatient('patient', prescription.id);
    expect(view.medications[0]).toMatchObject({ name: 'Amoxicillin', dose: '500 mg' });
    expect(view.integrity.valid).toBe(true);
    expect(users.doctor.blockchain_address).toBeTruthy();
  });

  it('uses each patient approval for one prescription only', async () => {
    const { service } = await setup();
    const approvalId = await approved(service, 'doctor');
    await service.create('doctor', 'patient', { ...form, approvalId, password: PASSWORD });
    await expect(service.create('doctor', 'patient', { ...form, approvalId, password: PASSWORD }))
      .rejects.toMatchObject({ code: 'PRESCRIPTION_APPROVAL_INVALID' });
  });

  it('refuses a prescription the patient has not approved', async () => {
    const { service } = await setup();
    const approval = await service.requestApproval('doctor', 'patient');
    await expect(service.create('doctor', 'patient', { ...form, approvalId: approval.id, password: PASSWORD }))
      .rejects.toMatchObject({ code: 'PRESCRIPTION_APPROVAL_INVALID' });
  });

  it('detects medicines changed after signing', async () => {
    const { service, storage, prescriptionRepository } = await setup();
    const approvalId = await approved(service, 'doctor');
    const prescription = await service.create('doctor', 'patient', { ...form, approvalId, password: PASSWORD });
    const tampered = { ...form, medications: [{ ...form.medications[0], dose: '875 mg' }] };
    const fileEncryptionService = new FileEncryptionService({ masterKey: Buffer.alloc(32, 5) });
    const encryption = fileEncryptionService.encrypt(Buffer.from(JSON.stringify({ medications: tampered.medications, diagnosis: form.diagnosis, notes: form.notes })));
    storage.body = encryption.ciphertext;
    Object.assign(prescriptionRepository.items[0], {
      encrypted_data_key: encryption.encryptedDataKey, data_key_iv: encryption.dataKeyIv, data_key_auth_tag: encryption.dataKeyAuthTag,
      file_iv: encryption.fileIv, file_auth_tag: encryption.fileAuthTag
    });
    await expect(integrityOf(service, prescriptionRepository, prescription.id)).resolves.toMatchObject({ valid: false, contentHashValid: false, signatureValid: true });
  });

  it('refuses to sign with a wrong password', async () => {
    const { service, prescriptionRepository } = await setup();
    const approvalId = await approved(service, 'doctor');
    await expect(service.create('doctor', 'patient', { ...form, approvalId, password: 'Wrong#Pass1234' }))
      .rejects.toMatchObject({ code: 'INVALID_SIGNING_PASSWORD' });
    expect(prescriptionRepository.items).toHaveLength(0);
    // The approval is still there for the corrected attempt.
    await expect(service.create('doctor', 'patient', { ...form, approvalId, password: PASSWORD })).resolves.toBeTruthy();
  });

  it('fails verification when the stored signer key belongs to another doctor', async () => {
    const { service, prescriptionRepository } = await setup();
    const approvalId = await approved(service, 'other');
    const prescription = await service.create('other', 'patient', { ...form, approvalId, password: PASSWORD });
    prescriptionRepository.items[0].doctor_user_id = 'doctor';
    await expect(integrityOf(service, prescriptionRepository, prescription.id)).resolves.toMatchObject({ valid: false, signatureValid: false });
  });

  it('shows a shared pharmacy the medicines only, with a proof it can check itself', async () => {
    const { service } = await setup();
    const approvalId = await approved(service, 'doctor');
    const prescription = await service.create('doctor', 'patient', { ...form, approvalId, password: PASSWORD });
    const share = await service.shareWithPharmacy('patient', prescription.id, 'PH-001');
    const opened = await service.openForPharmacy('pharmacy', share.id);

    expect(opened.patientName).toBe('Ravi Patient');
    expect(opened.patientId).toBe('MV-1234ABCD');
    expect(opened).not.toHaveProperty('doctorName');
    expect(opened.share).not.toHaveProperty('doctorName');
    expect(opened.medications[0].name).toBe('Amoxicillin');
    expect(JSON.stringify(opened)).not.toContain(form.diagnosis);
    expect(JSON.stringify(opened)).not.toContain(form.notes);

    // What the pharmacy's browser does: rebuild the signed hash from the medicines.
    const root = prescriptionRootSha256({
      patientUserId: opened.proof.patientUserId,
      medicationsHash: medicationsSha256(opened.medications),
      clinicalHash: opened.proof.clinicalSha256
    });
    expect(root).toBe(opened.proof.rootSha256);
    expect(verifyMessage(getBytes(`0x${root}`), opened.proof.signature)).toBe(opened.proof.signerAddress);

    await expect(service.openForPharmacy('pharmacy2', share.id)).rejects.toMatchObject({ code: 'SHARE_NOT_ACTIVE' });
  });

  it('lets the pharmacy dispense, signed with its own key, and the patient share it again for a refill', async () => {
    const { service } = await setup();
    const approvalId = await approved(service, 'doctor');
    const prescription = await service.create('doctor', 'patient', { ...form, approvalId, password: PASSWORD });
    const share = await service.shareWithPharmacy('patient', prescription.id, 'PH-001');

    await expect(service.dispense('pharmacy', share.id, 'Wrong#Pass1234')).rejects.toMatchObject({ code: 'INVALID_SIGNING_PASSWORD' });
    await expect(service.dispense('pharmacy', share.id, PASSWORD)).resolves.toMatchObject({ prescriptionId: prescription.id });
    // Dispensing ends the pharmacy's access to the prescription.
    await expect(service.openForPharmacy('pharmacy', share.id)).rejects.toMatchObject({ code: 'SHARE_NOT_ACTIVE' });
    await expect(service.dispense('pharmacy', share.id, PASSWORD)).rejects.toMatchObject({ code: 'SHARE_NOT_ACTIVE' });
    // The patient can share the same prescription again for the next refill.
    const refill = await service.shareWithPharmacy('patient', prescription.id, 'PH-001');
    expect(refill.id).not.toBe(share.id);
    await expect(service.dispense('pharmacy', refill.id, PASSWORD)).resolves.toMatchObject({ prescriptionId: prescription.id });
  });

  it('keeps symptoms and follow-up in the verified prescription', async () => {
    const { service, prescriptionRepository } = await setup();
    const approvalId = await approved(service, 'doctor');
    const prescription = await service.create('doctor', 'patient', { ...form, symptoms: 'Fever for 3 days', followUp: 'Review in a week', approvalId, password: PASSWORD });
    const view = await service.viewForPatient('patient', prescription.id);
    expect(view).toMatchObject({ symptoms: 'Fever for 3 days', followUp: 'Review in a week' });
    await expect(integrityOf(service, prescriptionRepository, prescription.id)).resolves.toMatchObject({ valid: true });
  });

  it('lets a linked doctor open a prescription once per patient approval, and no one else', async () => {
    const { service } = await setup();
    const approvalId = await approved(service, 'doctor');
    const prescription = await service.create('doctor', 'patient', { ...form, approvalId, password: PASSWORD });
    await expect(service.viewForDoctor('other', 'patient', prescription.id)).rejects.toMatchObject({ code: 'PRESCRIPTION_VIEW_APPROVAL_REQUIRED' });
    const request = await service.requestViewForDoctor('other', 'patient', prescription.id);
    await service.decideViewRequest('patient', request.id, 'approved');
    const view = await service.viewForDoctor('other', 'patient', prescription.id);
    expect(view.medications[0].name).toBe('Amoxicillin');
    await expect(service.viewForDoctor('other', 'patient', prescription.id)).rejects.toMatchObject({ code: 'PRESCRIPTION_VIEW_APPROVAL_REQUIRED' });
    await expect(service.listForDoctor('other', 'patient')).resolves.toMatchObject([{ viewRequest: { status: 'used' } }]);

    service.consentService = { assertDoctorAccess: async () => { throw Object.assign(new Error('no consent'), { code: 'CONSENT_REQUIRED' }); } };
    await expect(service.viewForDoctor('other', 'patient', prescription.id)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  });

  it('closes a share as soon as the patient revokes it', async () => {
    const { service } = await setup();
    const approvalId = await approved(service, 'doctor');
    const prescription = await service.create('doctor', 'patient', { ...form, approvalId, password: PASSWORD });
    const share = await service.shareWithPharmacy('patient', prescription.id, 'PH-001');
    await service.revokeShare('patient', share.id);
    await expect(service.openForPharmacy('pharmacy', share.id)).rejects.toMatchObject({ code: 'SHARE_NOT_ACTIVE' });
  });
});
