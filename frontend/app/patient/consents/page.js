"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { EmptyState, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function ConsentWallet() {
  const [consents, setConsents] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [licenseId, setLicenseId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.getConsents().then(setConsents);
  }

  useEffect(load, []);

  async function grant(e) {
    e.preventDefault();
    setError("");
    if (!licenseId.trim() || !expiresAt) {
      setError("Enter the doctor's medical license number and an expiry date.");
      return;
    }
    setBusyId("new");
    try {
      await api.grantConsent(licenseId.trim(), new Date(expiresAt).toISOString());
      setLicenseId("");
      setExpiresAt("");
      load();
    } catch (err) {
      setError(err.message || "Couldn't grant access. Check the doctor ID and try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(doctorUserId) {
    setBusyId(doctorUserId);
    try {
      await api.revokeConsent(doctorUserId);
      setConsents((cur) => cur.filter((c) => c.doctorUserId !== doctorUserId));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PortalShell
      role="patient"
      eyebrow="Patient Portal"
      title="Consent wallet"
      subtitle="Doctors can only view records and issue prescriptions for you while access is active."
    >
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>Grant access to a doctor</h3>
        <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 0 14px" }}>
          Enter the doctor's medical license number. MediVault checks that it belongs to an active, approved doctor account. You must still approve each record request separately.
        </p>
        <form onSubmit={grant} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0, flex: "1 1 240px" }}>
            <label>Doctor medical license number</label>
            <input value={licenseId} onChange={(e) => setLicenseId(e.target.value)} placeholder="Enter the license number used at registration" autoComplete="off" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Expires on</label>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busyId === "new"} style={{ padding: "10px 16px" }}>
            {busyId === "new" ? "Granting…" : "Grant access"}
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
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {consents.map((c) => (
                <tr key={c.doctorUserId}>
                  <td style={{ fontWeight: 600 }}>{c.doctor_name || c.doctorEmail}{c.license_id ? <div style={{ color: "var(--muted)", fontSize: 12 }}>License: {c.license_id}</div> : null}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDate(c.createdAt)}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDate(c.expiresAt)}</td>
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