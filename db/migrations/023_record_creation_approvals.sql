CREATE TABLE IF NOT EXISTS medical_record_creation_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    doctor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'consumed')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    CONSTRAINT creation_approval_distinct_users
        CHECK (patient_user_id <> doctor_user_id)
);

CREATE INDEX IF NOT EXISTS creation_approval_patient_status_idx
    ON medical_record_creation_approvals
    (patient_user_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS creation_approval_doctor_status_idx
    ON medical_record_creation_approvals
    (doctor_user_id, status, requested_at DESC);
