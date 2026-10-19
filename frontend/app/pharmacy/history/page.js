"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { StatusBadge, EmptyState, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function PharmacyHistory() {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let active = true;
    const refresh = () => api.getPharmacyHistory().then((rows) => { if (active) setHistory(rows); }).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return (
    <PortalShell
      role="pharmacy"
      eyebrow="Pharmacy Portal"
      title="Verification history"
      subtitle="Every prescription ID you've checked, and what came back."
    >
      <div className="card">
        {history && history.length === 0 && (
          <EmptyState title="No verifications yet" body="Prescriptions you verify will show up here." />
        )}
        {history && history.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Prescription ID</th>
                <th>Result</th>
                <th>Medication</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{h.prescription_id}</td>
                  <td><StatusBadge status={h.result} /></td>
                  <td style={{ color: "var(--muted)" }}>{h.medication_summary}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDateTime(h.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PortalShell>
  );
}
