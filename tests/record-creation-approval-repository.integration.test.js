
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';
import { randomUUID } from 'node:crypto';

import { createDatabase } from '../src/config/database.js';
import { RecordCreationApprovalRepository } from '../src/models/record-creation-approval-repository.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const integrationDescribe = TEST_DATABASE_URL ? describe : describe.skip;

integrationDescribe(
  'Record creation approval PostgreSQL integration',
  () => {
    let database;
    let repository;
    let patientId;
    let doctorId;
    const createdApprovalIds = [];

    beforeAll(async () => {
      const url = new URL(TEST_DATABASE_URL);

      if (url.pathname.replace(/^\/+/, '') !== 'securechain_test') {
        throw new Error(
          'Integration tests require the securechain_test database.'
        );
      }

      database = createDatabase({
        DATABASE_URL: TEST_DATABASE_URL,
        DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'false'
      });

      const result = await database.query(
        'SELECT current_database() AS name'
      );

      if (result.rows[0]?.name !== 'securechain_test') {
        throw new Error(
          'Connected database is not securechain_test.'
        );
      }

      repository = new RecordCreationApprovalRepository(database);
    });

    afterEach(async () => {
      if (!database) return;

      if (createdApprovalIds.length > 0) {
        await database.query(
          `DELETE FROM medical_record_creation_approvals
           WHERE id = ANY($1::uuid[])`,
          [createdApprovalIds]
        );
        createdApprovalIds.length = 0;
      }

      if (patientId) {
        await database.query(
          'DELETE FROM users WHERE id = $1',
          [patientId]
        );
        patientId = undefined;
      }

      if (doctorId) {
        await database.query(
          'DELETE FROM users WHERE id = $1',
          [doctorId]
        );
        doctorId = undefined;
      }
    });

    afterAll(async () => {
      if (database) await database.close();
    });

    async function createUser(role) {
      const suffix = randomUUID();

      const result = await database.query(
        `INSERT INTO users
           (name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id`,
        [
          `Approval integration ${role}`,
          `${role}-${suffix}@example.test`,
          'integration-test-only-hash',
          role
        ]
      );

      return result.rows[0].id;
    }

    async function setupUsers() {
      patientId = await createUser('patient');
      doctorId = await createUser('doctor');
    }

    async function createApproval({
      status = 'pending',
      expiresAt = new Date(Date.now() + 60 * 60 * 1000)
    } = {}) {
      const result = await database.query(
        `INSERT INTO medical_record_creation_approvals
           (patient_user_id, doctor_user_id, status, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [patientId, doctorId, status, expiresAt]
      );

      const id = result.rows[0].id;
      createdApprovalIds.push(id);
      return id;
    }

    it('allows the patient to approve and then revoke a request', async () => {
      await setupUsers();

      const approvalId = await createApproval();

      const approved = await repository.decide({
        approvalId,
        patientUserId: patientId,
        status: 'approved'
      });

      expect(approved.status).toBe('approved');

      const revoked = await repository.revoke({
        approvalId,
        patientUserId: patientId
      });

      expect(revoked.status).toBe('revoked');

      const consumed = await repository.consume({
        approvalId,
        patientUserId: patientId,
        doctorUserId: doctorId
      });

      expect(consumed).toBeNull();

      const stored = await repository.findById(approvalId);
      expect(stored.status).toBe('revoked');
    });

    it('rejects consumption by the wrong patient or doctor', async () => {
      await setupUsers();

      const approvalId = await createApproval({
        status: 'approved'
      });

      const wrongPatient = await createUser('patient');
      const wrongDoctor = await createUser('doctor');

      try {
        expect(
          await repository.consume({
            approvalId,
            patientUserId: wrongPatient,
            doctorUserId: doctorId
          })
        ).toBeNull();

        expect(
          await repository.consume({
            approvalId,
            patientUserId: patientId,
            doctorUserId: wrongDoctor
          })
        ).toBeNull();

        const valid = await repository.consume({
          approvalId,
          patientUserId: patientId,
          doctorUserId: doctorId
        });

        expect(valid.status).toBe('consumed');

        expect(
          await repository.consume({
            approvalId,
            patientUserId: patientId,
            doctorUserId: doctorId
          })
        ).toBeNull();
      } finally {
        await database.query(
          'DELETE FROM users WHERE id = ANY($1::uuid[])',
          [[wrongPatient, wrongDoctor]]
        );
      }
    });

    it('rejects consumption of expired approvals', async () => {
      await setupUsers();

      const approvalId = await createApproval({
        status: 'approved',
        expiresAt: new Date(Date.now() - 60 * 1000)
      });

      const result = await repository.consume({
        approvalId,
        patientUserId: patientId,
        doctorUserId: doctorId
      });

      expect(result).toBeNull();

      const stored = await repository.findById(approvalId);
      expect(stored.status).toBe('approved');
    });

    it('allows at most one winner when revoke and consume race', async () => {
      await setupUsers();

      const approvalId = await createApproval({
        status: 'approved'
      });

      const [revoked, consumed] = await Promise.all([
        repository.revoke({
          approvalId,
          patientUserId: patientId
        }),
        repository.consume({
          approvalId,
          patientUserId: patientId,
          doctorUserId: doctorId
        })
      ]);

      const revokeWon = revoked !== null;
      const consumeWon = consumed !== null;

      expect(Number(revokeWon) + Number(consumeWon)).toBe(1);

      const stored = await repository.findById(approvalId);

      expect(['revoked', 'consumed']).toContain(stored.status);

      if (revokeWon) {
        expect(stored.status).toBe('revoked');
      }

      if (consumeWon) {
        expect(stored.status).toBe('consumed');
      }
    });
  }
);
