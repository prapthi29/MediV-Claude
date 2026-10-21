
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { EmergencyProfileService } from '../src/services/emergency-profile-service.js';
import { AuthService } from '../src/services/auth-service.js';

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters';
const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
const APPROVAL_ID = '550e8400-e29b-41d4-a716-446655440000';

function token(role, id) {
  return jwt.sign(
    { role, email: `${id}@example.com` },
    SECRET,
    { subject: id, expiresIn: '1h' }
  );
}

function setup({ doctorStatus = 'active' } = {}) {
  const users = {
    findById: vi.fn(async (id) => {
      if (id === PATIENT_ID) {
        return { id, role: 'patient', status: 'active' };
      }

      if (id === DOCTOR_ID) {
        return { id, role: 'doctor', status: doctorStatus };
      }

      return null;
    })
  };

  const profile = {
    patientUserId: PATIENT_ID,
    medicalRecordStatus: 'active',
    bloodGroup: 'O+',
    emergencyContact: { name: 'Ravi', phone: '9999999999' },
    allergies: [],
    allergiesStatus: 'none_known',
    chronicConditions: [],
    chronicConditionsStatus: 'unknown',
    currentMedications: [],
    medicationsStatus: 'unknown'
  };

  const repository = {
    findByPatientId: vi.fn(async (id) => {
      if (id !== PATIENT_ID) return null;
      return profile;
    }),

    findByPatientIdForDoctor: vi.fn(async () => profile),

    create: vi.fn(async (input) => ({
      patientUserId: input.patientUserId,
      ...input.profile,
      medicalRecordStatus: 'active'
    })),

    update: vi.fn(async () => ({})),
    listAudit: vi.fn(async () => []),
    listAuditForDoctor: vi.fn(async () => [])
  };

  const consentService = {
    assertDoctorAccess: vi.fn(async () => true)
  };

  const emergencyProfileAccessRequestRepository = {
    isApproved: vi.fn(async () => true)
  };

  const service = new EmergencyProfileService({
    emergencyProfileRepository: repository,
    userRepository: users,
    consentService,
    emergencyProfileAccessRequestRepository
  });

  const realAuthService = new AuthService({
    userRepository: users,
    jwtSecret: SECRET,
    jwtExpiresIn: '1h'
  });

  const app = createApp({
    authService: realAuthService,
    emergencyProfileService: service
  });

  return {
    app,
    repository,
    users,
    consentService,
    emergencyProfileAccessRequestRepository
  };
}

describe('emergency profile API authorization', () => {
  it('allows a patient to read their own emergency profile', async () => {
    const { app } = setup();

    const response = await request(app)
      .get('/api/v1/patients/me/emergency-profile')
      .set('Authorization', `Bearer ${token('patient', PATIENT_ID)}`)
      .expect(200);

    expect(response.body.profile).toMatchObject({
      patientUserId: PATIENT_ID,
      allergiesStatus: 'none_known'
    });
  });

  it('blocks patients from doctor-only create, update, and audit routes', async () => {
    const { app, repository } = setup();
    const auth = `Bearer ${token('patient', PATIENT_ID)}`;
    const base =
      `/api/v1/doctor/patients/${PATIENT_ID}/emergency-profile`;

    await request(app)
      .post(base)
      .set('Authorization', auth)
      .send({})
      .expect(403);

    await request(app)
      .patch(base)
      .set('Authorization', auth)
      .send({
        reason: 'Attempted change',
        bloodGroup: 'A+',
        approvalRequestId: APPROVAL_ID
      })
      .expect(403);

    await request(app)
      .get(`${base}/audit`)
      .set('Authorization', auth)
      .expect(403);

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.listAuditForDoctor).not.toHaveBeenCalled();
  });

  it('blocks a doctor from reading patient-only self-service endpoints', async () => {
    const { app } = setup();

    await request(app)
      .get('/api/v1/patients/me/emergency-profile')
      .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
      .expect(403);
  });

  it('requires authentication for emergency-profile endpoints', async () => {
    const { app } = setup();

    await request(app)
      .get('/api/v1/patients/me/emergency-profile')
      .expect(401);
  });

  it('rejects a pending doctor even if the JWT contains the doctor role', async () => {
    const { app, repository } = setup({ doctorStatus: 'pending' });

    await request(app)
      .post(`/api/v1/doctor/patients/${PATIENT_ID}/emergency-profile`)
      .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
      .send({
        bloodGroup: 'O+',
        gender: 'female',
        dateOfBirth: '1990-04-12',
        emergencyContactName: 'Ravi Patel',
        emergencyContactPhone: '+91 9999999999',
        allergies: [],
        allergiesStatus: 'unknown',
        chronicConditions: [],
        chronicConditionsStatus: 'unknown',
        currentMedications: [],
        medicationsStatus: 'unknown',
        reason: 'Initial assessment',
        approvalRequestId: APPROVAL_ID,
        password: 'Strong#Pass123'
      })
      .expect(403);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('requires a view approval ID for doctor profile reads', async () => {
    const { app } = setup();

    await request(app)
      .get(`/api/v1/doctor/patients/${PATIENT_ID}/emergency-profile`)
      .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
      .expect(400);
  });

  it('requires a valid approval ID for audit history', async () => {
    const { app } = setup();

    await request(app)
      .get(
        `/api/v1/doctor/patients/${PATIENT_ID}/emergency-profile/audit`
      )
      .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
      .expect(400);
  });
});
