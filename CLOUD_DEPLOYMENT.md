# MediVault cloud deployment

Targets: contract on Sepolia, Supabase Postgres for metadata, a private Supabase
Storage bucket for AES-encrypted files, backend on Railway, frontend on Vercel.

Order: Sepolia contract, then Railway (it migrates the database and creates the
bucket on every deploy), then Vercel, then point Railway's `CORS_ORIGIN` at the
Vercel URL.

## 1. Contract on Sepolia

The deployer wallet needs Sepolia ETH. It becomes the contract `owner()`, and the
backend must sign with the same key.

```sh
cd blockchain
npm install
# SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY must be set in the environment or blockchain/.env
npm run deploy:sepolia      # writes blockchain/deployments/sepolia.json
npm run verify:sepolia      # optional, needs ETHERSCAN_API_KEY
```

Commit `blockchain/deployments/sepolia.json`. It holds only public data: address,
owner, chain ID, transaction hash, block number.

## 2. Backend on Railway

New project, then "Deploy from GitHub repo", then `prapthi29/MediV-Claude`.

| Setting | Value |
| --- | --- |
| Root directory | `/` (leave empty) |
| Branch | `main` |
| Build, start and pre-deploy | Read from `railway.json`: migrations and bucket setup run before each deploy, then `npm start` |
| Healthcheck | `/api/v1/health` (from `railway.json`) |
| Networking | Settings, then Networking, then Generate Domain |

Variables (Service, then Variables, then Raw Editor):

```
NODE_ENV=production
DATABASE_URL=<Supabase connection string, Session pooler, port 5432>
DATABASE_SSL=true
JWT_SECRET=<random, at least 32 characters>
JWT_EXPIRES_IN=1h
FILE_ENCRYPTION_KEY=<base64 32-byte key>
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_STORAGE_BUCKET=medical-records
SUPABASE_SERVICE_ROLE_KEY=<service role key>
BLOCKCHAIN_RPC_URL=<same value as SEPOLIA_RPC_URL>
BLOCKCHAIN_CHAIN_ID=11155111
BLOCKCHAIN_CONTRACT_ADDRESS=<address from deployments/sepolia.json>
BLOCKCHAIN_PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY, with the 0x prefix>
CORS_ORIGIN=<Vercel URL, set after step 3>
```

Notes:

- Don't set `PORT`. Railway provides it.
- Use Supabase's **Session pooler** string (Project Settings, then Database, then
  Connection string). The direct `db.<ref>.supabase.co` host is IPv6-only and
  may not be reachable from Railway.
- Generate secrets on your own machine:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` for
  `JWT_SECRET`, and `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  for `FILE_ENCRYPTION_KEY`. Keep `FILE_ENCRYPTION_KEY` backed up: losing it makes
  every stored file unreadable.
- Create the first admin once, from the service's shell or with
  `railway run npm run create-admin -- <email> <password>`.

## 3. Frontend on Vercel

Add New, then Project, then import `prapthi29/MediV-Claude`.

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Framework preset | Next.js |
| Build / output / install | Defaults |
| Environment variable | `NEXT_PUBLIC_API_URL=https://<railway-domain>/api/v1` |

`NEXT_PUBLIC_API_URL` is baked in at build time. If you change it, redeploy.

## 4. Lock down CORS

On Railway, set `CORS_ORIGIN=https://<your-app>.vercel.app`. Separate several
origins with commas. Railway redeploys automatically.

## Smoke test

1. `https://<railway-domain>/api/v1/health` returns `{"status":"ok"}`.
2. Sign in as admin on the Vercel URL and approve a doctor.
3. Create a record as that doctor and confirm the registration transaction on
   https://sepolia.etherscan.io/address/<contract-address>.
