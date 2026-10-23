
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

function authHeaders() {
  if (typeof window === "undefined") return {};

  const token = window.localStorage.getItem("sch_token");

  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizeUser(user) {
  const status = user.status || user.approval_status || "active";

  return {
    ...user,
    name: user.name || user.email,
    status,
    approval_status: status,
    health_id: user.health_id || "",
    license_id: user.license_id || "",
    created_at: user.created_at || user.createdAt,
  };
}

function normalizeAuditEvent(event) {
  return {
    ...event,
    actor:
      event.actor ||
      event.actor_user_id ||
      event.actorUserId ||
      "system",
    action: event.action || event.event_type || event.eventType,
    target:
      event.target ||
      [
        event.resource_type || event.resourceType,
        event.resource_id || event.resourceId,
      ]
        .filter(Boolean)
        .join(" ") ||
      "platform",
    at: event.at || event.created_at || event.createdAt,
  };
}

function normalizeConsent(consent) {
  return {
    ...consent,
    id: consent.id || consent.doctorUserId,
    doctor_name: consent.doctor_name || consent.doctorEmail,
    doctor_email: consent.doctor_email || consent.doctorEmail,
    license_id: consent.license_id || consent.licenseId || "",
    doctor_name: consent.doctor_name || consent.doctorName || "",
    status: consent.status || "active",
    granted_at: consent.granted_at || consent.createdAt,
    expires_at: consent.expires_at || consent.expiresAt,
  };
}

function normalizeDoctorPatient(patient) {
  return {
    ...patient,
    id: patient.id || patient.patientUserId,
    name: patient.name || patient.patientName || patient.patientEmail,
    health_id: patient.health_id || patient.patientHealthId || "",
    records_count: patient.records_count || 0,
    last_visit: patient.last_visit || patient.createdAt,
    granted_at: patient.granted_at || patient.createdAt,
  };
}

function handleExpiredSession(status, code) {
  if (status !== 401 || !["AUTH_REQUIRED", "INVALID_TOKEN"].includes(code)) return;
  if (typeof window === "undefined" || !window.localStorage.getItem("sch_token")) return;
  window.localStorage.removeItem("sch_token");
  window.localStorage.removeItem("sch_user");
  if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/register")) {
    window.location.replace("/login?session=expired");
  }
}

async function request(path, { method = "GET", body } = {}) {
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: isFormData
      ? authHeaders()
      : {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
    body: isFormData
      ? body
      : body
        ? JSON.stringify(body)
        : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(
      data?.error?.message || `Request failed: ${res.status}`
    );

    err.status = res.status;
    err.code = data?.error?.code;
    err.details = data?.error?.details;
    handleExpiredSession(res.status, err.code);

    throw err;
  }

  return data;
}

async function fetchFile(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));

    const err = new Error(
      data?.error?.message || `Download failed: ${res.status}`
    );

    err.status = res.status;
    err.code = data?.error?.code;
    handleExpiredSession(res.status, err.code);

    throw err;
  }

  return res.blob();
}

async function downloadFile(path, filename) {
  const blob = await fetchFile(path);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename || "download";

  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}

export const api = {
  // ---------- authentication ----------

  register: ({ name, email, password, role, licenseId }) =>
    request("/auth/register", {
      method: "POST",
      body: { name, email, password, role, ...(licenseId ? { licenseId } : {}) },
    }).then((r) => ({
      user: r.user,
      token: r.token,
    })),

  login: ({ email, password }) =>
    request("/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  getMe: () =>
    request("/health/me").then((r) => r.user),

  // ---------- wallet ----------

  setPatientWallet: (blockchainAddress) =>
    request("/patients/me/wallet", {
      method: "PUT",
      body: { blockchainAddress },
    }),

  getSigningKey: () =>
    request("/account/signing-key").then((r) => r.signingKey),

  setAccountWallet: (blockchainAddress) =>
    request("/account/wallet", {
      method: "PUT",
      body: { blockchainAddress },
    }),

  // ---------- patient: medical records ----------

  getPatientRecords: () =>
    request("/patients/me/records").then((r) => r.records),

  verifyRecord: (recordId) =>
    request(`/patients/me/records/${recordId}/verify`, {
      method: "POST",
    }).then((r) => r.verification),

  registerRecordOnChain: (recordId) =>
    request(`/patients/me/records/${recordId}/register-on-chain`, {
      method: "POST",
    }).then((r) => r.record),

  setRecordEmergencyEssential: (recordId, isEmergencyEssential) =>
    request(`/patients/me/records/${recordId}/emergency-essential`, {
      method: "PATCH",
      body: { isEmergencyEssential },
    }).then((r) => r.record),

  // The patient's own record attachment as a Blob, for viewing in the page.
  fetchOwnRecordFile: (recordId) =>
    fetchFile(`/patients/me/records/${recordId}/download`),

  downloadOwnRecord: (recordId, filename) =>
    downloadFile(
      `/patients/me/records/${recordId}/download`,
      filename
    ),

  // ---------- doctor: patients and records ----------

  getDoctorPatients: () =>
    request("/doctor/patients").then((r) =>
      (r.patients || []).map(normalizeDoctorPatient)
    ),

  getPatientRecordsForDoctor: (patientId) =>
    request(`/doctor/patients/${patientId}/records`).then(
      (r) => r.records
    ),

  // Doctor's own creation requests for this patient, newest first.
  getRecordCreationRequestsForDoctor: (patientId) =>
    request(`/doctor/patients/${patientId}/record-creation-requests`).then(
      (r) => r.approvals || []
    ),

  requestRecordCreation: (patientId) =>
    request(`/doctor/patients/${patientId}/record-creation-requests`, {
      method: "POST",
    }).then((r) => r.approval),

  // Uses up the patient's single-view approval.
  viewRecordForDoctor: (patientId, recordId) =>
    request(`/doctor/patients/${patientId}/records/${recordId}/view`, {
      method: "POST",
    }),

  // Creates a record. Content is a form, a file, or both.
  saveRecord: ({
    patientId,
    approvalId,
    title,
    category,
    form,
    file,
    password,
  }) => {
    const body = new FormData();
    body.append("approvalId", approvalId);
    body.append("password", password);
    if (title) body.append("title", title);
    if (category) body.append("category", category);
    if (form) body.append("form", JSON.stringify(form));
    if (file) body.append("document", file);

    return request(`/doctor/patients/${patientId}/records`, { method: "POST", body }).then((r) => r.record);
  },

  // ---------- patient: approve record creation and edits ----------

  getRecordCreationRequests: () =>
    request("/patients/me/record-creation-requests").then(
      (r) => r.approvals || []
    ),

  decideRecordCreation: (requestId, decision) =>
    request(`/patients/me/record-creation-requests/${requestId}/${decision}`, {
      method: "POST",
    }).then((r) => r.approval),

  getRecordUpdateRequests: () =>
    request("/patients/me/record-update-requests").then(
      (r) => r.approvals || []
    ),

  decideRecordUpdate: (requestId, decision) =>
    request(`/patients/me/record-update-requests/${requestId}/${decision}`, {
      method: "POST",
    }).then((r) => r.approval),

  viewOwnRecord: (recordId) => request(`/patients/me/records/${recordId}`),

  // ---------- file-specific access requests ----------

  requestRecordAccess: (patientId, recordId) =>
    request(
      `/doctor/patients/${patientId}/records/${recordId}/access-request`,
      {
        method: "POST",
      }
    ).then((r) => r.request),

  getRecordAccessRequests: () =>
    request("/patients/me/record-access-requests").then(
      (r) => r.requests
    ),

  approveRecordAccess: (requestId) =>
    request(
      `/patients/me/record-access-requests/${requestId}/approve`,
      {
        method: "POST",
      }
    ).then((r) => r.request),

  rejectRecordAccess: (requestId) =>
    request(
      `/patients/me/record-access-requests/${requestId}/reject`,
      {
        method: "POST",
      }
    ).then((r) => r.request),

  revokeRecordAccess: (requestId) =>
    request(
      `/patients/me/record-access-requests/${requestId}/revoke`,
      {
        method: "POST",
      }
    ).then((r) => r.request),

  // ---------- consents ----------

  getConsents: () =>
    request("/consents").then((r) =>
      (r.consents || []).map(normalizeConsent)
    ),

  getPatientConsents: () =>
    request("/consents").then((r) =>
      (r.consents || []).map(normalizeConsent)
    ),

  grantConsent: (licenseId) =>
    request("/consents", {
      method: "POST",
      body: { licenseId },
    }).then((r) => r.consent),

  revokeConsent: (doctorId) =>
    request(`/consents/${doctorId}`, {
      method: "DELETE",
    }).then((r) => r.consent),

  // ---------- prescriptions ----------

  // The doctor's password unlocks their signing key on the server for this one signature.
  createPrescription: ({ patientId, approvalId, title, medications, diagnosis, symptoms, notes, followUp, followUpDate, password }) =>
    request("/doctor/prescriptions", {
      method: "POST",
      body: {
        patientId,
        approvalId,
        title: title || undefined,
        medications,
        diagnosis: diagnosis || undefined,
        symptoms: symptoms || undefined,
        notes: notes || undefined,
        followUp: followUp || undefined,
        followUpDate: followUpDate || undefined,
        password,
      },
    }).then((r) => r.prescription),

  requestPrescriptionApproval: (patientId) =>
    request(`/doctor/patients/${patientId}/prescription-requests`, {
      method: "POST",
    }).then((r) => r.approval),

  getPrescriptionApprovalsForDoctor: (patientId) =>
    request(`/doctor/patients/${patientId}/prescription-requests`).then(
      (r) => r.approvals || []
    ),

  getPrescriptionRequests: () =>
    request("/patients/me/prescription-requests").then(
      (r) => r.approvals || []
    ),

  decidePrescriptionRequest: (requestId, decision) =>
    request(`/patients/me/prescription-requests/${requestId}/${decision}`, {
      method: "POST",
    }).then((r) => r.approval),

  viewPatientPrescription: (prescriptionId) =>
    request(`/patients/me/prescriptions/${prescriptionId}`),

  // ---------- pharmacy sharing ----------

  sharePrescription: (prescriptionId, pharmacyLicenseId) =>
    request(`/patients/me/prescriptions/${prescriptionId}/shares`, {
      method: "POST",
      body: { pharmacyLicenseId },
    }).then((r) => r.share),

  // Checks a pharmacy ID before the patient shares prescriptions with it.
  findPharmacy: (licenseId) =>
    request(`/patients/me/pharmacies/${encodeURIComponent(licenseId)}`).then((r) => r.pharmacy),

  getPrescriptionShares: () =>
    request("/patients/me/prescription-shares").then((r) => r.shares || []),

  revokePrescriptionShare: (shareId) =>
    request(`/patients/me/prescription-shares/${shareId}/revoke`, {
      method: "POST",
    }).then((r) => r.share),

  getSharedWithPharmacy: () =>
    request("/pharmacy/shares").then((r) => r.shares || []),

  openSharedPrescription: (shareId) => request(`/pharmacy/shares/${shareId}`),

  dispensePrescription: (shareId, password) =>
    request(`/pharmacy/shares/${shareId}/dispense`, {
      method: "POST",
      body: { password },
    }).then((r) => r.dispensed),

  getPatientPrescriptions: () =>
    request("/patients/me/prescriptions").then(
      (r) => r.prescriptions
    ),

  fetchPatientPrescriptionFile: (prescriptionId) =>
    fetchFile(`/patients/me/prescriptions/${prescriptionId}/download`),

  // Doctor: prescriptions of a patient who has linked them.
  getPatientPrescriptionsForDoctor: (patientId) =>
    request(`/doctor/patients/${patientId}/prescriptions`).then((r) => r.prescriptions || []),

  viewPrescriptionForDoctor: (patientId, prescriptionId) =>
    request(`/doctor/patients/${patientId}/prescriptions/${prescriptionId}`),

  // Each view needs the patient's approval, and is used up once opened.
  requestPrescriptionViewForDoctor: (patientId, prescriptionId) =>
    request(`/doctor/patients/${patientId}/prescriptions/${prescriptionId}/view-requests`, { method: "POST" }).then((r) => r.request),

  // Patient: doctors asking to view a prescription.
  getPrescriptionViewRequests: () =>
    request("/patients/me/prescription-view-requests").then((r) => r.requests || []),

  decidePrescriptionViewRequest: (requestId, decision) =>
    request(`/patients/me/prescription-view-requests/${requestId}/decision`, {
      method: "POST",
      body: { decision },
    }).then((r) => r.request),

  downloadPatientPrescription: (prescriptionId, filename) =>
    downloadFile(`/patients/me/prescriptions/${prescriptionId}/download`, filename),

  getPharmacyHistory: () =>
    request("/pharmacy/history").then((r) => r.history),

  // ---------- emergency medical profile ----------

  
  // ---------- emergency medical profile ----------

  getOwnEmergencyProfile: () =>
    request("/patients/me/emergency-profile").then((r) => r.profile),

  // Doctor: request, list and use emergency-profile permissions.
  requestEmergencyProfilePermission: (patientId, operation) =>
    request(
      `/doctor/patients/${patientId}/emergency-profile-access-requests`,
      {
        method: "POST",
        body: { operation },
      }
    ).then((r) => r.request),

  getEmergencyProfilePermissionRequestsForDoctor: (patientId) =>
    request(
      `/doctor/patients/${patientId}/emergency-profile-access-requests`
    ).then((r) => r.requests || []),

  // Patient: list requests and approve or reject one.
  getMyEmergencyProfilePermissionRequests: () =>
    request("/patients/me/emergency-profile-access-requests").then(
      (r) => r.requests || []
    ),

  decideEmergencyProfilePermission: (requestId, status) =>
    request(
      `/patients/me/emergency-profile-access-requests/${requestId}/decision`,
      {
        method: "POST",
        body: { status },
      }
    ).then((r) => r.request),

  // A view request ID is required by the backend for doctor profile reads.
  getPatientEmergencyProfile: (patientId, approvalRequestId) =>
    request(
      `/doctor/patients/${patientId}/emergency-profile?approvalRequestId=${encodeURIComponent(approvalRequestId)}`
    ).then((r) => r.profile),

  // Create/update expect approvalRequestId and reason in the JSON body.
  createPatientEmergencyProfile: (
    patientId,
    profile,
    approvalRequestId,
    reason,
    password
  ) =>
    request(`/doctor/patients/${patientId}/emergency-profile`, {
      method: "POST",
      body: { ...profile, approvalRequestId, reason, password },
    }).then((r) => r.profile),

  updatePatientEmergencyProfile: (
    patientId,
    changes,
    approvalRequestId,
    reason,
    password
  ) =>
    request(`/doctor/patients/${patientId}/emergency-profile`, {
      method: "PATCH",
      body: { ...changes, approvalRequestId, reason, password },
    }).then((r) => r.profile),

  // ---------- emergency access ----------

  // Glass-break: the doctor's password signs the request; access opens once it verifies.
  grantEmergencyAccess: ({ patientId, reason, durationMinutes, password }) =>
    request("/emergency-access", {
      method: "POST",
      body: { patientId, reason, durationMinutes, password },
    }).then((r) => r.emergencyAccess),

  getMyEmergencyGrants: () =>
    request("/emergency-access").then((r) => r.grants || []),

  viewEmergencyBasicProfile: (patientUserId) =>
    request(`/emergency-access/patients/${patientUserId}/basic-profile`),

  getEmergencyAccessOnMe: () =>
    request("/patients/me/emergency-access").then((r) => r.grants || []),

  revokeEmergencyAccess: (grantId) =>
    request(`/patients/me/emergency-access/${grantId}/revoke`, {
      method: "POST",
    }).then((r) => r.grant),

  // ---------- audit ----------

  getMyAuditLog: () =>
    request("/audit-events/me").then((r) => r.events),

  // ---------- admin ----------

  getPendingApprovals: () =>
    request("/admin/users/pending").then((r) =>
      (r.users || []).map(normalizeUser)
    ),

  approveUser: (id) =>
    request(`/admin/users/${id}/approve`, {
      method: "POST",
    }).then((r) => normalizeUser(r.user)),

  rejectUser: (id) =>
    request(`/admin/users/${id}/reject`, {
      method: "POST",
    }).then((r) => normalizeUser(r.user)),

  getAllUsers: () =>
    request("/admin/users").then((r) =>
      (r.users || []).map(normalizeUser)
    ),

  getIntegrityStatus: () => request("/admin/integrity"),

  runIntegrityCheck: () =>
    request("/admin/integrity/run", { method: "POST" }).then((r) => r.check),

  getAuditLog: () =>
    request("/admin/audit-events").then((r) =>
      (r.events || []).map(normalizeAuditEvent)
    ),

  getChainLog: () =>
    request("/admin/audit-events").then((r) =>
      (r.events || [])
        .filter(
          (event) =>
            event.blockchain_tx_hash || event.blockchainTxHash
        )
        .map((event) => ({
          tx_id:
            event.blockchain_tx_hash || event.blockchainTxHash,
          action_type: event.event_type || event.eventType,
          payload_hash:
            event.resource_id || event.resourceId || "recorded",
          created_at: event.created_at || event.createdAt,
        }))
    ),
};

