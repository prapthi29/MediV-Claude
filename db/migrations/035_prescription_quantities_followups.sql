-- Follow-up date, kept outside the encrypted prescription so the patient
-- portal can remind the patient without opening every prescription.
ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS follow_up_date DATE;

-- Each time a pharmacy hands over medicines, how many of each it gave.
-- A prescription is fully dispensed once every medicine's total is given.
CREATE TABLE IF NOT EXISTS prescription_dispenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    pharmacy_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quantities JSONB NOT NULL,
    dispense_sha256 CHAR(64) NOT NULL,
    signature TEXT NOT NULL,
    signer_address VARCHAR(42) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prescription_dispenses_prescription_idx
    ON prescription_dispenses (prescription_id, created_at);
