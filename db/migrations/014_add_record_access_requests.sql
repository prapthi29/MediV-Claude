CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS medical_record_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL
        REFERENCES medical_records(id) ON DELETE CASCADE,
    patient_user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    doctor_user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    CONSTRAINT medical_record_access_requests_unique
        UNIQUE (record_id, doctor_user_id),
    CONSTRAINT medical_record_access_requests_distinct_users
        CHECK (patient_user_id <> doctor_user_id)
);

CREATE INDEX IF NOT EXISTS medical_record_access_requests_patient_status_idx
    ON medical_record_access_requests
    (patient_user_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS medical_record_access_requests_doctor_idx
    ON medical_record_access_requests
    (doctor_user_id, status, requested_at DESC);