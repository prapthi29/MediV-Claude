
import { describe, expect, it, vi } from 'vitest';
import { EmergencyProfileAccessRequestService } from '../src/services/emergency-profile-access-request-service.js';

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000';

function setup({ doctorStatus = 'active' } = {}) {
  const users = {
    findById: vi.fn(async (id) => {
      if (id === DOCTOR_ID) {
        return { id, role: 'doctor', status: doctorStatus };
      }

      if (id === PATIENT_ID) {
        return { id, role: 'patient', status: 'active' };
      }

      return null;
    })
  };

  const request = {
    id: REQUEST_ID,
    patient_user_id: PATIENT_ID,
    doctor_user_id: DOCTOR_ID,
    operation: 'view',
    status: 'pending'
  };

  const requestRepository = {
    create: vi.fn(async (input) => ({
      ...request,
      patient_user_id: input.patientUserId,
      doctor_user_id: input.doctorUserId,
      operation: input.operation
    })),

    listForPatient: vi.fn(async () => [request]),

    listForDoctor: vi.fn(async () => [request]),

    decide: vi.fn(async ({ requestId, patientUserId, status }) => ({
      ...request,
      id: requestId,
      patient_user_id: patientUserId,
      status
    }))
  };

  const consentService = {
    assertDoctorAccess: vi.fn(async () => true)
  };

  const auditService = {
    record: vi.fn(async () => undefined)
  };

  const service = new EmergencyProfileAccessRequestService({
    requestRepository,
    userRepository: users,
    consentService,
    auditService
  });

  return {
    service,
    users,
    requestRepository,
    consentService,
    auditService
  };
}

describe('emergency profile access-request service', () => {
  it.each(['view', 'create', 'update'])(
    'creates a %s permission request for an active doctor',
    async (operation) => {
      const { service, requestRepository, consentService } = setup();

      const result = await service.requestPermission(
        DOCTOR_ID,
        PATIENT_ID,
        operation
      );

      expect(result.operation).toBe(operation);
      expect(requestRepository.create).toHaveBeenCalledWith({
        patientUserId: PATIENT_ID,
        doctorUserId: DOCTOR_ID,
        operation
      });
      expect(consentService.assertDoctorAccess).toHaveBeenCalledWith(
        PATIENT_ID,
        DOCTOR_ID
      );
    }
  );

  it('rejects a pending doctor before creating a request', async () => {
    const { service, requestRepository } = setup({
      doctorStatus: 'pending'
    });

    await expect(
      service.requestPermission(DOCTOR_ID, PATIENT_ID, 'view')
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'ACTIVE_DOCTOR_REQUIRED'
    });

    expect(requestRepository.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown doctor', async () => {
    const { service, requestRepository } = setup();

    await expect(
      service.requestPermission('unknown-doctor', PATIENT_ID, 'view')
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'ACTIVE_DOCTOR_REQUIRED'
    });

    expect(requestRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent patient', async () => {
    const { service, requestRepository } = setup();

    await expect(
      service.requestPermission(DOCTOR_ID, 'unknown-patient', 'view')
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'PATIENT_NOT_FOUND'
    });

    expect(requestRepository.create).not.toHaveBeenCalled();
  });

  it('rejects an unsupported operation', async () => {
    const { service, requestRepository } = setup();

    await expect(
      service.requestPermission(DOCTOR_ID, PATIENT_ID, 'delete')
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_PROFILE_OPERATION'
    });

    expect(requestRepository.create).not.toHaveBeenCalled();
  });

  it('does not create a request when the patient-doctor connection is missing', async () => {
    const { service, requestRepository, consentService } = setup();

    consentService.assertDoctorAccess.mockRejectedValueOnce(
      Object.assign(new Error('Connection consent required'), {
        statusCode: 403,
        code: 'CONSENT_REQUIRED'
      })
    );

    await expect(
      service.requestPermission(DOCTOR_ID, PATIENT_ID, 'view')
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'CONSENT_REQUIRED'
    });

    expect(requestRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a repository result indicating no active connection', async () => {
    const { service, requestRepository } = setup();
    requestRepository.create.mockResolvedValueOnce(null);

    await expect(
      service.requestPermission(DOCTOR_ID, PATIENT_ID, 'view')
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'CONSENT_REQUIRED'
    });
  });

  it('records an audit event when a permission is requested', async () => {
    const { service, auditService } = setup();

    await service.requestPermission(DOCTOR_ID, PATIENT_ID, 'view');

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'emergency_profile_permission_requested',
        actorUserId: DOCTOR_ID,
        subjectUserId: PATIENT_ID,
        resourceType: 'emergency_profile_access_request',
        resourceId: REQUEST_ID,
        metadata: { operation: 'view' }
      })
    );
  });

  it('allows the patient to approve their own pending request', async () => {
    const { service, requestRepository, auditService } = setup();

    const result = await service.decide(
      PATIENT_ID,
      REQUEST_ID,
      'approved'
    );

    expect(result.status).toBe('approved');
    expect(requestRepository.decide).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      patientUserId: PATIENT_ID,
      status: 'approved'
    });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'emergency_profile_permission_approved',
        actorUserId: PATIENT_ID,
        subjectUserId: DOCTOR_ID
      })
    );
  });

  it('allows the patient to reject their own pending request', async () => {
    const { service, auditService } = setup();

    const result = await service.decide(
      PATIENT_ID,
      REQUEST_ID,
      'rejected'
    );

    expect(result.status).toBe('rejected');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'emergency_profile_permission_rejected',
        actorUserId: PATIENT_ID,
        subjectUserId: DOCTOR_ID
      })
    );
  });

  it('rejects unsupported decisions', async () => {
    const { service, requestRepository } = setup();

    await expect(
      service.decide(PATIENT_ID, REQUEST_ID, 'pending')
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_PERMISSION_DECISION'
    });

    expect(requestRepository.decide).not.toHaveBeenCalled();
  });

  it('returns not found when the patient cannot decide the request', async () => {
    const { service, requestRepository, auditService } = setup();
    requestRepository.decide.mockResolvedValueOnce(null);

    await expect(
      service.decide(PATIENT_ID, REQUEST_ID, 'approved')
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'PERMISSION_REQUEST_NOT_FOUND'
    });

    expect(auditService.record).not.toHaveBeenCalled();
  });
});
