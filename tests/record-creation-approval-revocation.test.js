
import { describe, expect, it, vi } from 'vitest';
import { RecordCreationApprovalRepository } from '../src/models/record-creation-approval-repository.js';

const approvalId = '20000000-0000-4000-8000-000000000002';
const patientId = '10000000-0000-4000-8000-000000000001';
const otherPatientId = '30000000-0000-4000-8000-000000000003';

function makeRepository(returnedRows = []) {
  const database = {
    query: vi.fn().mockResolvedValue({ rows: returnedRows })
  };

  return {
    repository: new RecordCreationApprovalRepository(database),
    database
  };
}

describe('record creation approval revocation', () => {
  it('revokes an approved request belonging to the patient', async () => {
    const revokedApproval = {
      id: approvalId,
      patient_user_id: patientId,
      doctor_user_id: 'doctor-1',
      status: 'revoked'
    };

    const { repository, database } = makeRepository([revokedApproval]);

    const result = await repository.revoke({
      approvalId,
      patientUserId: patientId
    });

    expect(result).toEqual(revokedApproval);
    expect(database.query).toHaveBeenCalledOnce();

    const [sql, params] = database.query.mock.calls[0];

    expect(sql).toContain("SET status = 'revoked'");
    expect(sql).toContain('patient_user_id = $2');
    expect(sql).toContain("status = 'approved'");
    expect(sql).toContain('expires_at > NOW()');
    expect(params).toEqual([approvalId, patientId]);
  });

  it('returns null when the request does not belong to the patient', async () => {
    const { repository, database } = makeRepository([]);

    const result = await repository.revoke({
      approvalId,
      patientUserId: otherPatientId
    });

    expect(result).toBeNull();

    const [sql, params] = database.query.mock.calls[0];

    expect(sql).toContain('patient_user_id = $2');
    expect(params).toEqual([approvalId, otherPatientId]);
  });

  it('does not revoke an already consumed or otherwise ineligible request', async () => {
    const { repository, database } = makeRepository([]);

    const result = await repository.revoke({
      approvalId,
      patientUserId: patientId
    });

    expect(result).toBeNull();

    const [sql] = database.query.mock.calls[0];

    expect(sql).toContain("status = 'approved'");
    expect(sql).toContain('expires_at > NOW()');
  });

  it('consumes only an approved, unexpired request for the matching patient and doctor', async () => {
    const { repository, database } = makeRepository([]);

    const result = await repository.consume({
      approvalId,
      patientUserId: patientId,
      doctorUserId: 'doctor-1'
    });

    expect(result).toBeNull();

    const [sql, params] = database.query.mock.calls[0];

    expect(sql).toContain("SET status = 'consumed'");
    expect(sql).toContain("status = 'approved'");
    expect(sql).toContain('expires_at > NOW()');
    expect(sql).toContain('patient_user_id = $2');
    expect(sql).toContain('doctor_user_id = $3');
    expect(params).toEqual([approvalId, patientId, 'doctor-1']);
  });
});
