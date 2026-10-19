"use client";
import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { StatusBadge, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

const ROLES = ["all", "patient", "doctor", "pharmacy", "admin"];

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
    <PortalShell role="admin" eyebrow="Admin Portal" title="All users" subtitle="Directory only — record contents stay off-limits to admin accounts.">
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
              <th>Identifier</th>
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
                <td className="mono" style={{ color: "var(--muted)" }}>{u.health_id || u.license_id || "—"}</td>
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
