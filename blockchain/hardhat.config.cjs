require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-verify');
require('dotenv').config();

const withHexPrefix = (key) => (key.startsWith('0x') ? key : `0x${key}`);

const rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
const deployerPrivateKey = process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY;
const persistentNetwork = rpcUrl && deployerPrivateKey
  ? {
      medivaultTestnet: {
        url: rpcUrl,
        accounts: [deployerPrivateKey]
      }
    }
  : {};

// Sepolia uses the cloud deployment's variable names.
const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL;
const sepoliaDeployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const sepoliaNetwork = sepoliaRpcUrl && sepoliaDeployerKey
  ? {
      sepolia: {
        url: sepoliaRpcUrl,
        chainId: 11155111,
        accounts: [withHexPrefix(sepoliaDeployerKey)]
      }
    }
  : {};

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
  	localhost: {
  	  url: 'http://127.0.0.1:8545'
  	},
  	...persistentNetwork,
  	...sepoliaNetwork
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ?? ''
  },
  sourcify: {
    enabled: false
  }
};
