"use client";
import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import TimeLeft from "../../../components/TimeLeft";
import BasicProfileView from "../../../components/BasicProfileView";
import { api } from "../../../lib/api";
import { FieldError, scrollToField } from "../../../components/FieldError";
import { toast } from "../../../components/Toast";

const DURATIONS = [15, 30, 45];
export default function EmergencyAccess() {
  const [healthId, setHealthId] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState(15);
  const [password, setPassword] = useState("");
  const [grants, setGrants] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.getMyEmergencyGrants().then(setGrants).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  function clearFieldError(key) {
    setFieldErrors((errs) => {
      if (!errs[key] && !errs.submit) return errs;
      const { [key]: _gone, submit: _submit, ...rest } = errs;
      return rest;
    });
  }

  async function breakGlass(e) {
    e.preventDefault();
    setError("");
    // Each problem is shown under its own field; the page scrolls to the first.
    const errs = {};
    if (!healthId.trim()) errs.healthId = "Enter the patient's health ID.";
    if (reason.trim().length < 10) errs.reason = "Describe the emergency in at least 10 characters.";
    if (!password) errs.password = "Enter your password to confirm the request.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return scrollToField(Object.keys(errs));
    setBusy(true);
    try {
      await api.grantEmergencyAccess({ patientId: healthId.trim(), reason: reason.trim(), durationMinutes: duration, password });
      setHealthId("");
      setReason("");
      setPassword("");
      toast.success("Emergency access opened. The patient has been alerted.");
      load();
    } catch (err) {
      setFieldErrors({ submit: err.message || "Emergency access could not be opened." });
      toast.error(err.message || "Emergency access could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function viewProfile(patientUserId) {
    setError("");
    try {
      const { profile } = await api.viewEmergencyBasicProfile(patientUserId);
      setProfiles((prev) => ({ ...prev, [patientUserId]: profile }));
    } catch (err) {
      setProfiles((prev) => ({ ...prev, [patientUserId]: undefined }));
      setError(err.message || "Couldn't open the basic profile.");
      toast.error(err.message || "Couldn't open the basic profile.");
      load();
    }
  }

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Emergency access"
      subtitle="For emergencies only. You confirm the request with your password, the patient is alerted at once and can end it, and you see their basic profile only."
    >
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <form className="card card-pad" onSubmit={breakGlass}>
          <div className="field">
            <label htmlFor="eg-health-id">Patient health ID</label>
            <input
              id="eg-health-id"
              data-field="healthId"
              className="mono"
              value={healthId}
              onChange={(e) => {
                clearFieldError("healthId");
                setHealthId(e.target.value);
              }}
              placeholder="MV-XXXXXXXX"
              autoComplete="off"
            />
            <FieldError message={fieldErrors.healthId} />
          </div>
          <div className="field">
            <label htmlFor="eg-reason">Reason</label>
            <textarea
              id="eg-reason"
              data-field="reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => {
                clearFieldError("reason");
                setReason(e.target.value);
              }}
              placeholder="e.g. Unconscious in the emergency room, need allergies and blood group"
            />
            <FieldError message={fieldErrors.reason} />
          </div>
          <div className="field">
            <label>How long</label>
            <div style={{ display: "flex", gap: 16 }}>
              {DURATIONS.map((d) => (
                <label key={d} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 500 }}>
                  <input type="radio" name="duration" checked={duration === d} onChange={() => setDuration(d)} />
                  {d} minutes
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="eg-password">Your password</label>
            <input
              id="eg-password"
              data-field="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                clearFieldError("password");
                setPassword(e.target.value);
              }}
            />
            <FieldError message={fieldErrors.password} />
          </div>
          <FieldError message={fieldErrors.submit} />
          <button className="btn btn-danger" type="submit" disabled={busy}>
            {busy ? "Opening…" : "Open emergency access"}
          </button>
        </form>

        <div className="card card-pad">
          <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>Open emergency access</h3>
          {grants.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>None right now.</p>}
          {grants.map((g) => (
            <div key={g.id} style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <strong>{g.patientName || "Patient"}</strong> <span className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>{g.patientHealthId}</span>
                  <div style={{ fontSize: 12.5 }}>
                    <TimeLeft until={g.expiresAt} onExpire={load} /> · verified
                  </div>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => viewProfile(g.patientUserId)}>
                  View basic profile
                </button>
              </div>
              {profiles[g.patientUserId] && (
                <div style={{ marginTop: 12 }}>
                  <BasicProfileView profile={profiles[g.patientUserId]} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PortalShell>
  );
}
