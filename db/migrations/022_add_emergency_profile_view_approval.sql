ALTER TABLE emergency_profile_access_requests
DROP CONSTRAINT IF EXISTS emergency_profile_access_requests_operation_check;

ALTER TABLE emergency_profile_access_requests
ADD CONSTRAINT emergency_profile_access_requests_operation_check
CHECK (operation IN ('view', 'create', 'update'));
