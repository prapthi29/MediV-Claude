-- ECDSA signing keys for doctors and pharmacies. The private key is encrypted with a
-- key derived from the account password (scrypt + AES-256-GCM), so the server cannot
-- sign on a user's behalf without that password. Retired keys stay for verifying old signatures.
CREATE TABLE IF NOT EXISTS signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address VARCHAR(42) NOT NULL UNIQUE,
  encrypted_private_key BYTEA NOT NULL,
  kdf_salt BYTEA NOT NULL,
  key_iv BYTEA NOT NULL,
  key_auth_tag BYTEA NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS signing_keys_one_active_per_user
  ON signing_keys (user_id) WHERE status = 'active';

-- The address that produced each prescription signature, so verification survives key rotation.
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS signer_address VARCHAR(42);
