# MediVault

Blockchain-backed electronic health records: Express + PostgreSQL API, Next.js frontend, and a Solidity integrity registry. Files are encrypted with AES-256-GCM and stored locally or in a private Supabase Storage bucket; SHA-256 hashes and consent expiries are anchored on-chain.

## Run locally

Requires Node 20+ and PostgreSQL 14+. Use four terminals.

1. **Install dependencies**

   ```bash
   npm install
   (cd frontend && npm install)
   (cd blockchain && npm install)
   ```

2. **Database** – create a database (for example `medivault_dev`), copy `.env.example` to `.env`, and set `DATABASE_URL` to it. Generate the secrets:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # JWT_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # FILE_ENCRYPTION_KEY
   npm run db:migrate
   ```

3. **Local blockchain** (terminal 1, keep running):

   ```bash
   cd blockchain && npx hardhat node
   ```

   In another terminal, deploy the contract:

   ```bash
   cd blockchain && npx hardhat run scripts/deploy.js --network localhost
   ```

   Put the printed `address` in `BLOCKCHAIN_CONTRACT_ADDRESS`. Set `BLOCKCHAIN_PRIVATE_KEY` to Hardhat's Account #0 private key (printed when the node starts; it is the contract owner). Keep `BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545` and `BLOCKCHAIN_CHAIN_ID=31337`.

   The Hardhat node keeps its state in memory. After restarting it, redeploy, update `BLOCKCHAIN_CONTRACT_ADDRESS`, and expect existing consents to need re-granting. Leaving the address as `0x000…0` uses an in-memory mock chain instead.

4. **Admin account**

   ```bash
   npm run create-admin -- admin@example.com 'Choose#AStrongPass1'
   ```

5. **Start the API** (terminal 2): `npm run dev` (port 3001).

6. **Start the frontend** (terminal 3): `cd frontend && npm run dev`, then open http://localhost:3000.

### Tests

```bash
npm test                                   # backend unit/API tests
TEST_DATABASE_URL=postgres://... npm test  # also runs the database integration tests (use a throwaway database with migrations applied)
cd blockchain && npm test                  # contract tests
```

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

Medical-document endpoints are currently restricted to the owning patient. They accept PDF, JPEG, and PNG files up to 10 MB. Before upload, each document is encrypted with a newly generated AES-256-GCM data key. The data key is itself encrypted by the base64 32-byte `FILE_ENCRYPTION_KEY` master key and only its encrypted form plus IVs/authentication tags are stored in PostgreSQL. Storage (local disk or Supabase) receives only ciphertext and is never exposed through a public URL. Keep the master key in a secrets manager in production and rotate it using a key-versioned migration process.

Each new document is also hashed with SHA-256 before encryption. The digest is stored in PostgreSQL and is compared against the decrypted document by the verification endpoint. The digest is prepared for blockchain registration in Phase 7, but no medical data or files are placed on-chain.

## Blockchain integrity registry

The Phase 7 Solidity contract lives in [`blockchain/`](blockchain). It registers only opaque record IDs, SHA-256 hashes, patient wallet addresses, and timestamps. It never stores medical documents, filenames, patient profiles, encrypted keys, or clinical data. Phase 8 adds reproducible local and opt-in testnet deployment commands. See [the blockchain README](blockchain/README.md) for contract test and deployment commands.

## Backend blockchain integration

Phase 9 uses `ethers.js` to register each newly uploaded record's SHA-256 hash with the deployed contract. Configure `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_CHAIN_ID`, `BLOCKCHAIN_CONTRACT_ADDRESS`, and the dedicated contract-owner `BLOCKCHAIN_PRIVATE_KEY` in `.env`. Before uploading a record, a patient must set their wallet through `PUT /api/v1/patients/me/wallet` with `{ "blockchainAddress": "0x..." }`. A failed registration is retained as `failed` and can be retried with `POST /api/v1/patients/me/records/:recordId/register-on-chain`.

## Consent and doctor access

Patient consent is a 30-minute license link. A patient links a doctor by submitting `{ "licenseId": "..." }` to `POST /api/v1/consents`; the server sets the expiry to 30 minutes from now (`CONSENT_DURATION_MINUTES` in `consent-service.js`), and the patient can revoke it sooner with `DELETE /api/v1/consents/:doctorId`. Once it lapses, the patient has to link the doctor again. Both accounts must have wallet addresses. The backend records the consent and mirrors the expiry or revocation to the contract. Doctors receive only the records of patients with an active local consent that also verifies on-chain; expired or revoked consent is denied.

## Signing keys

Every doctor and pharmacy gets an ECDSA (secp256k1) signing key when they register. Its address becomes their blockchain address. The private key is encrypted with AES-256-GCM under a key derived from the account password (scrypt), so the server cannot sign for anyone without their password. Accounts created before signing keys existed get one at their next login. `GET /api/v1/account/signing-key` returns the active key's address. Doctor and pharmacy addresses cannot be changed through `PUT /api/v1/account/wallet`.

Signatures are Ethereum personal-sign signatures over the raw 32-byte SHA-256 digest, so anyone can check them with `ethers.verifyMessage`.

## Basic profile

A patient's account is not active until a doctor creates their basic profile: gender, date of birth (age is calculated), blood group, emergency contact, allergies, chronic conditions and current daily medications. The patient enters the doctor's license ID, the doctor requests `create`, `view` or `update` permission, and the patient approves; each approval works once.

Every saved version is signed by the doctor (password re-entry unlocks their key) over the SHA-256 hash of the canonical profile, bound to the patient and version number. The hash is registered on-chain as that version of the patient's profile record. Reads return an `integrity` object (`hashValid`, `signatureValid`, `onChain`, `verified`). Until the profile exists, record creation, prescriptions and emergency access for that patient return `409 PROFILE_NOT_ACTIVE`. Patients can no longer write their own profile; the old `/patients/me/profile` endpoints are removed.

## Admin scope

Admins approve or reject doctor and pharmacy accounts only. Their user list and audit log contain only doctors, pharmacies and admins, and only account events (`user_approved`, `user_rejected`, `signing_key_created`). Patient accounts and patient-related events are not visible to admins.

## Prescription verification

The doctor uploads the prescription document (multipart `document`) with `patientId`, an optional `title`, and their account `password`. The backend uses the password to unlock the doctor's signing key, signs the document's SHA-256 digest, stores the signature and signer address, encrypts the document, and registers the digest on-chain. A pharmacy uses the verification endpoint and receives only validity results and non-sensitive issuance metadata—never the prescription file.

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
