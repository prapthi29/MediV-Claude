
"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { EmptyState, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

const EMPTY = {
  gender: "",
  dateOfBirth: "",
  bloodGroup: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
  allergiesStatus: "unknown",
  allergies: [],
  chronicConditionsStatus: "unknown",
  chronicConditions: [],
  medicationsStatus: "unknown",
  currentMedications: [],
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

function IntegrityNote({ profile }) {
  const signature = profile?.signature;
  const integrity = profile?.integrity;
  if (!signature?.profileSha256) {
    return (
      <p style={{ color: "var(--amber)", fontSize: 13, margin: "0 0 12px" }}>
        This profile was saved before verification was available. The next approved edit will verify it.
      </p>
    );
  }
  return (
    <div style={{ fontSize: 13, margin: "0 0 14px", color: "var(--muted)" }}>
      <div style={{ fontWeight: 600, color: integrity?.verified ? "var(--primary)" : "var(--red)" }}>
        {integrity?.verified ? "✓ Verified" : "Could not be verified"}
      </div>
      <div>
        Version {profile.version} · saved by {signature.signedByDoctorName || "doctor"} on {fmtDate(signature.signedAt)}
      </div>
    </div>
  );
}
const STATUSES = [
  { value: "unknown", label: "Unknown" },
  { value: "none_known", label: "None known" },
  { value: "provided", label: "Provided" },
];

const requestIdOf = (item) =>
  item?.id || item?.requestId || item?.request_id;

const requestStatusOf = (item) =>
  String(item?.status || "").toLowerCase();

const operationLabel = (operation) => {
  if (operation === "create") return "Create basic profile";
  if (operation === "update") return "Edit basic profile";
  return "View basic profile";
};

function toForm(profile) {
  const contact = profile?.emergencyContact || {};

  return {
    gender: profile?.gender || "",
    dateOfBirth: profile?.dateOfBirth || "",
    bloodGroup: profile?.bloodGroup || "",
    emergencyContactName: contact.name || "",
    emergencyContactPhone: contact.phone || "",
    emergencyContactRelationship: contact.relationship || "",
    allergiesStatus: profile?.allergiesStatus || "unknown",
    allergies: profile?.allergies || [],
    chronicConditionsStatus: profile?.chronicConditionsStatus || "unknown",
    chronicConditions: profile?.chronicConditions || [],
    medicationsStatus: profile?.medicationsStatus || "unknown",
    currentMedications: profile?.currentMedications || [],
  };
}

function normalizePayload(form) {
  return {
    gender: form.gender || undefined,
    dateOfBirth: form.dateOfBirth || undefined,
    bloodGroup: form.bloodGroup || null,
    emergencyContactName: form.emergencyContactName || null,
    emergencyContactPhone: form.emergencyContactPhone || null,
    emergencyContactRelationship:
      form.emergencyContactRelationship || null,
    allergies: form.allergies,
    allergiesStatus: form.allergiesStatus,
    chronicConditions: form.chronicConditions,
    chronicConditionsStatus: form.chronicConditionsStatus,
    currentMedications: form.currentMedications,
    medicationsStatus: form.medicationsStatus,
  };
}

function ListEditor({
  title,
  status,
  onStatus,
  items,
  onItems,
  fields,
  addLabel,
}) {
  function updateItem(index, field, value) {
    onItems(
      items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  }

  function changeStatus(value) {
    onStatus(value);

    if (value !== "provided") {
      onItems([]);
    } else if (items.length === 0) {
      onItems([
        Object.fromEntries(fields.map((field) => [field.key, ""])),
      ]);
    }
  }

  return (
    <section className="card card-pad" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>

      <label style={{ display: "block", marginBottom: 8 }}>
        Information status
      </label>

      <select
        className="input"
        value={status}
        onChange={(event) => changeStatus(event.target.value)}
        style={{ width: "100%", marginBottom: 14 }}
      >
        {STATUSES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>

      {status === "provided" &&
        items.map((item, index) => (
          <div
            key={index}
            style={{
              border: "1px solid var(--border, #ddd)",
              borderRadius: 10,
              padding: 12,
              marginBottom: 12,
            }}
          >
            {fields.map((field) => (
              <label
                key={field.key}
                style={{ display: "block", marginBottom: 10 }}
              >
                <span style={{ display: "block", marginBottom: 5 }}>
                  {field.label}
                </span>

                {field.options ? (
                  <select
                    className="input"
                    value={item[field.key] || ""}
                    onChange={(event) =>
                      updateItem(index, field.key, event.target.value)
                    }
                    style={{ width: "100%" }}
                  >
                    <option value="">Select severity</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.multiline ? (
                  <textarea
                    className="input"
                    value={item[field.key] || ""}
                    maxLength={1000}
                    onChange={(event) =>
                      updateItem(index, field.key, event.target.value)
                    }
                    style={{ width: "100%" }}
                  />
                ) : (
                  <input
                    className="input"
                    value={item[field.key] || ""}
                    maxLength={500}
                    onChange={(event) =>
                      updateItem(index, field.key, event.target.value)
                    }
                    style={{ width: "100%" }}
                    placeholder={field.label}
                  />
                )}
              </label>
            ))}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const next = items.filter((_, i) => i !== index);
                onItems(next);
                if (next.length === 0) onStatus("none_known");
              }}
            >
              Remove item
            </button>
          </div>
        ))}

      {status === "provided" && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            onItems([
              ...items,
              Object.fromEntries(
                fields.map((field) => [field.key, ""])
              ),
            ])
          }
        >
          + {addLabel}
        </button>
      )}
    </section>
  );
}

export default function DoctorEmergencyProfiles() {
  const [patients, setPatients] = useState(null);
  const [patientId, setPatientId] = useState("");
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [audit, setAudit] = useState([]);
  const [permissionRequests, setPermissionRequests] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requesting, setRequesting] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeApproval, setActiveApproval] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    api
      .getDoctorPatients()
      .then((data) => {
        if (active) setPatients(data);
      })
      .catch((err) => {
        if (active) {
          setPatients([]);
          setError(err.message || "Unable to load patients.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const loadRequests = useCallback(async (id) => {
    if (!id) {
      setPermissionRequests([]);
      return;
    }

    setLoadingRequests(true);

    try {
      const requests =
        await api.getEmergencyProfilePermissionRequestsForDoctor(id);

      setPermissionRequests(Array.isArray(requests) ? requests : []);
    } catch (err) {
      setError(
        err.message || "Unable to load basic profile permission requests."
      );
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  async function requestPermission(operation) {
    if (!patientId) return;

    setError("");
    setNotice("");
    setRequesting(operation);

    try {
      const created = await api.requestEmergencyProfilePermission(
        patientId,
        operation
      );

      setNotice(
        `Permission to ${operationLabel(operation).toLowerCase()} requested. The patient must approve it before you can proceed.`
      );

      await loadRequests(patientId);

      if (created) {
        setPermissionRequests((previous) => {
          const id = requestIdOf(created);
          if (!id || previous.some((item) => requestIdOf(item) === id)) {
            return previous;
          }
          return [created, ...previous];
        });
      }
    } catch (err) {
      setError(err.message || "Unable to request permission.");
    } finally {
      setRequesting("");
    }
  }

  async function loadPatient(id) {
    setPatientId(id);
    setProfile(null);
    setForm(EMPTY);
    setAudit([]);
    setReason("");
    setError("");
    setNotice("");
    setCreating(false);
    setActiveApproval(null);
    setPermissionRequests([]);

    if (!id) return;

    await loadRequests(id);
  }

  async function useApprovedRequest(request) {
    const approvalRequestId = requestIdOf(request);
    const operation = String(request.operation || "").toLowerCase();

    if (!approvalRequestId) {
      setError("The approved request has no valid ID. Refresh and try again.");
      return;
    }

    if (requestStatusOf(request) !== "approved") {
      setError("This permission request has not been approved.");
      return;
    }

    if (!["view", "create", "update"].includes(operation)) {
      setError("The permission request has an unsupported operation.");
      return;
    }

    setError("");
    setNotice("");
    setLoadingProfile(true);
    setActiveApproval(null);

    try {
      if (operation === "view") {
        const result = await api.getPatientEmergencyProfile(
          patientId,
          approvalRequestId
        );

        setProfile(result);
        setForm(toForm(result));
        setCreating(false);
        setNotice("Basic profile loaded using approved view permission.");

        try {
          const history = await api.getPatientEmergencyProfileAudit(
            patientId,
            approvalRequestId
          );
          setAudit(history || []);
        } catch {
          setAudit([]);
        }
      } else if (operation === "create") {
        if (profile) {
          setNotice(
            "A profile is already loaded. Use a separate approved update request to edit it."
          );
        } else {
          setForm(EMPTY);
          setCreating(true);
          setNotice(
            "Fill in the basic profile. The approved create permission will be used when you save."
          );
          setActiveApproval({
            id: approvalRequestId,
            operation,
          });
        }
      } else {
        if (!profile) {
          setError(
            "Load the existing profile using an approved view request first, then use an approved update request."
          );
        } else {
          setForm(toForm(profile));
          setCreating(false);
          setNotice(
            "Edit the profile. The approved update permission will be used when you save."
          );
          setActiveApproval({
            id: approvalRequestId,
            operation,
          });
        }
      }
    } catch (err) {
      setError(
        err.message ||
          "Unable to use this approved permission. It may have expired or already been used."
      );
      await loadRequests(patientId);
    } finally {
      setLoadingProfile(false);
    }
  }

  function setField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function validateForm() {
    for (const [
      statusKey,
      itemsKey,
      label,
      requiredFields,
    ] of [
      [
        "allergiesStatus",
        "allergies",
        "Allergies",
        ["substance", "reaction", "severity"],
      ],
      [
        "chronicConditionsStatus",
        "chronicConditions",
        "Chronic conditions",
        ["name"],
      ],
      [
        "medicationsStatus",
        "currentMedications",
        "Medications",
        ["name", "dosage", "frequency"],
      ],
    ]) {
      const items = form[itemsKey];

      if (form[statusKey] === "provided" && items.length === 0) {
        return `${label}: add at least one item or select another status.`;
      }

      if (form[statusKey] !== "provided" && items.length > 0) {
        return `${label}: clear the entries or select Provided.`;
      }

      for (const item of items) {
        if (
          requiredFields.some(
            (field) => !String(item[field] || "").trim()
          )
        ) {
          return `Complete all required fields for ${label.toLowerCase()}.`;
        }
      }
    }

    if (creating) {
      if (!form.gender) return "Select the patient's gender.";
      if (!form.dateOfBirth) return "Enter the patient's date of birth.";
      if (!form.bloodGroup) return "Select the patient's blood group.";
      if (!form.emergencyContactName.trim() || !form.emergencyContactPhone.trim()) {
        return "Enter the emergency contact's name and phone number.";
      }
    }
    if (form.dateOfBirth && form.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      return "Date of birth cannot be in the future.";
    }

    if (!reason.trim()) return "Enter a reason for this change.";
    if (!password) return "Enter your password to confirm this profile.";
    if (!activeApproval?.id) {
      return "An approved permission is required before saving.";
    }

    return "";
  }

  async function saveProfile() {
    setError("");
    setNotice("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const approval = activeApproval;

    if (
      (creating && approval.operation !== "create") ||
      (!creating && approval.operation !== "update")
    ) {
      setError(
        "The approved permission does not match this operation. Request the correct permission."
      );
      return;
    }

    setSaving(true);

    try {
      const payload = normalizePayload(form);
      let result;

      if (creating) {
        result = await api.createPatientEmergencyProfile(
          patientId,
          payload,
          approval.id,
          reason,
          password
        );
      } else {
        result = await api.updatePatientEmergencyProfile(
          patientId,
          payload,
          approval.id,
          reason,
          password
        );
      }

      setProfile(result);
      setForm(toForm(result));
      setCreating(false);
      setReason("");
      setPassword("");
      setActiveApproval(null);
      setNotice("Basic profile saved.");
      setPatients((list) =>
        (list || []).map((p) =>
          (p.patientUserId || p.id) === patientId ? { ...p, hasBasicProfile: true } : p
        )
      );

      try {
        // A separate approved view permission is needed for protected audit access.
        setAudit([]);
      } catch {
        setAudit([]);
      }

      await loadRequests(patientId);
    } catch (err) {
      setError(err.message || "Unable to save the basic profile.");
    } finally {
      setSaving(false);
    }
  }

  const selectedPatient = patients?.find(
    (patient) => (patient.patientUserId || patient.id) === patientId
  );

  // Before a basic profile exists it can only be created; afterwards only
  // viewed or edited.
  const hasProfile = Boolean(selectedPatient?.hasBasicProfile || profile);
  const allowedOperations = hasProfile ? ["view", "update"] : ["create"];

  const pendingRequests = permissionRequests.filter(
    (item) => requestStatusOf(item) === "pending"
  );

  const approvedRequests = permissionRequests.filter(
    (item) => requestStatusOf(item) === "approved"
  );

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Basic profiles"
      subtitle="Request patient permission before viewing, creating, or updating a patient's basic profile."
    >
      {error && (
        <div
          className="card card-pad"
          role="alert"
          style={{ marginBottom: 16, color: "var(--danger, #dc2626)" }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div className="card card-pad" role="status" style={{ marginBottom: 16 }}>
          {notice}
        </div>
      )}

      <section className="card card-pad" style={{ marginBottom: 20 }}>
        <label
          htmlFor="emergency-patient"
          style={{ display: "block", fontWeight: 600, marginBottom: 8 }}
        >
          Select patient
        </label>

        <select
          id="emergency-patient"
          className="input"
          value={patientId}
          onChange={(event) => loadPatient(event.target.value)}
          style={{ width: "100%" }}
        >
          <option value="">Choose a patient</option>
          {(patients || []).map((patient) => {
            const id = patient.patientUserId || patient.id;

            return (
              <option key={id} value={id}>
                {patient.name || patient.patientEmail || id}
              </option>
            );
          })}
        </select>

        {patients === null && <p>Loading patients...</p>}

        {patients?.length === 0 && (
          <EmptyState
            title="No patients available"
            body="Patients with an active connection to your account will appear here."
          />
        )}

        {selectedPatient && (
          <>
            <p style={{ color: "var(--muted)", marginTop: 12 }}>
              Patient:{" "}
              {selectedPatient.name ||
                selectedPatient.patientEmail ||
                patientId}
            </p>

            <h3>Request permission</h3>
            <p>
              {hasProfile
                ? "This patient already has a basic profile. Ask to view or edit it; each needs the patient's approval."
                : "This patient has no basic profile yet. Ask the patient's approval to create one."}
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {allowedOperations.map((operation) => (
                <button
                  key={operation}
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={Boolean(requesting)}
                  onClick={() => requestPermission(operation)}
                >
                  {requesting === operation
                    ? "Requesting..."
                    : `Ask to ${operationLabel(operation).toLowerCase()}`}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {patientId && (
        <section className="card card-pad" style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Permission requests</h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loadingRequests}
              onClick={() => loadRequests(patientId)}
            >
              {loadingRequests ? "Refreshing..." : "Refresh requests"}
            </button>
          </div>

          {loadingRequests && <p>Loading permission requests...</p>}

          {!loadingRequests && pendingRequests.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No pending requests.</p>
          )}

          {pendingRequests.map((item, index) => (
            <div
              key={requestIdOf(item) || index}
              style={{
                borderTop: "1px solid var(--border, #ddd)",
                padding: "12px 0",
              }}
            >
              <strong>{operationLabel(item.operation)}</strong>
              <p>Waiting for patient approval.</p>
              <span className="emergency-muted">
                Status: {item.status}
              </span>
            </div>
          ))}

          {approvedRequests.length > 0 && (
            <>
              <h4>Approved permissions</h4>
              <p>
                Use an approved permission for its matching operation. The
                backend may reject permissions that have already been used.
              </p>

              {approvedRequests.map((item, index) => (
                <div
                  key={requestIdOf(item) || index}
                  style={{
                    borderTop: "1px solid var(--border, #ddd)",
                    padding: "12px 0",
                  }}
                >
                  <strong>{operationLabel(item.operation)}</strong>
                  <p>
                    Approved{" "}
                    {item.decided_at || item.decidedAt
                      ? fmtDate(item.decided_at || item.decidedAt)
                      : ""}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={loadingProfile || saving}
                    onClick={() => useApprovedRequest(item)}
                  >
                    Use approved permission
                  </button>
                </div>
              ))}
            </>
          )}
        </section>
      )}

      {loadingProfile && (
        <div className="card card-pad">Using approved permission...</div>
      )}

      {patientId && !loadingProfile && (profile || creating) && (
        <>
          <section className="card card-pad" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>
              Basic and emergency contact details
            </h3>

            {profile && !creating && <IntegrityNote profile={profile} />}

            <label style={{ display: "block", marginBottom: 12 }}>
              Gender
              <select
                className="input"
                value={form.gender}
                onChange={(event) => setField("gender", event.target.value)}
                style={{ display: "block", width: "100%", marginTop: 5 }}
              >
                <option value="">Select</option>
                {GENDERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              Date of birth
              <input
                className="input"
                type="date"
                value={form.dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setField("dateOfBirth", event.target.value)}
                style={{ display: "block", width: "100%", marginTop: 5 }}
              />
              {ageFrom(form.dateOfBirth) !== null && (
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  Age {ageFrom(form.dateOfBirth)}
                </span>
              )}
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              Blood group
              <select
                className="input"
                value={form.bloodGroup}
                onChange={(event) =>
                  setField("bloodGroup", event.target.value)
                }
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 5,
                }}
              >
                <option value="">Select</option>
                {BLOOD_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>

            {[
              ["emergencyContactName", "Emergency contact name"],
              ["emergencyContactPhone", "Emergency contact phone"],
              [
                "emergencyContactRelationship",
                "Relationship (optional)",
              ],
            ].map(([key, label]) => (
              <label
                key={key}
                style={{ display: "block", marginBottom: 12 }}
              >
                {label}
                <input
                  className="input"
                  value={form[key]}
                  maxLength={key === "emergencyContactPhone" ? 30 : 200}
                  onChange={(event) => setField(key, event.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 5,
                  }}
                />
              </label>
            ))}
          </section>

          <ListEditor
            title="Allergies"
            status={form.allergiesStatus}
            onStatus={(value) => setField("allergiesStatus", value)}
            items={form.allergies}
            onItems={(value) => setField("allergies", value)}
            addLabel="Add allergy"
            fields={[
              { key: "substance", label: "Substance" },
              { key: "reaction", label: "Reaction" },
              {
                key: "severity",
                label: "Severity",
                options: ["mild", "moderate", "severe", "unknown"],
              },
            ]}
          />

          <ListEditor
            title="Chronic conditions"
            status={form.chronicConditionsStatus}
            onStatus={(value) =>
              setField("chronicConditionsStatus", value)
            }
            items={form.chronicConditions}
            onItems={(value) => setField("chronicConditions", value)}
            addLabel="Add condition"
            fields={[
              { key: "name", label: "Condition name" },
              {
                key: "notes",
                label: "Notes (optional)",
                multiline: true,
              },
            ]}
          />

          <ListEditor
            title="Current medications"
            status={form.medicationsStatus}
            onStatus={(value) => setField("medicationsStatus", value)}
            items={form.currentMedications}
            onItems={(value) => setField("currentMedications", value)}
            addLabel="Add medication"
            fields={[
              { key: "name", label: "Medication name" },
              { key: "dosage", label: "Dosage" },
              { key: "frequency", label: "Frequency" },
            ]}
          />

          <section className="card card-pad" style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>
              {creating ? "Create basic profile" : "Save changes"}
            </h3>

            {!activeApproval && (
              <p role="alert">
                Select a matching approved create or update permission before
                saving.
              </p>
            )}

            <label style={{ display: "block", marginBottom: 12 }}>
              Reason for{" "}
              {creating ? "creating this basic profile" : "this update"} (required)
              <textarea
                className="input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Document why these details are being recorded or changed."
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 5,
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              Your password
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                style={{ display: "block", width: "100%", marginTop: 5 }}
              />
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                Confirms that you are saving this profile.
              </span>
            </label>

            <button
              type="button"
              className="btn btn-primary"
              onClick={saveProfile}
              disabled={saving || !activeApproval}
            >
              {saving
                ? "Signing..."
                : creating
                  ? "Create basic profile"
                  : "Save changes"}
            </button>

            <p
              style={{
                color: "var(--muted)",
                fontSize: 13,
                marginBottom: 0,
                marginTop: 12,
              }}
            >
              Every saved version is kept and verified. The patient's approval
              is used up once you save.
            </p>
          </section>
        </>
      )}

      {profile && (
        <section className="card card-pad">
          <h3 style={{ marginTop: 0 }}>Audit history</h3>
          <p style={{ color: "var(--muted)" }}>
            Audit details are available only when authorized by the backend.
            Use a valid approved permission if the audit endpoint requires one.
          </p>

          {!audit.length && (
            <p style={{ color: "var(--muted)" }}>
              No audit entries available, or the history could not be loaded.
            </p>
          )}

          {audit.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Reason</th>
                    <th>Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((entry, index) => (
                    <tr
                      key={
                        entry.id ||
                        `${entry.createdAt || entry.created_at}-${index}`
                      }
                    >
                      <td>
                        {fmtDate(
                          entry.createdAt ||
                            entry.created_at ||
                            entry.at
                        )}
                      </td>
                      <td>
                        {entry.action ||
                          entry.eventType ||
                          entry.event_type ||
                          "Profile update"}
                      </td>
                      <td>{entry.reason || "—"}</td>
                      <td>
                        {entry.newValues || entry.new_values
                          ? JSON.stringify(
                              entry.newValues || entry.new_values
                            )
                          : "Details recorded"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </PortalShell>
  );
}
