import crypto from 'node:crypto';
import path from 'node:path';
import { AppError } from '../utils/app-error.js';
import { SigningKeyService } from './signing-key-service.js';
import { assertProfileActive } from './profile-activation.js';
import { stableStringify } from './basic-profile-signature.js';
import {
  PRESCRIPTION_CONTENT_TYPE,
  buildPrescription,
  clinicalSha256,
  medicationsSha256,
  prescriptionRootSha256
} from './prescription-document.js';

function isoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

// A prescription approval lasts as long as the doctor's license link.
const APPROVAL_MINUTES = 30;
// A pharmacy can see a shared prescription for 30 minutes.
export const SHARE_MINUTES = 30;

export class PrescriptionService {
  constructor({ prescriptionRepository, prescriptionApprovalRepository, prescriptionShareRepository, prescriptionViewRequestRepository, prescriptionDispenseRepository, medicalStorage, fileEncryptionService, userRepository, consentService, recordRegistryClient, auditService, signingKeyService }) {
    this.signingKeyService = signingKeyService;
    this.prescriptionRepository = prescriptionRepository;
    this.prescriptionApprovalRepository = prescriptionApprovalRepository;
    this.prescriptionShareRepository = prescriptionShareRepository;
    this.prescriptionViewRequestRepository = prescriptionViewRequestRepository;
    this.prescriptionDispenseRepository = prescriptionDispenseRepository;
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

  async create(doctorUserId, patientUserId, { title, medications, diagnosis, symptoms, followUp, followUpDate, notes, approvalId, password }) {
    if (!Array.isArray(medications) || medications.length === 0) {
      throw new AppError(400, 'Add at least one medicine.', 'MEDICATIONS_REQUIRED');
    }
    if (!approvalId) {
      throw new AppError(403, 'The patient has to approve this prescription first.', 'PRESCRIPTION_APPROVAL_REQUIRED');
    }
    await assertProfileActive(this.userRepository, patientUserId);
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);

    const built = buildPrescription({ patientUserId, medications, diagnosis, symptoms, followUp, followUpDate, notes });
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
        format: 'form', medicationsSha256: built.medicationsHash, clinicalSha256: built.clinicalHash, approvalId: approval.id,
        followUpDate: followUpDate || null
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
      symptoms: opened.document?.symptoms ?? null,
      followUp: opened.document?.followUp ?? null,
      followUpDate: opened.document?.followUpDate ?? null,
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

  // A linked doctor sees the list of prescriptions, and needs the patient's
  // approval to open one. Each approval is good for one view, and doctors
  // never download.
  async listForDoctor(doctorUserId, patientUserId) {
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const [prescriptions, requests] = await Promise.all([
      this.listForPatient(patientUserId),
      this.prescriptionViewRequestRepository?.listForDoctorPatient(doctorUserId, patientUserId) ?? []
    ]);
    const byPrescription = new Map(requests.map((r) => [r.prescription_id, r]));
    return prescriptions.map(({ doctorEmail, followUpDate, ...p }) => {
      const request = byPrescription.get(p.id);
      return { ...p, viewRequest: request ? { id: request.id, status: request.status, requestedAt: request.requested_at } : null };
    });
  }

  async requestViewForDoctor(doctorUserId, patientUserId, prescriptionId) {
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const prescription = await this.findForPatient(patientUserId, prescriptionId);
    const request = await this.prescriptionViewRequestRepository.create({ prescriptionId: prescription.id, patientUserId, doctorUserId });
    await this.auditService?.record({ eventType: 'prescription_view_requested', actorUserId: doctorUserId, subjectUserId: patientUserId, resourceType: 'prescription', resourceId: prescription.id, metadata: {} });
    return { id: request.id, status: request.status, requestedAt: request.requested_at };
  }

  async viewForDoctor(doctorUserId, patientUserId, prescriptionId) {
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const prescription = await this.findForPatient(patientUserId, prescriptionId);
    const used = await this.prescriptionViewRequestRepository.consumeApproved({ prescriptionId: prescription.id, patientUserId, doctorUserId });
    if (!used) {
      throw new AppError(403, 'The patient has to approve before you can view this prescription.', 'PRESCRIPTION_VIEW_APPROVAL_REQUIRED');
    }
    const view = await this.viewForPatient(patientUserId, prescriptionId);
    // An uploaded prescription comes with its file, to show once on screen.
    if (prescription.format !== 'form') {
      const stored = await this.medicalStorage.get({ key: prescription.storage_key });
      const ciphertext = Buffer.isBuffer(stored) ? stored : stored?.body;
      view.file = { base64: this.fileEncryptionService.decrypt(ciphertext, prescription).toString('base64'), contentType: prescription.content_type };
    }
    await this.auditService?.record({ eventType: 'prescription_accessed', actorUserId: doctorUserId, subjectUserId: patientUserId, resourceType: 'prescription', resourceId: prescriptionId, metadata: {} });
    return view;
  }

  async listViewRequestsForPatient(patientUserId) {
    return this.prescriptionViewRequestRepository.listForPatient(patientUserId);
  }

  async decideViewRequest(patientUserId, requestId, status) {
    const request = await this.prescriptionViewRequestRepository.decide({ requestId, patientUserId, status });
    if (!request) throw new AppError(409, 'This request is no longer open.', 'PRESCRIPTION_REQUEST_NOT_OPEN');
    await this.auditService?.record({ eventType: `prescription_view_${status}`, actorUserId: patientUserId, subjectUserId: request.doctor_user_id, resourceType: 'prescription', resourceId: request.prescription_id, metadata: {} });
    return request;
  }

  // The pharmacy's own count of each medicine: the total it set on its first
  // visit, how many have been given, and how many are left. Only pharmacies
  // see this; it is not part of the doctor's prescription.
  async dispensingFor(prescription, medications) {
    const visits = (await this.prescriptionDispenseRepository?.listForPrescription(prescription.id)) ?? [];
    return {
      visits: visits.map((v) => ({ at: v.created_at, quantities: v.quantities })),
      medicines: (medications ?? []).map((m, i) => {
        const total = visits.map((v) => Number(v.totals?.[i]) || 0).find((t) => t > 0) ?? null;
        const given = visits.reduce((sum, v) => sum + (Number(v.quantities?.[i]) || 0), 0);
        return { name: m.name, total, given, left: total === null ? null : Math.max(0, total - given) };
      })
    };
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

  // --------------------------------------------------
  // SHARING WITH A PHARMACY
  // --------------------------------------------------

  async shareWithPharmacy(patientUserId, prescriptionId, pharmacyLicenseId) {
    const prescription = await this.findForPatient(patientUserId, prescriptionId);
    if (prescription.format !== 'form') {
      throw new AppError(409, 'Only typed prescriptions can be shared with a pharmacy.', 'PRESCRIPTION_NOT_SHAREABLE');
    }
    if (prescription.dispensed_at) {
      throw new AppError(409, 'This prescription has already been dispensed.', 'PRESCRIPTION_ALREADY_DISPENSED');
    }
    const pharmacy = await this.userRepository.findActivePharmacyByLicenseId(pharmacyLicenseId);
    if (!pharmacy) {
      throw new AppError(404, 'No approved pharmacy has that ID.', 'PHARMACY_NOT_FOUND');
    }

    const existing = await this.prescriptionShareRepository.findActiveForPair(prescription.id, pharmacy.id);
    if (existing) return this.publicShare(existing);

    const share = await this.prescriptionShareRepository.create({
      prescriptionId: prescription.id,
      patientUserId,
      pharmacyUserId: pharmacy.id,
      expiresAt: new Date(Date.now() + SHARE_MINUTES * 60 * 1000)
    });
    await this.auditService?.record({ eventType: 'prescription_shared', actorUserId: patientUserId, subjectUserId: pharmacy.id, resourceType: 'prescription', resourceId: prescription.id, metadata: { shareId: share.id }, expiresAt: share.expires_at });
    return this.publicShare(share);
  }

  async listSharesForPatient(patientUserId) {
    const shares = await this.prescriptionShareRepository.listForPatient(patientUserId);
    return shares.map((share) => this.publicShare(share));
  }

  async revokeShare(patientUserId, shareId) {
    const share = await this.prescriptionShareRepository.revokeForPatient(shareId, patientUserId);
    if (!share) throw new AppError(409, 'This share has already ended.', 'SHARE_NOT_ACTIVE');
    await this.auditService?.record({ eventType: 'prescription_share_revoked', actorUserId: patientUserId, subjectUserId: share.pharmacy_user_id, resourceType: 'prescription', resourceId: share.prescription_id, metadata: { shareId: share.id } });
    return this.publicShare(share);
  }

  async listSharedWithPharmacy(pharmacyUserId) {
    const shares = await this.prescriptionShareRepository.listActiveForPharmacy(pharmacyUserId);
    return shares.map((share) => this.pharmacyShare(share));
  }

  async requireShare(pharmacyUserId, shareId) {
    const share = await this.prescriptionShareRepository.findActiveForPharmacy(shareId, pharmacyUserId);
    if (!share) {
      throw new AppError(403, 'This prescription is not shared with you, or the 30 minutes have passed.', 'SHARE_NOT_ACTIVE');
    }
    const prescription = await this.prescriptionRepository.findById(share.prescription_id);
    return { share, prescription };
  }

  // The pharmacy sees the patient's name, patient ID and the medicines only,
  // plus the proof its browser needs to check the doctor's signature.
  async openForPharmacy(pharmacyUserId, shareId) {
    const { share, prescription } = await this.requireShare(pharmacyUserId, shareId);
    const { document, integrity } = await this.open(prescription);
    const medications = document?.medications ?? [];

    await this.auditService?.record({
      eventType: 'prescription_verified', actorUserId: pharmacyUserId, subjectUserId: prescription.patient_user_id,
      resourceType: 'prescription', resourceId: prescription.id,
      metadata: { valid: integrity.valid, prescriptionId: prescription.id, medication_summary: medications.map((m) => m.name).join(', ') }
    });

    return {
      share: this.pharmacyShare(share),
      patientName: share.patient_name,
      patientId: share.patient_health_id ?? null,
      medications,
      proof: {
        type: 'medivault-prescription/1',
        patientUserId: prescription.patient_user_id,
        medicationsSha256: prescription.medications_sha256,
        clinicalSha256: prescription.clinical_sha256,
        rootSha256: prescription.content_sha256,
        signature: prescription.doctor_signature,
        signerAddress: prescription.signer_address
      },
      integrity,
      dispensing: await this.dispensingFor(prescription, medications),
      dispensed: prescription.dispensed_at ? { at: prescription.dispensed_at, byUserId: prescription.dispensed_by_user_id } : null
    };
  }

  // The pharmacy records how many of each medicine it gave and signs that
  // with its own key. A prescription can be handed over in parts; once every
  // medicine is fully given it is dispensed and no pharmacy can open it again.
  async dispense(pharmacyUserId, shareId, password, { totals, quantities } = {}) {
    const { prescription } = await this.requireShare(pharmacyUserId, shareId);
    if (prescription.dispensed_at) {
      throw new AppError(409, 'This prescription has already been dispensed.', 'PRESCRIPTION_ALREADY_DISPENSED');
    }
    const { document, integrity } = await this.open(prescription);
    if (!integrity.valid) {
      throw new AppError(409, 'This prescription failed verification and cannot be dispensed.', 'PRESCRIPTION_NOT_VERIFIED');
    }

    const medications = document?.medications ?? [];
    const before = await this.dispensingFor(prescription, medications);
    const counted = this.checkCounts(totals, quantities, before.medicines);
    const given = counted.given;

    const dispensedAt = new Date();
    const digest = crypto.createHash('sha256').update(stableStringify({
      type: 'medivault-dispense/2',
      prescriptionId: prescription.id,
      prescriptionSha256: prescription.content_sha256,
      pharmacyUserId,
      totals: counted.totals,
      quantities: given,
      dispensedAt: dispensedAt.toISOString()
    }), 'utf8').digest('hex');
    const { signature, signerAddress } = await this.signingKeyService.signDigest(pharmacyUserId, password, digest);

    await this.prescriptionDispenseRepository.create({
      prescriptionId: prescription.id, pharmacyUserId, totals: counted.totals, quantities: given, dispenseSha256: digest, signature, signerAddress, createdAt: dispensedAt
    });

    const complete = before.medicines.every((m, i) => m.given + given[i] >= counted.totals[i]);
    let finishedAt = null;
    if (complete) {
      const updated = await this.prescriptionRepository.markDispensed(prescription.id, { pharmacyUserId, dispensedAt, signature, signerAddress });
      if (!updated) {
        throw new AppError(409, 'This prescription has already been dispensed.', 'PRESCRIPTION_ALREADY_DISPENSED');
      }
      finishedAt = updated.dispensed_at;
      // Once fully dispensed, no pharmacy can open this prescription again.
      await this.prescriptionShareRepository.revokeAllForPrescription(prescription.id);
    }

    const medicationSummary = medications
      .map((m, i) => (given[i] ? `${m.name} × ${given[i]}` : null))
      .filter(Boolean)
      .join(', ');
    await this.auditService?.record({ eventType: 'prescription_dispensed', actorUserId: pharmacyUserId, subjectUserId: prescription.patient_user_id, resourceType: 'prescription', resourceId: prescription.id, metadata: { dispenseSha256: digest, signerAddress, medication_summary: medicationSummary, quantities: given, complete } });
    return {
      prescriptionId: prescription.id,
      complete,
      dispensedAt: finishedAt,
      dispensing: await this.dispensingFor(prescription, medications)
    };
  }

  // totals[i] is the pharmacy's total for medicine i, set on the first visit
  // and kept after that; quantities[i] is how many are handed over now.
  checkCounts(totals, quantities, medicines) {
    if (!Array.isArray(quantities) || quantities.length !== medicines.length ||
        !Array.isArray(totals) || totals.length !== medicines.length) {
      throw new AppError(400, 'Enter the total and how many you are giving for each medicine.', 'QUANTITIES_REQUIRED');
    }
    const given = quantities.map((q) => Number(q));
    const fixed = medicines.map((m, i) => m.total ?? Number(totals[i]));
    medicines.forEach((m, i) => {
      if (!Number.isInteger(fixed[i]) || fixed[i] < 1) {
        throw new AppError(400, `Enter the total number of ${m.name} to give.`, 'TOTAL_REQUIRED');
      }
      if (!Number.isInteger(given[i]) || given[i] < 0) {
        throw new AppError(400, `Enter a whole number for ${m.name}.`, 'INVALID_QUANTITY');
      }
      const left = fixed[i] - m.given;
      if (given[i] > left) {
        throw new AppError(400, `Only ${left} of ${m.name} ${left === 1 ? 'is' : 'are'} left to give.`, 'QUANTITY_TOO_HIGH');
      }
    });
    if (!given.some((q) => q > 0)) {
      throw new AppError(400, 'Enter how many you are giving for at least one medicine.', 'QUANTITIES_REQUIRED');
    }
    return { totals: fixed, given };
  }

  // Lets the patient check a pharmacy ID before sharing prescriptions with it.
  async findPharmacy(pharmacyLicenseId) {
    const pharmacy = await this.userRepository.findActivePharmacyByLicenseId(pharmacyLicenseId);
    if (!pharmacy) {
      throw new AppError(404, 'No approved pharmacy has that ID.', 'PHARMACY_NOT_FOUND');
    }
    return { name: pharmacy.name, licenseId: pharmacy.license_id };
  }

  // What a pharmacy may see about a share: no doctor, diagnosis or dates of issue.
  pharmacyShare(share) {
    const { id, patientName, status, expiresAt, createdAt } = this.publicShare(share);
    return { id, patientName, patientId: share.patient_health_id ?? null, status, expiresAt, createdAt };
  }

  publicShare(share) {
    const active = !share.revoked_at && new Date(share.expires_at) > new Date();
    return {
      id: share.id,
      prescriptionId: share.prescription_id,
      prescriptionTitle: share.prescription_title ?? null,
      patientName: share.patient_name ?? null,
      pharmacyName: share.pharmacy_name ?? null,
      pharmacyLicenseId: share.pharmacy_license_id ?? null,
      doctorName: share.doctor_name ?? null,
      issuedAt: share.issued_at ?? null,
      dispensedAt: share.dispensed_at ?? null,
      status: share.dispensed_at ? 'dispensed' : share.revoked_at ? 'revoked' : active ? 'active' : 'expired',
      expiresAt: share.expires_at,
      createdAt: share.created_at
    };
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
      dispensedAt: prescription.dispensed_at ?? null,
      followUpDate: isoDate(prescription.follow_up_date),
      originalFilename: prescription.original_filename, contentType: prescription.content_type, sizeBytes: prescription.size_bytes,
      title: prescription.title, blockchainStatus: prescription.blockchain_status, createdAt: prescription.created_at
    };
  }
}
