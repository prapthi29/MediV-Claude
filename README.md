# MediVault backend

Phase 1–6 foundation for MediVault: Express, PostgreSQL, JWT authentication, bcrypt password hashing, patient/doctor/pharmacy role authorization, patient-owned profiles, private AWS S3 medical-document storage, application-level encryption, and SHA-256 integrity verification. Blockchain features are intentionally deferred until later phases.

## Run locally

1. Copy `.env.example` to `.env` and supply a PostgreSQL connection string, a 32+ character JWT secret, AWS region, and an S3 bucket name. Configure AWS credentials through the standard AWS SDK credential-provider chain.
2. Create the `medivault` PostgreSQL database.
3. Run `npm install`, then `npm run db:migrate`.
4. Start the API with `npm run dev`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Register a patient, doctor, or pharmacy account |
| POST | `/api/v1/auth/login` | Receive a JWT |
| GET | `/api/v1/health` | Liveness check |
| GET | `/api/v1/health/me` | JWT-protected identity check |
| GET | `/api/v1/patients/me/profile` | Read the authenticated patient's profile |
| POST | `/api/v1/patients/me/profile` | Create the authenticated patient's profile |
| PATCH | `/api/v1/patients/me/profile` | Update the authenticated patient's profile |
| GET | `/api/v1/patients/me/records` | List the authenticated patient's document metadata |
| POST | `/api/v1/patients/me/records` | Upload one medical document (multipart `document` field) |
| GET | `/api/v1/patients/me/records/:recordId/download` | Download the authenticated patient's document |
| POST | `/api/v1/patients/me/records/:recordId/verify` | Verify the document's SHA-256 integrity hash |
| PUT | `/api/v1/patients/me/wallet` | Set the authenticated patient's blockchain wallet address |
| PUT | `/api/v1/account/wallet` | Set any authenticated user's blockchain wallet address |
| POST | `/api/v1/patients/me/records/:recordId/register-on-chain` | Retry blockchain registration for a failed record |
| GET | `/api/v1/consents` | List the authenticated patient's active doctor consents |
| POST | `/api/v1/consents` | Grant a doctor time-bound record access |
| DELETE | `/api/v1/consents/:doctorId` | Revoke a doctor's access |
| GET | `/api/v1/doctor/patients/:patientId/records` | List records when active consent permits |
| GET | `/api/v1/doctor/patients/:patientId/records/:recordId/download` | Download a permitted record |
| POST | `/api/v1/doctor/prescriptions` | Create an encrypted, digitally signed prescription |
| GET | `/api/v1/pharmacy/prescriptions/:prescriptionId/verify` | Verify prescription signature, content, and blockchain integrity |
| PATCH | `/api/v1/patients/me/records/:recordId/emergency-essential` | Mark or unmark a patient record as emergency-essential |
| POST | `/api/v1/emergency-access` | Doctor requests emergency access (reason and ≤1-hour expiry) |
| GET | `/api/v1/emergency-access/patients/:patientId/records` | List essential records under active emergency access |
| GET | `/api/v1/audit-events/me` | List the patient's audit trail |

Registration payload: `{ "email": "user@example.com", "password": "at-least-12-characters", "role": "patient" }`.

Patient profile endpoints are restricted to the authenticated patient. Profile creation requires `firstName`, `lastName`, and `dateOfBirth` (`YYYY-MM-DD`); contact, address, blood type, allergy, and emergency-contact fields are optional.

Medical-document endpoints are currently restricted to the owning patient. They accept PDF, JPEG, and PNG files up to 10 MB. Before upload, each document is encrypted with a newly generated AES-256-GCM data key. The data key is itself encrypted by the base64 32-byte `FILE_ENCRYPTION_KEY` master key and only its encrypted form plus IVs/authentication tags are stored in PostgreSQL. S3 receives ciphertext, uses S3-managed encryption at rest, and is never exposed through an S3 URL. Keep the master key in a secrets manager in production and rotate it using a key-versioned migration process.

Each new document is also hashed with SHA-256 before encryption. The digest is stored in PostgreSQL and is compared against the decrypted document by the verification endpoint. The digest is prepared for blockchain registration in Phase 7, but no medical data or files are placed on-chain.

## Blockchain integrity registry

The Phase 7 Solidity contract lives in [`blockchain/`](blockchain). It registers only opaque record IDs, SHA-256 hashes, patient wallet addresses, and timestamps. It never stores medical documents, filenames, patient profiles, encrypted keys, or clinical data. Phase 8 adds reproducible local and opt-in testnet deployment commands. See [the blockchain README](blockchain/README.md) for contract test and deployment commands.

## Backend blockchain integration

Phase 9 uses `ethers.js` to register each newly uploaded record's SHA-256 hash with the deployed contract. Configure `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_CHAIN_ID`, `BLOCKCHAIN_CONTRACT_ADDRESS`, and the dedicated contract-owner `BLOCKCHAIN_PRIVATE_KEY` in `.env`. Before uploading a record, a patient must set their wallet through `PUT /api/v1/patients/me/wallet` with `{ "blockchainAddress": "0x..." }`. A failed registration is retained as `failed` and can be retried with `POST /api/v1/patients/me/records/:recordId/register-on-chain`.

## Consent and doctor access

Phase 10 adds expiry-bound patient consent. A patient grants a doctor by submitting `{ "doctorId": "UUID", "expiresAt": "ISO-8601 timestamp" }` to `POST /api/v1/consents`; both accounts must have wallet addresses. The backend records the consent and mirrors the expiry or revocation to the contract. Doctors receive only the records of patients with an active local consent that also verifies on-chain; expired or revoked consent is denied.

## Prescription verification

Phase 11 accepts a doctor-only multipart `document` upload alongside `patientId`, optional `title`, and an Ethereum `signature`. The doctor signs the raw 32-byte SHA-256 digest using their registered wallet; the backend validates that signature, encrypts the document, and registers the digest on-chain. A pharmacy uses the verification endpoint and receives only validity results and non-sensitive issuance metadata—never the prescription file.

## Emergency access and audit trail

Phase 12 lets a patient mark selected records as emergency-essential. A doctor may request an emergency grant with a documented reason and expiry of at most one hour. Only those essential record metadata are returned while the grant remains active; each grant and access is recorded in the audit trail and anchored on-chain when both wallets are configured. The audit trail also records consent changes and prescription creation/verification.

Run automated API tests with `npm test`.


## Recent project updates

- User display names are stored in `users.name`. Run `npm run db:migrate` after pulling these changes so migration `016_add_user_name.sql` backfills existing accounts.
- Patients can view/download their own medical records and prescriptions, but the patient portal no longer creates medical records. Doctors upload records with a title and must have active patient-doctor consent to enumerate a patient's records; each file still requires a separate patient approval before the doctor can download it.
- Medical record and prescription uploads accept any file type up to the existing 10 MB limit. Uploaded files remain encrypted at rest and are downloaded as attachments.
- Registration requires a full name. Existing users' names are backfilled from their email prefix during migration; users can be updated to their actual names in the database if needed.


## Recent license and session improvements

- Doctor and pharmacy registration now stores the entered professional license number.
- Patients grant doctor access using the doctor's medical license number, not a user UUID. The backend matches it against an active, approved doctor account before creating consent. This is an internal account/license-number check; it does not query an external medical council registry.
- Patient records and dashboard summaries refresh automatically while the tab is visible, and refresh when returning to the tab.
- Expired authentication sessions are cleared and redirected to sign-in with a clear message instead of leaving portal requests in a broken state.
- Apply the new migration with `npm run db:migrate` before testing these changes.


## Record update approvals and immutable versions

The doctor update workflow is exposed through the existing authenticated medical-record routers:

- Doctor requests a record-specific update approval: `POST /api/v1/doctor/patients/:patientId/records/:recordId/update-requests`.
- Patient lists requests: `GET /api/v1/patients/me/record-update-requests`.
- Patient approves/rejects/revokes: `POST /api/v1/patients/me/record-update-requests/:requestId/approve|reject|revoke`.
- Doctor submits an approved new version as multipart field `document` and `approvalId`: `POST /api/v1/doctor/patients/:patientId/records/:recordId/versions`.
- Patient lists/downloads historical versions: `GET /api/v1/patients/me/records/:recordId/versions` and `GET /api/v1/patients/me/records/:recordId/versions/:version/download`.
- Doctor may list/download versions only with consent and the record-specific access approval.

The backend atomically consumes an approval bound to the patient, doctor, and record; the contract appends a hash-only version using the expected-current-version guard. Files and encryption metadata remain off-chain. The contract's owner key is a trusted backend signer: the Solidity contract does not independently verify database patient approvals. Keep that key protected and never expose it to the frontend.

### Safe migration and deployment sequence

1. Configure a separate `securechain_test` database and run `npm run db:migrate` with `DATABASE_URL` temporarily set to that test URL.
2. Run backend tests (`npm test`) and blockchain tests (`cd blockchain; npm install; npm test`).
3. Deploy the contract to a local Hardhat network or chosen testnet only after review. The deploy script prints address, owner, chain ID, transaction hash, and block number.
4. Configure the backend `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_CHAIN_ID`, `BLOCKCHAIN_CONTRACT_ADDRESS`, and `BLOCKCHAIN_PRIVATE_KEY`. The signer must be the contract owner.
5. Test initial registration, patient approval, update, historical verification, stale-version rejection, and failure reconciliation on the test network.
6. Back up production data and deliberately schedule production migrations only after test sign-off. Never run test migrations against `securechain`.

Migrations `025` and `026` add update approvals and backfill version 1 for existing records with complete integrity/encryption metadata. Records missing that metadata are not fabricated; they require a separate reconciliation decision.
