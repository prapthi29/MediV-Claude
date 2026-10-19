
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/config/database.js';
import { EmergencyProfileAccessRequestRepository } from '../src/models/emergency-profile-access-request-repository.js';
import { ConsentRepository } from '../src/models/consent-repository.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const integrationDescribe = TEST_DATABASE_URL ? describe : describe.skip;

integrationDescribe(
  'Emergency profile access request PostgreSQL integration',
  () => {
    let database;
    let requestRepository;
    let consentRepository;
    let patientId;
    let doctorId;

    beforeAll(async () => {
      const url = new URL(TEST_DATABASE_URL);

      // Fail closed: never run these tests against another database.
      if (url.pathname.replace(/^\/+/, '') !== 'securechain_test') {
        throw new Error(
          'Safety check failed: integration tests require the securechain_test database.',
        );
      }

      database = createDatabase({
        DATABASE_URL: TEST_DATABASE_URL,
        DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'false',
      });

      const result = await database.query(
        'SELECT current_database() AS name',
      );

      if (result.rows[0]?.name !== 'securechain_test') {
        throw new Error(
          'Connected database is not securechain_test.',
        );
      }

      requestRepository =
        new EmergencyProfileAccessRequestRepository(database);

      consentRepository = new ConsentRepository(database);
    });

    afterEach(async () => {
      // Delete test users and their dependent records.
      if (patientId) {
        await database.query(
          'DELETE FROM users WHERE id = $1',
          [patientId],
        );
        patientId = undefined;
      }

      if (doctorId) {
        await database.query(
          'DELETE FROM users WHERE id = $1',
          [doctorId],
        );
        doctorId = undefined;
      }
    });

    afterAll(async () => {
      if (database) {
        await database.close();
      }
    });

    async function createUser(role) {
      const suffix = randomUUID();

      const result = await database.query(
        `INSERT INTO users
          (name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id`,
        [
          `Integration ${role}`,
          `integration-${role}-${suffix}@example.test`,
          'test-only-hash',
          role,
        ],
      );

      return result.rows[0].id;
    }

    async function createConnectedPair() {
      patientId = await createUser('patient');
      doctorId = await createUser('doctor');

      await consentRepository.grant({
        patientUserId: patientId,
        doctorUserId: doctorId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        transactionHash: null,
      });
    }

    async function createApprovedRequest(operation = 'view') {
      const request = await requestRepository.create({
        patientUserId: patientId,
        doctorUserId: doctorId,
        operation,
      });

      expect(request).toBeTruthy();
      expect(request.status).toBe('pending');

      const approved = await requestRepository.decide({
        requestId: request.id,
        patientUserId: patientId,
        status: 'approved',
      });

      expect(approved.status).toBe('approved');

      return approved;
    }

    it('creates a pending request for an actively connected patient', async () => {
      await createConnectedPair();

      const request = await requestRepository.create({
        patientUserId: patientId,
        doctorUserId: doctorId,
        operation: 'view',
      });

      expect(request).toBeTruthy();
      expect(request.status).toBe('pending');
      expect(request.used_at).toBeNull();
    });

    it('does not create a request when there is no active connection', async () => {
      patientId = await createUser('patient');
      doctorId = await createUser('doctor');

      const request = await requestRepository.create({
        patientUserId: patientId,
        doctorUserId: doctorId,
        operation: 'view',
      });

      expect(request).toBeNull();
    });

    it('does not allow a pending request to be consumed', async () => {
      await createConnectedPair();

      const request = await requestRepository.create({
        patientUserId: patientId,
        doctorUserId: doctorId,
        operation: 'view',
      });

      const consumed = await database.transaction((client) =>
        requestRepository.consumeApproved(client, {
          requestId: request.id,
          patientUserId: patientId,
          doctorUserId: doctorId,
          operation: 'view',
        }),
      );

      expect(consumed).toBe(false);
    });

    it('allows an approved request to be consumed only once', async () => {
      await createConnectedPair();

      const request = await createApprovedRequest('view');

      const first = await database.transaction((client) =>
        requestRepository.consumeApproved(client, {
          requestId: request.id,
          patientUserId: patientId,
          doctorUserId: doctorId,
          operation: 'view',
        }),
      );

      const second = await database.transaction((client) =>
        requestRepository.consumeApproved(client, {
          requestId: request.id,
          patientUserId: patientId,
          doctorUserId: doctorId,
          operation: 'view',
        }),
      );

      expect(first).toBe(true);
      expect(second).toBe(false);

      const stored = await database.query(
        `SELECT used_at
         FROM emergency_profile_access_requests
         WHERE id = $1`,
        [request.id],
      );

      expect(stored.rows[0].used_at).not.toBeNull();
    });

    it('does not consume an approval for the wrong operation', async () => {
      await createConnectedPair();

      const request = await createApprovedRequest('view');

      const consumed = await database.transaction((client) =>
        requestRepository.consumeApproved(client, {
          requestId: request.id,
          patientUserId: patientId,
          doctorUserId: doctorId,
          operation: 'update',
        }),
      );

      expect(consumed).toBe(false);

      const stored = await database.query(
        `SELECT used_at
         FROM emergency_profile_access_requests
         WHERE id = $1`,
        [request.id],
      );

      expect(stored.rows[0].used_at).toBeNull();
    });

    it('rejects unused approvals and blocks consumption after consent revocation', async () => {
      await createConnectedPair();

      const request = await createApprovedRequest('view');

      const revoked = await consentRepository.revoke({
        patientUserId: patientId,
        doctorUserId: doctorId,
        transactionHash: null,
      });

      expect(revoked).toBeTruthy();

      const stored = await database.query(
        `SELECT status, used_at
         FROM emergency_profile_access_requests
         WHERE id = $1`,
        [request.id],
      );

      expect(stored.rows[0].status).toBe('rejected');
      expect(stored.rows[0].used_at).toBeNull();

      const consumed = await database.transaction((client) =>
        requestRepository.consumeApproved(client, {
          requestId: request.id,
          patientUserId: patientId,
          doctorUserId: doctorId,
          operation: 'view',
        }),
      );

      expect(consumed).toBe(false);
    });

    it('rolls back approval consumption when the surrounding transaction fails', async () => {
      await createConnectedPair();

      const request = await createApprovedRequest('view');

      await expect(
        database.transaction(async (client) => {
          const consumed = await requestRepository.consumeApproved(
            client,
            {
              requestId: request.id,
              patientUserId: patientId,
              doctorUserId: doctorId,
              operation: 'view',
            },
          );

          expect(consumed).toBe(true);

          throw new Error('intentional rollback test');
        }),
      ).rejects.toThrow('intentional rollback test');

      const stored = await database.query(
        `SELECT used_at
         FROM emergency_profile_access_requests
         WHERE id = $1`,
        [request.id],
      );

      expect(stored.rows[0].used_at).toBeNull();

      const retry = await database.transaction((client) =>
        requestRepository.consumeApproved(client, {
          requestId: request.id,
          patientUserId: patientId,
          doctorUserId: doctorId,
          operation: 'view',
        }),
      );

      expect(retry).toBe(true);
    });

    it('does not create a pending request after consent has been revoked', async () => {
      await createConnectedPair();

      const revoked = await consentRepository.revoke({
        patientUserId: patientId,
        doctorUserId: doctorId,
        transactionHash: null,
      });

      expect(revoked).toBeTruthy();

      const request = await requestRepository.create({
        patientUserId: patientId,
        doctorUserId: doctorId,
        operation: 'view',
      });

      expect(request).toBeNull();

      const stored = await database.query(
        `SELECT COUNT(*)::int AS count
         FROM emergency_profile_access_requests
         WHERE patient_user_id = $1
           AND doctor_user_id = $2
           AND status = 'pending'`,
        [patientId, doctorId],
      );

      expect(stored.rows[0].count).toBe(0);
    });

    it('does not leave a pending or unused approved request when creation races with consent revocation', async () => {
      await createConnectedPair();

      const results = await Promise.all([
        requestRepository.create({
          patientUserId: patientId,
          doctorUserId: doctorId,
          operation: 'view',
        }),
        consentRepository.revoke({
          patientUserId: patientId,
          doctorUserId: doctorId,
          transactionHash: null,
        }),
      ]);

      // Revocation must complete successfully.
      expect(results[1]).toBeTruthy();

      const consent = await database.query(
        `SELECT revoked_at
         FROM patient_doctor_consents
         WHERE patient_user_id = $1
           AND doctor_user_id = $2`,
        [patientId, doctorId],
      );

      expect(consent.rows).toHaveLength(1);
      expect(consent.rows[0].revoked_at).not.toBeNull();

      const requests = await database.query(
        `SELECT status, used_at
         FROM emergency_profile_access_requests
         WHERE patient_user_id = $1
           AND doctor_user_id = $2`,
        [patientId, doctorId],
      );

      expect(
        requests.rows.some((request) => request.status === 'pending'),
      ).toBe(false);

      expect(
        requests.rows.some(
          (request) =>
            request.status === 'approved' && request.used_at === null,
        ),
      ).toBe(false);
    });
  },
);
