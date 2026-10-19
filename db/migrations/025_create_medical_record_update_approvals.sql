CREATE TABLE IF NOT EXISTS medical_record_update_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_record_id UUID NOT NULL REFERENCES medical_records(id) ON DELETE RESTRICT,
    patient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    doctor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','approved','rejected','revoked','consumed')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    CONSTRAINT update_approval_expiry_after_request CHECK (expires_at > requested_at),
    CONSTRAINT update_approval_distinct_users CHECK (patient_user_id <> doctor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_record_update_approvals_patient
  ON medical_record_update_approvals(patient_user_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_update_approvals_record
  ON medical_record_update_approvals(medical_record_id, status);
CREATE INDEX IF NOT EXISTS idx_record_update_approvals_doctor
  ON medical_record_update_approvals(doctor_user_id, status, requested_at DESC);
