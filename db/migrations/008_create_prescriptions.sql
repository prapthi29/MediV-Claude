CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  doctor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(127) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  title VARCHAR(200),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  doctor_signature TEXT NOT NULL,
  encryption_algorithm VARCHAR(32) NOT NULL CHECK (encryption_algorithm = 'AES-256-GCM'),
  encrypted_data_key BYTEA NOT NULL,
  data_key_iv BYTEA NOT NULL,
  data_key_auth_tag BYTEA NOT NULL,
  file_iv BYTEA NOT NULL,
  file_auth_tag BYTEA NOT NULL,
  blockchain_status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (blockchain_status IN ('pending', 'registered', 'failed')),
  blockchain_record_id CHAR(66) UNIQUE,
  blockchain_tx_hash CHAR(66),
  blockchain_registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prescriptions_patient_created_idx ON prescriptions (patient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prescriptions_doctor_created_idx ON prescriptions (doctor_user_id, created_at DESC);
