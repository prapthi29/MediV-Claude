const fs = require('node:fs');
const path = require('node:path');
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

  // Keep a public record of persistent deployments (no secrets) for the backend config.
  if (!['hardhat', 'localhost'].includes(hre.network.name)) {
    const directory = path.join(__dirname, '..', 'deployments');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `${hre.network.name}.json`);
    fs.writeFileSync(file, `${JSON.stringify(deployment, null, 2)}\n`);
    console.log(`Saved ${path.relative(process.cwd(), file)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
