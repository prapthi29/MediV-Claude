-- A patient shares one prescription with one pharmacy for 30 minutes.
CREATE TABLE IF NOT EXISTS prescription_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    patient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pharmacy_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prescription_shares_pharmacy_idx
    ON prescription_shares (pharmacy_user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS prescription_shares_patient_idx
    ON prescription_shares (patient_user_id, created_at DESC);

-- Dispensing is signed by the pharmacy and can happen once.
ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dispensed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS dispense_signature TEXT,
    ADD COLUMN IF NOT EXISTS dispense_signer_address VARCHAR(42);
