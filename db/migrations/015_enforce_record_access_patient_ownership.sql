ALTER TABLE medical_records
    ADD CONSTRAINT medical_records_id_patient_user_id_unique
    UNIQUE (id, patient_user_id);

ALTER TABLE medical_record_access_requests
    ADD CONSTRAINT medical_record_access_requests_record_patient_fk
    FOREIGN KEY (record_id, patient_user_id)
    REFERENCES medical_records (id, patient_user_id)
    ON DELETE CASCADE;
