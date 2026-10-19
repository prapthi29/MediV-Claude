# Merge notes — MediVault

## What this package is
This archive uses `MediVault_license_realtime_updated` as the base because it contains the newer doctor-license validation, real-time/security changes, and emergency-profile workflow. The `MediV-feature-blockchain-integration` archive was compared against it; its unique `frontend/public/sign-prescription.html` utility was carried over. Both archives already contain blockchain contracts, backend blockchain clients, database migrations, and frontend portals, so duplicating entire directories would create incompatible overwrites rather than a safe merge.

## Clean packaging choices
- Removed local `.env` / `.env.local` files so secrets and machine-specific configuration are not distributed.
- Removed `node_modules`, generated Solidity `artifacts`/cache, backup `.bak` files, Windows shortcut files, and uploaded medical files under `uploads/`.
- Kept source files, package manifests/lockfiles, migrations, tests, and documented examples.

## Important validation status
This is a source-level merge/package, not a claim that the whole system has passed end-to-end integration. Dependencies were not installed and the project was not run against your PostgreSQL/Supabase/blockchain environment here. Follow `INTEGRATION_PLAN_4_PEOPLE.pdf` before treating it as release-ready.

## Before running
1. Copy `.env.example` to `.env` and fill local values; never commit `.env`.
2. Review `frontend/.env.local.example` and create a local `.env.local` if needed.
3. Review `blockchain/.env.example` and set deployment variables only in your local environment.
4. Install backend, frontend, and blockchain dependencies in their own directories.
5. Back up the database before applying new migrations. Do not rerun old migrations against a populated database unless the migration runner confirms they are unapplied.
