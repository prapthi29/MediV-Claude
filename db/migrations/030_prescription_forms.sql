-- Prescriptions become a typed, signed form that needs the patient's approval.
CREATE TABLE IF NOT EXISTS prescription_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'consumed')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    CONSTRAINT prescription_approval_distinct_users CHECK (patient_user_id <> doctor_user_id)
);

CREATE INDEX IF NOT EXISTS prescription_approvals_patient_idx
    ON prescription_approvals (patient_user_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS prescription_approvals_doctor_idx
    ON prescription_approvals (doctor_user_id, patient_user_id, requested_at DESC);

ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS format VARCHAR(16) NOT NULL DEFAULT 'file'
        CHECK (format IN ('file', 'form')),
    ADD COLUMN IF NOT EXISTS medications_sha256 CHAR(64),
    ADD COLUMN IF NOT EXISTS clinical_sha256 CHAR(64),
    ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES prescription_approvals(id);
