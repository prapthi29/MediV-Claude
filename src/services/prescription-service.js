import crypto from 'node:crypto';
import path from 'node:path';
import { AppError } from '../utils/app-error.js';
import { SigningKeyService } from './signing-key-service.js';

export class PrescriptionService {
  constructor({ prescriptionRepository, medicalStorage, fileEncryptionService, userRepository, consentService, recordRegistryClient, auditService, signingKeyService }) {
    this.signingKeyService = signingKeyService;
    this.prescriptionRepository = prescriptionRepository;
    this.medicalStorage = medicalStorage;
    this.fileEncryptionService = fileEncryptionService;
    this.userRepository = userRepository;
    this.consentService = consentService;
    this.recordRegistryClient = recordRegistryClient;
    this.auditService = auditService;
  }

  async create(doctorUserId, patientUserId, file, { title, password }) {
    if (!file) throw new AppError(400, 'A prescription document is required.', 'FILE_REQUIRED');
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const contentSha256 = this.createSha256(file.buffer);
    // The doctor's password unlocks their ECDSA key; the server never signs without it.
    const { signature, signerAddress } = await this.signingKeyService.signDigest(doctorUserId, password, contentSha256);
    if (!this.isDoctorSignatureValid(contentSha256, signature, signerAddress)) {
      throw new AppError(500, 'The prescription signature could not be verified after signing.', 'INVALID_PRESCRIPTION_SIGNATURE');
    }
    const storageKey = this.createStorageKey(patientUserId, file.originalname);
    const encryption = this.fileEncryptionService.encrypt(file.buffer);
    await this.medicalStorage.put({ key: storageKey, body: encryption.ciphertext, contentType: 'application/octet-stream' });
    let persisted = false;
    try {
      let prescription = await this.prescriptionRepository.create({
        patientUserId, doctorUserId, storageKey, originalFilename: file.originalname, contentType: file.mimetype,
        sizeBytes: file.size, title, contentSha256, doctorSignature: signature, signerAddress, encryption
      });
      persisted = true;
      prescription = await this.registerOnChain(prescription);
      await this.auditService?.record({ eventType: 'prescription_created', actorUserId: doctorUserId, subjectUserId: patientUserId, resourceType: 'prescription', resourceId: prescription.id, metadata: {} });
      return this.publicPrescription(prescription);
    } catch (error) {
      if (!persisted) await this.medicalStorage.delete({ key: storageKey }).catch(() => {});
      throw error;
    }
  }

  async listForPatient(patientUserId) {
    const rows = await this.prescriptionRepository.listForPatient(patientUserId);
    return rows.map((row) => ({ ...this.publicPrescription(row), doctorEmail: row.doctor_email }));
  }

  async downloadForPatient(patientUserId, prescriptionId) {
    const prescription = await this.prescriptionRepository.findById(prescriptionId);
    if (!prescription || prescription.patient_user_id !== patientUserId) {
      throw new AppError(404, 'Prescription not found.', 'PRESCRIPTION_NOT_FOUND');
    }
    const { body: ciphertext } = await this.medicalStorage.get({ key: prescription.storage_key });
    const body = this.fileEncryptionService.decrypt(ciphertext, prescription);
    await this.auditService?.record({ eventType: 'prescription_accessed', actorUserId: patientUserId, subjectUserId: patientUserId, resourceType: 'prescription', resourceId: prescription.id, metadata: {} });
    return { prescription: this.publicPrescription(prescription), body };
  }

  async listPharmacyHistory(pharmacyUserId) {
    return this.auditService.auditRepository.listForPharmacy(pharmacyUserId);
  }

  async verifyForPharmacy(prescriptionId, pharmacyUserId) {
    const prescription = await this.prescriptionRepository.findById(prescriptionId);
    if (!prescription) throw new AppError(404, 'Prescription not found.', 'PRESCRIPTION_NOT_FOUND');
    const signatureValid = await this.isPrescriptionSignatureValid(prescription);
    let contentHashValid = false;
   try {
    const stored = await this.medicalStorage.get({
      key: prescription.storage_key
    });

    // Accept the standard storage response and legacy Buffer mocks.
    const ciphertext = Buffer.isBuffer(stored) ? stored : stored?.body;

    if (!Buffer.isBuffer(ciphertext)) {
      throw new Error('Invalid storage response');
    }

    const plaintext = this.fileEncryptionService.decrypt(
      ciphertext,
      prescription
    );

    contentHashValid = this.hashesMatch(
      this.createSha256(plaintext),
      prescription.content_sha256
    );
  } catch {
    // Report integrity failure without exposing storage details.
  }
    let blockchainValid = false;
    if (prescription.blockchain_status === 'registered') {
      try { blockchainValid = await this.recordRegistryClient.verifyRecord({ recordId: prescription.id, contentSha256: prescription.content_sha256 }); } catch { blockchainValid = false; }
    }
    const verification = {
      prescriptionId: prescription.id,
      doctorUserId: prescription.doctor_user_id,
      issuedAt: prescription.created_at,
      valid: signatureValid && contentHashValid && blockchainValid,
      signatureValid,
      contentHashValid,
      blockchainValid
    };
    await this.auditService?.record({ eventType: 'prescription_verified', actorUserId: pharmacyUserId, subjectUserId: prescription.patient_user_id, resourceType: 'prescription', resourceId: prescription.id, metadata: { valid: verification.valid, prescriptionId: prescription.id } });
    return verification;
  }

  async registerOnChain(prescription) {
    const patient = await this.userRepository.findById(prescription.patient_user_id);
    try {
      const registration = await this.recordRegistryClient.registerRecord({
        recordId: prescription.id, contentSha256: prescription.content_sha256, patientAddress: patient.blockchain_address
      });
      return await this.prescriptionRepository.markBlockchainRegistered(prescription.id, registration);
    } catch {
      await this.prescriptionRepository.markBlockchainFailed(prescription.id);
      throw new AppError(502, 'Prescription blockchain registration failed.', 'BLOCKCHAIN_REGISTRATION_FAILED');
    }
  }

  isDoctorSignatureValid(contentSha256, signature, doctorAddress) {
    return SigningKeyService.verifyDigest(contentSha256, signature, doctorAddress);
  }

  // The signature must come from the stored signer address, and that address must be
  // one of the issuing doctor's keys. Older prescriptions have no signer address and
  // are checked against the doctor's current address.
  async isPrescriptionSignatureValid(prescription) {
    if (prescription.signer_address) {
      const ownedByDoctor = await this.signingKeyService?.isKeyOfUser(prescription.signer_address, prescription.doctor_user_id);
      return Boolean(ownedByDoctor) &&
        this.isDoctorSignatureValid(prescription.content_sha256, prescription.doctor_signature, prescription.signer_address);
    }
    const doctor = await this.userRepository.findById(prescription.doctor_user_id);
    return this.isDoctorSignatureValid(prescription.content_sha256, prescription.doctor_signature, doctor?.blockchain_address);
  }

  createSha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
  hashesMatch(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string' || !/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
    const a = Buffer.from(actual, 'hex'); const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  createStorageKey(patientId, filename) {
    const extension = path.extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
    return `prescriptions/${patientId}/${crypto.randomUUID()}${extension}`;
  }

  publicPrescription(prescription) {
    return {
      id: prescription.id, patientUserId: prescription.patient_user_id, doctorUserId: prescription.doctor_user_id,
      originalFilename: prescription.original_filename, contentType: prescription.content_type, sizeBytes: prescription.size_bytes,
      title: prescription.title, blockchainStatus: prescription.blockchain_status, createdAt: prescription.created_at
    };
  }
}
