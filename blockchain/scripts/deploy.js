const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const registry = await hre.ethers.deployContract('MediVaultRecordRegistry');
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const receipt = await registry.deploymentTransaction().wait();
  const deployment = {
    contract: 'MediVaultRecordRegistry',
    address,
    owner: await registry.owner(),
    deployer: deployer.address,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber
  };
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
