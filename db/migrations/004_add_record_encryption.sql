ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS encryption_algorithm VARCHAR(32),
  ADD COLUMN IF NOT EXISTS encrypted_data_key BYTEA,
  ADD COLUMN IF NOT EXISTS data_key_iv BYTEA,
  ADD COLUMN IF NOT EXISTS data_key_auth_tag BYTEA,
  ADD COLUMN IF NOT EXISTS file_iv BYTEA,
  ADD COLUMN IF NOT EXISTS file_auth_tag BYTEA;

ALTER TABLE medical_records
  ADD CONSTRAINT medical_records_encryption_metadata_check CHECK (
    (encryption_algorithm IS NULL AND encrypted_data_key IS NULL AND data_key_iv IS NULL AND data_key_auth_tag IS NULL AND file_iv IS NULL AND file_auth_tag IS NULL)
    OR
    (encryption_algorithm = 'AES-256-GCM' AND encrypted_data_key IS NOT NULL AND data_key_iv IS NOT NULL AND data_key_auth_tag IS NOT NULL AND file_iv IS NOT NULL AND file_auth_tag IS NOT NULL)
  ) NOT VALID;
