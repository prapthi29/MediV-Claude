-- Existing records with complete integrity and encryption metadata become immutable v1 entries.
-- Missing data is not fabricated. This migration is safe to rerun.
INSERT INTO medical_record_versions (
  medical_record_id, version_number, uploaded_by_user_id, storage_key,
  original_filename, content_type, size_bytes, title, category, content_sha256,
  encryption_algorithm, encrypted_data_key, data_key_iv, data_key_auth_tag,
  file_iv, file_auth_tag, blockchain_status, blockchain_tx_hash,
  blockchain_registered_at, created_at
)
SELECT r.id, 1, r.uploaded_by_user_id, r.storage_key, r.original_filename,
       r.content_type, r.size_bytes, r.title, r.category, r.content_sha256,
       r.encryption_algorithm, r.encrypted_data_key, r.data_key_iv, r.data_key_auth_tag,
       r.file_iv, r.file_auth_tag,
       CASE WHEN r.blockchain_status = 'registered' THEN 'registered' ELSE 'pending' END,
       r.blockchain_tx_hash, r.blockchain_registered_at, r.created_at
FROM medical_records r
WHERE r.content_sha256 IS NOT NULL
  AND r.encryption_algorithm = 'AES-256-GCM'
  AND r.encrypted_data_key IS NOT NULL AND r.data_key_iv IS NOT NULL
  AND r.data_key_auth_tag IS NOT NULL AND r.file_iv IS NOT NULL AND r.file_auth_tag IS NOT NULL
ON CONFLICT (medical_record_id, version_number) DO NOTHING;
