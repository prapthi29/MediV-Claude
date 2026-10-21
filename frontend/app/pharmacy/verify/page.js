"use client";
import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import TimeLeft from "../../../components/TimeLeft";
import { EmptyState, StatusBadge, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";
import { FieldError } from "../../../components/FieldError";
import { toast } from "../../../components/Toast";
import { verifyPrescriptionInBrowser } from "../../../lib/verify-prescription";

export default function SharedPrescriptions() {
  const [shares, setShares] = useState(null);
  const [open, setOpen] = useState(null);
  const [browserCheck, setBrowserCheck] = useState(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  // The pharmacy's own count: the total of each medicine (set on the first
  // visit), how many are being handed over now, and any problem with each.
  const [totals, setTotals] = useState([]);
  const [giving, setGiving] = useState([]);
  const [givingErrors, setGivingErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");

  const load = useCallback(() => {
    api.getSharedWithPharmacy().then(setShares).catch(() => setShares([]));
  }, []);

  useEffect(() => {
    try {
      setPharmacyId(JSON.parse(window.localStorage.getItem("sch_user") || "null")?.licenseId || "");
    } catch {}
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  async function openShare(shareId) {
    setError("");
    setBrowserCheck(null);
    try {
      const view = await api.openSharedPrescription(shareId);
      setOpen(view);
      setPasswordError("");
      setGiving(view.medications.map(() => ""));
      setTotals(view.dispensing.medicines.map((m) => (m.total ? String(m.total) : "")));
      setGivingErrors({});
      setBrowserCheck(await verifyPrescriptionInBrowser(view.medications, view.proof));
    } catch (err) {
      setOpen(null);
      setError(err.message || "Couldn't open this prescription.");
      load();
    }
  }

  async function dispense(e) {
    e.preventDefault();
    const counts = open.dispensing?.medicines || [];
    const quantities = giving.map((q) => Number(q || 0));
    const totalNumbers = totals.map((t) => Number(t || 0));
    const errs = {};
    totalNumbers.forEach((t, i) => {
      if (t < 1) errs[`total-${i}`] = "Enter the total.";
    });
    quantities.forEach((q, i) => {
      const left = totalNumbers[i] - (counts[i]?.given || 0);
      if (totalNumbers[i] >= 1 && q > left) errs[i] = `Only ${left} left to give.`;
    });
    if (!quantities.some((q) => q > 0)) errs[0] = errs[0] || "Enter how many you are giving.";
    setGivingErrors(errs);
    if (!password) setPasswordError("Enter your password to confirm.");
    if (Object.keys(errs).length || !password) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.dispensePrescription(open.share.id, password, { totals: totalNumbers, quantities });
      setPassword("");
      if (result.complete) {
        // Once everything is given, this pharmacy can no longer open the prescription.
        setOpen(null);
        setBrowserCheck(null);
        toast.success("Everything is given. The prescription is closed and listed in your dispensing history.");
      } else {
        setOpen((current) => ({ ...current, dispensing: result.dispensing }));
        setGiving(open.medications.map(() => ""));
        setTotals(result.dispensing.medicines.map((m) => (m.total ? String(m.total) : "")));
        toast.success("Saved. The rest can be given later while the patient's share is open.");
      }
      load();
    } catch (err) {
      setPasswordError(err.message || "Couldn't save what you gave.");
      toast.error(err.message || "Couldn't save what you gave.");
    } finally {
      setBusy(false);
    }
  }

  const verified = open && open.integrity.valid && browserCheck?.medicinesMatch && browserCheck?.signatureMatches;
  const canGive = Boolean(verified && !open?.dispensed);

  return (
    <PortalShell
      role="pharmacy"
      eyebrow="Pharmacy Portal"
      title="Shared prescriptions"
      subtitle="Patients share a prescription with your pharmacy ID for 30 minutes. You see the patient's name, patient ID and the medicines only. You can give medicines in parts; access ends once everything is given."
    >
      {pharmacyId && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>Your pharmacy ID</div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{pharmacyId}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Patients enter this to share a prescription with you.</div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        {shares === null && <p className="card-pad">Loading…</p>}
        {shares?.length === 0 && <EmptyState title="Nothing shared right now" body="When a patient shares a prescription with your pharmacy ID, it appears here for 30 minutes." />}
        {shares?.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Patient ID</th>
                <th>Time left</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shares.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.patientName}</td>
                  <td className="mono">{s.patientId || "—"}</td>
                  <td>
                    <TimeLeft until={s.expiresAt} onExpire={load} />
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-primary btn-sm" onClick={() => openShare(s.id)}>
                      Open and verify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && (
        <div className="error-text" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {open && (
        <div className="card card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Patient</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{open.patientName}</div>
              {open.patientId && (
                <div className="mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  Patient ID {open.patientId}
                </div>
              )}
            </div>
            <StatusBadge status={open.dispensed ? "dispensed" : verified ? "valid" : "invalid"} />
          </div>

          <table style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Dose</th>
                <th>How often</th>
                <th>For how long</th>
                <th>Instructions</th>
                <th>Total</th>
                <th>Given</th>
                <th>Left</th>
                {canGive && <th>Giving now</th>}
              </tr>
            </thead>
            <tbody>
              {open.medications.map((m, i) => {
                const count = open.dispensing?.medicines?.[i];
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td>{m.dose}</td>
                    <td>{m.frequency}</td>
                    <td>{m.duration}</td>
                    <td>{m.instructions || "—"}</td>
                    <td style={{ minWidth: 100 }}>
                      {count?.total || !canGive ? (
                        count?.total ?? "—"
                      ) : (
                        <>
                          <input
                            aria-label={`Total ${m.name} to give`}
                            inputMode="numeric"
                            maxLength={5}
                            value={totals[i] ?? ""}
                            placeholder="e.g. 15"
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "");
                              setTotals((list) => list.map((t, j) => (j === i ? value : t)));
                              setGivingErrors({});
                            }}
                            style={{ width: 80 }}
                          />
                          <FieldError message={givingErrors[`total-${i}`]} />
                        </>
                      )}
                    </td>
                    <td>{count?.given ?? 0}</td>
                    <td>{totals[i] ? Math.max(0, Number(totals[i]) - (count?.given || 0)) : "—"}</td>
                    {canGive && (
                      <td style={{ minWidth: 110 }}>
                        <input
                          aria-label={`How many ${m.name} you are giving`}
                          inputMode="numeric"
                          maxLength={5}
                          value={giving[i] ?? ""}
                          disabled={count?.left === 0}
                          placeholder={count?.left === 0 ? "Done" : "0"}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, "");
                            setGiving((list) => list.map((q, j) => (j === i ? value : q)));
                            setGivingErrors({});
                          }}
                          style={{ width: 90 }}
                        />
                        <FieldError message={givingErrors[i]} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 10,
              fontWeight: 600,
              background: browserCheck === null ? "var(--surface-2)" : verified ? "var(--mint-tint)" : "var(--red-tint)",
              color: browserCheck === null ? "var(--muted)" : verified ? "var(--mint)" : "var(--red)",
            }}
          >
            {browserCheck === null
              ? "Checking this prescription…"
              : verified
                ? "Verified: this prescription is genuine and has not been changed."
                : "Not verified: this prescription could not be confirmed."}
          </div>

          {open.dispensed ? (
            <p style={{ fontWeight: 600, margin: 0 }}>Dispensed on {fmtDateTime(open.dispensed.at)}.</p>
          ) : verified ? (
            <form onSubmit={dispense}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="field" style={{ marginBottom: 0, flex: "1 1 240px" }}>
                  <label htmlFor="dispense-password">Your password</label>
                  <input
                    id="dispense-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPasswordError("");
                      setPassword(e.target.value);
                    }}
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save what you gave"}
                </button>
              </div>
              <FieldError message={passwordError} />
            </form>
          ) : (
            <p style={{ color: "var(--red)", fontWeight: 600, margin: 0 }}>Do not dispense this prescription.</p>
          )}
        </div>
      )}
    </PortalShell>
  );
}
