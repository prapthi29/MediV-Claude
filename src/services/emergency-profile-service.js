
import { AppError } from '../utils/app-error.js';
import { SigningKeyService } from './signing-key-service.js';
import {
  basicProfileChainId,
  basicProfileSha256
} from './basic-profile-signature.js';

const STATUSES = ['unknown', 'none_known', 'provided'];

function validateListStatus(items, status, label) {
  if (!Array.isArray(items)) {
    throw new AppError(
      400,
      `${label} must be a list.`,
      'INVALID_PROFILE_LIST'
    );
  }

  if (!STATUSES.includes(status)) {
    throw new AppError(
      400,
      `Invalid ${label} status.`,
      'INVALID_PROFILE_STATUS'
    );
  }

  if (status === 'provided' && items.length === 0) {
    throw new AppError(
      400,
      `${label} must contain at least one item when status is provided.`,
      'PROFILE_STATUS_MISMATCH'
    );
  }

  if (
    (status === 'none_known' || status === 'unknown') &&
    items.length !== 0
  ) {
    throw new AppError(
      400,
      `${label} must be empty when status is ${status}.`,
      'PROFILE_STATUS_MISMATCH'
    );
  }
}

function validateProfile(profile) {
  validateListStatus(
    profile.allergies,
    profile.allergiesStatus,
    'Allergies'
  );

  validateListStatus(
    profile.chronicConditions,
    profile.chronicConditionsStatus,
    'Chronic conditions'
  );

  validateListStatus(
    profile.currentMedications,
    profile.medicationsStatus,
    'Medications'
  );
}

export class EmergencyProfileService {
  constructor({
    emergencyProfileRepository,
    userRepository,
    consentService,
    emergencyProfileAccessRequestRepository,
    signingKeyService,
    recordRegistryClient,
    auditService
  }) {
    this.auditService = auditService;
    this.signingKeyService = signingKeyService;
    this.recordRegistryClient = recordRegistryClient;
    this.emergencyProfileRepository = emergencyProfileRepository;
    this.userRepository = userRepository;
    this.consentService = consentService;
    this.emergencyProfileAccessRequestRepository =
      emergencyProfileAccessRequestRepository;
  }

  async requireActiveDoctor(doctorUserId) {
    const doctor = await this.userRepository.findById(doctorUserId);

    if (
      !doctor ||
      doctor.role !== 'doctor' ||
      doctor.status !== 'active'
    ) {
      throw new AppError(
        403,
        'An active doctor account is required.',
        'ACTIVE_DOCTOR_REQUIRED'
      );
    }
  }

  async requirePatient(patientUserId) {
    const patient = await this.userRepository.findById(patientUserId);

    if (!patient || patient.role !== 'patient') {
      throw new AppError(
        404,
        'Patient account not found.',
        'PATIENT_NOT_FOUND'
      );
    }
  }

  async assertConnection(patientUserId, doctorUserId) {
    if (
      !this.consentService ||
      typeof this.consentService.assertDoctorAccess !== 'function'
    ) {
      throw new AppError(
        403,
        'Patient-doctor connection verification is unavailable.',
        'CONSENT_REQUIRED'
      );
    }

    await this.consentService.assertDoctorAccess(
      patientUserId,
      doctorUserId
    );
  }

  async assertApproved({
    approvalRequestId,
    patientUserId,
    doctorUserId,
    operation
  }) {
    if (
      !approvalRequestId ||
      !this.emergencyProfileAccessRequestRepository ||
      typeof this.emergencyProfileAccessRequestRepository.isApproved !==
        'function'
    ) {
      throw new AppError(
        403,
        'Patient approval is required for this operation.',
        'PROFILE_APPROVAL_REQUIRED'
      );
    }

    const approved =
      await this.emergencyProfileAccessRequestRepository.isApproved({
        requestId: approvalRequestId,
        patientUserId,
        doctorUserId,
        operation
      });

    if (!approved) {
      throw new AppError(
        403,
        'A valid, unused patient approval is required.',
        'PROFILE_APPROVAL_REQUIRED'
      );
    }
  }

  // Signs one version of the full profile with the doctor's password-locked key.
  async signVersion(doctorUserId, patientUserId, version, profile, password) {
    const profileSha256 = basicProfileSha256(patientUserId, version, profile);
    const { signature, signerAddress } =
      await this.signingKeyService.signDigest(doctorUserId, password, profileSha256);
    return { version, profileSha256, doctorSignature: signature, signerAddress };
  }

  // Anchors the signed hash on-chain as version N of the patient's profile record.
  // A chain failure leaves the saved profile marked 'failed' rather than undoing it.
  async anchorOnChain(patientUserId, signature, doctorUserId) {
    await this.auditService?.record({
      eventType: signature.version === 1 ? 'basic_profile_created' : 'basic_profile_updated',
      actorUserId: doctorUserId,
      subjectUserId: patientUserId,
      resourceType: 'basic_profile',
      resourceId: patientUserId,
      metadata: { version: signature.version, profileSha256: signature.profileSha256 }
    });
    if (!this.recordRegistryClient) return;
    const recordId = basicProfileChainId(patientUserId);
    try {
      let registration;
      if (signature.version === 1) {
        const patient = await this.userRepository.findById(patientUserId);
        registration = await this.recordRegistryClient.registerRecord({
          recordId,
          contentSha256: signature.profileSha256,
          patientAddress: patient.blockchain_address
        });
      } else {
        registration = await this.recordRegistryClient.registerRecordVersion({
          recordId,
          expectedCurrentVersion: signature.version - 1,
          contentSha256: signature.profileSha256
        });
      }
      await this.emergencyProfileRepository.markBlockchain?.(patientUserId, signature.version, {
        status: 'registered',
        transactionHash: registration?.transactionHash ?? null
      });
    } catch (error) {
      console.error('Basic profile blockchain anchoring failed:', error.message);
      await this.emergencyProfileRepository.markBlockchain?.(patientUserId, signature.version, { status: 'failed' });
    }
  }

  // Recomputes the hash from the stored fields and checks the signature and the chain.
  async withIntegrity(profile) {
    if (!profile) return profile;
    const stored = profile.signature ?? {};
    const integrity = { hashValid: false, signatureValid: false, onChain: false, verified: false };

    if (stored.profileSha256) {
      integrity.hashValid =
        basicProfileSha256(profile.patientUserId, profile.version, profile) === stored.profileSha256;

      integrity.signatureValid =
        SigningKeyService.verifyDigest(stored.profileSha256, stored.doctorSignature, stored.signerAddress) &&
        Boolean(await this.signingKeyService?.isKeyOfUser(stored.signerAddress, stored.signedByDoctorId));

      try {
        integrity.onChain = Boolean(await this.recordRegistryClient?.verifyRecordVersion({
          recordId: basicProfileChainId(profile.patientUserId),
          version: profile.version,
          contentSha256: stored.profileSha256
        }));
      } catch {
        integrity.onChain = false;
      }
    }

    integrity.verified = integrity.hashValid && integrity.signatureValid && integrity.onChain;
    return { ...profile, integrity };
  }

  // Patients may access their own profile without doctor approval.
  async getOwnProfile(patientUserId) {
    await this.requirePatient(patientUserId);

    const profile =
      await this.emergencyProfileRepository.findByPatientId(
        patientUserId
      );

    if (!profile) {
      throw new AppError(
        404,
        'Basic profile not found.',
        'EMERGENCY_PROFILE_NOT_FOUND'
      );
    }

    return this.withIntegrity(profile);
  }

  // The repository consumes a one-time view approval transactionally.
  async getPatientProfile(
    doctorUserId,
    patientUserId,
    approvalRequestId
  ) {
    await this.requireActiveDoctor(doctorUserId);
    await this.requirePatient(patientUserId);
    await this.assertConnection(patientUserId, doctorUserId);

    if (
      !approvalRequestId ||
      typeof this.emergencyProfileRepository
        .findByPatientIdForDoctor !== 'function'
    ) {
      throw new AppError(
        403,
        'Patient approval is required to view this profile.',
        'PROFILE_APPROVAL_REQUIRED'
      );
    }

    return this.withIntegrity(
      await this.emergencyProfileRepository.findByPatientIdForDoctor({
        patientUserId,
        doctorUserId,
        approvalRequestId
      })
    );
  }

  async createInitialProfile(
    doctorUserId,
    patientUserId,
    profile,
    reason,
    approvalRequestId,
    password
  ) {
    // Validate the submitted clinical data before any protected read/write.
    validateProfile(profile);

    await this.requireActiveDoctor(doctorUserId);
    await this.requirePatient(patientUserId);
    await this.assertConnection(patientUserId, doctorUserId);

    await this.assertApproved({
      approvalRequestId,
      patientUserId,
      doctorUserId,
      operation: 'create'
    });

    const signature = await this.signVersion(doctorUserId, patientUserId, 1, profile, password);

    const created = await this.emergencyProfileRepository.create({
      patientUserId,
      doctorUserId,
      profile,
      reason,
      approvalRequestId,
      signature
    });

    await this.anchorOnChain(patientUserId, signature, doctorUserId);
    return this.withIntegrity(
      (await this.emergencyProfileRepository.findByPatientId(patientUserId)) ?? created
    );
  }

  async updateProfile(
    doctorUserId,
    patientUserId,
    changes,
    reason,
    approvalRequestId,
    password
  ) {
    // Reject empty or malformed input before checking access.
    if (
      !changes ||
      typeof changes !== 'object' ||
      Array.isArray(changes) ||
      Object.keys(changes).length === 0
    ) {
      throw new AppError(
        400,
        'Provide at least one field to update.',
        'EMPTY_PROFILE_UPDATE'
      );
    }

    await this.requireActiveDoctor(doctorUserId);
    await this.requirePatient(patientUserId);
    await this.assertConnection(patientUserId, doctorUserId);

    // Check approval before reading the existing clinical profile.
    // The repository must recheck and consume it in the write transaction.
    await this.assertApproved({
      approvalRequestId,
      patientUserId,
      doctorUserId,
      operation: 'update'
    });

    const current =
      await this.emergencyProfileRepository.findByPatientId(
        patientUserId
      );

    if (!current) {
      throw new AppError(
        404,
        'Create the basic profile first.',
        'EMERGENCY_PROFILE_NOT_FOUND'
      );
    }

    const merged = {
      allergies: changes.allergies ?? current.allergies,
      allergiesStatus:
        changes.allergiesStatus ?? current.allergiesStatus,

      chronicConditions:
        changes.chronicConditions ?? current.chronicConditions,
      chronicConditionsStatus:
        changes.chronicConditionsStatus ??
        current.chronicConditionsStatus,

      currentMedications:
        changes.currentMedications ?? current.currentMedications,
      medicationsStatus:
        changes.medicationsStatus ?? current.medicationsStatus
    };

    validateProfile(merged);

    const full = {
      bloodGroup: current.bloodGroup,
      gender: current.gender,
      dateOfBirth: current.dateOfBirth,
      emergencyContactName: current.emergencyContact?.name ?? null,
      emergencyContactPhone: current.emergencyContact?.phone ?? null,
      emergencyContactRelationship: current.emergencyContact?.relationship ?? null,
      ...merged
    };
    for (const key of ['bloodGroup', 'gender', 'dateOfBirth', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelationship']) {
      if (Object.hasOwn(changes, key)) full[key] = changes[key];
    }

    const signature = await this.signVersion(
      doctorUserId,
      patientUserId,
      (current.version ?? 1) + 1,
      full,
      password
    );

    const updated = await this.emergencyProfileRepository.update({
      patientUserId,
      doctorUserId,
      changes,
      reason,
      approvalRequestId,
      signature
    });

    await this.anchorOnChain(patientUserId, signature, doctorUserId);
    return this.withIntegrity(
      (await this.emergencyProfileRepository.findByPatientId(patientUserId)) ?? updated
    );
  }

  async getAuditHistory(
    doctorUserId,
    patientUserId,
    approvalRequestId
  ) {
    await this.requireActiveDoctor(doctorUserId);
    await this.requirePatient(patientUserId);
    await this.assertConnection(patientUserId, doctorUserId);

    if (
      !approvalRequestId ||
      typeof this.emergencyProfileRepository
        .listAuditForDoctor !== 'function'
    ) {
      throw new AppError(
        403,
        'Patient approval is required to view this audit history.',
        'PROFILE_APPROVAL_REQUIRED'
      );
    }

    // The repository consumes a separate one-time view approval.
    return this.emergencyProfileRepository.listAuditForDoctor({
      patientUserId,
      doctorUserId,
      approvalRequestId
    });
  }
}
