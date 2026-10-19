"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { StatCard, EmptyState, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function AdminDashboard() {
  const [pending, setPending] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [counts, setCounts] = useState(null);

  function load() {
    api.getPendingApprovals().then(setPending);
    api.getAllUsers().then((users) => {
      setCounts({
        total: users.length,
        doctors: users.filter((u) => u.role === "doctor" && u.approval_status === "active").length,
        pharmacies: users.filter((u) => u.role === "pharmacy" && u.approval_status === "active").length,
      });
    });
  }

  useEffect(load, []);

  async function decide(id, decision) {
    setBusyId(id);
    try {
      if (decision === "approve") await api.approveUser(id);
      else await api.rejectUser(id);
      setPending((cur) => cur.filter((p) => p.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PortalShell
      role="admin"
      eyebrow="Admin Portal"
      title="Overview"
      subtitle="Approve platform access. Admins never see medical record contents."
    >
      {counts && (
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Pending approvals" value={pending ? pending.length : "—"} icon={<Dot color="var(--amber)" />} />
          <StatCard label="Approved doctors" value={counts.doctors} icon={<Dot color="var(--primary)" />} />
          <StatCard label="Approved pharmacies" value={counts.pharmacies} icon={<Dot color="var(--primary)" />} />
          <StatCard label="Total accounts" value={counts.total} icon={<Dot color="var(--muted)" />} />
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>Pending approvals</h3>
        <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 0 14px" }}>
          Reviewing a license identifies who's asking to join — it does not grant them access to any patient data.
        </p>

        {pending && pending.length === 0 && (
          <EmptyState title="All caught up" body="No doctor or pharmacy registrations are waiting on review." />
        )}

        {pending && pending.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>License</th>
                <th>Requested</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12.5 }}>{p.email}</div>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{p.role}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{p.license_id}</td>
                  <td style={{ color: "var(--muted)" }}>{fmtDate(p.created_at)}</td>
                  <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost btn-sm" disabled={busyId === p.id} onClick={() => decide(p.id, "reject")}>
                      Reject
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={busyId === p.id} onClick={() => decide(p.id, "approve")}>
                      Approve
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

function Dot({ color }) {
  return <div style={{ width: 10, height: 10, borderRadius: 999, background: color }} />;
}
