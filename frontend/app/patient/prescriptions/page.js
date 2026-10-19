"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { EmptyState, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function PatientPrescriptions() {
  const [prescriptions, setPrescriptions] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => api.getPatientPrescriptions().then((rows) => { if (active) setPrescriptions(rows); }).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  function copyId(id) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    });
  }

  return (
    <PortalShell
      role="patient"
      eyebrow="Patient Portal"
      title="Prescriptions"
      subtitle="Share the ID with a pharmacy — they verify the document's signature and chain hash, nothing else about you."
    >
      {error && <div className="error-text" role="alert">{error}</div>}
      <div className="card">
        {prescriptions && prescriptions.length === 0 && (
          <EmptyState title="No prescriptions yet" body="Prescriptions a doctor issues you will appear here." />
        )}
        {prescriptions && prescriptions.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Prescription ID</th>
                <th>Title</th>
                <th>Prescribed by</th>
                <th>Issued</th>
                <th>Chain status</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.map((p) => (
                <tr key={p.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{p.id}</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => copyId(p.id)}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        {copiedId === p.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </td>
                  <td>{p.title || "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{p.doctorName || p.doctorEmail || "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDate(p.createdAt)}</td>
                  <td style={{ textTransform: "capitalize" }}>{p.blockchainStatus}</td>
                  <td><button className="btn btn-primary btn-sm" onClick={() => api.downloadPatientPrescription(p.id, p.originalFilename || "prescription").catch((e) => setError(e.message || "Download failed."))}>Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PortalShell>
  );
}