ALTER TABLE users
  ADD COLUMN IF NOT EXISTS blockchain_address VARCHAR(42);

CREATE UNIQUE INDEX IF NOT EXISTS users_blockchain_address_unique_idx
  ON users (blockchain_address) WHERE blockchain_address IS NOT NULL;

ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS blockchain_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS blockchain_record_id CHAR(66),
  ADD COLUMN IF NOT EXISTS blockchain_tx_hash CHAR(66),
  ADD COLUMN IF NOT EXISTS blockchain_registered_at TIMESTAMPTZ;

ALTER TABLE medical_records
  ADD CONSTRAINT medical_records_blockchain_status_check CHECK (blockchain_status IN ('pending', 'registered', 'failed')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS medical_records_blockchain_record_id_unique_idx
  ON medical_records (blockchain_record_id) WHERE blockchain_record_id IS NOT NULL;
