CREATE TABLE IF NOT EXISTS patient_emergency_profile_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES users(id),
  doctor_user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(20) NOT NULL
    CHECK (action IN ('created', 'updated', 'reviewed')),
  changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS patient_emergency_profile_audit_patient_idx
  ON patient_emergency_profile_audit (patient_user_id, created_at DESC);
