"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import TimeLeft from "../../../components/TimeLeft";
import { EmptyState, fmtDate, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";
import { makeTextPdf, safeFilename, saveBlob } from "../../../lib/pdf";

// A typed prescription as a PDF the patient can keep.
function savePrescriptionPdf(view) {
  const { prescription, medications, diagnosis, notes, integrity } = view;
  const blocks = [
    { type: "title", text: prescription.title || "Prescription" },
    { type: "row", label: "Prescribed by", text: prescription.doctorName || "-" },
    { type: "row", label: "Issued", text: prescription.createdAt ? new Date(prescription.createdAt).toLocaleString() : "-" },
    { type: "row", label: "Prescription ID", text: prescription.id },
  ];
  if (prescription.dispensedAt) blocks.push({ type: "row", label: "Dispensed", text: new Date(prescription.dispensedAt).toLocaleString() });
  blocks.push({ type: "heading", text: "Medicines" });
  (medications || []).forEach((m, i) => {
    blocks.push({ type: "text", text: `${i + 1}. ${m.name}: ${[m.dose, m.frequency, m.duration].filter(Boolean).join(", ")}` });
    if (m.instructions) blocks.push({ type: "muted", text: `    ${m.instructions}` });
  });
  if (diagnosis) blocks.push({ type: "heading", text: "Diagnosis" }, { type: "text", text: diagnosis });
  if (notes) blocks.push({ type: "heading", text: "Advice" }, { type: "text", text: notes });
  blocks.push(
    { type: "heading", text: "Verification" },
    { type: "muted", text: `${integrity?.valid ? "Verified" : "Could not be verified"}. Contents match: ${integrity?.contentHashValid ? "yes" : "no"}; doctor signature: ${integrity?.signatureValid ? "valid" : "invalid"}; on blockchain: ${integrity?.blockchainValid ? "yes" : "no"}.` }
  );
  saveBlob(makeTextPdf(blocks), safeFilename(prescription.title || "prescription", "pdf"));
}

function SharePanel({ prescription, shares, onShare, onRevoke, busy }) {
  const [pharmacyId, setPharmacyId] = useState("");
  const mine = shares.filter((s) => s.prescriptionId === prescription.id);
  const active = mine.filter((s) => s.status === "active");

  if (prescription.dispensedAt) {
    const by = mine.find((s) => s.status === "dispensed");
    return (
      <p style={{ marginTop: 16, fontWeight: 600 }}>
        Dispensed{by?.pharmacyName ? ` by ${by.pharmacyName}` : ""} on {fmtDateTime(prescription.dispensedAt)}. It can't be shared again.
      </p>
    );
  }
  if (prescription.format !== "form") return null;

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Share with a pharmacy</h4>
      <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 0 10px" }}>
        The pharmacy sees your name and the medicines for 30 minutes, not the diagnosis or advice. You can stop sharing sooner.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pharmacyId.trim()) onShare(prescription.id, pharmacyId.trim()).then((ok) => ok && setPharmacyId(""));
        }}
        style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <div className="field" style={{ marginBottom: 0, flex: "1 1 220px" }}>
          <label htmlFor="pharmacy-id">Pharmacy ID</label>
          <input id="pharmacy-id" value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} placeholder="The ID the pharmacy gives you" autoComplete="off" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy === "share"}>
          {busy === "share" ? "Sharing…" : "Share for 30 minutes"}
        </button>
      </form>
      {active.map((s) => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <span>
            Shared with <strong>{s.pharmacyName}</strong> · <TimeLeft until={s.expiresAt} />
          </span>
          <button className="btn btn-danger btn-sm" disabled={busy === s.id} onClick={() => onRevoke(s.id)}>
            Stop sharing
          </button>
        </div>
      ))}
    </div>
  );
}

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
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onDownload}>
          {medications ? "Download PDF" : "Download"}
        </button>
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
  const [shares, setShares] = useState([]);
  const [shareBusy, setShareBusy] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const [rows, approvals, shareRows] = await Promise.all([
      api.getPatientPrescriptions().catch(() => null),
      api.getPrescriptionRequests().catch(() => []),
      api.getPrescriptionShares().catch(() => []),
    ]);
    if (rows) setPrescriptions(rows);
    setRequests(approvals);
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

  async function share(prescriptionId, pharmacyLicenseId) {
    setShareBusy("share");
    setError("");
    try {
      await api.sharePrescription(prescriptionId, pharmacyLicenseId);
      await load();
      return true;
    } catch (e) {
      setError(e.message || "Couldn't share the prescription.");
      return false;
    } finally {
      setShareBusy(null);
    }
  }

  async function stopSharing(shareId) {
    setShareBusy(shareId);
    try {
      await api.revokePrescriptionShare(shareId);
      await load();
    } catch (e) {
      setError(e.message || "Couldn't stop sharing.");
    } finally {
      setShareBusy(null);
    }
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
            onDownload={() => download(open.prescription.id)}
          />
          <SharePanel
            prescription={prescriptions?.find((p) => p.id === open.prescription.id) || open.prescription}
            shares={shares}
            onShare={share}
            onRevoke={stopSharing}
            busy={shareBusy}
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
