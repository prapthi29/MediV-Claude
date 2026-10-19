# MediVault integrity contract

`MediVaultRecordRegistry` registers a unique opaque record identifier, the record's SHA-256 digest, a patient wallet address, registrar address, and timestamp. It stores no medical files, filenames, clinical metadata, encrypted data keys, or personal profile data.

## Commands

Run these from `blockchain/`:

```sh
npm install
npm test
npm run deploy:local
```

`deploy:local` targets Hardhat's ephemeral local network and prints a deployment manifest (address, chain ID, transaction hash, block number, owner).

## Persistent testnet deployment

1. Copy `.env.example` to `.env` inside this `blockchain/` directory.
2. Set `BLOCKCHAIN_RPC_URL` and `BLOCKCHAIN_DEPLOYER_PRIVATE_KEY` for a dedicated low-balance deployer wallet.
3. Run `npm run deploy:testnet`.

The manifest printed by the script contains the contract address required by Phase 9's backend `ethers.js` integration. Never commit the `.env` file or reuse a personal wallet key.


## Versioning and backend trust boundary

The contract records the initial record hash as version 1 and supports append-only `registerRecordVersion(recordId, expectedCurrentVersion, contentHash)`. The expected-current-version argument prevents stale concurrent writes, and `getRecordVersion` / `verifyRecordVersion` support historical integrity checks. Only the contract owner can write registry entries; the backend is responsible for enforcing database patient approvals before calling the owner-only version method. This means the backend signer is trusted infrastructure, not a key to expose to patients or doctors.

Before deployment, test the exact compiled artifact and verify the printed owner matches the backend signer address. After deployment, configure the backend with that contract address, the same chain ID/RPC, and the owner signer key. Never reuse a funded personal wallet or commit a `.env` file.
