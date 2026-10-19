"use client";
import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import TimeLeft from "../../../components/TimeLeft";
import { EmptyState, StatusBadge, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";
import { verifyPrescriptionInBrowser } from "../../../lib/verify-prescription";

function Check({ ok, label }) {
  return (
    <tr>
      <td style={{ color: "var(--muted)", width: 260 }}>{label}</td>
      <td style={{ fontWeight: 600, color: ok ? "var(--primary)" : "var(--red)" }}>{ok ? "Yes" : "No"}</td>
    </tr>
  );
}

export default function SharedPrescriptions() {
  const [shares, setShares] = useState(null);
  const [open, setOpen] = useState(null);
  const [browserCheck, setBrowserCheck] = useState(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");

  const load = useCallback(() => {
    api.getSharedWithPharmacy().then(setShares).catch(() => setShares([]));
  }, []);

  useEffect(() => {
    try {
      setPharmacyId(JSON.parse(window.localStorage.getItem("sch_user") || "null")?.licenseId || "");
    } catch {}
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  async function openShare(shareId) {
    setError("");
    setNotice("");
    setBrowserCheck(null);
    try {
      const view = await api.openSharedPrescription(shareId);
      setOpen(view);
      setBrowserCheck(await verifyPrescriptionInBrowser(view.medications, view.proof));
    } catch (err) {
      setOpen(null);
      setError(err.message || "Couldn't open this prescription.");
      load();
    }
  }

  async function dispense(e) {
    e.preventDefault();
    if (!password) return setError("Enter your password to sign the dispense.");
    setBusy(true);
    setError("");
    try {
      await api.dispensePrescription(open.share.id, password);
      setPassword("");
      await openShare(open.share.id);
      setNotice("Marked as dispensed and signed with your pharmacy key.");
      load();
    } catch (err) {
      setError(err.message || "Couldn't mark this prescription as dispensed.");
    } finally {
      setBusy(false);
    }
  }

  const verified = open && open.integrity.valid && browserCheck?.medicinesMatch && browserCheck?.signatureMatches;

  return (
    <PortalShell
      role="pharmacy"
      eyebrow="Pharmacy Portal"
      title="Shared prescriptions"
      subtitle="Patients share a prescription with your pharmacy ID for 30 minutes. You see the patient's name and the medicines only."
    >
      {pharmacyId && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>Your pharmacy ID</div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{pharmacyId}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Patients enter this to share a prescription with you.</div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        {shares === null && <p className="card-pad">Loading…</p>}
        {shares?.length === 0 && <EmptyState title="Nothing shared right now" body="When a patient shares a prescription with your pharmacy ID, it appears here for 30 minutes." />}
        {shares?.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Prescribed by</th>
                <th>Issued</th>
                <th>Time left</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shares.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.patientName}</td>
                  <td>{s.doctorName || "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDateTime(s.issuedAt)}</td>
                  <td>
                    <TimeLeft until={s.expiresAt} onExpire={load} />
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-primary btn-sm" onClick={() => openShare(s.id)}>
                      Open and verify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && (
        <div className="error-text" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {open && (
        <div className="card card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Patient</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{open.patientName}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                Prescribed by {open.doctorName}
                {open.doctorLicenseId ? ` (license ${open.doctorLicenseId})` : ""} on {fmtDateTime(open.issuedAt)}
              </div>
            </div>
            <StatusBadge status={open.dispensed ? "dispensed" : verified ? "valid" : "invalid"} />
          </div>

          <table style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Dose</th>
                <th>How often</th>
                <th>For how long</th>
                <th>Instructions</th>
              </tr>
            </thead>
            <tbody>
              {open.medications.map((m, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td>{m.dose}</td>
                  <td>{m.frequency}</td>
                  <td>{m.duration}</td>
                  <td>{m.instructions || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ marginBottom: 16 }}>
            <tbody>
              <Check ok={browserCheck?.signatureMatches} label="Doctor's signature (checked in your browser)" />
              <Check ok={browserCheck?.medicinesMatch} label="Medicines match what the doctor signed" />
              <Check ok={open.integrity.contentHashValid} label="Stored prescription unchanged" />
              <Check ok={open.integrity.blockchainValid} label="Hash recorded on the blockchain" />
            </tbody>
          </table>
          <p className="mono" style={{ fontSize: 11.5, color: "var(--muted)", wordBreak: "break-all", margin: "0 0 16px" }}>
            Signer {open.proof.signerAddress} · hash {open.proof.rootSha256}
          </p>

          {open.dispensed ? (
            <p style={{ fontWeight: 600, margin: 0 }}>Dispensed on {fmtDateTime(open.dispensed.at)}.</p>
          ) : verified ? (
            <form onSubmit={dispense} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ marginBottom: 0, flex: "1 1 240px" }}>
                <label htmlFor="dispense-password">Your password (signs the dispense)</label>
                <input id="dispense-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Signing…" : "Mark as dispensed"}
              </button>
            </form>
          ) : (
            <p style={{ color: "var(--red)", fontWeight: 600, margin: 0 }}>Do not dispense: this prescription did not verify.</p>
          )}
          {notice && <p style={{ color: "var(--primary)", fontWeight: 600, marginBottom: 0 }}>{notice}</p>}
        </div>
      )}
    </PortalShell>
  );
}
