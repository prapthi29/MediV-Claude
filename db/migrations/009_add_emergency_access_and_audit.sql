ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS is_emergency_essential BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS emergency_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  blockchain_tx_hash CHAR(66),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT emergency_access_grants_distinct_users CHECK (patient_user_id <> doctor_user_id)
);

CREATE INDEX IF NOT EXISTS emergency_access_grants_active_idx
  ON emergency_access_grants (patient_user_id, doctor_user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resource_type VARCHAR(64),
  resource_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  blockchain_tx_hash CHAR(66),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_subject_created_idx ON audit_events (subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx ON audit_events (actor_user_id, created_at DESC);
