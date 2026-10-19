-- ============================================================================
-- SecureChain Health — Database Schema (FINAL, corrected for MVP scope)
-- PostgreSQL 16+
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role             TEXT NOT NULL CHECK (role IN ('patient','doctor','pharmacy','admin')),
  name             TEXT NOT NULL,
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  health_id        TEXT UNIQUE,          -- patients only
  license_id       TEXT UNIQUE,          -- doctors/pharmacies only
  approval_status  TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- enforce identity fields match role
  CONSTRAINT role_identity_check CHECK (
    (role = 'patient'  AND health_id  IS NOT NULL AND license_id IS NULL) OR
    (role IN ('doctor','pharmacy') AND license_id IS NOT NULL AND health_id IS NULL) OR
    (role = 'admin'    AND health_id  IS NULL     AND license_id IS NULL)
  )
);

CREATE INDEX idx_users_role_status ON users(role, approval_status);

-- ============================================================================
-- DOCTOR KEYS — required for ECC prescription signing/verification.
-- Private key is stored encrypted at rest; never returned via any API response.
-- ============================================================================
CREATE TABLE doctor_keys (
  doctor_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_key             TEXT NOT NULL,
  encrypted_private_key  TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- MEDICAL RECORDS
-- ============================================================================
CREATE TABLE medical_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  doctor_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  record_type          TEXT NOT NULL,     -- lab_report, consultation_note, imaging
  original_filename    TEXT,
  mime_type            TEXT,
  file_size_bytes      BIGINT,
  encrypted_file_path  TEXT NOT NULL,
  iv                   TEXT NOT NULL,     -- AES-256-GCM initialization vector
  auth_tag             TEXT NOT NULL,     -- AES-256-GCM auth tag (required to decrypt)
  record_hash          TEXT NOT NULL,     -- SHA-256 of the encrypted file
  chain_tx_id          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_records_patient ON medical_records(patient_id);
CREATE INDEX idx_records_doctor  ON medical_records(doctor_id);

-- ============================================================================
-- CONSENTS — includes lifecycle status so "requested" vs "granted" is explicit
-- ============================================================================
CREATE TABLE consents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  doctor_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scope        TEXT NOT NULL DEFAULT 'full',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked','expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_at   TIMESTAMPTZ,             -- set only when patient approves
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  chain_tx_id  TEXT
);

CREATE INDEX idx_consents_patient ON consents(patient_id);
CREATE INDEX idx_consents_doctor  ON consents(doctor_id);

-- only one pending/active consent per (patient, doctor) pair at a time
CREATE UNIQUE INDEX one_active_consent_per_pair
  ON consents (patient_id, doctor_id)
  WHERE status IN ('pending','active');

-- ============================================================================
-- PRESCRIPTIONS
-- ============================================================================
CREATE TABLE prescriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  doctor_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  medication          TEXT NOT NULL,
  dosage              TEXT NOT NULL,
  duration            TEXT,
  signature           TEXT NOT NULL,     -- ECDSA signature over the prescription payload
  prescription_hash   TEXT NOT NULL,     -- SHA-256 of the canonical payload
  status              TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','revoked','expired')),
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ,
  chain_tx_id         TEXT
);

CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_doctor  ON prescriptions(doctor_id);

-- ============================================================================
-- AUDIT LOGS — every sensitive action
-- ============================================================================
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,             -- e.g. record.view, consent.grant, prescription.verify
  target_type TEXT,                      -- e.g. medical_record, consent, prescription, user
  target_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor_created  ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_target         ON audit_logs(target_type, target_id);

-- ============================================================================
-- MOCK CHAIN LOG — swappable stand-in for the real chain, exposed to admin
-- as "mock mode". target_id added so admin UI can cross-reference easily.
-- ============================================================================
CREATE TABLE mock_chain_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_id         TEXT UNIQUE NOT NULL,
  action_type   TEXT NOT NULL,           -- storeRecordHash, grantConsent, revokeConsent, issuePrescription, verifyPrescription
  target_type   TEXT,                    -- medical_record, consent, prescription
  target_id     UUID,
  payload_hash  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chain_log_target ON mock_chain_log(target_type, target_id);

-- ============================================================================
-- End of schema
-- ============================================================================
