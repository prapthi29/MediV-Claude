ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64);

ALTER TABLE medical_records
  ADD CONSTRAINT medical_records_content_sha256_format_check CHECK (
    content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'
  ) NOT VALID;
