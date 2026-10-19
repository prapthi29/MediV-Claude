"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";

const ACTION_TONE = {
  "record.view": "badge-muted",
  "record.create": "badge-mint",
  "prescription.issue": "badge-mint",
  "prescription.verify": "badge-muted",
  "consent.grant": "badge-mint",
  "consent.revoke": "badge-amber",
  "user.approve": "badge-mint",
  "user.reject": "badge-red",
};

export default function AuditLog() {
  const [log, setLog] = useState(null);

  useEffect(() => {
    api.getAuditLog().then(setLog);
  }, []);

  return (
    <PortalShell role="admin" eyebrow="Admin Portal" title="Audit log" subtitle="Every sensitive action — who did what, to what, and when.">
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {log?.map((entry) => (
              <tr key={entry.id}>
                <td style={{ fontWeight: 600 }}>{entry.actor}</td>
                <td><span className={`badge ${ACTION_TONE[entry.action] || "badge-muted"}`}>{entry.action}</span></td>
                <td style={{ color: "var(--muted)" }}>{entry.target}</td>
                <td style={{ color: "var(--muted)" }}>{fmtDateTime(entry.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
