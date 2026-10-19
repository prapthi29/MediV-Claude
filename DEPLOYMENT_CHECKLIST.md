# MediVault blockchain/versioning deployment checklist

## Architecture and trust boundary

- Medical documents and encryption metadata remain off-chain.
- `MediVaultRecordRegistry` stores opaque record IDs, content hashes, patient wallet addresses, timestamps, and append-only version hashes.
- Initial registration creates version 1. Updates use `registerRecordVersion(recordId, expectedCurrentVersion, contentHash)`; the contract rejects stale versions and retains historical hashes.
- Patient approvals are enforced by the backend using record-, patient-, and doctor-bound, expiring, one-use database approvals. The registry write key is a trusted backend owner key; Solidity does not independently verify the database approval. Never expose that key to frontend code.

## Test-first rollout

1. Copy `.env.example` to `.env` and replace all placeholder values with development-only secrets. The example database is `securechain_test` intentionally.
2. Install backend dependencies with `npm install`; install chain dependencies from `blockchain/` with `npm install`.
3. Run `npm test` at the project root. The added `tests/record-update-workflow.test.js` covers approval binding, one-use consumption, version append, and version-count mismatch.
4. From `blockchain/`, run `npm test`. If a fresh compiler download is unavailable but the checked-in generated artifact is present, `npx hardhat test --no-compile` runs the existing contract tests against that artifact; use the normal `npm test` before deployment when compiler downloads are available.
5. Apply migrations only with `DATABASE_URL` temporarily pointing at `securechain_test`. Migrations 025 and 026 create update approvals and backfill v1 for existing records with complete hash/encryption metadata.
6. Verify the backend owner address matches the deployed contract's `owner()` result. Configure backend `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_CHAIN_ID`, `BLOCKCHAIN_CONTRACT_ADDRESS`, and `BLOCKCHAIN_PRIVATE_KEY` accordingly.
7. On a test network, verify: patient cannot upload; doctor cannot create/update without active account, consent and approval; approval cannot be reused or applied to another record; historical versions remain downloadable; stale version and chain/database mismatch are rejected; uncertain transaction outcomes require reconciliation.
8. Back up production DB and storage, review migrations and deployment manifest, and explicitly approve a production rollout. Never point test migrations at the production `securechain` database.

## New endpoints

- Doctor requests update approval: `POST /api/v1/doctor/patients/:patientId/records/:recordId/update-requests`.
- Patient lists requests: `GET /api/v1/patients/me/record-update-requests`.
- Patient approves/rejects/revokes: `POST /api/v1/patients/me/record-update-requests/:requestId/approve|reject|revoke`.
- Doctor submits multipart `document` plus `approvalId`: `POST /api/v1/doctor/patients/:patientId/records/:recordId/versions`.
- Patient lists/downloads versions: `GET /api/v1/patients/me/records/:recordId/versions` and `GET /api/v1/patients/me/records/:recordId/versions/:version/download`.
- Doctor lists/downloads versions only with consent and record-specific access approval.
