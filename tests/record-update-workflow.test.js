import { describe, expect, it } from 'vitest';
import { MedicalRecordService } from '../src/services/medical-record-service.js';
import { FileEncryptionService } from '../src/encryption/file-encryption-service.js';

const patientId = '10000000-0000-4000-8000-000000000001';
const doctorId = '20000000-0000-4000-8000-000000000002';
const recordId = '30000000-0000-4000-8000-000000000003';
const approvalId = '40000000-0000-4000-8000-000000000004';
const sha = (value) => Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);

function makeHarness({ approvalAvailable = true, chainCount = 1 } = {}) {
  const record = {
    id: recordId, patient_user_id: patientId, uploaded_by_user_id: doctorId,
    storage_key: 'records/v1.pdf', original_filename: 'v1.pdf', content_type: 'application/pdf',
    size_bytes: 3, title: 'Clinical note', category: 'clinical-note', content_sha256: sha('v1'),
    encryption_algorithm: 'AES-256-GCM', encrypted_data_key: Buffer.alloc(32),
    data_key_iv: Buffer.alloc(12), data_key_auth_tag: Buffer.alloc(16),
    file_iv: Buffer.alloc(12), file_auth_tag: Buffer.alloc(16), blockchain_status: 'registered'
  };
  const versions = [{ id: 'v1', medical_record_id: recordId, version_number: 1, uploaded_by_user_id: doctorId,
    ...record, blockchain_status: 'registered' }];
  let approvalConsumed = false;
  const medicalRecordRepository = {
    findByIdForPatient: async (id, pId) => id === recordId && pId === patientId ? record : null,
    promoteVersion: async (_id, versionNumber, registration) => {
      const v = versions.find((x) => x.version_number === versionNumber);
      Object.assign(record, {
        storage_key: v.storage_key, original_filename: v.original_filename, content_type: v.content_type,
        size_bytes: v.size_bytes, title: v.title, category: v.category, content_sha256: v.content_sha256,
        encryption_algorithm: v.encryption_algorithm, encrypted_data_key: v.encrypted_data_key,
        data_key_iv: v.data_key_iv, data_key_auth_tag: v.data_key_auth_tag, file_iv: v.file_iv,
        file_auth_tag: v.file_auth_tag, blockchain_status: 'registered', blockchain_tx_hash: registration.transactionHash
      });
      return record;
    }
  };
  const medicalRecordVersionRepository = {
    findLatest: async () => versions.slice().sort((a, b) => b.version_number - a.version_number)[0] ?? null,
    create: async ({ medicalRecordId, versionNumber, uploadedByUserId, record: r, blockchainStatus }) => {
      const v = { id: `v${versionNumber}`, medical_record_id: medicalRecordId, version_number: versionNumber,
        uploaded_by_user_id: uploadedByUserId, ...r, blockchain_status: blockchainStatus };
      versions.push(v); return v;
    },
    markBlockchainRegistered: async (id, data) => {
      const v = versions.find((x) => x.id === id); Object.assign(v, { blockchain_status: 'registered', blockchain_tx_hash: data.transactionHash }); return v;
    },
    markBlockchainFailed: async (id) => { const v = versions.find((x) => x.id === id); if (v) v.blockchain_status = 'failed'; return v; },
    deletePending: async (id) => { const i = versions.findIndex((x) => x.id === id); if (i >= 0) versions.splice(i, 1); },
    listForRecord: async () => versions.map(({ id, version_number, content_sha256, blockchain_status }) => ({ id, version_number, content_sha256, blockchain_status }))
  };
  const recordUpdateApprovalRepository = {
    create: async (input) => ({ id: approvalId, status: 'pending', ...input }),
    decide: async ({ approvalId: id, patientUserId, status }) => id === approvalId && patientUserId === patientId ? ({ id, status }) : null,
    revoke: async () => null,
    listForPatient: async () => [],
    consume: async (input) => {
      if (!approvalAvailable || approvalConsumed || input.approvalId !== approvalId || input.patientUserId !== patientId || input.doctorUserId !== doctorId || input.medicalRecordId !== recordId) return null;
      approvalConsumed = true; return { id: approvalId, status: 'consumed' };
    }
  };
  const objects = new Map([['records/v1.pdf', Buffer.from('v1-ciphertext')]]);
  const medicalStorage = {
    put: async ({ key, body }) => objects.set(key, Buffer.from(body)),
    get: async ({ key }) => ({ body: objects.get(key) }),
    delete: async ({ key }) => objects.delete(key)
  };
  let versionCount = chainCount;
  const recordRegistryClient = {
    getRecordVersionCount: async () => versionCount,
    registerRecordVersion: async ({ recordId: id, expectedCurrentVersion, contentSha256 }) => {
      if (expectedCurrentVersion !== versionCount) throw new Error('Version conflict');
      versionCount += 1;
      return { version: versionCount, contentHash: `0x${contentSha256}`, transactionHash: `0x${String(versionCount).padStart(64, '0')}`, registeredAt: new Date() };
    },
    getRecordVersion: async ({ version }) => ({ contentHash: `0x${versions[version - 1].content_sha256}`, registeredAt: new Date() })
  };
  const service = new MedicalRecordService({
    medicalRecordRepository, recordUpdateApprovalRepository, medicalRecordVersionRepository,
    recordAccessRequestRepository: { hasApproved: async () => true },
    medicalStorage, fileEncryptionService: new FileEncryptionService({ masterKey: Buffer.alloc(32, 7) }),
    userRepository: { findById: async (id) => id === doctorId ? { id, role: 'doctor', status: 'active' } : { id: patientId, role: 'patient' } },
    recordRegistryClient, consentService: { assertDoctorAccess: async () => true }
  });
  return { service, versions, record, recordUpdateApprovalRepository, get approvalConsumed() { return approvalConsumed; }, get versionCount() { return versionCount; } };
}

describe('patient-approved medical record updates', () => {
  it('creates a record-specific update request after consent and chain-version checks', async () => {
    const h = makeHarness();
    const approval = await h.service.requestRecordUpdate(doctorId, patientId, recordId);
    expect(approval.id).toBe(approvalId);
    expect(approval.medicalRecordId).toBe(recordId);
  });

  it('appends a new immutable version only after consuming the exact patient approval', async () => {
    const h = makeHarness();
    const updated = await h.service.updateRecordForDoctor(doctorId, patientId, recordId,
      { originalname: 'v2.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('v2') },
      { title: 'Updated note' }, approvalId);
    expect(h.approvalConsumed).toBe(true);
    expect(h.versionCount).toBe(2);
    expect(h.versions).toHaveLength(2);
    expect(h.versions[0].content_sha256).toBe(sha('v1'));
    expect(h.versions[1].blockchain_status).toBe('registered');
    expect(updated.originalFilename).toBe('v2.pdf');
  });

  it('rejects a missing, wrong, or already consumed approval', async () => {
    const h = makeHarness({ approvalAvailable: false });
    await expect(h.service.updateRecordForDoctor(doctorId, patientId, recordId,
      { originalname: 'v2.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('v2') },
      {}, approvalId)).rejects.toMatchObject({ code: 'RECORD_UPDATE_APPROVAL_INVALID' });
  });

  it('blocks updates when database and on-chain version counts disagree', async () => {
    const h = makeHarness({ chainCount: 2 });
    await expect(h.service.updateRecordForDoctor(doctorId, patientId, recordId,
      { originalname: 'v2.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('v2') },
      {}, approvalId)).rejects.toMatchObject({ code: 'VERSION_COUNT_MISMATCH' });
    expect(h.approvalConsumed).toBe(false);
  });
});
