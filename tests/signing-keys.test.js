import crypto from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AuthService } from '../src/services/auth-service.js';
import { AdminService } from '../src/services/admin-service.js';
import { WalletService } from '../src/services/wallet-service.js';
import { SigningKeyService } from '../src/services/signing-key-service.js';

const PASSWORD = 'Strong#Pass123';

class MemoryUsers {
  constructor() { this.users = []; }
  async findByEmail(email) { return this.users.find((u) => u.email === email) ?? null; }
  async findById(id) { return this.users.find((u) => u.id === id) ?? null; }
  async create({ name, email, passwordHash, role, status, licenseId, blockchainAddress }) {
    const user = { id: crypto.randomUUID(), name, email, password_hash: passwordHash, role, status, license_id: licenseId ?? null, blockchain_address: blockchainAddress, created_at: new Date() };
    this.users.push(user);
    return user;
  }
  async updateBlockchainAddress(id, address) {
    const user = await this.findById(id);
    user.blockchain_address = address;
    return { id, blockchain_address: address };
  }
  async setStatus(id, status) {
    const user = await this.findById(id);
    if (!user) return null;
    user.status = status;
    return user;
  }
  async listPending() { return this.users.filter((u) => u.status === 'pending'); }
  async listNonPatients() { return this.users.filter((u) => u.role !== 'patient'); }
}

class MemorySigningKeys {
  constructor() { this.keys = []; }
  async create(input) {
    const key = { id: crypto.randomUUID(), user_id: input.userId, address: input.address, encrypted_private_key: input.encryptedPrivateKey, kdf_salt: input.kdfSalt, key_iv: input.keyIv, key_auth_tag: input.keyAuthTag, status: 'active', created_at: new Date() };
    this.keys.push(key);
    return key;
  }
  async findActiveForUser(userId) { return this.keys.find((k) => k.user_id === userId && k.status === 'active') ?? null; }
  async findByAddress(address) { return this.keys.find((k) => k.address.toLowerCase() === address.toLowerCase()) ?? null; }
}

function setup() {
  const userRepository = new MemoryUsers();
  const signingKeyRepository = new MemorySigningKeys();
  const events = [];
  const auditService = { record: async (event) => { events.push(event); } };
  const signingKeyService = new SigningKeyService({ signingKeyRepository, userRepository, auditService });
  const authService = new AuthService({ userRepository, jwtSecret: 'test-secret-that-is-at-least-thirty-two-characters', jwtExpiresIn: '1h', signingKeyService });
  const app = createApp({
    authService,
    walletService: new WalletService({ userRepository }),
    adminService: new AdminService({ userRepository, auditRepository: { listAccountEvents: async () => events }, auditService }),
    signingKeyService
  });
  return { app, authService, userRepository, signingKeyRepository, signingKeyService, events };
}

async function adminToken({ userRepository, authService }) {
  const admin = await userRepository.create({ name: 'Admin', email: 'admin@example.com', passwordHash: 'x', role: 'admin', status: 'active' });
  return authService.createToken(admin);
}

describe('signing keys', () => {
  it('gives a registering doctor a password-locked key whose address is their blockchain address', async () => {
    const ctx = setup();
    const res = await request(ctx.app).post('/api/v1/auth/register').send({ name: 'Doc', email: 'doc@example.com', password: PASSWORD, role: 'doctor', licenseId: 'LIC-1' });
    expect(res.status).toBe(201);
    const key = await ctx.signingKeyRepository.findActiveForUser(res.body.user.id);
    expect(key.address).toBe(res.body.user.blockchainAddress);
    expect(key.encrypted_private_key.length).toBe(32);
    expect(ctx.events.map((e) => e.eventType)).toContain('signing_key_created');
  });

  it('does not create keys for patients', async () => {
    const ctx = setup();
    const res = await request(ctx.app).post('/api/v1/auth/register').send({ name: 'Pat', email: 'pat@example.com', password: PASSWORD, role: 'patient' });
    expect(await ctx.signingKeyRepository.findActiveForUser(res.body.user.id)).toBeNull();
  });

  it('signs only with the correct password, and the signature verifies against the key address', async () => {
    const ctx = setup();
    const user = await ctx.userRepository.create({ name: 'Doc', email: 'd@example.com', passwordHash: 'x', role: 'doctor', status: 'active' });
    const key = await ctx.signingKeyService.ensureKey(user, PASSWORD);
    const digest = crypto.createHash('sha256').update('record').digest('hex');

    const { signature, signerAddress } = await ctx.signingKeyService.signDigest(user.id, PASSWORD, digest);
    expect(signerAddress).toBe(key.address);
    expect(SigningKeyService.verifyDigest(digest, signature, key.address)).toBe(true);
    expect(SigningKeyService.verifyDigest(crypto.createHash('sha256').update('tampered').digest('hex'), signature, key.address)).toBe(false);

    await expect(ctx.signingKeyService.signDigest(user.id, 'Wrong#Pass1234', digest)).rejects.toMatchObject({ code: 'INVALID_SIGNING_PASSWORD' });
  });

  it('creates a key at login for an approved doctor who has none, once', async () => {
    const ctx = setup();
    await request(ctx.app).post('/api/v1/auth/register').send({ name: 'Doc', email: 'doc@example.com', password: PASSWORD, role: 'doctor', licenseId: 'LIC-1' });
    const doctor = await ctx.userRepository.findByEmail('doc@example.com');
    ctx.signingKeyRepository.keys = [];
    doctor.status = 'active';

    const first = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'doc@example.com', password: PASSWORD });
    const second = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'doc@example.com', password: PASSWORD });
    expect(ctx.signingKeyRepository.keys).toHaveLength(1);
    expect(first.body.user.blockchainAddress).toBe(ctx.signingKeyRepository.keys[0].address);
    expect(second.body.user.blockchainAddress).toBe(first.body.user.blockchainAddress);

    const info = await request(ctx.app).get('/api/v1/account/signing-key').set('authorization', `Bearer ${second.body.token}`);
    expect(info.body.signingKey.address).toBe(first.body.user.blockchainAddress);
  });

  it('does not let doctors replace their managed address', async () => {
    const ctx = setup();
    const doctor = await ctx.userRepository.create({ name: 'Doc', email: 'd@example.com', passwordHash: 'x', role: 'doctor', status: 'active' });
    const res = await request(ctx.app).put('/api/v1/account/wallet')
      .set('authorization', `Bearer ${ctx.authService.createToken(doctor)}`)
      .send({ blockchainAddress: '0x66C930eBE0ABF4524b43f506530113e3b70f09a1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WALLET_MANAGED');
  });
});

describe('admin limits', () => {
  it('lists only doctor, pharmacy and admin accounts', async () => {
    const ctx = setup();
    await ctx.userRepository.create({ name: 'Pat', email: 'p@example.com', passwordHash: 'x', role: 'patient', status: 'active' });
    await ctx.userRepository.create({ name: 'Doc', email: 'd@example.com', passwordHash: 'x', role: 'doctor', status: 'pending' });
    const token = await adminToken(ctx);
    const res = await request(ctx.app).get('/api/v1/admin/users').set('authorization', `Bearer ${token}`);
    expect(res.body.users.map((u) => u.role).sort()).toEqual(['admin', 'doctor']);
  });

  it('cannot approve or reject patient accounts', async () => {
    const ctx = setup();
    const patient = await ctx.userRepository.create({ name: 'Pat', email: 'p@example.com', passwordHash: 'x', role: 'patient', status: 'active' });
    const token = await adminToken(ctx);
    const res = await request(ctx.app).post(`/api/v1/admin/users/${patient.id}/reject`).set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(patient.status).toBe('active');
  });
});
