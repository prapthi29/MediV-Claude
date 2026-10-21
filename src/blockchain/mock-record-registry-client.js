
import crypto from 'node:crypto';

// Drop-in replacement for RecordRegistryClient.
// No RPC, deployed contract, or wallet funding is required.
// State is stored in memory for the lifetime of the process.
// Suitable for local development and testing only.
export class MockRecordRegistryClient {
  constructor() {
    this.grants = new Map(); // `${patientAddress}:${doctorAddress}` -> expiresAt
    this.records = new Map(); // recordId -> record registration details
    this.prescriptions = new Map(); // prescriptionId -> prescription details
    this.isMock = true; // state is lost on restart, so old anchors can't be verified

    console.log('🔷 Mock Blockchain Client initialized');
  }

  // Generates a mock blockchain record identifier.
  // This is not a transaction hash, so its format is unchanged.
  deriveRecordId(recordId) {
    return `0xmock${crypto
      .createHash('sha256')
      .update(String(recordId))
      .digest('hex')
      .slice(0, 56)}`;
  }

  // Registers a medical record in the mock blockchain.
  async registerRecord({
    recordId,
    contentSha256,
    patientAddress
  }) {
    console.log(`🔷 Mock: Registering record ${recordId}`);

    const txId = `0x${crypto.randomBytes(32).toString('hex')}`;

    const existing = this.records.get(recordId);
    if (existing) {
      if (existing.contentSha256 !== contentSha256 || existing.patientAddress !== patientAddress) {
        throw new Error('Existing mock blockchain registration conflicts with expected hash or patient.');
      }
      return {
        blockchainRecordId: this.deriveRecordId(recordId),
        transactionHash: null,
        registeredAt: new Date(existing.timestamp),
        alreadyRegistered: true
      };
    }

    this.records.set(recordId, {
      recordId, contentSha256, patientAddress, txId,
      timestamp: new Date().toISOString(), status: 'registered',
      versions: [{ version: 1, contentSha256, txId, timestamp: new Date().toISOString() }]
    });

    return {
      blockchainRecordId: this.deriveRecordId(recordId),
      transactionHash: txId,
      registeredAt: new Date(),
      alreadyRegistered: false
    };
  }

  async getRegisteredRecord({ recordId }) {
    const record = this.records.get(recordId);
    if (!record) return null;
    return {
      blockchainRecordId: this.deriveRecordId(recordId),
      contentHash: `0x${String(record.contentSha256).replace(/^0x/i, '')}`,
      patient: record.patientAddress,
      registeredAt: new Date(record.timestamp)
    };
  }

  async anchorDigest({ anchorId, sha256 }) {
    return this.registerRecord({
      recordId: anchorId,
      contentSha256: sha256,
      patientAddress: 'medivault-platform'
    });
  }

  async getRecordVersionCount({ recordId }) {
    return this.records.get(recordId)?.versions?.length ?? 0;
  }

  async getRecordVersion({ recordId, version }) {
    const item = this.records.get(recordId)?.versions?.[version - 1];
    if (!item) throw new Error('Mock record version not found.');
    return {
      blockchainRecordId: this.deriveRecordId(recordId),
      version,
      contentHash: `0x${String(item.contentSha256).replace(/^0x/i, '')}`,
      registrar: '0x0000000000000000000000000000000000000001',
      registeredAt: new Date(item.timestamp)
    };
  }

  async verifyRecordVersion({ recordId, version, contentSha256 }) {
    const item = this.records.get(recordId)?.versions?.[version - 1];
    return Boolean(item && item.contentSha256.toLowerCase() === contentSha256.toLowerCase());
  }

  async registerRecordVersion({ recordId, expectedCurrentVersion, contentSha256 }) {
    const record = this.records.get(recordId);
    if (!record) throw new Error('Mock record not found.');
    const current = record.versions.length;
    if (current !== expectedCurrentVersion) {
      throw new Error(`Version conflict: expected ${expectedCurrentVersion}, current version is ${current}.`);
    }
    const txId = `0x${crypto.randomBytes(32).toString('hex')}`;
    const item = { version: current + 1, contentSha256, txId, timestamp: new Date().toISOString() };
    record.versions.push(item);
    record.contentSha256 = contentSha256;
    record.txId = txId;
    record.timestamp = item.timestamp;
    return {
      blockchainRecordId: this.deriveRecordId(recordId),
      version: item.version,
      contentHash: `0x${String(contentSha256).replace(/^0x/i, '')}`,
      transactionHash: txId,
      registeredAt: new Date(item.timestamp)
    };
  }

  // Verifies a medical record against its stored hash.
  async verifyRecord({ recordId, contentSha256 }) {
    const record = this.records.get(recordId);

    if (!record) {
      return {
        valid: false,
        reason: 'Record not found'
      };
    }

    const valid = record.contentSha256 === contentSha256;

    return {
      valid,
      txId: record.txId,
      timestamp: record.timestamp
    };
  }

  // Grants temporary access in the mock blockchain.
  async grantAccess({
    patientAddress,
    doctorAddress,
    expiresAt
  }) {
    console.log(
      `🔷 Mock: Granting access from ${patientAddress} to ${doctorAddress}`
    );

    this.grants.set(
      `${patientAddress}:${doctorAddress}`,
      expiresAt
    );

    return `0x${crypto.randomBytes(32).toString('hex')}`;
  }

  // Revokes access in the mock blockchain.
  async revokeAccess({
    patientAddress,
    doctorAddress
  }) {
    console.log(
      `🔷 Mock: Revoking access from ${patientAddress} to ${doctorAddress}`
    );

    this.grants.delete(
      `${patientAddress}:${doctorAddress}`
    );

    return `0x${crypto.randomBytes(32).toString('hex')}`;
  }

  // Checks whether mock access is still valid.
  async hasAccess({
    patientAddress,
    doctorAddress
  }) {
    const expiresAt = this.grants.get(
      `${patientAddress}:${doctorAddress}`
    );

    return !!expiresAt && new Date(expiresAt) > new Date();
  }

  // Records a mock audit event and returns its transaction hash.
  async recordAuditEvent() {
    return `0x${crypto.randomBytes(32).toString('hex')}`;
  }

  // Grants consent in the mock blockchain.
  async grantConsent({
    patientId,
    doctorId,
    scope
  }) {
    console.log(
      `🔷 Mock: Granting consent from ${patientId} to ${doctorId}`
    );

    const txId = `0x${crypto.randomBytes(32).toString('hex')}`;

    return {
      txId,
      consentId: `consent_${crypto.randomUUID()}`
    };
  }

  // Revokes consent in the mock blockchain.
  async revokeConsent({
    patientId,
    doctorId
  }) {
    console.log(
      `🔷 Mock: Revoking consent from ${patientId} to ${doctorId}`
    );

    return {
      txId: `0x${crypto.randomBytes(32).toString('hex')}`
    };
  }

  // Issues a prescription in the mock blockchain.
  async issuePrescription({
    prescriptionId,
    hash,
    doctorAddress
  }) {
    console.log(
      `🔷 Mock: Issuing prescription ${prescriptionId}`
    );

    const txId = `0x${crypto.randomBytes(32).toString('hex')}`;

    this.prescriptions.set(prescriptionId, {
      prescriptionId,
      hash,
      doctorAddress,
      txId,
      timestamp: new Date().toISOString(),
      status: 'valid'
    });

    return { txId };
  }

  // Verifies a prescription in the mock blockchain.
  async verifyPrescription({ prescriptionId }) {
    const prescription = this.prescriptions.get(prescriptionId);

    if (!prescription) {
      return {
        valid: false,
        status: 'not_found'
      };
    }

    return {
      valid: true,
      status: prescription.status,
      txId: prescription.txId,
      timestamp: prescription.timestamp
    };
  }
}