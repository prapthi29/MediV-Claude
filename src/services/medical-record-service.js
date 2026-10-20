
import crypto from 'node:crypto';
import path from 'node:path';
import { AppError } from '../utils/app-error.js';
import { assertProfileActive } from './profile-activation.js';
import { SigningKeyService } from './signing-key-service.js';
import {
  BUNDLE_CONTENT_TYPE,
  MAX_BUNDLE_BYTES,
  DIAGNOSIS_FORM_FIELDS,
  decodeBundle,
  encodeBundle,
  recordSignatureDigest
} from './diagnosis-bundle.js';

export class MedicalRecordService {
  constructor({
    medicalRecordRepository,
    recordAccessRequestRepository,
    recordCreationApprovalRepository,
    recordUpdateApprovalRepository,
    medicalRecordVersionRepository,
    medicalStorage,
    fileEncryptionService,
    userRepository,
    recordRegistryClient,
    consentService,
    auditService,
    signingKeyService
  }) {
    this.medicalRecordRepository = medicalRecordRepository;
    this.recordAccessRequestRepository = recordAccessRequestRepository;
    this.recordCreationApprovalRepository = recordCreationApprovalRepository;
    this.recordUpdateApprovalRepository = recordUpdateApprovalRepository;
    this.medicalRecordVersionRepository = medicalRecordVersionRepository;
    this.medicalStorage = medicalStorage;
    this.fileEncryptionService = fileEncryptionService;
    this.userRepository = userRepository;
    this.recordRegistryClient = recordRegistryClient;
    this.consentService = consentService;
    this.auditService = auditService;
    this.signingKeyService = signingKeyService;
  }

  // --------------------------------------------------
  // DIAGNOSIS CONTENT AND DOCTOR SIGNATURES
  // --------------------------------------------------

  // Normalises the doctor's input into one bundle: a form, a file, or both.
  buildBundle({ form, file }, existingAttachment = null) {
    const attachment = file?.buffer?.length
      ? { filename: file.originalname, contentType: file.mimetype, buffer: file.buffer }
      : existingAttachment;
    // A report file can carry notes without a diagnosis.
    const cleanForm = this.cleanForm(form, { requireDiagnosis: !attachment });

    if (!cleanForm && !attachment) {
      throw new AppError(
        400,
        'Fill in the diagnosis form, attach a file, or both.',
        'RECORD_CONTENT_REQUIRED'
      );
    }

    const buffer = encodeBundle({ form: cleanForm, attachment });

    if (buffer.length > MAX_BUNDLE_BYTES) {
      throw new AppError(413, 'The record is larger than 10 MB.', 'RECORD_TOO_LARGE');
    }

    return {
      buffer,
      originalname: attachment?.filename || 'diagnosis-form',
      mimetype: BUNDLE_CONTENT_TYPE,
      size: buffer.length
    };
  }

  cleanForm(form, { requireDiagnosis = true } = {}) {
    if (!form || typeof form !== 'object') return null;
    const clean = {};
    for (const field of DIAGNOSIS_FORM_FIELDS) {
      const value = typeof form[field] === 'string' ? form[field].trim() : '';
      if (value) clean[field] = value;
    }
    if (Object.keys(clean).length === 0) return null;
    if (requireDiagnosis && !clean.diagnosis) {
      throw new AppError(400, 'The diagnosis field is required when using the form.', 'DIAGNOSIS_REQUIRED');
    }
    return clean;
  }

  async signRecordVersion(doctorUserId, password, { patientUserId, version, contentSha256, title, category }) {
    if (!this.signingKeyService) {
      throw new AppError(503, 'Record signing is not configured.', 'SIGNING_UNAVAILABLE');
    }
    if (typeof password !== 'string' || !password) {
      throw new AppError(400, 'Enter your password to confirm this record.', 'SIGNING_PASSWORD_REQUIRED');
    }
    const digest = recordSignatureDigest({ patientUserId, version, contentSha256, title, category });
    const { signature, signerAddress } = await this.signingKeyService.signDigest(doctorUserId, password, digest);
    return { doctorSignature: signature, signerAddress };
  }

  async signatureValid(record) {
    if (!record.doctor_signature || !record.signer_address) return null;
    const digest = recordSignatureDigest({
      patientUserId: record.patient_user_id,
      version: Number(record.current_version ?? 1),
      contentSha256: record.content_sha256,
      title: record.title,
      category: record.category
    });
    if (!SigningKeyService.verifyDigest(digest, record.doctor_signature, record.signer_address)) {
      return false;
    }
    return this.signingKeyService
      ? this.signingKeyService.isKeyOfUser(record.signer_address, record.uploaded_by_user_id)
      : false;
  }

  async onChainValid(record) {
    if (record.blockchain_status !== 'registered' || !this.recordRegistryClient) return null;
    const version = Number(record.current_version ?? 1);
    const result = typeof this.recordRegistryClient.verifyRecordVersion === 'function'
      ? await this.recordRegistryClient.verifyRecordVersion({ recordId: record.id, version, contentSha256: record.content_sha256 })
      : await this.recordRegistryClient.verifyRecord({ recordId: record.id, contentSha256: record.content_sha256 });
    return typeof result === 'boolean' ? result : result?.valid === true;
  }

  // Decrypts a record and returns its form, attachment and integrity checks.
  async openRecord(record, { includeAttachmentBytes = true } = {}) {
    const { body: ciphertext } = await this.medicalStorage.get({ key: record.storage_key });
    const plaintext = this.fileEncryptionService.decrypt(ciphertext, record);
    const { form, attachment } = decodeBundle(plaintext, {
      filename: record.original_filename,
      contentType: record.content_type
    });
    const hashValid = this.hashesMatch(this.createSha256(plaintext), record.content_sha256);
    const signatureValid = await this.signatureValid(record);
    const onChain = await this.onChainValid(record).catch(() => false);

    return {
      record: this.publicRecord(record),
      form,
      attachment: attachment
        ? {
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.size ?? attachment.buffer.length,
            ...(includeAttachmentBytes ? { base64: attachment.buffer.toString('base64') } : {})
          }
        : null,
      attachmentBuffer: attachment?.buffer ?? null,
      integrity: {
        hashValid,
        signatureValid,
        onChain,
        verified: hashValid && signatureValid === true && onChain === true
      }
    };
  }

  viewPayload(opened) {
    const { attachmentBuffer, ...view } = opened;
    return view;
  }

  // --------------------------------------------------
  // UPLOAD MEDICAL RECORDS
  // --------------------------------------------------

  async uploadOwnRecord(patientUserId, file, metadata) {
    throw new AppError(
      403,
      'Patients cannot upload or create medical records.',
      'PATIENT_RECORD_CREATION_FORBIDDEN'
    );
  }

  async uploadRecordForDoctor(
    doctorUserId,
    patientUserId,
    content,
    metadata,
    approvalId,
    password
  ) {
    await assertProfileActive(this.userRepository, patientUserId);
    await this.consentService.assertDoctorAccess(
      patientUserId,
      doctorUserId
    );

    if (!approvalId || !this.recordCreationApprovalRepository) {
      throw new AppError(
        403,
        'Patient-approved record creation is required.',
        'RECORD_CREATION_APPROVAL_REQUIRED'
      );
    }

    const bundleFile = this.buildBundle(content ?? {});
    // Sign before using up the approval, so a mistyped password costs nothing.
    const signature = await this.signRecordVersion(doctorUserId, password, {
      patientUserId,
      version: 1,
      contentSha256: this.createSha256(bundleFile.buffer),
      title: metadata?.title,
      category: metadata?.category
    });

    // Atomic compare-and-set: only one upload can consume this approval.
    const approval = await this.recordCreationApprovalRepository.consume({
      approvalId,
      patientUserId,
      doctorUserId
    });

    if (!approval) {
      throw new AppError(
        403,
        'The creation approval is missing, expired, already used, or belongs to another user.',
        'RECORD_CREATION_APPROVAL_INVALID'
      );
    }

    return this.uploadRecord({
      patientUserId,
      uploadedByUserId: doctorUserId,
      file: bundleFile,
      metadata,
      signature
    });
  }

  async requestRecordCreation(doctorUserId, patientUserId) {
    if (doctorUserId === patientUserId) {
      throw new AppError(
        400,
        'Invalid patient account.',
        'INVALID_PATIENT'
      );
    }

    await assertProfileActive(this.userRepository, patientUserId);
    await this.consentService.assertDoctorAccess(
      patientUserId,
      doctorUserId
    );

    const doctor = await this.userRepository.findById(doctorUserId);

    if (!doctor || doctor.role !== 'doctor' || doctor.status !== 'active') {
      throw new AppError(
        403,
        'An active, approved doctor account is required.',
        'DOCTOR_NOT_ACTIVE'
      );
    }

    const approval = await this.recordCreationApprovalRepository.create({
      patientUserId,
      doctorUserId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await this.auditService?.record({
      eventType: 'record_creation_requested',
      actorUserId: doctorUserId,
      subjectUserId: patientUserId,
      resourceType: 'medical_record_creation_approval',
      resourceId: approval.id,
      metadata: {
        expiresAt: approval.expires_at
      }
    });

    return approval;
  }

  async listRecordCreationRequestsForPatient(patientUserId) {
    return this.recordCreationApprovalRepository.listForPatient(
      patientUserId
    );
  }

  async decideRecordCreationRequest(
    patientUserId,
    approvalId,
    status
  ) {
    const approval = await this.recordCreationApprovalRepository.decide({
      approvalId,
      patientUserId,
      status
    });

    if (!approval) {
      throw new AppError(
        404,
        'Creation request not found, expired, or already decided.',
        'RECORD_CREATION_REQUEST_NOT_FOUND'
      );
    }

    await this.auditService?.record({
      eventType: `record_creation_${status}`,
      actorUserId: patientUserId,
      subjectUserId: approval.doctor_user_id,
      resourceType: 'medical_record_creation_approval',
      resourceId: approval.id,
      metadata: {
        status
      }
    });

    return approval;
  }
  async revokeRecordCreationRequest(patientUserId, approvalId) {
    const approval =
      await this.recordCreationApprovalRepository.revoke({
        approvalId,
        patientUserId
      });

    if (!approval) {
      throw new AppError(
        409,
        'Creation request cannot be revoked because it is missing, expired, not approved, or already used.',
        'RECORD_CREATION_REQUEST_NOT_REVOCABLE'
      );
    }

    await this.auditService?.record({
      eventType: 'record_creation_revoked',
      actorUserId: patientUserId,
      subjectUserId: approval.doctor_user_id,
      resourceType: 'medical_record_creation_approval',
      resourceId: approval.id,
      metadata: {
        status: 'revoked'
      }
    });

    return approval;
  }

  async uploadRecord({
    patientUserId,
    uploadedByUserId,
    file,
    metadata = {},
    signature = {}
  }) {
    if (!file) {
      throw new AppError(
        400,
        'A medical document is required.',
        'FILE_REQUIRED'
      );
    }

    const storageKey = this.createStorageKey(
      patientUserId,
      file.originalname
    );

    const contentSha256 = this.createSha256(file.buffer);
    const encryption = this.fileEncryptionService.encrypt(file.buffer);

    await this.medicalStorage.put({
      key: storageKey,
      body: encryption.ciphertext,
      contentType: 'application/octet-stream'
    });

    let record;

    try {
      record = await this.medicalRecordRepository.create({
        patientUserId,
        uploadedByUserId,
        storageKey,
        originalFilename: file.originalname,
        contentType: file.mimetype,
        sizeBytes: file.size,
        title: metadata.title,
        category: metadata.category,
        contentSha256,
        encryption,
        signature
      });
    } catch (error) {
      await this.medicalStorage
        .delete({ key: storageKey })
        .catch(() => {});

      throw error;
    }

    let initialVersion;
    if (this.medicalRecordVersionRepository) {
      try {
        initialVersion = await this.medicalRecordVersionRepository.create({
          medicalRecordId: record.id,
          versionNumber: 1,
          uploadedByUserId,
          record,
          blockchainStatus: 'pending'
        });
      } catch (error) {
        // Do not claim successful blockchain registration when version history is missing.
        await this.medicalRecordRepository.markBlockchainFailed?.(record.id).catch(() => {});
        throw new AppError(503, 'The record was saved but its version history could not be initialized. Recovery is required.', 'VERSION_HISTORY_INITIALIZATION_FAILED');
      }
    }

    if (this.recordRegistryClient) {
      try {
        record = await this.registerRecordOnChain(patientUserId, record);
        if (initialVersion) {
          await this.medicalRecordVersionRepository.markBlockchainRegistered(initialVersion.id, {
            transactionHash: record.blockchain_tx_hash ?? null,
            registeredAt: record.blockchain_registered_at ?? new Date()
          });
        }
      } catch (error) {
        if (initialVersion) {
          await this.medicalRecordVersionRepository.markBlockchainFailed(initialVersion.id).catch(() => {});
        }
        throw error;
      }
    }

    await this.auditService?.record({
      eventType: 'record_created',
      actorUserId: uploadedByUserId,
      subjectUserId: patientUserId,
      resourceType: 'medical_record',
      resourceId: record.id,
      metadata: {}
    });

    return this.publicRecord(record);
  }

  // --------------------------------------------------
  // PATIENT-APPROVED RECORD UPDATES AND IMMUTABLE VERSIONS
  // --------------------------------------------------

  requireVersioning() {
    if (!this.recordUpdateApprovalRepository || !this.medicalRecordVersionRepository) {
      throw new AppError(503, 'Record update/versioning is not configured.', 'VERSIONING_UNAVAILABLE');
    }
    if (!this.recordRegistryClient ||
        typeof this.recordRegistryClient.getRecordVersionCount !== 'function' ||
        typeof this.recordRegistryClient.registerRecordVersion !== 'function') {
      throw new AppError(503, 'Version-aware blockchain registry is unavailable.', 'BLOCKCHAIN_VERSIONING_UNAVAILABLE');
    }
  }

  async requestRecordUpdate(doctorUserId, patientUserId, recordId) {
    this.requireVersioning();
    if (doctorUserId === patientUserId) {
      throw new AppError(400, 'Invalid patient account.', 'INVALID_PATIENT');
    }
    await assertProfileActive(this.userRepository, patientUserId);
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const doctor = await this.userRepository.findById(doctorUserId);
    if (!doctor || doctor.role !== 'doctor' || doctor.status !== 'active') {
      throw new AppError(403, 'An active, approved doctor account is required.', 'DOCTOR_NOT_ACTIVE');
    }
    const record = await this.medicalRecordRepository.findByIdForPatient(recordId, patientUserId);
    if (!record) throw new AppError(404, 'Medical record not found.', 'RECORD_NOT_FOUND');
    if (record.blockchain_status !== 'registered') {
      throw new AppError(409, 'The record must be registered on-chain before requesting an update.', 'RECORD_NOT_REGISTERED');
    }
    const latest = await this.medicalRecordVersionRepository.findLatest(recordId);
    if (!latest) {
      throw new AppError(409, 'Record version history is missing. Apply the version-history backfill migration first.', 'VERSION_HISTORY_MISSING');
    }
    if (latest.blockchain_status !== 'registered') {
      throw new AppError(409, 'The latest record version is not confirmed on-chain.', 'VERSION_NOT_REGISTERED');
    }
    const chainCount = await this.recordRegistryClient.getRecordVersionCount({ recordId });
    if (chainCount !== Number(latest.version_number)) {
      throw new AppError(409, 'Database and blockchain version counts differ. Reconcile before requesting an update.', 'VERSION_COUNT_MISMATCH');
    }
    const approval = await this.recordUpdateApprovalRepository.create({
      medicalRecordId: recordId,
      patientUserId,
      doctorUserId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    await this.auditService?.record({
      eventType: 'record_update_requested', actorUserId: doctorUserId,
      subjectUserId: patientUserId, resourceType: 'medical_record', resourceId: recordId,
      metadata: { approvalId: approval.id, currentVersion: Number(latest.version_number) }
    });
    return approval;
  }

  async listRecordUpdateRequestsForPatient(patientUserId) {
    this.requireVersioning();
    return this.recordUpdateApprovalRepository.listForPatient(patientUserId);
  }

  async decideRecordUpdateRequest(patientUserId, approvalId, status) {
    this.requireVersioning();
    const approval = await this.recordUpdateApprovalRepository.decide({ approvalId, patientUserId, status });
    if (!approval) throw new AppError(404, 'Update request not found, expired, or already decided.', 'RECORD_UPDATE_REQUEST_NOT_FOUND');
    await this.auditService?.record({
      eventType: `record_update_${status}`, actorUserId: patientUserId,
      subjectUserId: approval.doctor_user_id, resourceType: 'medical_record',
      resourceId: approval.medical_record_id, metadata: { approvalId: approval.id, status }
    });
    return approval;
  }

  async revokeRecordUpdateRequest(patientUserId, approvalId) {
    this.requireVersioning();
    const approval = await this.recordUpdateApprovalRepository.revoke({ approvalId, patientUserId });
    if (!approval) throw new AppError(409, 'Only an active approved update request can be revoked.', 'RECORD_UPDATE_REQUEST_NOT_REVOCABLE');
    await this.auditService?.record({
      eventType: 'record_update_revoked', actorUserId: patientUserId,
      subjectUserId: approval.doctor_user_id, resourceType: 'medical_record',
      resourceId: approval.medical_record_id, metadata: { approvalId: approval.id }
    });
    return approval;
  }

  // The doctor sees the current contents while an approved, unused edit request exists.
  async getRecordForEdit(doctorUserId, patientUserId, recordId, approvalId) {
    this.requireVersioning();
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const approval = await this.recordUpdateApprovalRepository.findUsable({
      approvalId, medicalRecordId: recordId, patientUserId, doctorUserId
    });
    if (!approval) throw new AppError(403, 'The patient has not approved this edit, or it was already used.', 'RECORD_UPDATE_APPROVAL_INVALID');
    const record = await this.medicalRecordRepository.findByIdForPatient(recordId, patientUserId);
    if (!record) throw new AppError(404, 'Medical record not found.', 'RECORD_NOT_FOUND');
    return this.viewPayload(await this.openRecord(record, { includeAttachmentBytes: false }));
  }

  async updateRecordForDoctor(doctorUserId, patientUserId, recordId, content, metadata, approvalId, password) {
    this.requireVersioning();
    await assertProfileActive(this.userRepository, patientUserId);
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const doctor = await this.userRepository.findById(doctorUserId);
    if (!doctor || doctor.role !== 'doctor' || doctor.status !== 'active') {
      throw new AppError(403, 'An active, approved doctor account is required.', 'DOCTOR_NOT_ACTIVE');
    }
    const current = await this.medicalRecordRepository.findByIdForPatient(recordId, patientUserId);
    if (!current) throw new AppError(404, 'Medical record not found.', 'RECORD_NOT_FOUND');
    const latest = await this.medicalRecordVersionRepository.findLatest(recordId);
    if (!latest) throw new AppError(409, 'Record version history is missing. Apply migration 026 first.', 'VERSION_HISTORY_MISSING');
    const currentVersion = Number(latest.version_number);
    if (latest.blockchain_status !== 'registered') {
      throw new AppError(409, 'The latest record version is not confirmed on-chain.', 'VERSION_NOT_REGISTERED');
    }
    const chainCount = await this.recordRegistryClient.getRecordVersionCount({ recordId });
    if (chainCount !== currentVersion) throw new AppError(409, 'Database and blockchain version counts differ. Reconcile before updating.', 'VERSION_COUNT_MISMATCH');

    const usable = await this.recordUpdateApprovalRepository.findUsable?.({
      approvalId, medicalRecordId: recordId, patientUserId, doctorUserId
    });
    if (usable === null) throw new AppError(403, 'A valid, unexpired, unused patient approval for this exact record is required.', 'RECORD_UPDATE_APPROVAL_INVALID');

    let existingAttachment = null;
    if (content?.keepExistingFile && !content?.file?.buffer?.length) {
      const opened = await this.openRecord(current);
      if (opened.attachment) {
        existingAttachment = {
          filename: opened.attachment.filename,
          contentType: opened.attachment.contentType,
          buffer: opened.attachmentBuffer
        };
      }
    }
    const file = this.buildBundle(content ?? {}, existingAttachment);
    const title = metadata?.title ?? current.title;
    const category = metadata?.category ?? current.category;
    const contentSha256 = this.createSha256(file.buffer);
    const signature = await this.signRecordVersion(doctorUserId, password, {
      patientUserId, version: currentVersion + 1, contentSha256, title, category
    });

    const approval = await this.recordUpdateApprovalRepository.consume({
      approvalId, medicalRecordId: recordId, patientUserId, doctorUserId
    });
    if (!approval) throw new AppError(403, 'A valid, unexpired, unused patient approval for this exact record is required.', 'RECORD_UPDATE_APPROVAL_INVALID');

    const storageKey = this.createStorageKey(patientUserId, file.originalname);
    const encryption = this.fileEncryptionService.encrypt(file.buffer);
    await this.medicalStorage.put({ key: storageKey, body: encryption.ciphertext, contentType: 'application/octet-stream' });
    let versionRow;
    try {
      versionRow = await this.medicalRecordVersionRepository.create({
        medicalRecordId: recordId, versionNumber: currentVersion + 1,
        uploadedByUserId: doctorUserId,
        record: {
          storage_key: storageKey, original_filename: file.originalname,
          content_type: file.mimetype, size_bytes: file.size ?? file.buffer.length,
          title, category,
          doctor_signature: signature.doctorSignature, signer_address: signature.signerAddress,
          content_sha256: contentSha256, encryption_algorithm: encryption.encryptionAlgorithm,
          encrypted_data_key: encryption.encryptedDataKey, data_key_iv: encryption.dataKeyIv,
          data_key_auth_tag: encryption.dataKeyAuthTag, file_iv: encryption.fileIv,
          file_auth_tag: encryption.fileAuthTag
        }, blockchainStatus: 'pending'
      });
    } catch (error) {
      await this.medicalStorage.delete({ key: storageKey }).catch(() => {});
      throw error;
    }

    let registration;
    try {
      registration = await this.recordRegistryClient.registerRecordVersion({
        recordId, expectedCurrentVersion: currentVersion, contentSha256
      });
    } catch (chainError) {
      // Resolve lost receipts by reading canonical chain state before deciding what to clean up.
      try {
        const observedCount = await this.recordRegistryClient.getRecordVersionCount({ recordId });
        if (observedCount === currentVersion + 1) {
          const observed = await this.recordRegistryClient.getRecordVersion({ recordId, version: currentVersion + 1 });
          const observedHash = String(observed.contentHash).replace(/^0x/i, '').toLowerCase();
          if (observedHash === contentSha256.toLowerCase()) {
            registration = { version: currentVersion + 1, contentHash: observed.contentHash, transactionHash: null, registeredAt: observed.registeredAt };
          } else {
            throw new AppError(409, 'A different hash is registered for the expected version.', 'BLOCKCHAIN_VERSION_CONFLICT');
          }
        } else if (observedCount === currentVersion) {
          await this.medicalRecordVersionRepository.deletePending(versionRow.id);
          await this.medicalStorage.delete({ key: storageKey }).catch(() => {});
          throw new AppError(502, 'Blockchain version registration failed; the prior version remains current.', 'BLOCKCHAIN_VERSION_REGISTRATION_FAILED');
        } else {
          throw new AppError(503, 'Blockchain version state is uncertain. Reconciliation is required before another update.', 'BLOCKCHAIN_VERSION_RECONCILIATION_REQUIRED');
        }
      } catch (reconcileError) {
        if (reconcileError instanceof AppError) throw reconcileError;
        throw new AppError(503, 'Blockchain version state could not be confirmed. Reconciliation is required.', 'BLOCKCHAIN_VERSION_RECONCILIATION_REQUIRED');
      }
    }

    try {
      await this.medicalRecordVersionRepository.markBlockchainRegistered(versionRow.id, {
        transactionHash: registration.transactionHash ?? null,
        registeredAt: registration.registeredAt ?? new Date()
      });
      const promoted = await this.medicalRecordRepository.promoteVersion(recordId, currentVersion + 1, registration);
      if (!promoted) throw new Error('Medical record promotion returned no row.');
      await this.auditService?.record({
        eventType: 'record_version_created', actorUserId: doctorUserId,
        subjectUserId: patientUserId, resourceType: 'medical_record', resourceId: recordId,
        metadata: { version: currentVersion + 1, contentSha256, transactionHash: registration.transactionHash ?? null }
      });
      return this.publicRecord(promoted);
    } catch (error) {
      throw new AppError(503, 'The blockchain version is confirmed, but database reconciliation failed. Do not retry the upload; reconcile the registered version.', 'BLOCKCHAIN_VERSION_RECONCILIATION_REQUIRED');
    }
  }

  async listRecordVersionsForPatient(patientUserId, recordId) {
    this.requireVersioning();
    const record = await this.medicalRecordRepository.findByIdForPatient(recordId, patientUserId);
    if (!record) throw new AppError(404, 'Medical record not found.', 'RECORD_NOT_FOUND');
    return this.medicalRecordVersionRepository.listForRecord(recordId);
  }

  async listRecordVersionsForDoctor(doctorUserId, patientUserId, recordId) {
    this.requireVersioning();
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const record = await this.medicalRecordRepository.findByIdForPatient(recordId, patientUserId);
    if (!record) throw new AppError(404, 'Medical record not found.', 'RECORD_NOT_FOUND');
    return this.medicalRecordVersionRepository.listForRecord(recordId);
  }

  async downloadRecordVersion(patientUserId, recordId, versionNumber) {
    this.requireVersioning();
    const parent = await this.medicalRecordRepository.findByIdForPatient(recordId, patientUserId);
    if (!parent) throw new AppError(404, 'Medical record not found.', 'RECORD_NOT_FOUND');
    const version = await this.medicalRecordVersionRepository.findVersion(recordId, versionNumber);
    if (!version) throw new AppError(404, 'Record version not found.', 'RECORD_VERSION_NOT_FOUND');
    const { body: ciphertext } = await this.medicalStorage.get({ key: version.storage_key });
    const plaintext = this.fileEncryptionService.decrypt(ciphertext, version);
    const { form, attachment } = decodeBundle(plaintext, { filename: version.original_filename, contentType: version.content_type });
    if (attachment) {
      return { record: { ...this.publicRecord(parent), original_filename: attachment.filename, content_type: attachment.contentType }, body: attachment.buffer };
    }
    return { record: { ...this.publicRecord(parent), original_filename: `${parent.title || 'diagnosis'}-v${versionNumber}.json`, content_type: 'application/json' }, body: Buffer.from(JSON.stringify(form, null, 2)) };
  }

  async downloadRecordVersionForDoctor(doctorUserId, patientUserId, recordId, versionNumber) {
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const approved = await this.recordAccessRequestRepository?.consumeApproved({ recordId, patientUserId, doctorUserId });
    if (!approved) throw new AppError(403, 'The patient has not approved access to this specific record.', 'RECORD_ACCESS_NOT_APPROVED');
    return this.downloadRecordVersion(patientUserId, recordId, versionNumber);
  }

  // --------------------------------------------------
  // PATIENT RECORDS
  // --------------------------------------------------

  async listOwnRecords(patientUserId) {
    const records =
      await this.medicalRecordRepository.listForPatient(
        patientUserId
      );

    return records.map((record) => this.publicRecord(record));
  }

  async downloadOwnRecord(patientUserId, recordId) {
    const record =
      await this.medicalRecordRepository.findByIdForPatient(
        recordId,
        patientUserId
      );

    if (!record) {
      throw new AppError(
        404,
        'Medical record not found.',
        'RECORD_NOT_FOUND'
      );
    }

    const opened = await this.openRecord(record, { includeAttachmentBytes: false });

    if (!opened.attachment) {
      throw new AppError(404, 'This record has no attached file.', 'NO_ATTACHMENT');
    }

    await this.auditService?.record({
      eventType: 'record_accessed',
      actorUserId: patientUserId,
      subjectUserId: patientUserId,
      resourceType: 'medical_record',
      resourceId: record.id,
      metadata: {}
    });

    return {
      record: {
        ...this.publicRecord(record),
        originalFilename: opened.attachment.filename,
        contentType: opened.attachment.contentType
      },
      body: opened.attachmentBuffer
    };
  }

  async viewOwnRecord(patientUserId, recordId) {
    const record = await this.medicalRecordRepository.findByIdForPatient(recordId, patientUserId);
    if (!record) throw new AppError(404, 'Medical record not found.', 'RECORD_NOT_FOUND');
    return this.viewPayload(await this.openRecord(record, { includeAttachmentBytes: false }));
  }

  // --------------------------------------------------
  // DOCTOR: LIST PATIENT FILES
  // --------------------------------------------------

  async listRecordsForDoctor(doctorUserId, patientUserId) {
    if (doctorUserId === patientUserId) {
      throw new AppError(
        400,
        'Invalid patient account.',
        'INVALID_PATIENT'
      );
    }

    await this.consentService.assertDoctorAccess(
      patientUserId,
      doctorUserId
    );

    const records =
      await this.medicalRecordRepository.listForPatient(
        patientUserId
      );
    const viewRequests =
      (await this.recordAccessRequestRepository?.listForDoctorPatient?.(doctorUserId, patientUserId)) ?? [];
    const editRequests =
      (await this.recordUpdateApprovalRepository?.listForDoctorPatient?.(doctorUserId, patientUserId)) ?? [];

    return records.map((record) => {
      const view = viewRequests.find((r) => r.record_id === record.id);
      const edit = editRequests.find((r) => r.medical_record_id === record.id);
      return {
        id: record.id,
        originalFilename: record.original_filename,
        title: record.title,
        category: record.category,
        version: Number(record.current_version ?? 1),
        doctorName: record.doctor_name ?? null,
        createdAt: record.created_at,
        viewRequest: view ? { id: view.id, status: view.status } : null,
        editRequest: edit
          ? { id: edit.id, status: new Date(edit.expires_at) <= new Date() && ['pending', 'approved'].includes(edit.status) ? 'expired' : edit.status }
          : null
      };
    });
  }

  async listRecordCreationRequestsForDoctor(doctorUserId, patientUserId) {
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const rows = await this.recordCreationApprovalRepository.listForDoctorPatient(doctorUserId, patientUserId);
    return rows.map((row) => ({
      id: row.id,
      status: new Date(row.expires_at) <= new Date() && ['pending', 'approved'].includes(row.status) ? 'expired' : row.status,
      requestedAt: row.requested_at,
      expiresAt: row.expires_at
    }));
  }

  // --------------------------------------------------
  // DOCTOR: REQUEST ACCESS TO A SPECIFIC FILE
  // --------------------------------------------------

  async requestRecordAccess(
    doctorUserId,
    patientUserId,
    recordId
  ) {
    if (doctorUserId === patientUserId) {
      throw new AppError(
        400,
        'You cannot request access to your own patient account.',
        'INVALID_ACCESS_REQUEST'
      );
    }

    await this.consentService.assertDoctorAccess(
      patientUserId,
      doctorUserId
    );

    const record =
      await this.medicalRecordRepository.findByIdForPatient(
        recordId,
        patientUserId
      );

    if (!record) {
      throw new AppError(
        404,
        'Medical record not found.',
        'RECORD_NOT_FOUND'
      );
    }

    const request =
      await this.recordAccessRequestRepository.create({
        recordId,
        patientUserId,
        doctorUserId
      });

    if (!request) {
      throw new AppError(
        409,
        'An access request already exists and cannot be resubmitted.',
        'ACCESS_REQUEST_EXISTS'
      );
    }

    await this.auditService?.record({
      eventType: 'record_access_requested',
      actorUserId: doctorUserId,
      subjectUserId: patientUserId,
      resourceType: 'medical_record',
      resourceId: record.id,
      metadata: {
        requestId: request.id,
        status: request.status
      }
    });

    return request;
  }

  // --------------------------------------------------
  // PATIENT: VIEW ACCESS REQUESTS
  // --------------------------------------------------

  async listRecordAccessRequestsForPatient(patientUserId) {
    return this.recordAccessRequestRepository.listForPatient(
      patientUserId
    );
  }

  // --------------------------------------------------
  // PATIENT: APPROVE, REJECT OR REVOKE ACCESS
  // --------------------------------------------------

  async decideRecordAccessRequest(
    patientUserId,
    requestId,
    status
  ) {
    if (!['approved', 'rejected', 'revoked'].includes(status)) {
      throw new AppError(
        400,
        'Invalid access decision.',
        'INVALID_ACCESS_DECISION'
      );
    }

    const request =
      await this.recordAccessRequestRepository.decide({
        requestId,
        patientUserId,
        status
      });

    if (!request) {
      throw new AppError(
        404,
        'Access request not found or cannot be updated.',
        'ACCESS_REQUEST_NOT_FOUND'
      );
    }

    await this.auditService?.record({
      eventType: `record_access_${status}`,
      actorUserId: patientUserId,
      subjectUserId: request.doctor_user_id,
      resourceType: 'medical_record',
      resourceId: request.record_id,
      metadata: {
        requestId: request.id,
        status
      }
    });

    return request;
  }

  // --------------------------------------------------
  // DOCTOR: DOWNLOAD A PATIENT FILE
  // --------------------------------------------------

  // A view approval allows exactly one view: opening the record uses it up.
  async viewRecordForDoctor(doctorUserId, patientUserId, recordId) {
    await this.consentService.assertDoctorAccess(patientUserId, doctorUserId);
    const record = await this.medicalRecordRepository.findByIdForPatient(recordId, patientUserId);
    if (!record) throw new AppError(404, 'Medical record not found.', 'RECORD_NOT_FOUND');

    const used = await this.recordAccessRequestRepository.consumeApproved({ recordId, patientUserId, doctorUserId });
    if (!used) {
      throw new AppError(403, 'The patient has not approved a view of this record, or the approval was already used.', 'RECORD_ACCESS_NOT_APPROVED');
    }

    const opened = await this.openRecord(record);
    await this.auditService?.record({
      eventType: 'record_accessed',
      actorUserId: doctorUserId,
      subjectUserId: patientUserId,
      resourceType: 'medical_record',
      resourceId: record.id,
      metadata: { access: 'single_view_approval', requestId: used.id }
    });
    return this.viewPayload(opened);
  }

  // --------------------------------------------------
  // EMERGENCY RECORD CLASSIFICATION
  // --------------------------------------------------

  async setOwnRecordEmergencyEssential(
    patientUserId,
    recordId,
    isEmergencyEssential
  ) {
    const record =
      await this.medicalRecordRepository.setEmergencyEssential(
        recordId,
        patientUserId,
        isEmergencyEssential
      );

    if (!record) {
      throw new AppError(
        404,
        'Medical record not found.',
        'RECORD_NOT_FOUND'
      );
    }

    await this.auditService?.record({
      eventType: 'emergency_record_classification_changed',
      actorUserId: patientUserId,
      subjectUserId: patientUserId,
      resourceType: 'medical_record',
      resourceId: record.id,
      metadata: {
        isEmergencyEssential
      }
    });

    return this.publicRecord(record);
  }

  // --------------------------------------------------
  // INTEGRITY VERIFICATION
  // --------------------------------------------------

  async verifyOwnRecord(patientUserId, recordId) {
    const record =
      await this.medicalRecordRepository.findByIdForPatient(
        recordId,
        patientUserId
      );

    if (!record) {
      throw new AppError(
        404,
        'Medical record not found.',
        'RECORD_NOT_FOUND'
      );
    }

    if (!record.content_sha256) {
      throw new AppError(
        409,
        'This record has no integrity hash.',
        'HASH_UNAVAILABLE'
      );
    }

    try {
      const { body: ciphertext } = await this.medicalStorage.get({
        key: record.storage_key
      });

      const plaintext = this.fileEncryptionService.decrypt(
        ciphertext,
        record
      );

      const localValid = this.hashesMatch(
        this.createSha256(plaintext),
        record.content_sha256
      );

      const blockchainValid = await this.onChainValid(record);
      const signatureValid = await this.signatureValid(record);

      return {
        recordId: record.id,
        valid:
          localValid &&
          record.blockchain_status === 'registered' &&
          blockchainValid === true &&
          signatureValid !== false,
        localValid,
        blockchainValid,
        signatureValid
      };
    } catch (error) {
      if (error.code === 'DECRYPTION_FAILED') {
        return {
          recordId: record.id,
          valid: false,
          localValid: false,
          blockchainValid: null
        };
      }

      throw error;
    }
  }

  // --------------------------------------------------
  // BLOCKCHAIN REGISTRATION
  // --------------------------------------------------

  async registerOwnRecordOnChain(patientUserId, recordId) {
    // Internal legacy method only.
    // Do not expose this method through patient routes.
    const record =
      await this.medicalRecordRepository.findByIdForPatient(
        recordId,
        patientUserId
      );

    if (!record) {
      throw new AppError(
        404,
        'Medical record not found.',
        'RECORD_NOT_FOUND'
      );
    }

    if (record.blockchain_status === 'registered') {
      return this.publicRecord(record);
    }

    const registeredRecord =
      await this.registerRecordOnChain(patientUserId, record);

    return this.publicRecord(registeredRecord);
  }

  async registerRecordOnChain(patientUserId, record) {
    if (!this.recordRegistryClient) {
      throw new AppError(
        503,
        'Blockchain registry is not configured.',
        'BLOCKCHAIN_UNAVAILABLE'
      );
    }

    const patient = await this.userRepository.findById(
      patientUserId
    );

    if (!patient?.blockchain_address) {
      throw new AppError(
        409,
        'Patient blockchain wallet address is required.',
        'WALLET_REQUIRED'
      );
    }

    const expectedHash =
      `0x${record.content_sha256.replace(/^0x/i, '').toLowerCase()}`;

    const expectedPatient =
      patient.blockchain_address.toLowerCase();

    let registration;

    try {
      registration =
        await this.recordRegistryClient.registerRecord({
          recordId: record.id,
          contentSha256: record.content_sha256,
          patientAddress: patient.blockchain_address
        });
    } catch (registrationError) {
      // The transaction may have succeeded even if the backend
      // lost the receipt or encountered a network timeout.
      // Check the actual blockchain state before declaring failure.

      let existing;

      try {
        existing =
          await this.recordRegistryClient.getRegisteredRecord({
            recordId: record.id
          });
      } catch (lookupError) {
        throw new AppError(
          503,
          'Blockchain registration status could not be confirmed. Retry reconciliation before submitting another transaction.',
          'BLOCKCHAIN_STATUS_UNCONFIRMED'
        );
      }

      if (!existing) {
        await this.medicalRecordRepository.markBlockchainFailed(
          record.id
        );

        throw new AppError(
          502,
          'Blockchain registration failed. The record remains pending recovery.',
          'BLOCKCHAIN_REGISTRATION_FAILED'
        );
      }

      if (
        existing.contentHash?.toLowerCase() !== expectedHash ||
        existing.patient?.toLowerCase() !== expectedPatient
      ) {
        await this.medicalRecordRepository.markBlockchainFailed(
          record.id
        );

        throw new AppError(
          409,
          'An on-chain record already exists with a different hash or patient.',
          'BLOCKCHAIN_RECORD_CONFLICT'
        );
      }

      // Chain state is authoritative. Reconcile the DB rather
      // than broadcasting the same registration again.
      registration = {
        blockchainRecordId: existing.blockchainRecordId,
        transactionHash: null,
        registeredAt: existing.registeredAt,
        alreadyRegistered: true
      };
    }

    // Keep database reconciliation separate from chain submission.
    // If the blockchain transaction succeeded but this update fails,
    // do not incorrectly mark the chain registration as failed.
    try {
      const updated =
        await this.medicalRecordRepository.markBlockchainRegistered(
          record.id,
          registration
        );

      if (!updated) {
        throw new Error(
          'The medical record could not be found during reconciliation.'
        );
      }

      return updated;
    } catch (databaseError) {
      throw new AppError(
        503,
        'Blockchain registration was confirmed, but the database could not be updated. Reconciliation is required.',
        'BLOCKCHAIN_RECONCILIATION_REQUIRED'
      );
    }
  }

  // --------------------------------------------------
  // UTILITIES
  // --------------------------------------------------

  createStorageKey(patientUserId, originalFilename) {
    const extension = path
      .extname(originalFilename)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 12);

    return `medical-records/${patientUserId}/${crypto.randomUUID()}${extension}`;
  }

  createSha256(buffer) {
    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
  }

  hashesMatch(actual, expected) {
    if (
      typeof actual !== 'string' ||
      typeof expected !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(actual) ||
      !/^[a-f0-9]{64}$/i.test(expected)
    ) {
      return false;
    }

    const actualBuffer = Buffer.from(actual, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    return (
      actualBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  publicRecord(record) {
    return {
      id: record.id,
      patientUserId: record.patient_user_id,
      originalFilename: record.original_filename,
      contentType: record.content_type,
      sizeBytes: record.size_bytes,
      title: record.title,
      category: record.category,
      version: Number(record.current_version ?? 1),
      format: record.content_type === BUNDLE_CONTENT_TYPE ? 'diagnosis' : 'file',
      doctorName: record.doctor_name ?? null,
      signerAddress: record.signer_address ?? null,
      signed: Boolean(record.doctor_signature || record.signer_address),
      blockchainStatus: record.blockchain_status,
      createdAt: record.created_at
    };
  }
}
