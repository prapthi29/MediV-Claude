// Verifies the contract recorded in deployments/sepolia.json on Etherscan.
const { execFileSync } = require('node:child_process');
const deployment = require('../deployments/sepolia.json');

if (!process.env.ETHERSCAN_API_KEY) {
  console.error('ETHERSCAN_API_KEY is required to verify on Etherscan.');
  process.exit(1);
}

execFileSync(
  'npx',
  ['hardhat', 'verify', '--network', 'sepolia', deployment.address],
  { stdio: 'inherit' }
);
