import crypto from 'node:crypto';
import path from 'node:path';
import { AppError } from '../utils/app-error.js';
import { SigningKeyService } from './signing-key-service.js';
import { assertProfileActive } from './profile-activation.js';
import {
  PRESCRIPTION_CONTENT_TYPE,
  buildPrescription,
  clinicalSha256,
  medicationsSha256,
  prescriptionRootSha256
} from './prescription-document.js';

// A prescription approval lasts as long as the doctor's license link.
const APPROVAL_MINUTES = 30;

export class PrescriptionService {
  constructor({ prescriptionRepository, prescriptionApprovalRepository, medicalStorage, fileEncryptionService, userRepository, consentService, recordRegistryClient, auditService, signingKeyService }) {
    this.signingKeyService = signingKeyService;
    this.prescriptionRepository = prescriptionRepository;
    this.prescriptionApprovalRepository = prescriptionApprovalRepository;
    this.medicalStorage = medicalStorage;
    this.fileEncryptionService = fileEncryptionService;
    this.userRepository = userRepository;
    this.consentService = consentService;
    this.recordRegistryClient = recordRegistryClient;
    this.auditService = auditService;
  }

  // --------------------------------------------------
  // PATIENT APPROVAL FOR EACH PRESCRIPTION
  // --------------------------------------------------

  async requestApproval(doctorUserId, patientUserId) {
    await assertProfileActive(this.userRepository, patientUserId);
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const approval = await this.prescriptionApprovalRepository.create({
      patientUserId,
      doctorUserId,
      expiresAt: new Date(Date.now() + APPROVAL_MINUTES * 60 * 1000)
    });
    await this.auditService?.record({ eventType: 'prescription_requested', actorUserId: doctorUserId, subjectUserId: patientUserId, resourceType: 'prescription_approval', resourceId: approval.id, metadata: {} });
    return approval;
  }

  async listApprovalsForDoctor(doctorUserId, patientUserId) {
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const rows = await this.prescriptionApprovalRepository.listForDoctorPatient(doctorUserId, patientUserId);
    return rows.map((row) => ({ ...row, status: this.liveStatus(row) }));
  }

  async listApprovalsForPatient(patientUserId) {
    const rows = await this.prescriptionApprovalRepository.listForPatient(patientUserId);
    return rows.map((row) => ({ ...row, status: this.liveStatus(row) }));
  }

  async decideApproval(patientUserId, approvalId, decision) {
    const approval = decision === 'revoked'
      ? await this.prescriptionApprovalRepository.revoke({ approvalId, patientUserId })
      : await this.prescriptionApprovalRepository.decide({ approvalId, patientUserId, status: decision });
    if (!approval) {
      throw new AppError(409, 'This request is no longer open.', 'PRESCRIPTION_REQUEST_NOT_OPEN');
    }
    await this.auditService?.record({ eventType: `prescription_request_${decision}`, actorUserId: patientUserId, subjectUserId: approval.doctor_user_id, resourceType: 'prescription_approval', resourceId: approval.id, metadata: {} });
    return approval;
  }

  liveStatus(row) {
    return ['pending', 'approved'].includes(row.status) && new Date(row.expires_at) <= new Date() ? 'expired' : row.status;
  }

  // --------------------------------------------------
  // ISSUING A PRESCRIPTION
  // --------------------------------------------------

  async create(doctorUserId, patientUserId, { title, medications, diagnosis, notes, approvalId, password }) {
    if (!Array.isArray(medications) || medications.length === 0) {
      throw new AppError(400, 'Add at least one medicine.', 'MEDICATIONS_REQUIRED');
    }
    if (!approvalId) {
      throw new AppError(403, 'The patient has to approve this prescription first.', 'PRESCRIPTION_APPROVAL_REQUIRED');
    }
    await assertProfileActive(this.userRepository, patientUserId);
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);

    const built = buildPrescription({ patientUserId, medications, diagnosis, notes });
    // The doctor's password unlocks their ECDSA key; the server never signs without it.
    // Signing happens before the approval is used, so a mistyped password costs nothing.
    const { signature, signerAddress } = await this.signingKeyService.signDigest(doctorUserId, password, built.rootHash);
    if (!this.isDoctorSignatureValid(built.rootHash, signature, signerAddress)) {
      throw new AppError(500, 'The prescription signature could not be verified after signing.', 'INVALID_PRESCRIPTION_SIGNATURE');
    }

    const approval = await this.prescriptionApprovalRepository.consume({ approvalId, patientUserId, doctorUserId });
    if (!approval) {
      throw new AppError(403, 'The approval is missing, expired, already used, or belongs to someone else.', 'PRESCRIPTION_APPROVAL_INVALID');
    }

    const storageKey = this.createStorageKey(patientUserId, 'prescription.json');
    const encryption = this.fileEncryptionService.encrypt(built.buffer);
    await this.medicalStorage.put({ key: storageKey, body: encryption.ciphertext, contentType: 'application/octet-stream' });
    let persisted = false;
    try {
      let prescription = await this.prescriptionRepository.create({
        patientUserId, doctorUserId, storageKey, originalFilename: 'prescription.json', contentType: PRESCRIPTION_CONTENT_TYPE,
        sizeBytes: built.buffer.length, title, contentSha256: built.rootHash, doctorSignature: signature, signerAddress, encryption,
        format: 'form', medicationsSha256: built.medicationsHash, clinicalSha256: built.clinicalHash, approvalId: approval.id
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

  // --------------------------------------------------
  // READING AND VERIFYING
  // --------------------------------------------------

  async listForPatient(patientUserId) {
    const rows = await this.prescriptionRepository.listForPatient(patientUserId);
    return rows.map((row) => ({ ...this.publicPrescription(row), doctorEmail: row.doctor_email }));
  }

  async viewForPatient(patientUserId, prescriptionId) {
    const prescription = await this.findForPatient(patientUserId, prescriptionId);
    const opened = await this.open(prescription);
    return {
      prescription: this.publicPrescription(prescription),
      medications: opened.document?.medications ?? null,
      diagnosis: opened.document?.diagnosis ?? null,
      notes: opened.document?.notes ?? null,
      integrity: opened.integrity
    };
  }

  async downloadForPatient(patientUserId, prescriptionId) {
    const prescription = await this.findForPatient(patientUserId, prescriptionId);
    const { body: ciphertext } = await this.medicalStorage.get({ key: prescription.storage_key });
    const body = this.fileEncryptionService.decrypt(ciphertext, prescription);
    await this.auditService?.record({ eventType: 'prescription_accessed', actorUserId: patientUserId, subjectUserId: patientUserId, resourceType: 'prescription', resourceId: prescription.id, metadata: {} });
    return { prescription: this.publicPrescription(prescription), body };
  }

  async findForPatient(patientUserId, prescriptionId) {
    const prescription = await this.prescriptionRepository.findById(prescriptionId);
    if (!prescription || prescription.patient_user_id !== patientUserId) {
      throw new AppError(404, 'Prescription not found.', 'PRESCRIPTION_NOT_FOUND');
    }
    return prescription;
  }

  // Decrypts a prescription and checks its hash, the doctor's signature and the chain.
  async open(prescription) {
    let document = null;
    let contentHashValid = false;
    try {
      const stored = await this.medicalStorage.get({ key: prescription.storage_key });
      // Accept the standard storage response and legacy Buffer mocks.
      const ciphertext = Buffer.isBuffer(stored) ? stored : stored?.body;
      if (!Buffer.isBuffer(ciphertext)) throw new Error('Invalid storage response');
      const plaintext = this.fileEncryptionService.decrypt(ciphertext, prescription);
      if (prescription.format === 'form') {
        document = JSON.parse(plaintext.toString('utf8'));
        const medicationsHash = medicationsSha256(document.medications);
        const clinicalHash = clinicalSha256(document);
        contentHashValid =
          medicationsHash === prescription.medications_sha256 &&
          clinicalHash === prescription.clinical_sha256 &&
          this.hashesMatch(prescriptionRootSha256({ patientUserId: prescription.patient_user_id, medicationsHash, clinicalHash }), prescription.content_sha256);
      } else {
        contentHashValid = this.hashesMatch(this.createSha256(plaintext), prescription.content_sha256);
      }
    } catch {
      // Report integrity failure without exposing storage details.
    }
    const signatureValid = await this.isPrescriptionSignatureValid(prescription);
    let blockchainValid = false;
    if (prescription.blockchain_status === 'registered') {
      try { blockchainValid = await this.recordRegistryClient.verifyRecord({ recordId: prescription.id, contentSha256: prescription.content_sha256 }); } catch { blockchainValid = false; }
    }
    return {
      document,
      integrity: {
        valid: signatureValid && contentHashValid && blockchainValid,
        signatureValid,
        contentHashValid,
        blockchainValid
      }
    };
  }

  async listPharmacyHistory(pharmacyUserId) {
    return this.auditService.auditRepository.listForPharmacy(pharmacyUserId);
  }

  async verifyForPharmacy(prescriptionId, pharmacyUserId) {
    const prescription = await this.prescriptionRepository.findById(prescriptionId);
    if (!prescription) throw new AppError(404, 'Prescription not found.', 'PRESCRIPTION_NOT_FOUND');
    const { integrity } = await this.open(prescription);
    const verification = {
      prescriptionId: prescription.id,
      doctorUserId: prescription.doctor_user_id,
      issuedAt: prescription.created_at,
      ...integrity
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
      doctorName: prescription.doctor_name ?? null, format: prescription.format ?? 'file',
      originalFilename: prescription.original_filename, contentType: prescription.content_type, sizeBytes: prescription.size_bytes,
      title: prescription.title, blockchainStatus: prescription.blockchain_status, createdAt: prescription.created_at
    };
  }
}
