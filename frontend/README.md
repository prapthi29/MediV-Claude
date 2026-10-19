# MediVault — Frontend (Patient, Admin, Doctor, Pharmacy)

Next.js (App Router) frontend for all four roles in the project plan: Patient, Admin, Doctor, and Pharmacy.

## Run it

```bash
npm install
cp .env.local.example .env.local
# Point at your Express backend, or leave as-is
npm run dev
```

Open http://localhost:3000.

If `NEXT_PUBLIC_API_URL` isn't reachable, pages that support fixtures fall back to the demo data in `lib/fixtures.js`. The frontend can be explored using the role picker on the login screen and demo accounts for the four roles.

## Structure

```text
app/
  login/, register/          — auth (patient/doctor/pharmacy/admin)
  patient/
    dashboard, records, consents, prescriptions
  admin/
    dashboard, users, audit-log, chain-log
  doctor/
    dashboard, patients, records/new, prescriptions/new
  pharmacy/
    verify, history

components/
  PortalShell, Sidebar, ui.jsx
  (StatCard, StatusBadge, VerifyChip, EmptyState)

lib/
  api.js        — API functions corresponding to the project API contract
  fixtures.js   — demo data for frontend development
```

## Design

Light, clinical-but-warm palette (mint/teal/white — no dark surfaces per your brief). Fraunces for headings (a little warmth/trust), Inter for body copy, IBM Plex Mono for hashes/transaction IDs.

The signature element is the verification chip (`.verify-chip` in `globals.css`) — a small pulsing "specimen label" used on hashed/signed artifacts (records, prescriptions, chain log rows), making tamper-evidence legible at a glance instead of using a generic checkmark.

## Doctor portal

**Dashboard** — Active patients, records added, and the logged-in doctor's own `license_id` (read from the session, not hardcoded). Patient access is granted and revoked directly by patients through the consent flow. The dashboard displays patients whose access is currently active.

**My patients** — Patients with an active consent grant, with quick links to add a record or write a prescription for each. Patients who grant access to the doctor appear in this list; revoked access should no longer be displayed.

**Upload record** — Patient, record type (`lab_report` / `consultation_note` / `imaging`), and file only. Sent as `multipart/form-data` since a `File` can't be sent through JSON. No notes field — `medical_records` has no column for it.

**Write prescription** — One medication per submission (medication, dosage, duration, optional expiry), matching the prescriptions table. Prescribing several drugs means submitting the form once per drug, each with its own signature, hash, and chain record.

**Patient-controlled consent** — Patients grant and revoke doctor access through the consent flow. There is no doctor-initiated access-request or approval workflow. Doctors can view patient records only when access has been granted and remains active.

## Pharmacy portal

**Verify** — Look up a prescription by ID; shows only medication, dosage, duration, prescribing doctor, issue/expiry dates, and validity (`valid` / `expired` / `revoked` / `invalid`) — nothing else about the patient, per the least-privilege requirement.

**History** — Past verifications performed by this pharmacy.

## What I deliberately left out (and why)

**Registration fields** — Name, email, password, and license ID for doctor/pharmacy only. That's all the `users` table has columns for. Anything from the "patient portal" draft document that isn't in the schema (DOB, blood group, Aadhaar, allergies, insurance, emergency contact, lifestyle) was cut — collecting it with nowhere secure to put it is worse than not asking.

**Doctor-initiated access requests** — Not implemented because the backend consent model is patient-initiated. Patients grant and revoke access directly; there is no separate doctor request/approval workflow.

**Guardian recovery / emergency access** — Confirm the implementation status against the project specification and backend before presenting it as an available feature. Where it remains future work, it is not represented as a completed UI feature. Any implemented emergency-access functionality should be restricted to essential records, temporary, and auditable.

**Admin editing users** — The API contract only has approve/reject, not edit/delete. The admin screens don't pretend otherwise.

**QR codes** — Listed as nice-to-have, not required — left out to keep the prescription screen honest about what it actually does (share an ID).

**Multi-medication prescriptions** — An earlier draft of this frontend grouped several medications under one prescription with an `items[]` array. The final prescriptions table keeps one medication per row (`medication`, `dosage`, `duration` as direct columns, no `prescription_items` table), so both the doctor's prescription form and the patient/pharmacy prescription views were reverted to match — one prescription, one medication, one signature.

## Wiring to the real backend

Nothing here is chain-specific in a way that would break when you move from the mock `ChainService` to a real Hardhat/Sepolia deployment — the frontend only ever sees `tx_id` / `payload_hash` strings from `/admin/chain-log`, `chain_tx_id` on records/prescriptions, etc. Swap `ChainService`'s internals on the backend and this UI needs no changes.

The `lib/api.js` functions correspond to the project's API contract. Patient consent is handled through the consent endpoints; there is no doctor-initiated access-request endpoint in the current flow.

Where the spec doesn't define a dedicated stats endpoint (e.g. no `/doctor/overview` or `/pharmacy/overview`), the dashboard composes its numbers from the routes that do exist (`/doctor/patients` and `/pharmacy/history`) instead.

The frontend's API layer includes authentication, patient profile and records, doctor patient and record access, consent, prescriptions, emergency-access operations, audit logs, and admin operations. Verify each endpoint against the currently implemented backend before treating it as available in a live deployment.

## Consent and access model

* Patients control which doctors can access their records.
* Doctors see patients whose consent is currently active.
* Patients can revoke access.
* The frontend does not provide a doctor-initiated access-request or approval flow.
* Backend authorization must enforce consent and access restrictions; frontend visibility alone is not a security boundary.
