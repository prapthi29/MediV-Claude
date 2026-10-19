
import { describe, expect, it } from 'vitest';
import { ConsentService } from '../src/services/consent-service.js';

class Consents {
  constructor() {
    this.items = new Map();
  }

  key(patientId, doctorId) {
    return `${patientId}:${doctorId}`;
  }

  async grant(input) {
    const item = {
      id: `consent-${input.patientUserId}-${input.doctorUserId}`,
      patient_user_id: input.patientUserId,
      doctor_user_id: input.doctorUserId,
      expires_at: new Date(input.expiresAt),
      revoked_at: null,
      blockchain_tx_hash: input.transactionHash,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.items.set(
      this.key(input.patientUserId, input.doctorUserId),
      item,
    );

    return item;
  }

  async revoke(input) {
    const item = this.items.get(
      this.key(input.patientUserId, input.doctorUserId),
    );

    if (!item || item.revoked_at) return null;

    item.revoked_at = new Date();
    item.blockchain_tx_hash = input.transactionHash;

    return item;
  }

  async findActive(patientId, doctorId) {
    const item = this.items.get(this.key(patientId, doctorId));

    return item &&
      !item.revoked_at &&
      item.expires_at > new Date()
      ? item
      : null;
  }

  async listActiveForPatient(patientId) {
    return [...this.items.values()].filter(
      (item) =>
        item.patient_user_id === patientId &&
        !item.revoked_at &&
        item.expires_at > new Date(),
    );
  }
}

const users = {
  patient: {
    id: 'patient',
    role: 'patient',
    status: 'active',
    email: 'patient@example.com',
    blockchain_address: '0x1111111111111111111111111111111111111111',
  },

  doctor: {
    id: 'doctor',
    name: 'Test Doctor',
    role: 'doctor',
    status: 'active',
    license_id: 'MED-TEST-001',
    email: 'doctor@example.com',
    blockchain_address: '0x2222222222222222222222222222222222222222',
  },
};

function makeService({
  consents = new Consents(),
  userOverrides = {},
  auditService,
} = {}) {
  const userRepository = {
    findById: async (id) => users[id] ?? null,
    findActiveDoctorByLicenseId: async (licenseId) => {
      const doctor = Object.values(users).find(
        (user) =>
          user.role === 'doctor' &&
          user.status === 'active' &&
          user.license_id?.trim().toLowerCase() ===
            licenseId.trim().toLowerCase(),
      );

      return doctor ?? null;
    },
    ...userOverrides,
  };

  const service = new ConsentService({
    consentRepository: consents,
    userRepository,
    recordRegistryClient: {
      grants: new Map(),

      async grantAccess({ patientAddress, doctorAddress, expiresAt }) {
        this.grants.set(
          `${patientAddress}:${doctorAddress}`,
          new Date(expiresAt),
        );
        return `0x${'a'.repeat(64)}`;
      },

      async revokeAccess({ patientAddress, doctorAddress }) {
        this.grants.delete(`${patientAddress}:${doctorAddress}`);
        return `0x${'b'.repeat(64)}`;
      },

      async hasAccess({ patientAddress, doctorAddress }) {
        const expiry = this.grants.get(`${patientAddress}:${doctorAddress}`);
        return Boolean(expiry && expiry > new Date());
      },
    },
    auditService,
  });

  return { service, consents, userRepository };
}

describe('consent service', () => {
  it('grants access, authorizes it, and revokes it', async () => {
    const { service } = makeService();

    const consent = await service.grant(
      'patient',
      'doctor',
      new Date(Date.now() + 60_000),
    );

    expect(consent.doctorUserId).toBe('doctor');

    await expect(
      service.assertDoctorAccess('patient', 'doctor'),
    ).resolves.toBeUndefined();

    await service.revoke('patient', 'doctor');

    await expect(
      service.assertDoctorAccess('patient', 'doctor'),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  });

  it('rejects expired consent before checking the blockchain', async () => {
    let blockchainChecked = false;

    const service = new ConsentService({
      consentRepository: {
        findActive: async () => null,
      },
      userRepository: {
        findById: async (id) => users[id] ?? null,
      },
      recordRegistryClient: {
        hasAccess: async () => {
          blockchainChecked = true;
          return true;
        },
      },
    });

    await expect(
      service.assertDoctorAccess('patient', 'doctor'),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });

    expect(blockchainChecked).toBe(false);
  });

  it('grants consent using a matching active doctor license', async () => {
    const { service } = makeService();

    const consent = await service.grantByLicense(
      'patient',
      ' med-test-001 ',
    );

    expect(consent.patientUserId).toBe('patient');
    expect(consent.doctorUserId).toBe('doctor');
    const minutesLeft =
      (new Date(consent.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(29);
    expect(minutesLeft).toBeLessThanOrEqual(30);
  });

  it('rejects an empty license ID', async () => {
    const { service } = makeService();

    await expect(
      service.grantByLicense(
        'patient',
        '   ',
      ),
    ).rejects.toMatchObject({
      code: 'LICENSE_REQUIRED',
      statusCode: 400,
    });
  });

  it('rejects a license with no matching active doctor', async () => {
    const { service } = makeService({
      userOverrides: {
        findActiveDoctorByLicenseId: async () => null,
      },
    });

    await expect(
      service.grantByLicense(
        'patient',
        'UNKNOWN-LICENSE',
      ),
    ).rejects.toMatchObject({
      code: 'DOCTOR_LICENSE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('rejects expired consent dates', async () => {
    const { service } = makeService();

    await expect(
      service.grant(
        'patient',
        'doctor',
        new Date(Date.now() - 60_000),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_CONSENT_EXPIRY',
      statusCode: 400,
    });
  });

  it('rejects duplicate active consent', async () => {
    const { service } = makeService();

    await service.grantByLicense('patient', 'MED-TEST-001');

    await expect(
      service.grantByLicense(
        'patient',
        'MED-TEST-001',
      ),
    ).rejects.toMatchObject({
      code: 'CONSENT_EXISTS',
      statusCode: 409,
    });
  });

  it('does not grant consent when the matching doctor is pending', async () => {
    const { service } = makeService({
      userOverrides: {
        findActiveDoctorByLicenseId: async () => null,
      },
    });

    await expect(
      service.grantByLicense(
        'patient',
        'MED-TEST-001',
      ),
    ).rejects.toMatchObject({
      code: 'DOCTOR_LICENSE_NOT_FOUND',
    });
  });
});
