-- A doctor asks the patient before viewing a prescription. One approval is
-- good for one view, the same as for lab reports.
CREATE TABLE IF NOT EXISTS prescription_view_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    patient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'used')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    CONSTRAINT prescription_view_requests_unique UNIQUE (prescription_id, doctor_user_id)
);

CREATE INDEX IF NOT EXISTS prescription_view_requests_patient_idx
    ON prescription_view_requests (patient_user_id, status, requested_at DESC);
