"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import TimeLeft from "../../../components/TimeLeft";
import { EmptyState, fmtDate, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";
import { PrescriptionView, savePrescriptionPdf } from "../../../components/PrescriptionView";

// Where the prescription stands with pharmacies. Sharing itself happens in
// the consent wallet, where the patient links a pharmacy.
function DispenseNote({ prescription, shares }) {
  const active = shares.filter((s) => s.prescriptionId === prescription.id && s.status === "active");
  if (prescription.dispensedAt) {
    return <p style={{ marginTop: 16, fontWeight: 600 }}>Fully dispensed on {fmtDateTime(prescription.dispensedAt)}.</p>;
  }
  if (prescription.format !== "form") return null;
  return (
    <p style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
      {active.length > 0 ? (
        <>
          Shared with {active.map((s) => s.pharmacyName).join(", ")} · <TimeLeft until={active[0].expiresAt} />.{" "}
        </>
      ) : null}
      To give this to a pharmacy, link the pharmacy in your <Link href="/patient/consents">consent wallet</Link>.
    </p>
  );
}

export default function PatientPrescriptions() {
  const [prescriptions, setPrescriptions] = useState(null);
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(null);
  const [viewRequests, setViewRequests] = useState([]);
  const [shares, setShares] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const [rows, approvals, viewRows, shareRows] = await Promise.all([
      api.getPatientPrescriptions().catch(() => null),
      api.getPrescriptionRequests().catch(() => []),
      api.getPrescriptionViewRequests().catch(() => []),
      api.getPrescriptionShares().catch(() => []),
    ]);
    if (rows) setPrescriptions(rows);
    setRequests(approvals);
    setViewRequests(viewRows);
    setShares(shareRows);
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

  async function decide(id, decision, kind = "write") {
    setBusyId(id);
    setError("");
    try {
      if (kind === "view") {
        await api.decidePrescriptionViewRequest(id, { approve: "approved", reject: "rejected", revoke: "revoked" }[decision]);
      } else {
        await api.decidePrescriptionRequest(id, decision);
      }
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

  // Typed prescriptions download as a PDF; older uploaded ones as the file.
  async function download(id) {
    setError("");
    try {
      const view = open?.prescription.id === id ? open : await api.viewPatientPrescription(id);
      if (view.medications) savePrescriptionPdf(view);
      else await api.downloadPatientPrescription(id, view.prescription.originalFilename || "prescription");
    } catch (e) {
      setError(e.message || "Couldn't download the prescription.");
    }
  }

  const pending = [
    ...requests.filter((r) => r.status === "pending").map((r) => ({ ...r, kind: "write", what: "wants to write you a prescription" })),
    ...viewRequests.filter((r) => r.status === "pending").map((r) => ({ ...r, kind: "view", what: `wants to view “${r.prescription_title || "a prescription"}” once` })),
  ];
  const unused = [
    ...requests.filter((r) => r.status === "approved").map((r) => ({ ...r, kind: "write", what: "write a prescription" })),
    ...viewRequests.filter((r) => r.status === "approved").map((r) => ({ ...r, kind: "view", what: `view “${r.prescription_title || "a prescription"}”` })),
  ];

  return (
    <PortalShell
      role="patient"
      eyebrow="Patient Portal"
      title="Prescriptions"
      subtitle="Doctors ask you before writing or viewing each prescription. Only you can download them."
    >
      {error && <div className="error-text" role="alert">{error}</div>}

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Doctor requests</h3>
        {pending.length === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>No requests waiting for you.</p>}
        {pending.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <span>
              <strong>{r.doctor_name || r.doctor_email}</strong> {r.what}
              {r.doctor_license_id && <span style={{ color: "var(--muted)", fontSize: 12 }}> · License {r.doctor_license_id}</span>}
              <span style={{ color: "var(--muted)", fontSize: 12 }}> · {fmtDateTime(r.requested_at)}</span>
            </span>
            <span style={{ whiteSpace: "nowrap" }}>
              <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "approve", r.kind)}>
                Allow
              </button>{" "}
              <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "reject", r.kind)}>
                Deny
              </button>
            </span>
          </div>
        ))}
        {unused.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <span>
              <strong>{r.doctor_name || r.doctor_email}</strong> may {r.what}, not used yet
            </span>
            <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "revoke", r.kind)}>
              Revoke
            </button>
          </div>
        ))}
      </div>

      {open && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <PrescriptionView
            view={open}
            onDownload={() => download(open.prescription.id)}
            loadFile={() => api.fetchPatientPrescriptionFile(open.prescription.id)}
          />
          <DispenseNote prescription={prescriptions?.find((p) => p.id === open.prescription.id) || open.prescription} shares={shares} />
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.title || "Prescription"}
                    {p.dispensedAt && <span className="badge badge-muted" style={{ marginLeft: 8 }}>Dispensed</span>}
                    {shares.some((s) => s.prescriptionId === p.id && s.status === "active") && (
                      <span className="badge badge-amber" style={{ marginLeft: 8 }}>Shared</span>
                    )}
                  </td>
                  <td style={{ color: "var(--muted)" }}>{p.doctorName || p.doctorEmail || "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDate(p.createdAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => download(p.id)}>
                      Download
                    </button>{" "}
                    <button className="btn btn-primary btn-sm" onClick={() => toggle(p.id)}>
                      {open?.prescription.id === p.id ? "Close" : "View"}
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
