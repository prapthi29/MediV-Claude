
import { AppError } from '../utils/app-error.js';

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
    emergencyProfileAccessRequestRepository
  }) {
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
        'Emergency medical profile not found.',
        'EMERGENCY_PROFILE_NOT_FOUND'
      );
    }

    return profile;
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

    return this.emergencyProfileRepository.findByPatientIdForDoctor({
      patientUserId,
      doctorUserId,
      approvalRequestId
    });
  }

  async createInitialProfile(
    doctorUserId,
    patientUserId,
    profile,
    reason,
    approvalRequestId
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

    return this.emergencyProfileRepository.create({
      patientUserId,
      doctorUserId,
      profile,
      reason,
      approvalRequestId
    });
  }

  async updateProfile(
    doctorUserId,
    patientUserId,
    changes,
    reason,
    approvalRequestId
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
        'Create the initial emergency profile first.',
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

    return this.emergencyProfileRepository.update({
      patientUserId,
      doctorUserId,
      changes,
      reason,
      approvalRequestId
    });
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
