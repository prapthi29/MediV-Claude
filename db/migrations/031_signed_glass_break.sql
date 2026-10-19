-- Glass-break requests are signed by the doctor and unlock only after the
-- signature verifies. The patient can revoke them at any time.
ALTER TABLE emergency_access_grants
    ADD COLUMN IF NOT EXISTS duration_minutes INTEGER
        CHECK (duration_minutes IN (15, 30, 45)),
    ADD COLUMN IF NOT EXISTS request_payload JSONB,
    ADD COLUMN IF NOT EXISTS request_sha256 CHAR(64),
    ADD COLUMN IF NOT EXISTS doctor_signature TEXT,
    ADD COLUMN IF NOT EXISTS signer_address VARCHAR(42),
    ADD COLUMN IF NOT EXISTS revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS emergency_access_grants_patient_idx
    ON emergency_access_grants (patient_user_id, created_at DESC);
