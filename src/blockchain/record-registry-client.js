
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  NonceManager,
  keccak256,
  toUtf8Bytes,
  getAddress,
} from 'ethers';

const REGISTRY_ABI = [
  'error RecordNotFound(bytes32 recordId)',
  'error InvalidVersion(uint256 requested, uint256 current)',

  // Initial record registration
  'function registerRecord(bytes32 recordId, bytes32 contentHash, address patient)',
  'function getRecord(bytes32 recordId) view returns (bytes32 contentHash, address patient, address registrar, uint256 registeredAt)',
  'function verifyRecord(bytes32 recordId, bytes32 contentHash) view returns (bool)',

  // Immutable record version history
  'function registerRecordVersion(bytes32 recordId, uint256 expectedCurrentVersion, bytes32 contentHash)',
  'function getRecordVersion(bytes32 recordId, uint256 version) view returns (bytes32 contentHash, address registrar, uint256 registeredAt)',
  'function verifyRecordVersion(bytes32 recordId, uint256 version, bytes32 contentHash) view returns (bool)',
  'function versionCount(bytes32 recordId) view returns (uint256)',

  // Consent and access
  'function grantAccess(address patient, address doctor, uint256 expiresAt)',
  'function revokeAccess(address patient, address doctor)',
  'function hasAccess(address patient, address doctor) view returns (bool)',
  'function accessExpiry(address patient, address doctor) view returns (uint256)',

  // Audit events
  'function recordAuditEvent(bytes32 eventId, bytes32 eventType, address subject, address actor, uint256 expiresAt)',

  // Events
  'event RecordRegistered(bytes32 indexed recordId, bytes32 indexed contentHash, address indexed patient, address registrar, uint256 timestamp)',
  'event RecordVersionRegistered(bytes32 indexed recordId, uint256 indexed version, bytes32 indexed contentHash, address registrar, uint256 timestamp)',
];

export class RecordRegistryClient {
  constructor({ rpcUrl, chainId, contractAddress, privateKey }) {
    if (!rpcUrl || !chainId || !contractAddress || !privateKey) {
      throw new Error(
        'Blockchain configuration requires rpcUrl, chainId, contractAddress, and privateKey.'
      );
    }

    this.provider = new JsonRpcProvider(
      rpcUrl,
      chainId,
      { staticNetwork: true }
    );

    const wallet = new Wallet(privateKey, this.provider);
    this.signer = new NonceManager(wallet);

    this.contract = new Contract(
      getAddress(contractAddress),
      REGISTRY_ABI,
      this.signer
    );
  }

  deriveRecordId(recordId) {
    if (!recordId || typeof recordId !== 'string') {
      throw new Error('A valid record ID is required.');
    }

    return keccak256(
      toUtf8Bytes(`medivault-record:${recordId}`)
    );
  }

  normalizeContentHash(contentSha256) {
    if (
      typeof contentSha256 !== 'string' ||
      !/^[a-fA-F0-9]{64}$/.test(contentSha256)
    ) {
      throw new Error(
        'Content hash must be a 64-character SHA-256 hex string.'
      );
    }

    return `0x${contentSha256.toLowerCase()}`;
  }

  validateVersion(version, fieldName = 'Version') {
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error(`${fieldName} must be a positive safe integer.`);
    }
  }

  async registerRecord({
    recordId,
    contentSha256,
    patientAddress,
  }) {
    const blockchainRecordId = this.deriveRecordId(recordId);
    const contentHash = this.normalizeContentHash(contentSha256);
    const normalizedPatientAddress = getAddress(patientAddress);

    const existing = await this.getRegisteredRecord({ recordId });

    if (existing) {
      if (
        existing.contentHash.toLowerCase() !== contentHash.toLowerCase() ||
        existing.patient.toLowerCase() !==
          normalizedPatientAddress.toLowerCase()
      ) {
        throw new Error(
          'Existing blockchain registration does not match the expected hash and patient.'
        );
      }

      return {
        blockchainRecordId,
        transactionHash: null,
        registeredAt: existing.registeredAt,
        alreadyRegistered: true,
      };
    }

    const transaction = await this.contract.registerRecord(
      blockchainRecordId,
      contentHash,
      normalizedPatientAddress
    );

    const receipt = await transaction.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error('Blockchain registration transaction failed.');
    }

    return {
      blockchainRecordId,
      transactionHash: receipt.hash,
      registeredAt: new Date(),
      alreadyRegistered: false,
    };
  }

  async getRegisteredRecord({ recordId }) {
    const blockchainRecordId = this.deriveRecordId(recordId);

    try {
      const [
        contentHash,
        patient,
        registrar,
        registeredAt,
      ] = await this.contract.getRecord(blockchainRecordId);

      return {
        blockchainRecordId,
        contentHash,
        patient,
        registrar,
        registeredAt: new Date(Number(registeredAt) * 1000),
      };
    } catch (error) {
      // Only treat the specific RecordNotFound error as an absent record.
      // RPC failures and unrelated contract errors must propagate.
      let parsedError;

      try {
        const errorData =
          error?.data ??
          error?.info?.error?.data ??
          error?.error?.data ??
          '0x';

        parsedError = this.contract.interface.parseError(errorData);
      } catch {
        parsedError = null;
      }

      if (parsedError?.name === 'RecordNotFound') {
        return null;
      }

      throw error;
    }
  }

  async verifyRecord({ recordId, contentSha256 }) {
    const blockchainRecordId = this.deriveRecordId(recordId);
    const contentHash = this.normalizeContentHash(contentSha256);

    return this.contract.verifyRecord(
      blockchainRecordId,
      contentHash
    );
  }

  async getRecordVersionCount({ recordId }) {
    const blockchainRecordId = this.deriveRecordId(recordId);
    const count = await this.contract.versionCount(blockchainRecordId);

    return Number(count);
  }

  async getRecordVersion({ recordId, version }) {
    this.validateVersion(version);

    const blockchainRecordId = this.deriveRecordId(recordId);

    const [
      contentHash,
      registrar,
      registeredAt,
    ] = await this.contract.getRecordVersion(
      blockchainRecordId,
      version
    );

    return {
      blockchainRecordId,
      version,
      contentHash,
      registrar,
      registeredAt: new Date(Number(registeredAt) * 1000),
    };
  }

  async verifyRecordVersion({
    recordId,
    version,
    contentSha256,
  }) {
    this.validateVersion(version);

    const blockchainRecordId = this.deriveRecordId(recordId);
    const contentHash = this.normalizeContentHash(contentSha256);

    return this.contract.verifyRecordVersion(
      blockchainRecordId,
      version,
      contentHash
    );
  }

  async registerRecordVersion({
    recordId,
    expectedCurrentVersion,
    contentSha256,
  }) {
    this.validateVersion(
      expectedCurrentVersion,
      'Expected current version'
    );

    const blockchainRecordId = this.deriveRecordId(recordId);
    const contentHash = this.normalizeContentHash(contentSha256);

    // Early conflict check; the contract also enforces this atomically.
    const currentVersion =
      await this.contract.versionCount(blockchainRecordId);

    if (currentVersion !== BigInt(expectedCurrentVersion)) {
      throw new Error(
        `Version conflict: expected ${expectedCurrentVersion}, current version is ${currentVersion}.`
      );
    }

    const transaction = await this.contract.registerRecordVersion(
      blockchainRecordId,
      expectedCurrentVersion,
      contentHash
    );

    const receipt = await transaction.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error(
        'Blockchain version registration transaction failed.'
      );
    }

    return {
      blockchainRecordId,
      version: expectedCurrentVersion + 1,
      contentHash,
      transactionHash: receipt.hash,
      registeredAt: new Date(),
    };
  }

  async grantAccess({
    patientAddress,
    doctorAddress,
    expiresAt,
  }) {
    if (
      !(expiresAt instanceof Date) ||
      Number.isNaN(expiresAt.getTime())
    ) {
      throw new Error('A valid consent expiry date is required.');
    }

    const transaction = await this.contract.grantAccess(
      getAddress(patientAddress),
      getAddress(doctorAddress),
      Math.floor(expiresAt.getTime() / 1000)
    );

    const receipt = await transaction.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error('Blockchain access grant failed.');
    }

    return receipt.hash;
  }

  async revokeAccess({ patientAddress, doctorAddress }) {
    const transaction = await this.contract.revokeAccess(
      getAddress(patientAddress),
      getAddress(doctorAddress)
    );

    const receipt = await transaction.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error('Blockchain access revocation failed.');
    }

    return receipt.hash;
  }

  async hasAccess({ patientAddress, doctorAddress }) {
    return this.contract.hasAccess(
      getAddress(patientAddress),
      getAddress(doctorAddress)
    );
  }

  async accessExpiry({ patientAddress, doctorAddress }) {
    const expiry = await this.contract.accessExpiry(
      getAddress(patientAddress),
      getAddress(doctorAddress)
    );

    return new Date(Number(expiry) * 1000);
  }

  async recordAuditEvent({
    eventId,
    eventType,
    subjectAddress,
    actorAddress,
    expiresAt = null,
  }) {
    if (!eventId || !eventType) {
      throw new Error('Audit event ID and event type are required.');
    }

    if (
      expiresAt !== null &&
      (!(expiresAt instanceof Date) ||
        Number.isNaN(expiresAt.getTime()))
    ) {
      throw new Error('Audit expiry must be a valid Date or null.');
    }

    const transaction = await this.contract.recordAuditEvent(
      keccak256(toUtf8Bytes(`medivault-audit:${eventId}`)),
      keccak256(toUtf8Bytes(eventType)),
      getAddress(subjectAddress),
      getAddress(actorAddress),
      expiresAt ? Math.floor(expiresAt.getTime() / 1000) : 0
    );

    const receipt = await transaction.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error('Blockchain audit event transaction failed.');
    }

    return receipt.hash;
  }
}
