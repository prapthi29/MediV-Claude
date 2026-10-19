CREATE TABLE IF NOT EXISTS medical_record_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_record_id UUID NOT NULL
        REFERENCES medical_records(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number >= 1),
    uploaded_by_user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,
    storage_key TEXT NOT NULL UNIQUE,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(127) NOT NULL,
    size_bytes INTEGER NOT NULL
        CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    title VARCHAR(200),
    category VARCHAR(50),
    content_sha256 CHAR(64) NOT NULL
        CHECK (content_sha256 ~ '^[0-9a-fA-F]{64}$'),
    encryption_algorithm VARCHAR(50) NOT NULL,
    encrypted_data_key BYTEA NOT NULL,
    data_key_iv BYTEA NOT NULL,
    data_key_auth_tag BYTEA NOT NULL,
    file_iv BYTEA NOT NULL,
    file_auth_tag BYTEA NOT NULL,
    blockchain_status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (blockchain_status IN ('pending', 'registered', 'failed')),
    blockchain_tx_hash CHAR(66),
    blockchain_registered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT medical_record_versions_unique_number
        UNIQUE (medical_record_id, version_number)
);
