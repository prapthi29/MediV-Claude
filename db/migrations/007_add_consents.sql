CREATE TABLE IF NOT EXISTS patient_doctor_consents (
  patient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  blockchain_tx_hash CHAR(66),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (patient_user_id, doctor_user_id),
  CONSTRAINT patient_doctor_consents_distinct_users CHECK (patient_user_id <> doctor_user_id)
);

CREATE INDEX IF NOT EXISTS patient_doctor_consents_doctor_active_idx
  ON patient_doctor_consents (doctor_user_id, expires_at)
  WHERE revoked_at IS NULL;
