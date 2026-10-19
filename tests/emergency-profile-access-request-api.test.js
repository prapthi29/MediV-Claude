
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth-service.js';

const SECRET = 'test-secret-that-is-at-least-thirty-two-characters';
const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000';

function token(role, id) {
  return jwt.sign(
    { role, email: `${id}@example.com` },
    SECRET,
    { subject: id, expiresIn: '1h' }
  );
}

function setup() {
  const users = {
    findById: vi.fn(async (id) => {
      if (id === PATIENT_ID) {
        return { id, role: 'patient', status: 'active' };
      }

      if (id === DOCTOR_ID) {
        return { id, role: 'doctor', status: 'active' };
      }

      return null;
    })
  };

  const requestRecord = {
    id: REQUEST_ID,
    patient_user_id: PATIENT_ID,
    doctor_user_id: DOCTOR_ID,
    operation: 'view',
    status: 'pending'
  };

  const accessRequestService = {
    requestPermission: vi.fn(async (doctorId, patientId, operation) => ({
      ...requestRecord,
      doctor_user_id: doctorId,
      patient_user_id: patientId,
      operation
    })),

    listForPatient: vi.fn(async () => [requestRecord]),

    listForDoctor: vi.fn(async () => [requestRecord]),

    decide: vi.fn(async (patientId, requestId, status) => ({
      ...requestRecord,
      patient_user_id: patientId,
      id: requestId,
      status
    }))
  };

  const authService = new AuthService({
    userRepository: users,
    jwtSecret: SECRET,
    jwtExpiresIn: '1h'
  });

  const app = createApp({
    authService,
    emergencyProfileAccessRequestService: accessRequestService
  });

  return { app, accessRequestService };
}

describe('emergency profile access-request API', () => {
  it('allows an authenticated doctor to request view permission', async () => {
    const { app, accessRequestService } = setup();

    const response = await request(app)
      .post(
        `/api/v1/doctor/patients/${PATIENT_ID}/emergency-profile-access-requests`
      )
      .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
      .send({ operation: 'view' })
      .expect(201);

    expect(response.body.request.operation).toBe('view');
    expect(accessRequestService.requestPermission).toHaveBeenCalledWith(
      DOCTOR_ID,
      PATIENT_ID,
      'view'
    );
  });

  it.each(['create', 'update'])(
    'accepts a doctor request for %s permission',
    async (operation) => {
      const { app, accessRequestService } = setup();

      await request(app)
        .post(
          `/api/v1/doctor/patients/${PATIENT_ID}/emergency-profile-access-requests`
        )
        .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
        .send({ operation })
        .expect(201);

      expect(
        accessRequestService.requestPermission
      ).toHaveBeenCalledWith(DOCTOR_ID, PATIENT_ID, operation);
    }
  );

  it('rejects an unsupported operation', async () => {
    const { app, accessRequestService } = setup();

    await request(app)
      .post(
        `/api/v1/doctor/patients/${PATIENT_ID}/emergency-profile-access-requests`
      )
      .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
      .send({ operation: 'delete' })
      .expect(400);

    expect(accessRequestService.requestPermission).not.toHaveBeenCalled();
  });

  it('allows a patient to list their own access requests', async () => {
    const { app, accessRequestService } = setup();

    const response = await request(app)
      .get('/api/v1/patients/me/emergency-profile-access-requests')
      .set('Authorization', `Bearer ${token('patient', PATIENT_ID)}`)
      .expect(200);

    expect(response.body.requests).toHaveLength(1);
    expect(accessRequestService.listForPatient).toHaveBeenCalledWith(
      PATIENT_ID
    );
  });

  it('allows a doctor to list requests for a connected patient', async () => {
    const { app, accessRequestService } = setup();

    const response = await request(app)
      .get(
        `/api/v1/doctor/patients/${PATIENT_ID}/emergency-profile-access-requests`
      )
      .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
      .expect(200);

    expect(response.body.requests).toHaveLength(1);
    expect(accessRequestService.listForDoctor).toHaveBeenCalledWith(
      DOCTOR_ID,
      PATIENT_ID
    );
  });

  it.each(['approved', 'rejected'])(
    'allows a patient to submit the %s decision',
    async (status) => {
      const { app, accessRequestService } = setup();

      const response = await request(app)
        .post(
          `/api/v1/patients/me/emergency-profile-access-requests/${REQUEST_ID}/decision`
        )
        .set('Authorization', `Bearer ${token('patient', PATIENT_ID)}`)
        .send({ status })
        .expect(200);

      expect(response.body.request.status).toBe(status);
      expect(accessRequestService.decide).toHaveBeenCalledWith(
        PATIENT_ID,
        REQUEST_ID,
        status
      );
    }
  );

  it('rejects an unsupported patient decision', async () => {
    const { app, accessRequestService } = setup();

    await request(app)
      .post(
        `/api/v1/patients/me/emergency-profile-access-requests/${REQUEST_ID}/decision`
      )
      .set('Authorization', `Bearer ${token('patient', PATIENT_ID)}`)
      .send({ status: 'pending' })
      .expect(400);

    expect(accessRequestService.decide).not.toHaveBeenCalled();
  });

  it('rejects an invalid patient ID', async () => {
    const { app, accessRequestService } = setup();

    await request(app)
      .post(
        '/api/v1/doctor/patients/not-a-uuid/emergency-profile-access-requests'
      )
      .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
      .send({ operation: 'view' })
      .expect(400);

    expect(accessRequestService.requestPermission).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const { app, accessRequestService } = setup();

    await request(app)
      .get('/api/v1/patients/me/emergency-profile-access-requests')
      .expect(401);

    expect(accessRequestService.listForPatient).not.toHaveBeenCalled();
  });

  it('blocks patients from doctor access-request endpoints', async () => {
    const { app, accessRequestService } = setup();

    await request(app)
      .post(
        `/api/v1/doctor/patients/${PATIENT_ID}/emergency-profile-access-requests`
      )
      .set('Authorization', `Bearer ${token('patient', PATIENT_ID)}`)
      .send({ operation: 'view' })
      .expect(403);

    expect(accessRequestService.requestPermission).not.toHaveBeenCalled();
  });

  it('blocks doctors from patient decision endpoints', async () => {
    const { app, accessRequestService } = setup();

    await request(app)
      .post(
        `/api/v1/patients/me/emergency-profile-access-requests/${REQUEST_ID}/decision`
      )
      .set('Authorization', `Bearer ${token('doctor', DOCTOR_ID)}`)
      .send({ status: 'approved' })
      .expect(403);

    expect(accessRequestService.decide).not.toHaveBeenCalled();
  });
});
