// lib/fixtures.js
// Demo data shaped exactly like the Postgres schema in the spec (section 6),
// so swapping in the real API later requires zero changes to the UI layer.

export const fixtures = {
  demoUserFor(role) {
    const base = { id: "u-demo", approval_status: "approved" };
    if (role === "admin") return { ...base, role: "admin", name: "Admin", email: "admin@medivault.health" };
    if (role === "doctor") return { ...base, role: "doctor", name: "Dr. Nair", email: "nair@clinic.health", license_id: "MED-2291" };
    if (role === "pharmacy") return { ...base, role: "pharmacy", name: "Nair's Pharmacy", email: "pharmacy@medivault.health", license_id: "PHM-1042" };
    return { ...base, role: "patient", name: "Prapthi Rao", email: "prapthi@example.com", health_id: "SCH-4471-9902" };
  },

  patientOverview: {
    health_id: "SCH-4471-9902",
    name: "Prapthi Rao",
    active_consents: 2,
    total_records: 4,
    active_prescriptions: 1,
    recent_activity: [
      { action: "record.view", detail: "Dr. Nair viewed Lab Report — CBC Panel", at: "2026-08-21T10:12:00Z" },
      { action: "prescription.issue", detail: "Dr. Nair issued a prescription", at: "2026-08-20T16:40:00Z" },
      { action: "consent.grant", detail: "Access granted to Dr. Nair", at: "2026-08-18T09:03:00Z" },
    ],
  },

  records: [
    { id: "r-1", record_type: "lab_report", doctor_name: "Dr. Nair", record_hash: "9f2a7c1e8b4d0a6f3c5e9b1d7a4f2c8e", chain_tx_id: "0x7a1c...4e2b", created_at: "2026-08-20T09:00:00Z", verified: true },
    { id: "r-2", record_type: "consultation_note", doctor_name: "Dr. Nair", record_hash: "3b8e1f4a9c2d6e0b7f1a5c3d9e2b8f4a", chain_tx_id: "0x2f9d...11ac", created_at: "2026-08-18T14:20:00Z", verified: true },
    { id: "r-3", record_type: "imaging", doctor_name: "Dr. Iyer", record_hash: "6c4d2a8f1e9b3c7d5a0f4e2b8c1d9a3f", chain_tx_id: "0x88b1...9f0d", created_at: "2026-07-30T11:15:00Z", verified: true },
    { id: "r-4", record_type: "lab_report", doctor_name: "Dr. Iyer", record_hash: "1d9f3e7a5c2b8d0f4a6e1c9b3d7f2a8e", chain_tx_id: "0xd41a...73c9", created_at: "2026-06-11T08:45:00Z", verified: false },
  ],

  consents: [
    { id: "c-1", doctor_name: "Dr. Nair", license_id: "MED-2291", scope: "full", status: "active", granted_at: "2026-08-18T09:03:00Z" },
    { id: "c-2", doctor_name: "Dr. Iyer", license_id: "MED-3387", scope: "full", status: "active", granted_at: "2026-05-02T09:03:00Z" },
    { id: "c-3", doctor_name: "Dr. Chen", license_id: "MED-1120", scope: "full", status: "pending", granted_at: null },
    { id: "c-4", doctor_name: "Dr. Fernandes", license_id: "MED-4482", scope: "full", status: "revoked", granted_at: "2026-01-11T09:03:00Z" },
  ],

  prescriptions: [
    {
      id: "p-1",
      doctor_name: "Dr. Nair",
      medication: "Amoxicillin 500mg",
      dosage: "1 tablet, 3x/day",
      duration: "7 days",
      status: "valid",
      issued_at: "2026-08-20T16:40:00Z",
      expires_at: "2026-08-30T00:00:00Z",
      chain_tx_id: "0x5e2a...c910",
      prescription_hash: "7e1c3a9f2b8d0e4a6c1f9b3d7e2a8c4f",
    },
    {
      id: "p-2",
      doctor_name: "Dr. Iyer",
      medication: "Cetirizine 10mg",
      dosage: "1 tablet, nightly",
      duration: "10 days",
      status: "expired",
      issued_at: "2026-05-10T10:00:00Z",
      expires_at: "2026-05-20T00:00:00Z",
      chain_tx_id: "0x1af3...4bd2",
      prescription_hash: "3c9d1a7f5e2b8c0d4a6f1e9b3d7c2a8f",
    },
    {
      id: "p-3",
      doctor_name: "Dr. Nair",
      medication: "Paracetamol 650mg",
      dosage: "1 tablet, as needed",
      duration: "5 days",
      status: "valid",
      issued_at: "2026-08-20T16:41:00Z",
      expires_at: "2026-08-30T00:00:00Z",
      chain_tx_id: "0x2b7f...19e4",
      prescription_hash: "1a4c8e2f6b9d3a7c5e0f2b8d4a9c1e6f",
    },
  ],

  pendingApprovals: [
    { id: "a-1", role: "doctor", name: "Dr. Chen", email: "chen@cityhospital.health", license_id: "MED-1120", created_at: "2026-08-21T08:00:00Z" },
    { id: "a-2", role: "pharmacy", name: "Wellness Pharmacy", email: "contact@wellnesspharm.health", license_id: "PHM-2207", created_at: "2026-08-19T13:20:00Z" },
  ],

  allUsers: [
    { id: "u-1", role: "patient", name: "Prapthi Rao", email: "prapthi@example.com", health_id: "SCH-4471-9902", approval_status: "approved", created_at: "2026-04-02T00:00:00Z" },
    { id: "u-2", role: "doctor", name: "Dr. Nair", email: "nair@clinic.health", license_id: "MED-2291", approval_status: "approved", created_at: "2026-03-11T00:00:00Z" },
    { id: "u-3", role: "doctor", name: "Dr. Iyer", email: "iyer@clinic.health", license_id: "MED-3387", approval_status: "approved", created_at: "2026-02-19T00:00:00Z" },
    { id: "u-4", role: "pharmacy", name: "Nair's Pharmacy", email: "pharmacy@medivault.health", license_id: "PHM-1042", approval_status: "approved", created_at: "2026-01-30T00:00:00Z" },
    { id: "a-1", role: "doctor", name: "Dr. Chen", email: "chen@cityhospital.health", license_id: "MED-1120", approval_status: "pending", created_at: "2026-08-21T08:00:00Z" },
    { id: "a-2", role: "pharmacy", name: "Wellness Pharmacy", email: "contact@wellnesspharm.health", license_id: "PHM-2207", approval_status: "pending", created_at: "2026-08-19T13:20:00Z" },
  ],

  auditLog: [
    { id: "l-1", actor: "Dr. Nair", action: "record.view", target: "Lab Report (r-1)", at: "2026-08-21T10:12:00Z" },
    { id: "l-2", actor: "Dr. Nair", action: "prescription.issue", target: "Prescription (p-1)", at: "2026-08-20T16:40:00Z" },
    { id: "l-3", actor: "Prapthi Rao", action: "consent.grant", target: "Dr. Nair", at: "2026-08-18T09:03:00Z" },
    { id: "l-4", actor: "Nair's Pharmacy", action: "prescription.verify", target: "Prescription (p-1)", at: "2026-08-20T17:02:00Z" },
    { id: "l-5", actor: "Admin", action: "user.approve", target: "Dr. Iyer", at: "2026-02-19T09:00:00Z" },
  ],

  chainLog: [
    { tx_id: "0x5e2a...c910", action_type: "issuePrescription", payload_hash: "7e1c...a904", created_at: "2026-08-20T16:40:01Z" },
    { tx_id: "0x7a1c...4e2b", action_type: "storeRecordHash", payload_hash: "9f2a...2c8e", created_at: "2026-08-20T09:00:01Z" },
    { tx_id: "0x9d31...aa02", action_type: "grantConsent", payload_hash: "—", created_at: "2026-08-18T09:03:01Z" },
    { tx_id: "0xd41a...73c9", action_type: "storeRecordHash", payload_hash: "1d9f...2a8e", created_at: "2026-06-11T08:45:01Z" },
  ],

  // -- doctor portal --

  doctorAccessRequests: [
    { id: "c-1", patient_name: "Prapthi Rao", health_id: "SCH-4471-9902", status: "active", requested_at: "2026-08-17T12:00:00Z", granted_at: "2026-08-18T09:03:00Z" },
    { id: "c-5", patient_name: "Arjun Mehta", health_id: "SCH-2201-4471", status: "pending", requested_at: "2026-08-21T15:30:00Z", granted_at: null },
    { id: "c-6", patient_name: "Leela Menon", health_id: "SCH-7734-0021", status: "revoked", requested_at: "2026-03-01T10:00:00Z", granted_at: "2026-03-02T08:00:00Z" },
  ],

  doctorPatients: [
    { id: "u-1", name: "Prapthi Rao", health_id: "SCH-4471-9902", scope: "full", granted_at: "2026-08-18T09:03:00Z", records_count: 4, last_visit: "2026-08-20T09:00:00Z" },
    { id: "u-5", name: "Arjun Mehta", health_id: "SCH-2201-4471", scope: "full", granted_at: "2026-06-02T09:03:00Z", records_count: 2, last_visit: "2026-07-11T09:00:00Z" },
    { id: "u-6", name: "Meera Krishnan", health_id: "SCH-8810-3390", scope: "full", granted_at: "2026-01-20T09:03:00Z", records_count: 5, last_visit: "2026-08-05T09:00:00Z" },
  ],

  // -- pharmacy portal --

  // Keyed by prescription id so the demo verify screen can look one up
  // without a backend, exactly the way /prescriptions/verify/:id would.
  prescriptionLookup: {
    "p-1": {
      id: "p-1",
      status: "valid",
      doctor_name: "Dr. Nair",
      license_id: "MED-2291",
      medication: "Amoxicillin 500mg",
      dosage: "1 tablet, 3x/day",
      duration: "7 days",
      issued_at: "2026-08-20T16:40:00Z",
      expires_at: "2026-08-30T00:00:00Z",
      chain_tx_id: "0x5e2a...c910",
      prescription_hash: "7e1c3a9f2b8d0e4a6c1f9b3d7e2a8c4f",
    },
    "p-2": {
      id: "p-2",
      status: "expired",
      doctor_name: "Dr. Iyer",
      license_id: "MED-3387",
      medication: "Cetirizine 10mg",
      dosage: "1 tablet, nightly",
      duration: "10 days",
      issued_at: "2026-05-10T10:00:00Z",
      expires_at: "2026-05-20T00:00:00Z",
      chain_tx_id: "0x1af3...4bd2",
      prescription_hash: "3c9d1a7f5e2b8c0d4a6f1e9b3d7c2a8f",
    },
    "p-3": {
      id: "p-3",
      status: "valid",
      doctor_name: "Dr. Nair",
      license_id: "MED-2291",
      medication: "Paracetamol 650mg",
      dosage: "1 tablet, as needed",
      duration: "5 days",
      issued_at: "2026-08-20T16:41:00Z",
      expires_at: "2026-08-30T00:00:00Z",
      chain_tx_id: "0x2b7f...19e4",
      prescription_hash: "1a4c8e2f6b9d3a7c5e0f2b8d4a9c1e6f",
    },
  },

  pharmacyHistory: [
    { id: "v-1", prescription_id: "p-1", result: "valid", medication_summary: "Amoxicillin 500mg", at: "2026-08-20T17:02:00Z" },
    { id: "v-2", prescription_id: "p-2", result: "expired", medication_summary: "Cetirizine 10mg", at: "2026-08-19T11:20:00Z" },
    { id: "v-3", prescription_id: "p-9", result: "invalid", medication_summary: "—", at: "2026-08-15T09:40:00Z" },
  ],
};
