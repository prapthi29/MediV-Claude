"use client";
import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { StatusBadge, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

const ROLES = ["all", "doctor", "pharmacy", "admin"];

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api.getAllUsers().then(setUsers);
  }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    return filter === "all" ? users : users.filter((u) => u.role === filter);
  }, [users, filter]);

  return (
    <PortalShell role="admin" eyebrow="Admin Portal" title="Doctors and pharmacies" subtitle="Patient accounts are not visible to admins.">
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {ROLES.map((r) => (
          <button key={r} className={`btn btn-sm ${filter === r ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(r)} style={{ textTransform: "capitalize" }}>
            {r}
          </button>
        ))}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>License</th>
              <th>Signing key</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12.5 }}>{u.email}</div>
                </td>
                <td style={{ textTransform: "capitalize" }}>{u.role}</td>
                <td className="mono" style={{ color: "var(--muted)" }}>{u.license_id || "—"}</td>
                <td className="mono" style={{ color: "var(--muted)" }} title={u.blockchain_address || ""}>
                  {u.role === "admin" || !u.blockchain_address ? "—" : `${u.blockchain_address.slice(0, 6)}…${u.blockchain_address.slice(-4)}`}
                </td>
                <td><StatusBadge status={u.approval_status} /></td>
                <td style={{ color: "var(--muted)" }}>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
