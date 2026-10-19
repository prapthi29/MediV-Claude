-- Basic profile: gender and date of birth, plus a doctor ECDSA signature and an
-- on-chain SHA-256 hash for every version of the profile.
ALTER TABLE patient_emergency_profiles
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS profile_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS doctor_signature TEXT,
  ADD COLUMN IF NOT EXISTS signer_address VARCHAR(42),
  ADD COLUMN IF NOT EXISTS signed_by_doctor_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blockchain_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS blockchain_tx_hash CHAR(66);

ALTER TABLE patient_emergency_profiles
  ADD CONSTRAINT emergency_profile_gender_check
    CHECK (gender IS NULL OR gender IN ('female', 'male', 'other', 'prefer_not_to_say')),
  ADD CONSTRAINT emergency_profile_dob_check
    CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE),
  ADD CONSTRAINT emergency_profile_version_check CHECK (version >= 1),
  ADD CONSTRAINT emergency_profile_sha256_check
    CHECK (profile_sha256 IS NULL OR profile_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT emergency_profile_blockchain_status_check
    CHECK (blockchain_status IN ('pending', 'registered', 'failed'));

ALTER TABLE patient_emergency_profile_audit
  ADD COLUMN IF NOT EXISTS version INTEGER,
  ADD COLUMN IF NOT EXISTS profile_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS doctor_signature TEXT,
  ADD COLUMN IF NOT EXISTS signer_address VARCHAR(42);
