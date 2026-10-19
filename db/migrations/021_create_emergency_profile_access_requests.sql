CREATE TABLE emergency_profile_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    patient_user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    doctor_user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    operation VARCHAR(10) NOT NULL
        CHECK (operation IN ('create', 'update')),

    status VARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),

    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,

    CHECK (patient_user_id <> doctor_user_id),

    CHECK (
        (status = 'pending' AND decided_at IS NULL)
        OR
        (status IN ('approved', 'rejected') AND decided_at IS NOT NULL)
    ),

    CHECK (
        status = 'approved'
        OR used_at IS NULL
    )
);

CREATE INDEX idx_emergency_profile_requests_patient
    ON emergency_profile_access_requests
    (patient_user_id, status, requested_at DESC);

CREATE INDEX idx_emergency_profile_requests_doctor
    ON emergency_profile_access_requests
    (doctor_user_id, status, requested_at DESC);

CREATE UNIQUE INDEX uq_emergency_profile_pending_request
    ON emergency_profile_access_requests
    (patient_user_id, doctor_user_id, operation)
    WHERE status = 'pending';
