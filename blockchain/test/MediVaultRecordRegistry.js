
const { expect } = require('chai');
const { ethers } = require('hardhat');

async function expectCustomError(promise, errorName) {
  try {
    await promise;
    expect.fail(`Expected ${errorName}`);
  } catch (error) {
    expect(error.message).to.include(errorName);
  }
}

describe('MediVaultRecordRegistry', function () {
  async function deployRegistry() {
    const [owner, patient, unauthorized] = await ethers.getSigners();
    const registry = await ethers.deployContract('MediVaultRecordRegistry');
    return { registry, owner, patient, unauthorized };
  }

  it('registers only opaque IDs, integrity hashes, and non-sensitive metadata', async function () {
    const { registry, owner, patient } = await deployRegistry();
    const recordId = ethers.id('medivault-record-opaque-1');
    const contentHash = ethers.sha256(ethers.toUtf8Bytes('sha256-digest-input'));

    const transaction = await registry.registerRecord(
      recordId, contentHash, patient.address
    );
    const receipt = await transaction.wait();

    expect(receipt.status).to.equal(1);
    expect(await registry.verifyRecord(recordId, contentHash)).to.equal(true);
    expect(await registry.verifyRecord(recordId, ethers.ZeroHash)).to.equal(false);

    const record = await registry.getRecord(recordId);
    expect(record.contentHash).to.equal(contentHash);
    expect(record.patient).to.equal(patient.address);
    expect(record.registrar).to.equal(owner.address);
    expect(Number(record.registeredAt)).to.be.greaterThan(0);
    expect(await registry.versionCount(recordId)).to.equal(1n);
  });

  it('prevents unauthorized and duplicate registrations', async function () {
    const { registry, patient, unauthorized } = await deployRegistry();
    const recordId = ethers.id('medivault-record-opaque-2');
    const contentHash = ethers.sha256(ethers.toUtf8Bytes('digest'));

    await expectCustomError(
      registry.connect(unauthorized).registerRecord(
        recordId, contentHash, patient.address
      ),
      'Unauthorized'
    );

    await registry.registerRecord(recordId, contentHash, patient.address);

    await expectCustomError(
      registry.registerRecord(recordId, contentHash, patient.address),
      'RecordAlreadyRegistered'
    );
  });

  it('grants expiring access and allows the owner to revoke it', async function () {
    const { registry, patient, unauthorized } = await deployRegistry();
    const latest = await ethers.provider.getBlock('latest');
    const expiry = BigInt(latest.timestamp + 3600);

    await registry.grantAccess(patient.address, unauthorized.address, expiry);
    expect(await registry.hasAccess(patient.address, unauthorized.address)).to.equal(true);
    expect(await registry.accessExpiry(patient.address, unauthorized.address)).to.equal(expiry);

    await registry.revokeAccess(patient.address, unauthorized.address);
    expect(await registry.hasAccess(patient.address, unauthorized.address)).to.equal(false);
  });

  it('prevents non-owners from granting access', async function () {
    const { registry, patient, unauthorized } = await deployRegistry();
    const latest = await ethers.provider.getBlock('latest');

    await expectCustomError(
      registry.connect(unauthorized).grantAccess(
        patient.address, unauthorized.address, BigInt(latest.timestamp + 3600)
      ),
      'Unauthorized'
    );
  });

  it('records a non-sensitive audit event for controlled emergency access', async function () {
    const { registry, patient, unauthorized } = await deployRegistry();
    const eventId = ethers.id('emergency-audit-event-1');
    const eventType = ethers.id('emergency_access_granted');

    const transaction = await registry.recordAuditEvent(
      eventId, eventType, patient.address, unauthorized.address, 0
    );
    const receipt = await transaction.wait();

    expect(receipt.status).to.equal(1);
  });

  it('preserves historical hashes when a new record version is registered', async function () {
    const { registry, patient } = await deployRegistry();
    const recordId = ethers.id('versioned-medical-record');
    const hashV1 = ethers.sha256(ethers.toUtf8Bytes('record version one'));
    const hashV2 = ethers.sha256(ethers.toUtf8Bytes('record version two'));

    await registry.registerRecord(recordId, hashV1, patient.address);

    await registry.registerRecordVersion(recordId, 1, hashV2);

    expect(await registry.versionCount(recordId)).to.equal(2n);

    const version1 = await registry.getRecordVersion(recordId, 1);
    const version2 = await registry.getRecordVersion(recordId, 2);

    expect(version1.contentHash).to.equal(hashV1);
    expect(version2.contentHash).to.equal(hashV2);

    expect(await registry.verifyRecordVersion(recordId, 1, hashV1)).to.equal(true);
    expect(await registry.verifyRecordVersion(recordId, 2, hashV2)).to.equal(true);
    expect(await registry.verifyRecordVersion(recordId, 1, hashV2)).to.equal(false);

    // Legacy verification checks the latest version.
    expect(await registry.verifyRecord(recordId, hashV1)).to.equal(false);
    expect(await registry.verifyRecord(recordId, hashV2)).to.equal(true);
  });

  it('rejects stale expected versions and leaves history unchanged', async function () {
    const { registry, patient } = await deployRegistry();
    const recordId = ethers.id('stale-version-record');
    const hashV1 = ethers.sha256(ethers.toUtf8Bytes('version one'));
    const hashV2 = ethers.sha256(ethers.toUtf8Bytes('version two'));
    const hashV3 = ethers.sha256(ethers.toUtf8Bytes('version three'));

    await registry.registerRecord(recordId, hashV1, patient.address);
    await registry.registerRecordVersion(recordId, 1, hashV2);

    await expectCustomError(
      registry.registerRecordVersion(recordId, 1, hashV3),
      'InvalidVersion'
    );

    expect(await registry.versionCount(recordId)).to.equal(2n);
    expect(await registry.verifyRecordVersion(recordId, 1, hashV1)).to.equal(true);
    expect(await registry.verifyRecordVersion(recordId, 2, hashV2)).to.equal(true);
  });

  it('restricts version registration to the owner', async function () {
    const { registry, patient, unauthorized } = await deployRegistry();
    const recordId = ethers.id('unauthorized-version-record');
    const hashV1 = ethers.sha256(ethers.toUtf8Bytes('version one'));
    const hashV2 = ethers.sha256(ethers.toUtf8Bytes('version two'));

    await registry.registerRecord(recordId, hashV1, patient.address);

    await expectCustomError(
      registry.connect(unauthorized).registerRecordVersion(recordId, 1, hashV2),
      'Unauthorized'
    );

    expect(await registry.versionCount(recordId)).to.equal(1n);
  });
});
