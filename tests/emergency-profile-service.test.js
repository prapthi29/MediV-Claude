
import { describe, expect, it, vi } from 'vitest';
import { EmergencyProfileService } from '../src/services/emergency-profile-service.js';

const doctorId = 'doctor-1';
const patientId = 'patient-1';
const approvalRequestId = 'approval-1';

function makeProfile(overrides = {}) {
  return {
    bloodGroup: 'O+',
    emergencyContactName: 'Ravi Patel',
    emergencyContactPhone: '+919999999999',
    emergencyContactRelationship: 'Spouse',
    allergies: [],
    allergiesStatus: 'unknown',
    chronicConditions: [],
    chronicConditionsStatus: 'unknown',
    currentMedications: [],
    medicationsStatus: 'unknown',
    ...overrides
  };
}

function setup({ doctorStatus = 'active', existingProfile = null } = {}) {
  const repository = {
    findByPatientId: vi.fn(async () => existingProfile),

    findByPatientIdForDoctor: vi.fn(async () => existingProfile),

    create: vi.fn(async (input) => ({
      patientUserId: input.patientUserId,
      ...input.profile,
      medicalRecordStatus: 'active'
    })),

    update: vi.fn(async ({ changes }) => ({
      patientUserId: patientId,
      ...existingProfile,
      ...changes
    })),

    listAudit: vi.fn(async () => []),
    listAuditForDoctor: vi.fn(async () => [])
  };

  const users = {
    findById: vi.fn(async (id) => {
      if (id === doctorId) {
        return { id, role: 'doctor', status: doctorStatus };
      }

      if (id === patientId) {
        return { id, role: 'patient', status: 'active' };
      }

      return null;
    })
  };

  const consentService = {
    assertDoctorAccess: vi.fn(async () => true)
  };

  const emergencyProfileAccessRequestRepository = {
    isApproved: vi.fn(async ({ requestId, operation }) => {
      return (
        requestId === approvalRequestId &&
        ['view', 'create', 'update'].includes(operation)
      );
    })
  };

  return {
    repository,
    users,
    consentService,
    emergencyProfileAccessRequestRepository,

    service: new EmergencyProfileService({
      emergencyProfileRepository: repository,
      userRepository: users,
      consentService,
      emergencyProfileAccessRequestRepository,
      signingKeyService: {
        signDigest: vi.fn(async () => ({ signature: '0xsignature', signerAddress: '0xsigner' })),
        isKeyOfUser: vi.fn(async () => true)
      }
    })
  };
}

describe('emergency medical profile service', () => {
  it('creates an initial profile through the repository with a reason', async () => {
    const { service, repository } = setup();
    const profile = makeProfile();

    await service.createInitialProfile(
      doctorId,
      patientId,
      profile,
      'Initial clinical assessment',
      approvalRequestId
    );

    expect(repository.create).toHaveBeenCalledWith({
      patientUserId: patientId,
      doctorUserId: doctorId,
      profile,
      reason: 'Initial clinical assessment',
      approvalRequestId,
      signature: expect.objectContaining({
        version: 1,
        profileSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        doctorSignature: '0xsignature',
        signerAddress: '0xsigner'
      })
    });
  });

  it('rejects a doctor whose account is still pending', async () => {
    const { service, repository } = setup({ doctorStatus: 'pending' });

    await expect(
      service.createInitialProfile(
        doctorId,
        patientId,
        makeProfile(),
        'Initial assessment',
        approvalRequestId
      )
    ).rejects.toMatchObject({
      code: 'ACTIVE_DOCTOR_REQUIRED'
    });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a provided allergy status when the list is empty', async () => {
    const { service, repository } = setup();

    await expect(
      service.createInitialProfile(
        doctorId,
        patientId,
        makeProfile({
          allergies: [],
          allergiesStatus: 'provided'
        }),
        'Initial assessment',
        approvalRequestId
      )
    ).rejects.toMatchObject({
      code: 'PROFILE_STATUS_MISMATCH'
    });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('accepts none_known when the corresponding list is empty', async () => {
    const { service, repository } = setup();

    const profile = makeProfile({
      allergies: [],
      allergiesStatus: 'none_known'
    });

    await service.createInitialProfile(
      doctorId,
      patientId,
      profile,
      'Allergies reviewed with patient',
      approvalRequestId
    );

    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('rejects none_known when allergy entries exist', async () => {
    const { service, repository } = setup();

    await expect(
      service.createInitialProfile(
        doctorId,
        patientId,
        makeProfile({
          allergies: [
            {
              substance: 'Penicillin',
              reaction: 'Rash',
              severity: 'moderate'
            }
          ],
          allergiesStatus: 'none_known'
        }),
        'Assessment',
        approvalRequestId
      )
    ).rejects.toMatchObject({
      code: 'PROFILE_STATUS_MISMATCH'
    });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('validates the complete profile when medication dosage changes', async () => {
    const existingProfile = {
      allergies: [],
      allergiesStatus: 'none_known',
      chronicConditions: [
        { name: 'Diabetes', notes: null }
      ],
      chronicConditionsStatus: 'provided',
      currentMedications: [
        {
          name: 'Metformin',
          dosage: '500 mg',
          frequency: 'Twice daily'
        }
      ],
      medicationsStatus: 'provided'
    };

    const { service, repository } = setup({ existingProfile });

    const updatedMedications = [
      {
        name: 'Metformin',
        dosage: '250 mg',
        frequency: 'Twice daily'
      }
    ];

    await service.updateProfile(
      doctorId,
      patientId,
      { currentMedications: updatedMedications },
      'Dosage revised after clinical review',
      approvalRequestId
    );

    expect(repository.update).toHaveBeenCalledWith({
      patientUserId: patientId,
      doctorUserId: doctorId,
      changes: { currentMedications: updatedMedications },
      reason: 'Dosage revised after clinical review',
      approvalRequestId,
      signature: expect.objectContaining({ version: 2, doctorSignature: '0xsignature' })
    });
  });

  it('rejects a partial update that makes the resulting profile inconsistent', async () => {
    const existingProfile = {
      allergies: [
        {
          substance: 'Penicillin',
          reaction: 'Rash',
          severity: 'moderate'
        }
      ],
      allergiesStatus: 'provided',
      chronicConditions: [],
      chronicConditionsStatus: 'unknown',
      currentMedications: [],
      medicationsStatus: 'unknown'
    };

    const { service, repository } = setup({ existingProfile });

    await expect(
      service.updateProfile(
        doctorId,
        patientId,
        { allergiesStatus: 'none_known' },
        'Correct allergy status',
        approvalRequestId
      )
    ).rejects.toMatchObject({
      code: 'PROFILE_STATUS_MISMATCH'
    });

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects an update containing no clinical changes', async () => {
    const { service, repository } = setup();

    await expect(
      service.updateProfile(
        doctorId,
        patientId,
        {},
        'No actual change',
        approvalRequestId
      )
    ).rejects.toMatchObject({
      code: 'EMPTY_PROFILE_UPDATE'
    });

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects creation when the patient approval is missing', async () => {
    const { service, repository } = setup();

    await expect(
      service.createInitialProfile(
        doctorId,
        patientId,
        makeProfile(),
        'Initial assessment'
      )
    ).rejects.toMatchObject({
      code: 'PROFILE_APPROVAL_REQUIRED'
    });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects creation when the approval is for the wrong operation', async () => {
    const { service, repository, emergencyProfileAccessRequestRepository } =
      setup();

    emergencyProfileAccessRequestRepository.isApproved.mockResolvedValueOnce(
      false
    );

    await expect(
      service.createInitialProfile(
        doctorId,
        patientId,
        makeProfile(),
        'Initial assessment',
        approvalRequestId
      )
    ).rejects.toMatchObject({
      code: 'PROFILE_APPROVAL_REQUIRED'
    });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('checks patient-doctor consent before creating a profile', async () => {
    const { service, repository, consentService } = setup();

    consentService.assertDoctorAccess.mockRejectedValueOnce(
      Object.assign(new Error('Consent required'), {
        code: 'CONSENT_REQUIRED',
        statusCode: 403
      })
    );

    await expect(
      service.createInitialProfile(
        doctorId,
        patientId,
        makeProfile(),
        'Initial assessment',
        approvalRequestId
      )
    ).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED'
    });

    expect(repository.create).not.toHaveBeenCalled();
  });
});
