
"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { StatCard, StatusBadge, EmptyState, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function DoctorDashboard() {
  const [patients, setPatients] = useState(null);
  const [licenseId, setLicenseId] = useState(null);
  const [name, setName] = useState("");

  useEffect(() => {
    api.getDoctorPatients().then(setPatients);

    // Read the doctor's license ID from the session.
    try {
      const stored = JSON.parse(window.localStorage.getItem("sch_user") || "null");
      const storedLicense = stored?.licenseId || stored?.license_id;
      if (storedLicense) setLicenseId(storedLicense);
      if (stored?.name) setName(stored.name);
    } catch {
      // Ignore malformed or missing localStorage value.
    }
  }, []);

  const activeCount = patients ? patients.length : "-";

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title={`Welcome back${name ? `, ${name}` : ""}`}
      subtitle="Your access is patient-granted and revocable at any time — you only see what's currently shared with you."
    >
      <div className="grid grid-even-2" style={{ marginBottom: 20 }}>
        <StatCard label="License ID" value={<span className="mono" style={{ fontSize: 15 }}>{licenseId || "—"}</span>} icon={<Dot color="var(--muted)" />} />
        <StatCard label="Active patients" value={activeCount} icon={<Dot color="var(--primary)" />} />
      </div>

      <div className="card card-pad">
        <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>Your patients</h3>
        <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 0 14px" }}>
          Access shown here can be revoked by the patient at any time — a revoked patient disappears from this list immediately.
        </p>

        {patients && patients.length === 0 && (
          <EmptyState
            title="No active patients yet"
            body="Patients who grant you access will appear here."
          />
        )}

        {patients && patients.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Health ID</th>
                <th>Access</th>
                <th>Records</th>
                <th>Last visit</th>
              </tr>
            </thead>
            <tbody>
              {patients.slice(0, 5).map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{p.health_id}</td>
                  <td><StatusBadge status="active" /></td>
                  <td>{p.records_count}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDateTime(p.last_visit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PortalShell>
  );
}

function Dot({ color }) {
  return <div style={{ width: 10, height: 10, borderRadius: 999, background: color }} />;
}