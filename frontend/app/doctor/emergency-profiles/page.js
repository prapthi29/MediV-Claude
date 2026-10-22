
"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { FieldError, scrollToField } from "../../../components/FieldError";
import BasicProfileView from "../../../components/BasicProfileView";
import PhoneInput from "../../../components/PhoneInput";
import { toast } from "../../../components/Toast";
import { phoneProblem } from "../../../lib/phone";
import { EmptyState, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

const EMPTY = {
  gender: "",
  dateOfBirth: "",
  bloodGroup: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
  allergiesStatus: "none_known",
  allergies: [],
  chronicConditionsStatus: "none_known",
  chronicConditions: [],
  medicationsStatus: "none_known",
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
// "Unknown" and "None known" meant the same thing, so older "unknown"
// values are shown and saved as "None as of now".
const STATUSES = [
  { value: "none_known", label: "None as of now" },
  { value: "provided", label: "Provided" },
];
const statusOf = (value) => (value === "provided" ? "provided" : "none_known");

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
    allergiesStatus: statusOf(profile?.allergiesStatus),
    allergies: profile?.allergies || [],
    chronicConditionsStatus: statusOf(profile?.chronicConditionsStatus),
    chronicConditions: profile?.chronicConditions || [],
    medicationsStatus: statusOf(profile?.medicationsStatus),
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
  fieldKey,
  error,
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
    <section className="card card-pad" style={{ marginBottom: 16 }} data-field={fieldKey}>
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
      <FieldError message={error} />
    </section>
  );
}

function InlineNote({ value }) {
  if (!value) return null;
  return (
    <div className={value.kind === "error" ? "error-text field-error" : "inline-note"} role={value.kind === "error" ? "alert" : "status"}>
      {value.text}
    </div>
  );
}

export default function DoctorEmergencyProfiles() {
  const [patients, setPatients] = useState(null);
  const [patientId, setPatientId] = useState("");
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [permissionRequests, setPermissionRequests] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  // The ask buttons wait for the first load, so they don't flash and vanish.
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [requesting, setRequesting] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeApproval, setActiveApproval] = useState(null);
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  // Results shown next to the button that caused them, keyed by that button.
  const [notes, setNotes] = useState({});
  const note = (key, kind, text) => setNotes((n) => ({ ...n, [key]: { kind, text } }));

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
          toast.error(err.message || "Unable to load patients.");
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
      setRequestsLoaded(true);
    } catch (err) {
      toast.error(
        err.message || "Unable to load basic profile permission requests."
      );
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  async function requestPermission(operation) {
    if (!patientId) return;

    setRequesting(operation);

    try {
      const created = await api.requestEmergencyProfilePermission(
        patientId,
        operation
      );

      const sent = `Request sent. ${operationLabel(operation)} can be used once the patient approves.`;
      note("request", "ok", sent);
      toast.success(sent);

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
      note("request", "error", err.message || "Unable to request permission.");
      toast.error(err.message || "Unable to request permission.");
    } finally {
      setRequesting("");
    }
  }

  async function loadPatient(id) {
    setPatientId(id);
    setProfile(null);
    setForm(EMPTY);
    setReason("");
    setCreating(false);
    setActiveApproval(null);
    setPermissionRequests([]);
    setRequestsLoaded(false);
    setNotes({});
    setFieldErrors({});

    if (!id) return;

    await loadRequests(id);
  }

  async function useApprovedRequest(request) {
    const approvalRequestId = requestIdOf(request);
    const operation = String(request.operation || "").toLowerCase();
    const fail = (text) => {
      note(approvalRequestId, "error", text);
      toast.error(text);
    };

    if (!approvalRequestId || requestStatusOf(request) !== "approved" || !["view", "create", "update"].includes(operation)) {
      fail("This permission can't be used. Refresh the requests and try again.");
      return;
    }

    setNotes({});
    setFieldErrors({});
    setLoadingProfile(true);
    setActiveApproval(null);

    try {
      if (operation === "view") {
        const result = await api.getPatientEmergencyProfile(patientId, approvalRequestId);
        setProfile(result);
        setForm(toForm(result));
        setCreating(false);
        toast.success("Basic profile opened.");
        // The view approval is used up now.
        loadRequests(patientId);
      } else if (operation === "create") {
        setForm(EMPTY);
        setCreating(true);
        setActiveApproval({ id: approvalRequestId, operation });
        toast.success("Fill in the basic profile below and save it.");
        scrollToField("gender");
      } else {
        // An approved edit loads the current profile without using up the approval.
        const current = await api.getPatientEmergencyProfile(patientId, approvalRequestId);
        setProfile(current);
        setForm(toForm(current));
        setCreating(false);
        setActiveApproval({ id: approvalRequestId, operation });
        toast.success("Make your changes below and save them.");
        scrollToField("gender");
      }
    } catch (err) {
      fail(err.message || "Unable to use this permission. It may have expired or already been used.");
      await loadRequests(patientId);
    } finally {
      setLoadingProfile(false);
    }
  }

  function setField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    clearFieldError(field);
  }

  function clearFieldError(field) {
    setFieldErrors((previous) => {
      if (!previous[field] && !previous.submit) return previous;
      const { [field]: _removed, submit: _submit, ...rest } = previous;
      return rest;
    });
  }

  // Collects every problem, keyed by the field it belongs under.
  function validateForm() {
    const errs = {};
    const add = (key, message) => {
      if (!errs[key]) errs[key] = message;
    };
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
        add(itemsKey, `Add at least one item, or choose another status.`);
      }

      if (form[statusKey] !== "provided" && items.length > 0) {
        add(itemsKey, `Clear the entries, or choose Recorded.`);
      }

      for (const item of items) {
        if (
          requiredFields.some(
            (field) => !String(item[field] || "").trim()
          )
        ) {
          add(itemsKey, `Fill in every required field for ${label.toLowerCase()}.`);
        }
      }
    }

    if (creating) {
      if (!form.gender) add("gender", "Select the patient's gender.");
      if (!form.dateOfBirth) add("dateOfBirth", "Enter the patient's date of birth.");
      if (!form.bloodGroup) add("bloodGroup", "Select the patient's blood group.");
      if (!form.emergencyContactName.trim()) {
        add("emergencyContactName", "Enter the emergency contact's name.");
      }
      if (!form.emergencyContactPhone.trim()) {
        add("emergencyContactPhone", "Enter the emergency contact's phone number.");
      }
    }
    if (form.emergencyContactPhone && phoneProblem(form.emergencyContactPhone)) {
      add("emergencyContactPhone", phoneProblem(form.emergencyContactPhone));
    }
    if (form.dateOfBirth && form.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      add("dateOfBirth", "Date of birth cannot be in the future.");
    }

    if (!reason.trim()) add("reason", "Enter a reason for this change.");
    if (!password) add("password", "Enter your password to confirm this profile.");
    if (!activeApproval?.id) {
      add("submit", "An approved permission is required before saving.");
    }

    return errs;
  }

  async function saveProfile() {

    const errs = validateForm();
    setFieldErrors(errs);

    if (Object.keys(errs).length) {
      scrollToField(Object.keys(errs));
      return;
    }

    const approval = activeApproval;

    if (
      (creating && approval.operation !== "create") ||
      (!creating && approval.operation !== "update")
    ) {
      setFieldErrors({
        submit: "The approved permission does not match this operation. Request the correct permission.",
      });
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
      toast.success("Basic profile saved.");
      setPatients((list) =>
        (list || []).map((p) =>
          (p.patientUserId || p.id) === patientId ? { ...p, hasBasicProfile: true } : p
        )
      );

      await loadRequests(patientId);
    } catch (err) {
      setFieldErrors({ submit: err.message || "Unable to save the basic profile." });
      toast.error(err.message || "Unable to save the basic profile.");
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

  // Only permissions that still fit this patient are shown.
  const approvedRequests = permissionRequests.filter(
    (item) =>
      requestStatusOf(item) === "approved" &&
      !(item.used_at || item.usedAt) &&
      allowedOperations.includes(String(item.operation).toLowerCase())
  );

  // Once a request is waiting or approved, asking again is not offered.
  const openOperations = new Set(
    [...pendingRequests, ...approvedRequests].map((item) => String(item.operation).toLowerCase())
  );
  const askOperations = requestsLoaded
    ? allowedOperations.filter((operation) => !openOperations.has(operation))
    : [];

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Basic profiles"
      subtitle="Request patient permission before viewing, creating, or updating a patient's basic profile."
    >
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
              {!requestsLoaded
                ? "Checking your permissions..."
                : askOperations.length === 0
                ? "Your request is with the patient. Its status is shown below."
                : hasProfile
                  ? "This patient already has a basic profile. Ask to view or edit it; each needs the patient's approval."
                  : "This patient has no basic profile yet. Ask the patient's approval to create one."}
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {askOperations.map((operation) => (
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
            <InlineNote value={notes.request} />
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
            <h3 style={{ marginTop: 0 }}>Active permissions</h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loadingRequests}
              onClick={() => loadRequests(patientId)}
            >
              {loadingRequests ? "Refreshing..." : "Refresh requests"}
            </button>
          </div>

          {loadingRequests && <p>Loading permissions...</p>}

          {!loadingRequests && pendingRequests.length === 0 && approvedRequests.length === 0 && (
            <p style={{ color: "var(--muted)" }}>No active permissions.</p>
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
              <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>Waiting for the patient to approve.</p>
            </div>
          ))}

          {approvedRequests.map((item, index) => (
            <div
              key={requestIdOf(item) || index}
              style={{
                borderTop: "1px solid var(--border, #ddd)",
                padding: "12px 0",
              }}
            >
              <strong>{operationLabel(item.operation)}</strong>
              <p style={{ color: "var(--muted)", margin: "4px 0 8px" }}>
                Approved by the patient. It can be used once.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={loadingProfile || saving}
                onClick={() => useApprovedRequest(item)}
              >
                {operationLabel(item.operation)}
              </button>
              <InlineNote value={notes[requestIdOf(item)]} />
            </div>
          ))}
        </section>
      )}

      {loadingProfile && (
        <div className="card card-pad">Opening...</div>
      )}

      {patientId && !loadingProfile && profile && !activeApproval && (
        <section className="card card-pad" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Basic profile</h3>
          <BasicProfileView profile={profile} />
        </section>
      )}

      {patientId && !loadingProfile && activeApproval && (
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
                data-field="gender"
                style={{ display: "block", width: "100%", marginTop: 5 }}
              >
                <option value="">Select</option>
                {GENDERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.gender} />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              Date of birth
              <input
                className="input"
                type="date"
                value={form.dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setField("dateOfBirth", event.target.value)}
                data-field="dateOfBirth"
                style={{ display: "block", width: "100%", marginTop: 5 }}
              />
              {ageFrom(form.dateOfBirth) !== null && (
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  Age {ageFrom(form.dateOfBirth)}
                </span>
              )}
              <FieldError message={fieldErrors.dateOfBirth} />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              Blood group
              <select
                className="input"
                value={form.bloodGroup}
                onChange={(event) =>
                  setField("bloodGroup", event.target.value)
                }
                data-field="bloodGroup"
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
              <FieldError message={fieldErrors.bloodGroup} />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              Emergency contact phone
              <PhoneInput
                value={form.emergencyContactPhone}
                dataField="emergencyContactPhone"
                onChange={(value) => setField("emergencyContactPhone", value)}
              />
              <FieldError message={fieldErrors.emergencyContactPhone} />
            </label>

            {[
              ["emergencyContactName", "Emergency contact name"],
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
                  maxLength={200}
                  onChange={(event) => setField(key, event.target.value)}
                  data-field={key}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 5,
                  }}
                />
                <FieldError message={fieldErrors[key]} />
              </label>
            ))}
          </section>

          <ListEditor
            title="Allergies"
            fieldKey="allergies"
            error={fieldErrors.allergies}
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
            fieldKey="chronicConditions"
            error={fieldErrors.chronicConditions}
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
            fieldKey="currentMedications"
            error={fieldErrors.currentMedications}
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

            <label style={{ display: "block", marginBottom: 12 }}>
              Reason for{" "}
              {creating ? "creating this basic profile" : "this update"} (required)
              <textarea
                className="input"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  clearFieldError("reason");
                }}
                data-field="reason"
                maxLength={1000}
                rows={3}
                placeholder="Document why these details are being recorded or changed."
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 5,
                }}
              />
              <FieldError message={fieldErrors.reason} />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              Your password
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearFieldError("password");
                }}
                data-field="password"
                style={{ display: "block", width: "100%", marginTop: 5 }}
              />
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                Confirms that you are saving this profile.
              </span>
              <FieldError message={fieldErrors.password} />
            </label>

            <div data-field="submit">
              <FieldError message={fieldErrors.submit} />
            </div>

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

    </PortalShell>
  );
}
