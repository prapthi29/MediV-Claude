"use client";
import { useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { StatusBadge, VerifyChip, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function VerifyPrescription() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [searchedId, setSearchedId] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!id.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.verifyPrescription(id.trim());
      setResult(res);
      setSearchedId(id.trim());
    } catch (err) {
      setError("Couldn't reach verification — try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  const found = result && (result.valid || result.status === "valid" || result.status === "expired" || result.status === "revoked");

  return (
    <PortalShell
      role="pharmacy"
      eyebrow="Pharmacy Portal"
      title="Verify a prescription"
      subtitle="Checked against the signature and chain hash alone — no access to the patient's broader record."
    >
      <div className="grid grid-2">
        <div className="card card-pad">
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Prescription ID</label>
              <input className="mono" value={id} onChange={(e) => setId(e.target.value)} placeholder="p-1" />
              <div className="field-hint">Scan or enter the ID the patient shared with you.</div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: "11px 14px" }}>
              {loading ? "Verifying…" : "Verify"}
            </button>
            {error && <div className="error-text">{error}</div>}
          </form>
        </div>

        <div className="card card-pad">
          {!result && (
            <div style={{ color: "var(--muted)", fontSize: 13.5 }}>
              Results appear here — medication, dosage, prescribing doctor, and validity only. Nothing else about the patient is exposed.
            </div>
          )}

          {result && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 2 }}>Prescription</div>
                  <div className="mono" style={{ fontWeight: 600 }}>{searchedId}</div>
                </div>
                <StatusBadge status={result.valid ? "valid" : "invalid"} />
              </div>

              <table style={{ marginBottom: 12 }}>
                <tbody>
                  <tr><td style={{ color: "var(--muted)", width: 160 }}>Signature valid</td><td>{result.signatureValid ? "Yes" : "No"}</td></tr>
                  <tr><td style={{ color: "var(--muted)" }}>Content hash matches</td><td>{result.contentHashValid ? "Yes" : "No"}</td></tr>
                  <tr><td style={{ color: "var(--muted)" }}>On-chain verified</td><td>{result.blockchainValid ? "Yes" : "No"}</td></tr>
                  <tr><td style={{ color: "var(--muted)" }}>Issued</td><td>{fmtDate(result.issuedAt)}</td></tr>
                </tbody>
              </table>

              {!result.valid && (
                <div style={{ color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>
                  This prescription failed verification. Don't dispense against it.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
