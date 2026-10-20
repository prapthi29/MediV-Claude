"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { EmptyState, fmtDateTime } from "../../../components/ui";
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
      title="Dispensing history"
      subtitle="Prescriptions you have dispensed. Once dispensed, you no longer have access to the prescription itself."
    >
      <div className="card">
        {history && history.length === 0 && (
          <EmptyState title="Nothing dispensed yet" body="Prescriptions you mark as dispensed will show up here." />
        )}
        {history && history.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Medicines</th>
                <th>Dispensed</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{h.patient_id || "—"}</td>
                  <td>{h.medication_summary}</td>
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
