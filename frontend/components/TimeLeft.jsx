"use client";
import { useEffect, useState } from "react";

// Shows how long a short-lived grant has left, refreshing every few seconds.
export default function TimeLeft({ until, onExpire }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const msLeft = new Date(until).getTime() - now;

  useEffect(() => {
    if (msLeft <= 0 && onExpire) onExpire();
  }, [msLeft <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!until || Number.isNaN(msLeft)) return <span>—</span>;
  if (msLeft <= 0) return <span style={{ color: "var(--red)" }}>Expired</span>;

  const minutes = Math.ceil(msLeft / 60000);
  const at = new Date(until).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <span>
      {minutes} min left <span style={{ color: "var(--muted)", fontSize: 12 }}>(until {at})</span>
    </span>
  );
}
