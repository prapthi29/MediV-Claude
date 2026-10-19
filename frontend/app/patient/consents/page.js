"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import TimeLeft from "../../../components/TimeLeft";
import { EmptyState, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function ConsentWallet() {
  const [consents, setConsents] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [licenseId, setLicenseId] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.getConsents().then(setConsents);
  }

  useEffect(load, []);

  async function grant(e) {
    e.preventDefault();
    setError("");
    if (!licenseId.trim()) {
      setError("Enter the doctor's medical license number.");
      return;
    }
    setBusyId("new");
    try {
      await api.grantConsent(licenseId.trim());
      setLicenseId("");
      load();
    } catch (err) {
      setError(err.message || "Couldn't grant access. Check the doctor ID and try again.");
    } finally {
      setBusyId(null);
    }
  }

  function dropExpired(doctorUserId) {
    setConsents((cur) => (cur || []).filter((c) => c.doctorUserId !== doctorUserId));
  }

  async function revoke(doctorUserId) {
    setBusyId(doctorUserId);
    try {
      await api.revokeConsent(doctorUserId);
      setConsents((cur) => cur.filter((c) => c.doctorUserId !== doctorUserId));
    } catch (err) {
      setError(err.message || "Couldn't revoke access. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PortalShell
      role="patient"
      eyebrow="Patient Portal"
      title="Consent wallet"
      subtitle="Linking a doctor gives them 30 minutes of access. You can revoke it sooner, and they need a new link after it ends."
    >
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>Grant access to a doctor</h3>
        <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 0 14px" }}>
          Enter the doctor's medical license number. MediVault checks that it belongs to an active, approved doctor account. Access ends automatically after 30 minutes, and you still approve each record request separately.
        </p>
        <form onSubmit={grant} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0, flex: "1 1 240px" }}>
            <label>Doctor medical license number</label>
            <input value={licenseId} onChange={(e) => setLicenseId(e.target.value)} placeholder="Enter the license number used at registration" autoComplete="off" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busyId === "new"} style={{ padding: "10px 16px" }}>
            {busyId === "new" ? "Linking…" : "Link for 30 minutes"}
          </button>
        </form>
        {error && <div className="error-text">{error}</div>}
      </div>

      <div className="card">
        {consents && consents.length === 0 && (
          <EmptyState title="No active access" body="Doctors you grant access to will appear here." />
        )}
        {consents && consents.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Granted</th>
                <th>Time left</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {consents.map((c) => (
                <tr key={c.doctorUserId}>
                  <td style={{ fontWeight: 600 }}>{c.doctor_name || c.doctorEmail}{c.license_id ? <div style={{ color: "var(--muted)", fontSize: 12 }}>License: {c.license_id}</div> : null}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDateTime(c.createdAt)}</td>
                  <td><TimeLeft until={c.expiresAt} onExpire={() => dropExpired(c.doctorUserId)} /></td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-danger btn-sm" disabled={busyId === c.doctorUserId} onClick={() => revoke(c.doctorUserId)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PortalShell>
  );
}