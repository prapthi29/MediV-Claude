
"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { api } from "../../../lib/api";

const GENDER_LABEL = { female: "Female", male: "Male", other: "Other", prefer_not_to_say: "Prefer not to say" };

function displayValue(value) {
  return value && String(value).trim() ? value : "Not recorded";
}

function StatusLabel({ status }) {
  const provided = status === "provided";
  return (
    <span className={`emergency-status emergency-status-${provided ? "provided" : "none_known"}`}>
      {provided ? "Provided" : "None as of now"}
    </span>
  );
}

function Section({ title, status, children }) {
  return (
    <section className="emergency-card">
      <div className="emergency-card-heading">
        <h2>{title}</h2>
        {status && <StatusLabel status={status} />}
      </div>
      {children}
    </section>
  );
}

function requestIdOf(item) {
  return item?.id || item?.requestId || item?.request_id;
}

function doctorNameOf(item) {
  return (
    item?.doctorName ||
    item?.doctor_name ||
    item?.doctor?.name ||
    "Your doctor"
  );
}

function operationLabel(operation) {
  switch (String(operation || "view").toLowerCase()) {
    case "create":
      return "Create your basic profile";
    case "update":
      return "Edit your basic profile";
    default:
      return "View your basic profile";
  }
}

export default function PatientEmergencyProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [accessRequests, setAccessRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [decisionLoading, setDecisionLoading] = useState(null);

  const loadAccessRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestError("");

    try {
      const requests = await api.getMyEmergencyProfilePermissionRequests();
      setAccessRequests(Array.isArray(requests) ? requests : []);
    } catch (err) {
      setRequestError(
        err?.message || "Unable to load basic profile access requests."
      );
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const result = await api.getOwnEmergencyProfile();
        if (!cancelled) setProfile(result || null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.message ||
              "Unable to load your basic profile."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();
    loadAccessRequests();

    return () => {
      cancelled = true;
    };
  }, [loadAccessRequests]);

  async function handleDecision(requestId, status) {
    if (!requestId) {
      setRequestError("This request has no valid ID. Refresh and try again.");
      return;
    }

    setDecisionLoading(requestId);
    setRequestError("");
    setRequestMessage("");

    try {
      await api.decideEmergencyProfilePermission(requestId, status);

      setAccessRequests((previous) =>
        previous.map((item) =>
          requestIdOf(item) === requestId
            ? { ...item, status }
            : item
        )
      );

      setRequestMessage(
        status === "approved"
          ? "Request approved. The doctor may now use the approved permission."
          : "Request rejected."
      );

      // Refresh from the backend to reflect its authoritative request status.
      await loadAccessRequests();
    } catch (err) {
      setRequestError(
        err?.message || "Unable to update the permission request."
      );
    } finally {
      setDecisionLoading(null);
    }
  }

  function renderAccessRequests() {
    const pendingRequests = accessRequests.filter(
      (item) => String(item?.status || "").toLowerCase() === "pending"
    );

    return (
      <section className="emergency-card" style={{ marginTop: 20 }}>
        <div className="emergency-card-heading">
          <h2>Doctor requests</h2>
        </div>

        <p>
          Review requests to view, create, or edit your basic profile.
          Approve only requests you recognize and agree to.
        </p>

        {requestMessage && (
          <div role="status" aria-live="polite" className="emergency-notice">
            {requestMessage}
          </div>
        )}

        {requestError && (
          <div role="alert" className="emergency-alert">
            {requestError}
          </div>
        )}

        {requestsLoading ? (
          <p>Loading requests...</p>
        ) : pendingRequests.length === 0 ? (
          <p className="emergency-muted">No pending requests.</p>
        ) : (
          pendingRequests.map((item, index) => {
            const id = requestIdOf(item);
            const operation = item?.operation || "view";
            const doctorName = doctorNameOf(item);
            const busy = decisionLoading === id;

            return (
              <div
                key={id || `request-${index}`}
                style={{
                  borderTop: "1px solid var(--border, #ddd)",
                  padding: "14px 0",
                }}
              >
                <strong>{doctorName}</strong>
                <p>{operationLabel(operation)}</p>

                {(item?.doctorLicense ||
                  item?.doctor_license ||
                  item?.licenseNumber ||
                  item?.license_number) && (
                  <p className="emergency-muted">
                    License:{" "}
                    {item.doctorLicense ||
                      item.doctor_license ||
                      item.licenseNumber ||
                      item.license_number}
                  </p>
                )}

                {(item?.requestedAt ||
                  item?.requested_at ||
                  item?.createdAt ||
                  item?.created_at) && (
                  <p className="emergency-muted">
                    Requested:{" "}
                    {new Date(
                      item.requestedAt ||
                        item.requested_at ||
                        item.createdAt ||
                        item.created_at
                    ).toLocaleString()}
                  </p>
                )}

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !id}
                  onClick={() => handleDecision(id, "approved")}
                >
                  {busy ? "Processing..." : "Approve"}
                </button>{" "}

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || !id}
                  onClick={() => handleDecision(id, "rejected")}
                >
                  Reject
                </button>
              </div>
            );
          })
        )}
      </section>
    );
  }

  const shellProps = {
    role: "patient",
    eyebrow: "Patient Portal",
    title: "Basic profile",
    subtitle:
      "Your essential medical information: blood group, allergies, conditions, medicines and an emergency contact. Doctors need your permission to view or change it.",
  };

  if (loading) {
    return (
      <PortalShell {...shellProps}>
        <p className="emergency-muted">Loading your basic profile...</p>
      </PortalShell>
    );
  }

  const contact = profile?.emergencyContact || {};

  return (
    <PortalShell {...shellProps}>
      {error && (
        <div className="emergency-alert" role="alert">
          {error}
        </div>
      )}

      {renderAccessRequests()}

      {!profile ? (
        <div className="emergency-empty" style={{ marginTop: 20 }}>
          <h2>Your profile is not available yet</h2>
          <p>
            An active doctor with the required patient consent can request
            permission to create your basic profile.
            You can review that request above.
          </p>
        </div>
      ) : (
        <>
          <div className="emergency-notice" style={{ marginTop: 20 }}>
            <strong>Keep this information accurate.</strong>
            <span>
              If any details are incorrect, contact your doctor. Clinical
              changes must follow the required authorization process.
            </span>
          </div>

          <section className="emergency-card emergency-overview">
            <div>
              <span className="emergency-field-label">Patient</span>
              <strong>{displayValue(profile.patientName)}</strong>
            </div>
            <div>
              <span className="emergency-field-label">Patient ID</span>
              <strong>
                {displayValue(profile.patientId || profile.patientUserId)}
              </strong>
            </div>
            <div>
              <span className="emergency-field-label">Blood group</span>
              <strong className="emergency-blood-group">
                {displayValue(profile.bloodGroup)}
              </strong>
            </div>
            <div>
              <span className="emergency-field-label">Gender</span>
              <strong>{displayValue(GENDER_LABEL[profile.gender] || profile.gender)}</strong>
            </div>
            <div>
              <span className="emergency-field-label">Date of birth</span>
              <strong>
                {displayValue(profile.dateOfBirth)}
                {profile.age !== null && profile.age !== undefined ? ` (age ${profile.age})` : ""}
              </strong>
            </div>
          </section>

          <Section title="Added by">
            {profile.signature?.profileSha256 ? (
              <p>
                <strong style={{ color: profile.integrity?.verified ? "var(--primary)" : "var(--red)" }}>
                  {profile.integrity?.verified ? "Verified" : "Could not be verified"}
                </strong>
                {" · "}Version {profile.version}, added by{" "}
                {displayValue(profile.signature.signedByDoctorName)} on{" "}
                {new Date(profile.signature.signedAt).toLocaleString()}.
                              </p>
            ) : (
              <p>This profile was added before verification was available.</p>
            )}
          </Section>

          <Section title="Emergency contact">
            <div className="emergency-details-grid">
              <div>
                <span className="emergency-field-label">Name</span>
                <p>{displayValue(contact.name)}</p>
              </div>
              <div>
                <span className="emergency-field-label">Phone</span>
                <p>{displayValue(contact.phone)}</p>
              </div>
              <div>
                <span className="emergency-field-label">Relationship</span>
                <p>{displayValue(contact.relationship)}</p>
              </div>
            </div>
          </Section>

          <Section title="Allergies" status={profile.allergiesStatus}>
            {profile.allergiesStatus === "provided" ? (
              <ul className="emergency-list">
                {(profile.allergies || []).map((item, index) => (
                  <li key={`${item.substance}-${index}`}>
                    <strong>{item.substance}</strong>
                    <span>Reaction: {displayValue(item.reaction)}</span>
                    <span>Severity: {displayValue(item.severity)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emergency-muted">
                No allergies as of now.
              </p>
            )}
          </Section>

          <Section
            title="Chronic conditions"
            status={profile.chronicConditionsStatus}
          >
            {profile.chronicConditionsStatus === "provided" ? (
              <ul className="emergency-list">
                {(profile.chronicConditions || []).map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <strong>{item.name}</strong>
                    {item.notes && <span>{item.notes}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emergency-muted">
                No chronic conditions as of now.
              </p>
            )}
          </Section>

          <Section title="Current medications" status={profile.medicationsStatus}>
            {profile.medicationsStatus === "provided" ? (
              <ul className="emergency-list">
                {(profile.currentMedications || []).map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <strong>{item.name}</strong>
                    <span>Dosage: {displayValue(item.dosage)}</span>
                    <span>Frequency: {displayValue(item.frequency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emergency-muted">
                No current medications as of now.
              </p>
            )}
          </Section>

          <footer className="emergency-page-footer">
            <p>
              Last reviewed:{" "}
              {profile.lastReviewedAt
                ? new Date(profile.lastReviewedAt).toLocaleString()
                : "Not recorded"}
            </p>
            <p>This information may change. Confirm details with a clinician.</p>
          </footer>
        </>
      )}
    </PortalShell>
  );
}
