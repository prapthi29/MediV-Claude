"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function ChainLog() {
  const [log, setLog] = useState(null);

  useEffect(() => {
    api.getChainLog().then(setLog);
  }, []);

  return (
    <PortalShell role="admin" eyebrow="Admin Portal" title="Chain activity log" subtitle="Every action routed through ChainService, in order.">
      <div className="card card-pad" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, background: "var(--amber-tint)", border: "1px solid #EFDBAE" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
        <div style={{ fontSize: 13 }}>
          <strong>Mock mode.</strong> No real chain is deployed yet — these rows come from{" "}
          <code className="mono">mock_chain_log</code>. Swapping in the Hardhat/Sepolia contract only changes
          ChainService internals; this view and its data shape stay the same.
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Action</th>
              <th>Payload hash</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {log?.map((row) => (
              <tr key={row.tx_id}>
                <td className="mono" style={{ color: "var(--primary-dark)", fontWeight: 600 }}>{row.tx_id}</td>
                <td>{row.action_type}</td>
                <td className="mono" style={{ color: "var(--muted)" }}>{row.payload_hash}</td>
                <td style={{ color: "var(--muted)" }}>{fmtDateTime(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
