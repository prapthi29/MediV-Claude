const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('deployment', function () {
  it('deploys the registry with the deployer as owner', async function () {
    const [deployer] = await ethers.getSigners();
    const registry = await ethers.deployContract('MediVaultRecordRegistry');
    await registry.waitForDeployment();
    expect(await registry.getAddress()).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(await registry.owner()).to.equal(deployer.address);
  });
});
