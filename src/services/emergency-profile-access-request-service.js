import { AppError } from '../utils/app-error.js';

const OPERATIONS = ['view', 'create', 'update'];
const DECISIONS = ['approved', 'rejected'];

export class EmergencyProfileAccessRequestService {
  constructor({
    requestRepository,
    userRepository,
    consentService,
    auditService
  }) {
    this.requestRepository = requestRepository;
    this.userRepository = userRepository;
    this.consentService = consentService;
    this.auditService = auditService;
  }

  async requireActiveDoctor(doctorUserId) {
    const doctor = await this.userRepository.findById(doctorUserId);

    if (!doctor || doctor.role !== 'doctor' || doctor.status !== 'active') {
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
      throw new AppError(404, 'Patient account not found.', 'PATIENT_NOT_FOUND');
    }
  }

  async requestPermission(doctorUserId, patientUserId, operation) {
    if (!OPERATIONS.includes(operation)) {
      throw new AppError(
        400,
        'Operation must be view, create, or update.',
        'INVALID_PROFILE_OPERATION'
      );
    }

    await this.requireActiveDoctor(doctorUserId);
    await this.requirePatient(patientUserId);

    // Connection consent is necessary, but does not itself grant
    // emergency-profile permission.
    await this.consentService.assertDoctorAccess(
      patientUserId,
      doctorUserId
    );

    const request = await this.requestRepository.create({
      patientUserId,
      doctorUserId,
      operation
    });

    if (!request) {
      throw new AppError(
        403,
        'An active patient-doctor connection is required.',
        'CONSENT_REQUIRED'
      );
    }

    await this.auditService?.record({
      eventType: 'emergency_profile_permission_requested',
      actorUserId: doctorUserId,
      subjectUserId: patientUserId,
      resourceType: 'emergency_profile_access_request',
      resourceId: request.id,
      metadata: { operation }
    });

    return request;
  }

  async listForPatient(patientUserId) {
    return this.requestRepository.listForPatient(patientUserId);
  }

  async listForDoctor(doctorUserId, patientUserId) {
    await this.requireActiveDoctor(doctorUserId);
    await this.requirePatient(patientUserId);

    await this.consentService.assertDoctorAccess(
      patientUserId,
      doctorUserId
    );

    return this.requestRepository.listForDoctor({
      patientUserId,
      doctorUserId
    });
  }

  async decide(patientUserId, requestId, status) {
    if (!DECISIONS.includes(status)) {
      throw new AppError(
        400,
        'Decision must be approved or rejected.',
        'INVALID_PERMISSION_DECISION'
      );
    }

    const request = await this.requestRepository.decide({
      requestId,
      patientUserId,
      status
    });

    if (!request) {
      throw new AppError(
        404,
        'Pending permission request not found.',
        'PERMISSION_REQUEST_NOT_FOUND'
      );
    }

    await this.auditService?.record({
      eventType: status === 'approved'
        ? 'emergency_profile_permission_approved'
        : 'emergency_profile_permission_rejected',
      actorUserId: patientUserId,
      subjectUserId: request.doctor_user_id,
      resourceType: 'emergency_profile_access_request',
      resourceId: request.id,
      metadata: { operation: request.operation, status }
    });

    return request;
  }
}
