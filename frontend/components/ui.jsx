export function StatCard({ label, value, icon }) {
  return (
    <div className="card card-pad">
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    valid: ["badge-mint", "Valid"],
    active: ["badge-mint", "Active"],
    approved: ["badge-mint", "Approved"],
    pending: ["badge-amber", "Pending"],
    expired: ["badge-muted", "Expired"],
    invalid: ["badge-red", "Invalid"],
    revoked: ["badge-red", "Revoked"],
    rejected: ["badge-red", "Rejected"],
    verified: ["badge-mint", "Verified"],
    failed: ["badge-red", "Failed"],
    dispensed: ["badge-muted", "Dispensed"],
  };
  const [cls, label] = map[status] || ["badge-muted", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

// The signature element: every hashed/signed artifact (a record, a
// prescription, a chain-log row) gets one of these instead of a plain
// checkmark, so tamper-evidence reads as a lab/specimen label rather
// than a generic "verified" tag.
export function VerifyChip({ hash, txId, stale = false }) {
  return (
    <span className={`verify-chip mono ${stale ? "stale" : ""}`} title={stale ? "Hash mismatch — needs review" : "Hash matches chain record"}>
      <span className="verify-dot" />
      {hash && <span className="verify-hash">{shorten(hash)}</span>}
      {txId && <span className="verify-tx">{txId}</span>}
    </span>
  );
}

function shorten(str) {
  if (!str || str.length <= 14) return str;
  return `${str.slice(0, 6)}…${str.slice(-4)}`;
}

export function EmptyState({ title, body }) {
  return (
    <div className="empty-state">
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, color: "var(--ink)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13.5 }}>{body}</div>
    </div>
  );
}

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
