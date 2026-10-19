import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { EmergencyAccessService } from '../src/services/emergency-access-service.js';
import { SigningKeyService } from '../src/services/signing-key-service.js';

const PATIENT = '10000000-0000-4000-8000-000000000001';
const PASSWORD = 'Strong#Pass123';

class Grants {
  constructor() { this.items = []; }
  async create(input) {
    const grant = { id: crypto.randomUUID(), patient_user_id: input.patientUserId, doctor_user_id: input.doctorUserId, reason: input.reason,
      expires_at: input.expiresAt, duration_minutes: input.durationMinutes, request_sha256: input.requestSha256,
      doctor_signature: input.doctorSignature, signer_address: input.signerAddress, created_at: new Date(), revoked_at: null };
    this.items.push(grant);
    return grant;
  }
  async findActive(patientId, doctorId) {
    return this.items.find((g) => g.patient_user_id === patientId && g.doctor_user_id === doctorId && !g.revoked_at && g.expires_at > new Date()) ?? null;
  }
  async revokeForPatient(id, patientId) {
    const grant = this.items.find((g) => g.id === id && g.patient_user_id === patientId && !g.revoked_at);
    if (!grant) return null;
    grant.revoked_at = new Date();
    return grant;
  }
}

class SigningKeys {
  constructor() { this.keys = []; }
  async create(input) {
    const key = { id: crypto.randomUUID(), user_id: input.userId, address: input.address, encrypted_private_key: input.encryptedPrivateKey, kdf_salt: input.kdfSalt, key_iv: input.keyIv, key_auth_tag: input.keyAuthTag, status: 'active' };
    this.keys.push(key);
    return key;
  }
  async findActiveForUser(userId) { return this.keys.find((k) => k.user_id === userId) ?? null; }
  async findByAddress(address) { return this.keys.find((k) => k.address.toLowerCase() === address.toLowerCase()) ?? null; }
}

async function setup({ keyOwnedByDoctor = true } = {}) {
  const users = {
    doctor: { id: 'doctor', role: 'doctor', status: 'active' },
    [PATIENT]: { id: PATIENT, role: 'patient', patient_id: 'MV-1A2B3C4D', medical_record_status: 'active' }
  };
  const userRepository = {
    findById: async (id) => users[id] ?? null,
    findByHealthId: async (healthId) => Object.values(users).find((u) => u.patient_id?.toUpperCase() === healthId.toUpperCase()) ?? null,
    updateBlockchainAddress: async (id, address) => { users[id].blockchain_address = address; }
  };
  const signingKeyService = new SigningKeyService({ signingKeyRepository: new SigningKeys(), userRepository });
  await signingKeyService.ensureKey(users.doctor, PASSWORD);
  if (!keyOwnedByDoctor) signingKeyService.isKeyOfUser = async () => false;
  const grants = new Grants();
  const events = [];
  const service = new EmergencyAccessService({
    emergencyAccessRepository: grants,
    userRepository,
    emergencyProfileService: { getOwnProfile: async () => ({ bloodGroup: 'O+', integrity: { verified: true } }) },
    signingKeyService,
    auditService: { record: async (event) => events.push(event) }
  });
  return { service, grants, events };
}

describe('glass-break emergency access', () => {
  it('opens after the signed request verifies and shows the basic profile only', async () => {
    const { service, events } = await setup();
    const access = await service.grant('doctor', 'mv-1a2b3c4d', 'Unconscious following an accident', 30, PASSWORD);
    expect(access).toMatchObject({ patientUserId: PATIENT, durationMinutes: 30, signed: true, status: 'active' });
    expect(access.requestSha256).toMatch(/^[a-f0-9]{64}$/);
    const minutes = (new Date(access.expiresAt) - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    const view = await service.viewBasicProfile('doctor', PATIENT);
    expect(view.profile.bloodGroup).toBe('O+');
    expect(events.map((e) => e.eventType)).toEqual(['emergency_access_granted', 'emergency_profile_viewed']);
  });

  it('only offers 15, 30 or 45 minutes', async () => {
    const { service } = await setup();
    await expect(service.grant('doctor', PATIENT, 'Unconscious following an accident', 60, PASSWORD))
      .rejects.toMatchObject({ code: 'INVALID_EMERGENCY_DURATION' });
  });

  it('stays closed with a wrong password', async () => {
    const { service, grants } = await setup();
    await expect(service.grant('doctor', PATIENT, 'Unconscious following an accident', 15, 'Wrong#Pass1234'))
      .rejects.toMatchObject({ code: 'INVALID_SIGNING_PASSWORD' });
    expect(grants.items).toHaveLength(0);
  });

  it('stays closed when the signing key is not the doctor\'s', async () => {
    const { service, grants } = await setup({ keyOwnedByDoctor: false });
    await expect(service.grant('doctor', PATIENT, 'Unconscious following an accident', 15, PASSWORD))
      .rejects.toMatchObject({ code: 'EMERGENCY_SIGNATURE_INVALID' });
    expect(grants.items).toHaveLength(0);
  });

  it('ends at once when the patient revokes it', async () => {
    const { service } = await setup();
    const access = await service.grant('doctor', PATIENT, 'Unconscious following an accident', 45, PASSWORD);
    await service.revokeForPatient(PATIENT, access.id);
    await expect(service.viewBasicProfile('doctor', PATIENT)).rejects.toMatchObject({ code: 'EMERGENCY_ACCESS_REQUIRED' });
  });

  it('rejects an unknown health ID', async () => {
    const { service } = await setup();
    await expect(service.grant('doctor', 'MV-00000000', 'Unconscious following an accident', 15, PASSWORD))
      .rejects.toMatchObject({ code: 'PATIENT_NOT_FOUND' });
  });
});
