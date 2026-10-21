"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { StatCard, EmptyState, fmtDateTime } from "../../../components/ui";
import { toast } from "../../../components/Toast";
import { api } from "../../../lib/api";

export default function DataIntegrity() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  function load() {
    api.getIntegrityStatus().then(setStatus).catch((err) => setError(err.message || "Could not load the integrity status."));
  }

  useEffect(load, []);

  async function runNow() {
    setRunning(true);
    try {
      const check = await api.runIntegrityCheck();
      if (check.status === "ok") toast.success("Everything matches the change log and the blockchain.");
      else toast.error(`${check.problems.length} problem${check.problems.length === 1 ? "" : "s"} found.`);
      load();
    } catch (err) {
      toast.error(err.message || "The check could not run.");
    } finally {
      setRunning(false);
    }
  }

  const check = status?.lastCheck;
  const problems = check?.problems || [];

  return (
    <PortalShell
      role="admin"
      eyebrow="Admin Portal"
      title="Data integrity"
      subtitle="Every create, edit and delete in the database is logged, sealed into a hash chain and anchored on the blockchain. The check runs every day."
    >
      {error && <div className="card card-pad" style={{ marginBottom: 16, color: "var(--red)" }}>{error}</div>}

      {status && (
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Last check" value={check ? (check.status === "ok" ? "All good" : `${problems.length} problems`) : "Not run yet"} icon={<Dot color={!check ? "var(--muted)" : check.status === "ok" ? "var(--primary)" : "var(--red)"} />} />
          <StatCard label="Rows checked" value={check ? check.checkedRows : "—"} icon={<Dot color="var(--muted)" />} />
          <StatCard label="Logged changes" value={status.logEntries} icon={<Dot color="var(--muted)" />} />
          <StatCard label="Anchored on chain" value={status.lastAnchor ? `Up to #${status.lastAnchor.upToEntry}` : "Not yet"} icon={<Dot color="var(--primary)" />} />
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {check ? <>Last checked {fmtDateTime(check.ranAt)}.</> : <>No check has run yet.</>}
          {status?.lastAnchor && <> Last anchored {fmtDateTime(status.lastAnchor.anchoredAt)}.</>}
        </div>
        <button className="btn btn-primary" onClick={runNow} disabled={running}>
          {running ? "Checking…" : "Run check now"}
        </button>
      </div>

      <div className="card">
        {check && problems.length === 0 && (
          <EmptyState title="Nothing out of place" body="Every row matches its last logged change, the change log is unbroken, and it matches the blockchain." />
        )}
        {problems.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Problem</th>
                <th>Table</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p, i) => (
                <tr key={i}>
                  <td>{p.message}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{p.table || "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{p.at ? fmtDateTime(p.at) : "—"}</td>
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
