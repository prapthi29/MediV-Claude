"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { EmptyState, fmtDate, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";

function PrescriptionView({ view, onDownload }) {
  const { prescription, medications, diagnosis, notes, integrity } = view;
  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{prescription.title || "Prescription"}</h3>
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
          {prescription.doctorName ? `by ${prescription.doctorName} · ` : ""}
          {fmtDateTime(prescription.createdAt)}
        </span>
      </div>
      <p style={{ fontSize: 13, margin: "0 0 12px" }}>
        <strong style={{ color: integrity.valid ? "var(--primary)" : "var(--red)" }}>{integrity.valid ? "Verified" : "Could not be verified"}</strong>
        {" · "}contents match: {integrity.contentHashValid ? "yes" : "no"}; doctor signature: {integrity.signatureValid ? "valid" : "invalid"}; on blockchain:{" "}
        {integrity.blockchainValid ? "yes" : "no"}
      </p>
      {medications ? (
        <table>
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
            {medications.map((m, i) => (
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
      ) : (
        <p style={{ fontSize: 13.5 }}>
          This prescription was uploaded as a file before typed prescriptions existed.{" "}
          <button className="btn btn-ghost btn-sm" onClick={onDownload}>
            Download
          </button>
        </p>
      )}
      {(diagnosis || notes) && (
        <dl style={{ margin: "12px 0 0", display: "grid", gridTemplateColumns: "minmax(110px, 160px) 1fr", gap: "6px 14px", fontSize: 13.5 }}>
          {diagnosis && (
            <>
              <dt style={{ color: "var(--muted)" }}>Diagnosis</dt>
              <dd style={{ margin: 0 }}>{diagnosis}</dd>
            </>
          )}
          {notes && (
            <>
              <dt style={{ color: "var(--muted)" }}>Advice</dt>
              <dd style={{ margin: 0 }}>{notes}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

export default function PatientPrescriptions() {
  const [prescriptions, setPrescriptions] = useState(null);
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const [rows, approvals] = await Promise.all([
      api.getPatientPrescriptions().catch(() => null),
      api.getPrescriptionRequests().catch(() => []),
    ]);
    if (rows) setPrescriptions(rows);
    setRequests(approvals);
  }

  useEffect(() => {
    let active = true;
    const refresh = () => active && document.visibilityState === "visible" && load();
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function decide(id, decision) {
    setBusyId(id);
    setError("");
    try {
      await api.decidePrescriptionRequest(id, decision);
      await load();
    } catch (e) {
      setError(e.message || "Couldn't update the request.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(id) {
    setError("");
    if (open?.prescription.id === id) return setOpen(null);
    try {
      setOpen(await api.viewPatientPrescription(id));
    } catch (e) {
      setError(e.message || "Couldn't open the prescription.");
    }
  }

  function copyId(id) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    });
  }

  const pending = requests.filter((r) => r.status === "pending");
  const unused = requests.filter((r) => r.status === "approved");

  return (
    <PortalShell
      role="patient"
      eyebrow="Patient Portal"
      title="Prescriptions"
      subtitle="Doctors ask you before writing each prescription. Every prescription is signed by the doctor and recorded on the blockchain."
    >
      {error && <div className="error-text" role="alert">{error}</div>}

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Doctor requests</h3>
        {pending.length === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>No requests waiting for you.</p>}
        {pending.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <span>
              <strong>{r.doctor_name || r.doctor_email}</strong> wants to write you a prescription
              {r.doctor_license_id && <span style={{ color: "var(--muted)", fontSize: 12 }}> · License {r.doctor_license_id}</span>}
              <span style={{ color: "var(--muted)", fontSize: 12 }}> · {fmtDateTime(r.requested_at)}</span>
            </span>
            <span style={{ whiteSpace: "nowrap" }}>
              <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "approve")}>
                Allow
              </button>{" "}
              <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "reject")}>
                Deny
              </button>
            </span>
          </div>
        ))}
        {unused.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <span>
              Approved for <strong>{r.doctor_name || r.doctor_email}</strong>, not used yet
            </span>
            <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "revoke")}>
              Revoke
            </button>
          </div>
        ))}
      </div>

      {open && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <PrescriptionView
            view={open}
            onDownload={() => api.downloadPatientPrescription(open.prescription.id, open.prescription.originalFilename || "prescription").catch((e) => setError(e.message))}
          />
        </div>
      )}

      <div className="card">
        {prescriptions && prescriptions.length === 0 && <EmptyState title="No prescriptions yet" body="Prescriptions a doctor issues you will appear here." />}
        {prescriptions && prescriptions.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Prescription</th>
                <th>Prescribed by</th>
                <th>Issued</th>
                <th>Prescription ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.map((p) => (
                <tr key={p.id}>
                  <td>{p.title || "Prescription"}</td>
                  <td style={{ color: "var(--muted)" }}>{p.doctorName || p.doctorEmail || "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDate(p.createdAt)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {p.id.slice(0, 8)}…{" "}
                    <button className="btn btn-ghost btn-sm" onClick={() => copyId(p.id)} style={{ padding: "2px 8px", fontSize: 11 }}>
                      {copiedId === p.id ? "Copied" : "Copy"}
                    </button>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-primary btn-sm" onClick={() => toggle(p.id)}>
                      {open?.prescription.id === p.id ? "Close" : "Open"}
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
