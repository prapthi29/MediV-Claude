
import request from 'supertest';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth-service.js';
import { AdminService } from '../src/services/admin-service.js';

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
      id: crypto.randomUUID(),
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
    return this.publicUser(user);
  }

  async listPending() {
    return this.users
      .filter((user) => user.status === 'pending')
      .map((user) => this.publicUser(user));
  }

  async listNonPatients() {
    return [...this.users]
      .filter((user) => user.role !== 'patient')
      .reverse()
      .map((user) => this.publicUser(user));
  }

  async setStatus(id, status) {
    const user = this.users.find((item) => item.id === id);

    if (!user) return null;

    user.status = status;
    return this.publicUser(user);
  }

  publicUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      license_id: user.license_id ?? user.licenseId ?? null,
      blockchain_address:
        user.blockchain_address ?? user.blockchainAddress ?? null,
      created_at: user.created_at
    };
  }
}

class MemoryAudit {
  constructor() {
    this.events = [];
  }

  async create(input) {
    const event = {
      id: crypto.randomUUID(),
      ...input,
      created_at: new Date().toISOString()
    };

    this.events.push(event);
    return event;
  }

  async listAccountEvents() {
    return this.events;
  }
}

function api() {
  const userRepository = new MemoryUsers();
  const auditRepository = new MemoryAudit();

  const auditService = {
    record: (input) => auditRepository.create(input)
  };

  const authService = new AuthService({
    userRepository,
    jwtSecret: 'test-secret-that-is-at-least-thirty-two-characters',
    jwtExpiresIn: '1h'
  });

  const adminService = new AdminService({
    userRepository,
    auditRepository,
    auditService
  });

  const app = createApp({
    authService,
    adminService
  });

  return {
    app,
    authService,
    userRepository,
    auditRepository
  };
}

describe('authentication API', () => {
  it('rejects passwords without mixed character classes', async () => {
    const { app } = api();

    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Weak Password User',
        email: 'weak@example.com',
        password: '123456789012',
        role: 'patient'
      })
      .expect(400);

    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Letters Only User',
        email: 'letters@example.com',
        password: 'abcdefghijkl',
        role: 'patient'
      })
      .expect(400);
  });

  it('registers, authenticates, and exposes the JWT user', async () => {
    const { app } = api();

    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test Patient',
        email: 'PATIENT@example.com',
        password: 'Correct-Horse-Battery9!',
        role: 'patient'
      })
      .expect(201);

    expect(registration.body.user.email).toBe('patient@example.com');
    expect(registration.body.user.name).toBe('Test Patient');
    expect(registration.body.user.status).toBe('active');
    expect(registration.body.user).not.toHaveProperty('password_hash');

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'patient@example.com',
        password: 'Correct-Horse-Battery9!'
      })
      .expect(200);

    const me = await request(app)
      .get('/api/v1/health/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);

    // The current JWT user endpoint exposes role but not name.
    expect(me.body.user).toMatchObject({
      role: 'patient'
    });
  });

  it('rejects duplicate registrations and role violations', async () => {
    const { app } = api();

    const input = {
      name: 'Test Doctor',
      email: 'doctor@example.com',
      password: 'Correct-Horse-Battery9!',
      role: 'doctor',
      licenseId: 'TEST-DOC-001'
    };

    await request(app)
      .post('/api/v1/auth/register')
      .send(input)
      .expect(201);

    await request(app)
      .post('/api/v1/auth/register')
      .send(input)
      .expect(409);

    const patient = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test Patient',
        email: 'patient@example.com',
        password: 'Correct-Horse-Battery9!',
        role: 'patient'
      })
      .expect(201);

    await request(app)
      .get('/api/v1/health/doctor-only')
      .set('Authorization', `Bearer ${patient.body.token}`)
      .expect(403);
  });

  it('keeps doctor and pharmacy accounts pending until admin approval', async () => {
    const { app, userRepository } = api();

    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test Doctor',
        email: 'doctor@example.com',
        password: 'Correct-Horse-Battery9!',
        role: 'doctor',
        licenseId: 'TEST-DOC-002'
      })
      .expect(201);

    expect(registration.body.user.status).toBe('pending');

    // The registration response exposes licenseId in camelCase.
    expect(registration.body.user.licenseId).toBe('TEST-DOC-002');

    expect(registration.body.token).toBeNull();

    await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'doctor@example.com',
        password: 'Correct-Horse-Battery9!'
      })
      .expect(403);

    await userRepository.setStatus(registration.body.user.id, 'active');

    await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'doctor@example.com',
        password: 'Correct-Horse-Battery9!'
      })
      .expect(200);
  });

  it('restricts admin endpoints to admin users', async () => {
    const { app } = api();

    const patient = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test Patient',
        email: 'patient@example.com',
        password: 'Correct-Horse-Battery9!',
        role: 'patient'
      })
      .expect(201);

    await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${patient.body.token}`)
      .expect(403);

    const admin = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Unauthorized Admin',
        email: 'admin@example.com',
        password: 'Correct-Horse-Battery9!',
        role: 'admin'
      })
      .expect(400);

    expect(admin.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lets admins list and approve pending users', async () => {
    const {
      app,
      authService,
      userRepository,
      auditRepository
    } = api();

    const admin = await userRepository.create({
      name: 'Test Admin',
      email: 'admin@example.com',
      passwordHash: 'hash',
      role: 'admin',
      status: 'active'
    });

    const token = authService.createToken(admin);

    const doctor = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Pending Doctor',
        email: 'doctor@example.com',
        password: 'Correct-Horse-Battery9!',
        role: 'doctor',
        licenseId: 'TEST-DOC-003'
      })
      .expect(201);

    const pending = await request(app)
      .get('/api/v1/admin/users/pending')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(pending.body.users).toHaveLength(1);
    expect(pending.body.users[0]).toMatchObject({
      id: doctor.body.user.id,
      name: 'Pending Doctor',
      status: 'pending'
    });

    const approved = await request(app)
      .post(`/api/v1/admin/users/${doctor.body.user.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(approved.body.user).toMatchObject({
      id: doctor.body.user.id,
      status: 'active'
    });

    expect(auditRepository.events[0]).toMatchObject({
      eventType: 'user_approved',
      actorUserId: admin.id,
      subjectUserId: doctor.body.user.id
    });
  });
});
