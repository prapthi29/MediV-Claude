import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EmergencyProfileService } from '../src/services/emergency-profile-service.js';
import { SigningKeyService } from '../src/services/signing-key-service.js';
import { MockRecordRegistryClient } from '../src/blockchain/mock-record-registry-client.js';
import { ageFromDateOfBirth, basicProfileSha256 } from '../src/services/basic-profile-signature.js';

const PASSWORD = 'Strong#Pass123';
const patientId = 'patient-1';
const doctorId = 'doctor-1';

class SigningKeys {
  constructor() { this.keys = []; }
  async create(input) {
    const key = { id: crypto.randomUUID(), user_id: input.userId, address: input.address, encrypted_private_key: input.encryptedPrivateKey, kdf_salt: input.kdfSalt, key_iv: input.keyIv, key_auth_tag: input.keyAuthTag, status: 'active', created_at: new Date() };
    this.keys.push(key);
    return key;
  }
  async findActiveForUser(userId) { return this.keys.find((k) => k.user_id === userId) ?? null; }
  async findByAddress(address) { return this.keys.find((k) => k.address === address) ?? null; }
}

const input = {
  bloodGroup: 'B+',
  gender: 'female',
  dateOfBirth: '1990-04-12',
  emergencyContactName: 'Ravi',
  emergencyContactPhone: '+919999999999',
  emergencyContactRelationship: 'Spouse',
  allergies: [{ substance: 'Penicillin', reaction: 'Rash', severity: 'moderate' }],
  allergiesStatus: 'provided',
  chronicConditions: [],
  chronicConditionsStatus: 'none_known',
  currentMedications: [{ name: 'Metformin', dosage: '500 mg', frequency: 'Twice daily' }],
  medicationsStatus: 'provided'
};

// Shape returned by the repository, with jsonb-style reordered keys.
function stored(profile, signature) {
  return {
    patientUserId: patientId,
    version: signature.version,
    gender: profile.gender,
    dateOfBirth: profile.dateOfBirth,
    bloodGroup: profile.bloodGroup,
    emergencyContact: { phone: profile.emergencyContactPhone, name: profile.emergencyContactName, relationship: profile.emergencyContactRelationship },
    allergies: profile.allergies.map(({ severity, reaction, substance }) => ({ severity, reaction, substance })),
    allergiesStatus: profile.allergiesStatus,
    chronicConditions: profile.chronicConditions,
    chronicConditionsStatus: profile.chronicConditionsStatus,
    currentMedications: profile.currentMedications.map(({ frequency, dosage, name }) => ({ frequency, dosage, name })),
    medicationsStatus: profile.medicationsStatus,
    signature: { profileSha256: signature.profileSha256, doctorSignature: signature.doctorSignature, signerAddress: signature.signerAddress, signedByDoctorId: doctorId }
  };
}

async function setup() {
  const users = {
    [doctorId]: { id: doctorId, role: 'doctor', status: 'active' },
    [patientId]: { id: patientId, role: 'patient', blockchain_address: '0x0000000000000000000000000000000000000002' }
  };
  const userRepository = { findById: async (id) => users[id], updateBlockchainAddress: async () => {} };
  const signingKeyService = new SigningKeyService({ signingKeyRepository: new SigningKeys(), userRepository });
  await signingKeyService.ensureKey(users[doctorId], PASSWORD);
  const service = new EmergencyProfileService({
    emergencyProfileRepository: { markBlockchain: async () => {} },
    userRepository,
    signingKeyService,
    recordRegistryClient: new MockRecordRegistryClient()
  });
  return { service };
}

describe('basic profile signatures', () => {
  it('verifies hash, doctor signature and chain anchor for a signed version', async () => {
    const { service } = await setup();
    const signature = await service.signVersion(doctorId, patientId, 1, input, PASSWORD);
    await service.anchorOnChain(patientId, signature);

    const { integrity } = await service.withIntegrity(stored(input, signature));
    expect(integrity).toEqual({ hashValid: true, signatureValid: true, onChain: true, verified: true });
  });

  it('detects a field changed after signing', async () => {
    const { service } = await setup();
    const signature = await service.signVersion(doctorId, patientId, 1, input, PASSWORD);
    await service.anchorOnChain(patientId, signature);

    const tampered = stored(input, signature);
    tampered.currentMedications[0].dosage = '5000 mg';
    const { integrity } = await service.withIntegrity(tampered);
    expect(integrity.hashValid).toBe(false);
    expect(integrity.verified).toBe(false);
  });

  it('anchors each new version on-chain', async () => {
    const { service } = await setup();
    const v1 = await service.signVersion(doctorId, patientId, 1, input, PASSWORD);
    await service.anchorOnChain(patientId, v1);
    const changed = { ...input, bloodGroup: 'O+' };
    const v2 = await service.signVersion(doctorId, patientId, 2, changed, PASSWORD);
    await service.anchorOnChain(patientId, v2);

    expect((await service.withIntegrity(stored(changed, v2))).integrity.verified).toBe(true);
    expect(v1.profileSha256).not.toBe(v2.profileSha256);
  });

  it('binds the hash to the patient and version', () => {
    expect(basicProfileSha256(patientId, 1, input)).not.toBe(basicProfileSha256('patient-2', 1, input));
    expect(basicProfileSha256(patientId, 1, input)).not.toBe(basicProfileSha256(patientId, 2, input));
  });

  it('calculates age from date of birth', () => {
    const now = new Date('2026-10-19T00:00:00Z');
    expect(ageFromDateOfBirth('1990-04-12', now)).toBe(36);
    expect(ageFromDateOfBirth('1990-12-25', now)).toBe(35);
    expect(ageFromDateOfBirth(null, now)).toBeNull();
  });
});
