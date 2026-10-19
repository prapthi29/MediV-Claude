
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth-service.js';
import { MedicalRecordService } from '../src/services/medical-record-service.js';
import { FileEncryptionService } from '../src/encryption/file-encryption-service.js';

const JWT_SECRET =
  'test-secret-that-is-at-least-thirty-two-characters';

const PATIENT_ID =
  '10000000-0000-4000-8000-000000000001';

const APPROVAL_ID =
  '20000000-0000-4000-8000-000000000002';

class MemoryUsers {
  constructor() {
    this.users = [];
  }

  async findByEmail(email) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findById(id) {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async create({
    name,
    email,
    passwordHash,
    role,
    status = 'active',
    licenseId = null,
    blockchainAddress = null
  }) {
    const user = {
      id: String(this.users.length + 1),
      name,
      email,
      password_hash: passwordHash,
      role,
      status,
      license_id: licenseId,
      blockchain_address: blockchainAddress,
      created_at: new Date().toISOString()
    };

    this.users.push(user);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      license_id: user.license_id,
      blockchain_address: user.blockchain_address,
      created_at: user.created_at
    };
  }
}

class MemoryRecords {
  constructor() {
    this.records = [];
  }

  async create(input) {
    const record = {
      id: `d0aa0000-0000-4000-8000-${String(
        this.records.length + 1
      ).padStart(12, '0')}`,
      patient_user_id: input.patientUserId,
      uploaded_by_user_id: input.uploadedByUserId,
      storage_key: input.storageKey,
      original_filename: input.originalFilename,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      title: input.title,
      category: input.category,
      content_sha256: input.contentSha256,
      encryption_algorithm: input.encryption.encryptionAlgorithm,
      encrypted_data_key: input.encryption.encryptedDataKey,
      data_key_iv: input.encryption.dataKeyIv,
      data_key_auth_tag: input.encryption.dataKeyAuthTag,
      file_iv: input.encryption.fileIv,
      file_auth_tag: input.encryption.fileAuthTag,
      doctor_signature: input.signature?.doctorSignature ?? null,
      signer_address: input.signature?.signerAddress ?? null,
      created_at: new Date().toISOString()
    };

    this.records.push(record);
    return record;
  }

  async findByIdForPatient(id, patientId) {
    return (
      this.records.find(
        (record) =>
          record.id === id &&
          record.patient_user_id === patientId
      ) ?? null
    );
  }

  async listForPatient(patientId) {
    return this.records.filter(
      (record) => record.patient_user_id === patientId
    );
  }
}

const signingKeyService = {
  signDigest: async () => ({ signature: '0xsig', signerAddress: '0x00000000000000000000000000000000000000d0' }),
  isKeyOfUser: async () => true
};

class MemoryStorage {
  constructor() {
    this.objects = new Map();
  }

  async put({ key, body }) {
    this.objects.set(key, Buffer.from(body));
  }

  async get({ key }) {
    const body = this.objects.get(key);
    return body ? { body } : null;
  }

  async delete({ key }) {
    this.objects.delete(key);
  }
}

function api({
  recordCreationApprovalRepository = {
    consume: async ({ approvalId, patientUserId, doctorUserId }) => ({
      id: approvalId,
      patient_user_id: patientUserId,
      doctor_user_id: doctorUserId,
      status: 'consumed'
    }),

    revoke: async ({ approvalId, patientUserId }) => ({
      id: approvalId,
      patient_user_id: patientUserId,
      doctor_user_id: 'doctor-1',
      status: 'revoked'
    })
  },
  consentService = {
    assertDoctorAccess: async () => true
  }
} = {}) {
  const authService = new AuthService({
    userRepository: new MemoryUsers(),
    jwtSecret: JWT_SECRET,
    jwtExpiresIn: '1h'
  });

  const medicalRecordService = new MedicalRecordService({
    medicalRecordRepository: new MemoryRecords(),
    userRepository: { findById: async (id) => ({ id, role: 'patient', medical_record_status: 'active' }) },
    recordCreationApprovalRepository,
    medicalStorage: new MemoryStorage(),
    fileEncryptionService: new FileEncryptionService({
      masterKey: Buffer.alloc(32, 7)
    }),
    consentService,
    signingKeyService
  });

  return createApp({
    authService,
    medicalRecordService,
    consentService
  });
}

async function register(app, role, email) {
  const input = {
    name: role === 'doctor' ? 'Test Doctor' : 'Test Patient',
    email,
    password: 'Correct-Horse-Battery9!',
    role
  };

  if (role === 'doctor') {
    input.licenseId = `TEST-${email}`;
  }

  return request(app)
    .post('/api/v1/auth/register')
    .send(input)
    .expect(201);
}

function tokenFor(role) {
  return jwt.sign(
    {
      role,
      email: `${role}@example.com`
    },
    JWT_SECRET,
    {
      subject: `${role}-1`,
      expiresIn: '1h'
    }
  );
}

describe('medical record API', () => {
  it('does not expose a patient medical-record upload endpoint', async () => {
    const app = api();

    const patient = await register(
      app,
      'patient',
      'patient@example.com'
    );

    await request(app)
      .post('/api/v1/patients/me/records')
      .set('Authorization', `Bearer ${patient.body.token}`)
      .field('title', 'Blood report')
      .attach('document', Buffer.from('test document'), {
        filename: 'report.pdf',
        contentType: 'application/pdf'
      })
      .expect(404);
  });

  it('rejects upload by a non-patient or unsupported document type', async () => {
    const app = api();

    await request(app)
      .post('/api/v1/patients/me/records')
      .set('Authorization', `Bearer ${tokenFor('doctor')}`)
      .attach('document', Buffer.from('content'), {
        filename: 'note.pdf',
        contentType: 'application/pdf'
      })
      .expect(403);

    const patient = await register(
      app,
      'patient',
      'patient-upload-test@example.com'
    );

    await request(app)
      .post('/api/v1/patients/me/records')
      .set('Authorization', `Bearer ${patient.body.token}`)
      .attach('document', Buffer.from('content'), {
        filename: 'note.exe',
        contentType: 'application/octet-stream'
      })
      .expect(404);
  });

  it('lets a doctor upload a record for a consented patient with an approval', async () => {
    const authService = new AuthService({
      userRepository: new MemoryUsers(),
      jwtSecret: JWT_SECRET,
      jwtExpiresIn: '1h'
    });

    const medicalRecordService = new MedicalRecordService({
      medicalRecordRepository: new MemoryRecords(),
      userRepository: { findById: async (id) => ({ id, role: 'patient', medical_record_status: 'active' }) },

      recordCreationApprovalRepository: {
        consume: async ({
          approvalId,
          patientUserId,
          doctorUserId
        }) => ({
          id: approvalId,
          patient_user_id: patientUserId,
          doctor_user_id: doctorUserId,
          status: 'consumed'
        })
      },

      medicalStorage: new MemoryStorage(),

      fileEncryptionService: new FileEncryptionService({
        masterKey: Buffer.alloc(32, 7)
      }),

      consentService: {
        assertDoctorAccess: async () => true
      },

      signingKeyService
    });

    const app = createApp({
      authService,
      medicalRecordService,
      consentService: {
        assertDoctorAccess: async () => true
      }
    });

    const upload = await request(app)
      .post(`/api/v1/doctor/patients/${PATIENT_ID}/records`)
      .set('Authorization', `Bearer ${tokenFor('doctor')}`)
      .field('approvalId', APPROVAL_ID)
      .field('password', 'Correct-Horse-Battery9!')
      .field('title', 'Consultation note')
      .field('category', 'clinical-note')
      .attach(
        'document',
        Buffer.from('%PDF-1.7\nDoctor test note\n%%EOF'),
        {
          filename: 'note.pdf',
          contentType: 'application/pdf'
        }
      );

    expect(upload.status).toBe(201);

    expect(upload.body.record).toMatchObject({
      patientUserId: PATIENT_ID,
      originalFilename: 'note.pdf',
      category: 'clinical-note',
      format: 'diagnosis',
      signed: true
    });

    const formOnly = await request(app)
      .post(`/api/v1/doctor/patients/${PATIENT_ID}/records`)
      .set('Authorization', `Bearer ${tokenFor('doctor')}`)
      .field('approvalId', APPROVAL_ID)
      .field('password', 'Correct-Horse-Battery9!')
      .field('title', 'Fever review')
      .field('category', 'diagnosis')
      .field('form', JSON.stringify({ diagnosis: 'Viral fever', treatmentPlan: 'Rest and fluids' }));

    expect(formOnly.status).toBe(201);

    const empty = await request(app)
      .post(`/api/v1/doctor/patients/${PATIENT_ID}/records`)
      .set('Authorization', `Bearer ${tokenFor('doctor')}`)
      .field('approvalId', APPROVAL_ID)
      .field('password', 'Correct-Horse-Battery9!')
      .field('title', 'Nothing');

    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('RECORD_CONTENT_REQUIRED');
  });

  it('allows a patient to revoke their creation approval request', async () => {
    let revokeArguments;

    const app = api({
      recordCreationApprovalRepository: {
        revoke: async (input) => {
          revokeArguments = input;

          return {
            id: input.approvalId,
            patient_user_id: input.patientUserId,
            doctor_user_id: 'doctor-1',
            status: 'revoked'
          };
        }
      }
    });

    const patient = await register(
      app,
      'patient',
      'revoke-patient@example.com'
    );

    const response = await request(app)
      .post(
        `/api/v1/patients/me/record-creation-requests/${APPROVAL_ID}/revoke`
      )
      .set('Authorization', `Bearer ${patient.body.token}`)
      .expect(200);

    expect(response.body.approval.status).toBe('revoked');
    expect(revokeArguments.approvalId).toBe(APPROVAL_ID);
    expect(revokeArguments.patientUserId).toBeDefined();
  });

  it('rejects a doctor upload when approval consumption fails', async () => {
    const app = api({
      recordCreationApprovalRepository: {
        consume: async () => null
      }
    });

    const response = await request(app)
      .post(`/api/v1/doctor/patients/${PATIENT_ID}/records`)
      .set('Authorization', `Bearer ${tokenFor('doctor')}`)
      .field('approvalId', APPROVAL_ID)
      .field('password', 'Correct-Horse-Battery9!')
      .attach('document', Buffer.from('test document'), {
        filename: 'report.pdf',
        contentType: 'application/pdf'
      });

    expect(response.status).toBe(403);
  });
});
