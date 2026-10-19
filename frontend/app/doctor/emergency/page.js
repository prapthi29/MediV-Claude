"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { EmptyState, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

const DURATIONS = [15, 30, 45];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EmergencyAccess() {
  const [patientId, setPatientId] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [confirmed, setConfirmed] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [grant, setGrant] = useState(null);
  const [records, setRecords] = useState(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!grant?.expiresAt) {
      setLeft(0);
      return;
    }

    const updateCountdown = () => {
      const secondsRemaining = Math.max(
        0,
        Math.ceil((new Date(grant.expiresAt).getTime() - Date.now()) / 1000)
      );

      setLeft(secondsRemaining);

      if (secondsRemaining === 0) {
        setRecords(null);
      }
    };

    updateCountdown();

    const timer = window.setInterval(updateCountdown, 1000);

    return () => window.clearInterval(timer);
  }, [grant]);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    // Hide any previous patient's records before starting a new request.
    setGrant(null);
    setRecords(null);
    setLeft(0);

    const normalizedPatientId = patientId.trim();
    const normalizedReason = reason.trim();

    if (!UUID_PATTERN.test(normalizedPatientId)) {
      setError("Enter a valid patient ID in UUID format.");
      return;
    }

    if (normalizedReason.length < 10) {
      setError("Describe the emergency in at least 10 characters.");
      return;
    }

    if (normalizedReason.length > 1000) {
      setError("Keep the emergency description within 1,000 characters.");
      return;
    }

    if (!DURATIONS.includes(minutes)) {
      setError("Choose a valid emergency-access duration.");
      return;
    }

    if (!confirmed) {
      setError("Confirm that this is a genuine medical emergency.");
      return;
    }

    setSubmitting(true);

    try {
      const requestedExpiry = new Date(
        Date.now() + minutes * 60 * 1000
      ).toISOString();

      const response = await api.grantEmergencyAccess({
        patientId: normalizedPatientId,
        reason: normalizedReason,
        expiresAt: requestedExpiry,
      });

      // Prefer the expiry returned by the backend.
      const emergencyAccess = response?.emergencyAccess || response?.access;
      const expiresAt = emergencyAccess?.expiresAt || requestedExpiry;

      if (!Number.isFinite(new Date(expiresAt).getTime())) {
        throw new Error("The server returned an invalid expiry time.");
      }

      if (new Date(expiresAt).getTime() <= Date.now()) {
        throw new Error("Emergency access has already expired.");
      }

      // Fetch records only after access creation succeeds.
      const emergencyRecords = await api.getEmergencyEssentialRecords(
        normalizedPatientId
      );

      setGrant({
        patientId: normalizedPatientId,
        expiresAt,
      });

      setRecords(Array.isArray(emergencyRecords) ? emergencyRecords : []);
      setSuccess("Emergency access was requested successfully.");
      setConfirmed(false);
    } catch (err) {
      if (err.status === 404) {
        setError("No patient was found, or the requested resource is unavailable.");
      } else if (err.status === 400) {
        setError("The request was rejected. Check the reason and duration.");
      } else if (err.status === 401 || err.status === 403) {
        setError("You are not authorized to access these emergency records.");
      } else {
        setError(
          err.message ||
            "Emergency access could not be completed. Please try again."
        );
      }

      setGrant(null);
      setRecords(null);
    } finally {
      setSubmitting(false);
    }
  }

  const active =
    Boolean(grant) &&
    left > 0 &&
    new Date(grant.expiresAt).getTime() > Date.now();

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Emergency access"
      subtitle="Break-glass access to emergency-essential records. Access is time-limited and should be audited by the backend."
    >
      <div
        className="card"
        style={{
          marginBottom: 20,
          border: "1px solid var(--border, #e5e7eb)",
        }}
      >
        <strong>Emergency access notice</strong>
        <p
          style={{
            color: "var(--muted)",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 0,
          }}
        >
          Use this workflow only for genuine medical emergencies. Enter a
          specific clinical reason. Access should be restricted by the server,
          recorded in the audit log, and automatically expire.
        </p>
      </div>

      <div className="grid grid-2">
        <form className="card card-pad" onSubmit={handleSubmit}>
          <h3 style={{ marginTop: 0 }}>Request emergency access</h3>

          <div className="field">
            <label htmlFor="emergency-patient-id">Patient ID</label>
            <input
              id="emergency-patient-id"
              className="mono"
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              required
            />
            <div className="field-hint">
              Enter the patient UUID supplied through your authorized
              clinical workflow.
            </div>
          </div>

          <div className="field">
            <label htmlFor="emergency-reason">
              Reason for emergency access
            </label>
            <textarea
              id="emergency-reason"
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe the emergency and why these records are needed."
              minLength={10}
              maxLength={1000}
              required
            />
            <div className="field-hint">
              10–1,000 characters. Provide a genuine clinical reason; the
              backend should retain it in the audit trail.
            </div>
          </div>

          <div className="field">
            <label htmlFor="emergency-duration">Access duration</label>
            <select
              id="emergency-duration"
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            >
              {DURATIONS.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} minutes
                </option>
              ))}
            </select>
          </div>

          <label
            style={{
              display: "flex",
              gap: 9,
              alignItems: "flex-start",
              fontSize: 12.5,
              color: "var(--muted)",
              marginBottom: 14,
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              style={{ width: "auto", marginTop: 2 }}
              required
            />
            I confirm that this is a genuine medical emergency and understand
            that the access request should be logged and reviewed.
          </label>

          {error && (
            <div
              className="error-text"
              role="alert"
              style={{ marginBottom: 12 }}
            >
              {error}
            </div>
          )}

          {success && (
            <p
              role="status"
              style={{ color: "var(--primary)", fontSize: 13 }}
            >
              {success}
            </p>
          )}

          <button
            className="btn btn-danger"
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "11px 14px",
              marginTop: 8,
            }}
          >
            {submitting ? "Requesting access…" : "Request emergency access"}
          </button>
        </form>

        <div className="card card-pad">
          <h3 style={{ marginTop: 0 }}>Emergency session</h3>

          {!grant && (
            <EmptyState
              title="No active emergency session"
              body="After the backend grants access and the records are retrieved, the emergency-essential records will appear here."
            />
          )}

          {grant && (
            <>
              <div
                className={`badge ${
                  active ? "badge-red" : "badge-muted"
                }`}
                role="status"
                aria-live="polite"
              >
                {active
                  ? `Access active · ${mm}:${ss} remaining`
                  : "Access expired"}
              </div>

              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--muted)",
                  overflowWrap: "anywhere",
                  marginTop: 12,
                }}
              >
                Patient ID: <span className="mono">{grant.patientId}</span>
              </p>

              <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
                Expires: {fmtDate(grant.expiresAt)}
              </p>

              {!active && (
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: 13,
                    marginTop: 14,
                  }}
                >
                  The session has expired. Records are hidden in this
                  interface. A new request must be authorized by the backend.
                </p>
              )}

              {active && records?.length === 0 && (
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: 13,
                    marginTop: 14,
                  }}
                >
                  No emergency-essential records were returned for this
                  patient.
                </p>
              )}

              {active && records?.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ marginTop: 14 }}>
                    <thead>
                      <tr>
                        <th>Title / file</th>
                        <th>Category</th>
                        <th>Date</th>
                      </tr>
                    </thead>

                    <tbody>
                      {records.map((record) => (
                        <tr key={record.id}>
                          <td style={{ fontWeight: 600 }}>
                            {record.title || record.originalFilename || "—"}
                          </td>
                          <td style={{ color: "var(--muted)" }}>
                            {record.category || "—"}
                          </td>
                          <td style={{ color: "var(--muted)" }}>
                            {fmtDate(record.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
