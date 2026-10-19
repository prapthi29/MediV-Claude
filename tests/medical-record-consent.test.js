import { describe, expect, it, vi } from 'vitest';
import { MedicalRecordService } from '../src/services/medical-record-service.js';
import { AppError } from '../src/utils/app-error.js';

const doctorId = 'doctor-1';
const patientId = 'patient-1';
const recordId = 'record-1';

function setup({ consentActive = true, approved = true } = {}) {
  const record = {
    id: recordId,
    patient_user_id: patientId,
    storage_key: 'encrypted-record-key',
    original_filename: 'report.pdf',
    content_type: 'application/pdf',
    title: 'Blood report',
    category: 'lab-result'
  };

  const medicalRecordRepository = {
    findByIdForPatient: vi.fn(async () => record)
  };

  const recordAccessRequestRepository = {
    create: vi.fn(async () => ({ id: 'request-1', status: 'pending' })),
    consumeApproved: vi.fn(async () => (approved ? { id: 'request-1' } : null))
  };

  const medicalStorage = {
    get: vi.fn(async () => ({ body: Buffer.from('ciphertext') }))
  };

  const fileEncryptionService = {
    decrypt: vi.fn(() => Buffer.from('decrypted report'))
  };

  const consentService = {
    assertDoctorAccess: vi.fn(async () => {
      if (!consentActive) {
        throw new AppError(
          403,
          'Valid patient consent is required to access these records.',
          'CONSENT_REQUIRED'
        );
      }
    })
  };

  const service = new MedicalRecordService({
    medicalRecordRepository,
    recordAccessRequestRepository,
    medicalStorage,
    fileEncryptionService,
    consentService
  });

  return {
    service,
    medicalRecordRepository,
    recordAccessRequestRepository,
    medicalStorage,
    fileEncryptionService,
    consentService
  };
}

describe('doctor medical-record consent enforcement', () => {
  it('blocks record-access requests when connection consent is inactive', async () => {
    const {
      service,
      recordAccessRequestRepository,
      consentService
    } = setup({ consentActive: false });

    await expect(
      service.requestRecordAccess(doctorId, patientId, recordId)
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });

    expect(consentService.assertDoctorAccess).toHaveBeenCalledWith(
      patientId,
      doctorId
    );
    expect(recordAccessRequestRepository.create).not.toHaveBeenCalled();
  });

  it('blocks views after connection consent is revoked, even if the record was approved', async () => {
    const {
      service,
      recordAccessRequestRepository,
      medicalStorage,
      fileEncryptionService,
      consentService
    } = setup({ consentActive: false, approved: true });

    await expect(
      service.viewRecordForDoctor(doctorId, patientId, recordId)
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });

    expect(consentService.assertDoctorAccess).toHaveBeenCalledWith(
      patientId,
      doctorId
    );
    expect(recordAccessRequestRepository.consumeApproved).not.toHaveBeenCalled();
    expect(medicalStorage.get).not.toHaveBeenCalled();
    expect(fileEncryptionService.decrypt).not.toHaveBeenCalled();
  });

  it('still requires individual record approval when connection consent is active', async () => {
    const {
      service,
      recordAccessRequestRepository,
      medicalStorage
    } = setup({ consentActive: true, approved: false });

    await expect(
      service.viewRecordForDoctor(doctorId, patientId, recordId)
    ).rejects.toMatchObject({ code: 'RECORD_ACCESS_NOT_APPROVED' });

    expect(recordAccessRequestRepository.consumeApproved).toHaveBeenCalledWith({
      recordId,
      patientUserId: patientId,
      doctorUserId: doctorId
    });
    expect(medicalStorage.get).not.toHaveBeenCalled();
  });
});
