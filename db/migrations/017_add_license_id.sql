-- Store the professional license identifier entered at registration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_id TEXT;

-- License numbers must identify at most one account. Existing accounts without
-- a license remain intact, but cannot be used for patient consent until updated.
CREATE UNIQUE INDEX IF NOT EXISTS users_license_id_unique_idx
  ON users (LOWER(BTRIM(license_id)))
  WHERE license_id IS NOT NULL AND BTRIM(license_id) <> '';
