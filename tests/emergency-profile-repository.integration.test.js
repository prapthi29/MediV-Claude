
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
import { EmergencyProfileRepository } from '../src/models/emergency-profile-repository.js';
import { EmergencyProfileAccessRequestRepository } from '../src/models/emergency-profile-access-request-repository.js';
import { ConsentRepository } from '../src/models/consent-repository.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const integrationDescribe = TEST_DATABASE_URL ? describe : describe.skip;

integrationDescribe(
  'Emergency profile repository PostgreSQL integration',
  () => {
    let database;
    let profileRepository;
    let requestRepository;
    let consentRepository;
    let patientId;
    let doctorId;

    beforeAll(async () => {
      if (!TEST_DATABASE_URL) {
        throw new Error('TEST_DATABASE_URL is required.');
      }

      const url = new URL(TEST_DATABASE_URL);

      // Never allow these tests to run against the development database.
      if (url.pathname.replace(/^\/+/, '') !== 'securechain_test') {
        throw new Error(
          'Integration tests require the securechain_test database.',
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

      profileRepository = new EmergencyProfileRepository(
        database,
        requestRepository,
      );
    });

    afterEach(async () => {
      if (!database) return;

      // Audit rows reference users without ON DELETE CASCADE.
      // Delete those rows first so cleanup does not violate the FK.
      if (patientId) {
        await database.transaction(async (client) => {
          await client.query(
            `DELETE FROM patient_emergency_profile_audit
             WHERE patient_user_id = $1`,
            [patientId],
          );

          await client.query(
            'DELETE FROM users WHERE id = $1',
            [patientId],
          );
        });

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
          `${role}-${suffix}@example.test`,
          'test-only-hash',
          role,
        ],
      );

      return result.rows[0].id;
    }

    async function setupConnectedPair() {
      patientId = await createUser('patient');
      doctorId = await createUser('doctor');

      await consentRepository.grant({
        patientUserId: patientId,
        doctorUserId: doctorId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        transactionHash: null,
      });
    }

    async function approve(operation) {
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

    function validProfile() {
      return {
        bloodGroup: 'O+',
        emergencyContactName: 'Test Contact',
        emergencyContactPhone: '+919999999999',
        emergencyContactRelationship: 'Sibling',
        allergies: [],
        allergiesStatus: 'unknown',
        chronicConditions: [],
        chronicConditionsStatus: 'unknown',
        currentMedications: [],
        medicationsStatus: 'unknown',
      };
    }

    it(
      'requires approval and atomically creates the profile, audit row, and active record status',
      async () => {
        await setupConnectedPair();

        // An invalid approval must not create the profile or activate the record.
        await expect(
          profileRepository.create({
            patientUserId: patientId,
            doctorUserId: doctorId,
            profile: validProfile(),
            reason: 'Initial profile integration test',
            approvalRequestId: randomUUID(),
          }),
        ).rejects.toMatchObject({
          code: 'PROFILE_APPROVAL_REQUIRED',
        });

        const beforeApproval = await database.query(
          `SELECT medical_record_status
           FROM users
           WHERE id = $1`,
          [patientId],
        );

        expect(
          beforeApproval.rows[0].medical_record_status,
        ).toBe('pending');

        const approval = await approve('create');

        const created = await profileRepository.create({
          patientUserId: patientId,
          doctorUserId: doctorId,
          profile: validProfile(),
          reason: 'Initial profile integration test',
          approvalRequestId: approval.id,
        });

        expect(created.patientUserId).toBe(patientId);
        expect(created.bloodGroup).toBe('O+');
        expect(created.medicalRecordStatus).toBe('active');

        const state = await database.query(
          `SELECT
             u.medical_record_status,
             (
               SELECT COUNT(*)::int
               FROM patient_emergency_profiles p
               WHERE p.patient_user_id = u.id
             ) AS profile_count,
             (
               SELECT COUNT(*)::int
               FROM patient_emergency_profile_audit a
               WHERE a.patient_user_id = u.id
                 AND a.action = 'created'
             ) AS audit_count,
             (
               SELECT used_at
               FROM emergency_profile_access_requests r
               WHERE r.id = $2
             ) AS approval_used_at
           FROM users u
           WHERE u.id = $1`,
          [patientId, approval.id],
        );

        expect(state.rows[0].medical_record_status).toBe('active');
        expect(state.rows[0].profile_count).toBe(1);
        expect(state.rows[0].audit_count).toBe(1);
        expect(state.rows[0].approval_used_at).not.toBeNull();
      },
    );

    it(
      'rolls back profile, audit, status, and approval consumption if creation fails',
      async () => {
        await setupConnectedPair();

        const approval = await approve('create');

        // The audit table requires change_reason to be NOT NULL.
        // This forces a failure after profile insertion and approval consumption.
        await expect(
          profileRepository.create({
            patientUserId: patientId,
            doctorUserId: doctorId,
            profile: validProfile(),
            reason: null,
            approvalRequestId: approval.id,
          }),
        ).rejects.toThrow();

        const state = await database.query(
          `SELECT
             u.medical_record_status,
             (
               SELECT COUNT(*)::int
               FROM patient_emergency_profiles p
               WHERE p.patient_user_id = u.id
             ) AS profile_count,
             (
               SELECT COUNT(*)::int
               FROM patient_emergency_profile_audit a
               WHERE a.patient_user_id = u.id
             ) AS audit_count,
             (
               SELECT status
               FROM emergency_profile_access_requests r
               WHERE r.id = $2
             ) AS approval_status,
             (
               SELECT used_at
               FROM emergency_profile_access_requests r
               WHERE r.id = $2
             ) AS approval_used_at
           FROM users u
           WHERE u.id = $1`,
          [patientId, approval.id],
        );

        expect(state.rows[0].medical_record_status).toBe('pending');
        expect(state.rows[0].profile_count).toBe(0);
        expect(state.rows[0].audit_count).toBe(0);
        expect(state.rows[0].approval_status).toBe('approved');
        expect(state.rows[0].approval_used_at).toBeNull();
      },
    );
  },
);
