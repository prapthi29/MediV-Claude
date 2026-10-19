-- Doctor ECDSA signatures on every medical record version.
ALTER TABLE medical_records
    ADD COLUMN IF NOT EXISTS doctor_signature TEXT,
    ADD COLUMN IF NOT EXISTS signer_address VARCHAR(42),
    ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE medical_record_versions
    ADD COLUMN IF NOT EXISTS doctor_signature TEXT,
    ADD COLUMN IF NOT EXISTS signer_address VARCHAR(42);

UPDATE medical_records r
SET current_version = v.max_version
FROM (
    SELECT medical_record_id, MAX(version_number) AS max_version
    FROM medical_record_versions
    GROUP BY medical_record_id
) v
WHERE v.medical_record_id = r.id;

-- A view approval is good for one view: viewing moves it to 'used'.
ALTER TABLE medical_record_access_requests
    DROP CONSTRAINT IF EXISTS medical_record_access_requests_status_check;

ALTER TABLE medical_record_access_requests
    ADD CONSTRAINT medical_record_access_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'used'));

ALTER TABLE medical_record_access_requests
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
