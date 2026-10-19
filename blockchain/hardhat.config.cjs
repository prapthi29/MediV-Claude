require('@nomicfoundation/hardhat-ethers');
require('dotenv').config();

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
  	...persistentNetwork
  }
};
