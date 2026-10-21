"use client";

// Consent wallet: the patient links a pharmacy by its ID, then approves which
// prescriptions it may see. Each approval lasts 30 minutes.
import { useCallback, useEffect, useState } from "react";
import TimeLeft from "./TimeLeft";
import { FieldError } from "./FieldError";
import { toast } from "./Toast";
import { fmtDate } from "./ui";
import { api } from "../lib/api";

const STORE = "mv_linked_pharmacies";

function remembered() {
  try {
    return JSON.parse(window.localStorage.getItem(STORE) || "[]");
  } catch {
    return [];
  }
}

function remember(list) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(list));
  } catch {}
}

export default function PharmacyLinks() {
  const [pharmacyId, setPharmacyId] = useState("");
  const [idError, setIdError] = useState("");
  const [linked, setLinked] = useState([]);
  const [prescriptions, setPrescriptions] = useState(null);
  const [shares, setShares] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const [rows, shareRows] = await Promise.all([
      api.getPatientPrescriptions().catch(() => []),
      api.getPrescriptionShares().catch(() => []),
    ]);
    setPrescriptions(rows || []);
    setShares(shareRows);
    // Pharmacies with a live share stay listed even on another device.
    setLinked((current) => {
      const next = [...current];
      for (const s of shareRows) {
        if (s.status === "active" && s.pharmacyLicenseId && !next.some((p) => p.licenseId === s.pharmacyLicenseId)) {
          next.push({ licenseId: s.pharmacyLicenseId, name: s.pharmacyName });
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setLinked(remembered());
    load();
    const timer = window.setInterval(() => document.visibilityState === "visible" && load(), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => remember(linked), [linked]);

  async function link(e) {
    e.preventDefault();
    setIdError("");
    const id = pharmacyId.trim();
    if (!id) return setIdError("Enter the pharmacy ID.");
    setBusy("link");
    try {
      const pharmacy = await api.findPharmacy(id);
      setLinked((list) => [pharmacy, ...list.filter((p) => p.licenseId !== pharmacy.licenseId)]);
      setPharmacyId("");
      toast.success(`${pharmacy.name} linked. Approve the prescriptions it may see.`);
    } catch (err) {
      setIdError(err.message || "Couldn't find that pharmacy.");
    } finally {
      setBusy(null);
    }
  }

  async function approve(pharmacy, prescription) {
    setBusy(`${pharmacy.licenseId}:${prescription.id}`);
    try {
      await api.sharePrescription(prescription.id, pharmacy.licenseId);
      toast.success(`${pharmacy.name} can see “${prescription.title || "Prescription"}” for 30 minutes.`);
      await load();
    } catch (err) {
      toast.error(err.message || "Couldn't share the prescription.");
    } finally {
      setBusy(null);
    }
  }

  async function stop(share) {
    setBusy(share.id);
    try {
      await api.revokePrescriptionShare(share.id);
      toast.success("Sharing stopped.");
      await load();
    } catch (err) {
      toast.error(err.message || "Couldn't stop sharing.");
    } finally {
      setBusy(null);
    }
  }

  async function unlink(pharmacy) {
    const live = shares.filter((s) => s.pharmacyLicenseId === pharmacy.licenseId && s.status === "active");
    setBusy(`unlink:${pharmacy.licenseId}`);
    try {
      await Promise.all(live.map((s) => api.revokePrescriptionShare(s.id)));
      setLinked((list) => list.filter((p) => p.licenseId !== pharmacy.licenseId));
      toast.success(`${pharmacy.name} removed.`);
      await load();
    } catch (err) {
      toast.error(err.message || "Couldn't remove the pharmacy.");
    } finally {
      setBusy(null);
    }
  }

  // Only typed prescriptions that still have medicines to give can be shared.
  const shareable = (prescriptions || []).filter((p) => p.format === "form" && !p.dispensedAt);

  return (
    <div className="card card-pad" style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>Share prescriptions with a pharmacy</h3>
      <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 0 14px" }}>
        Enter the pharmacy ID, then approve the prescriptions it may see. The pharmacy sees your name and the medicines for 30 minutes, never the diagnosis or advice.
      </p>
      <form onSubmit={link} noValidate style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0, flex: "1 1 240px" }}>
          <label htmlFor="pharmacy-id">Pharmacy ID</label>
          <input
            id="pharmacy-id"
            value={pharmacyId}
            onChange={(e) => {
              setIdError("");
              setPharmacyId(e.target.value);
            }}
            placeholder="The ID the pharmacy gives you"
            autoComplete="off"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy === "link"} style={{ padding: "10px 16px" }}>
          {busy === "link" ? "Linking…" : "Link pharmacy"}
        </button>
      </form>
      <FieldError message={idError} />

      {linked.map((pharmacy) => (
        <div key={pharmacy.licenseId} style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div>
              <strong>{pharmacy.name}</strong>
              <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>ID {pharmacy.licenseId}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === `unlink:${pharmacy.licenseId}`} onClick={() => unlink(pharmacy)}>
              Remove pharmacy
            </button>
          </div>
          {prescriptions === null && <p style={{ fontSize: 13 }}>Loading prescriptions…</p>}
          {prescriptions && shareable.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 0 }}>You have no prescriptions waiting to be dispensed.</p>
          )}
          {shareable.length > 0 && (
            <table style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Prescription</th>
                  <th>Prescribed by</th>
                  <th>Issued</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shareable.map((p) => {
                  const share = shares.find((s) => s.prescriptionId === p.id && s.pharmacyLicenseId === pharmacy.licenseId && s.status === "active");
                  return (
                    <tr key={p.id}>
                      <td>{p.title || "Prescription"}</td>
                      <td style={{ color: "var(--muted)" }}>{p.doctorName || "—"}</td>
                      <td style={{ color: "var(--muted)" }}>{fmtDate(p.createdAt)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {share ? (
                          <>
                            <span style={{ fontSize: 12.5, marginRight: 8 }}>
                              Approved · <TimeLeft until={share.expiresAt} onExpire={load} />
                            </span>
                            <button className="btn btn-danger btn-sm" disabled={busy === share.id} onClick={() => stop(share)}>
                              Stop
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={busy === `${pharmacy.licenseId}:${p.id}`}
                            onClick={() => approve(pharmacy, p)}
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
