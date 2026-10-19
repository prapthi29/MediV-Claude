"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { StatCard, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";

const ACTION_LABEL = {
  consent_granted: "Consent granted",
  consent_revoked: "Consent revoked",
  prescription_created: "Prescription issued",
  prescription_verified: "Prescription verified",
  record_uploaded: "Record uploaded",
  user_approved: "Account approved",
  user_rejected: "Account rejected",
  basic_profile_created: "Basic profile created and signed",
  basic_profile_updated: "Basic profile updated and signed",
  record_created: "Record added",
};

export default function PatientDashboard() {
  const [profile, setProfile] = useState(null);
  const [consents, setConsents] = useState([]);
  const [records, setRecords] = useState([]);
  const [events, setEvents] = useState([]);
  const [prescriptionCount, setPrescriptionCount] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [storedUser, setStoredUser] = useState(null);

  useEffect(() => {
    setStoredUser(JSON.parse(window.localStorage.getItem("sch_user") || "null"));

    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const [profileRes, consentsRes, recordsRes, eventsRes, prescriptionsRes] = await Promise.all([
        api.getOwnEmergencyProfile().catch(() => null),
        api.getConsents().catch(() => []),
        api.getPatientRecords().catch(() => []),
        api.getMyAuditLog().catch(() => []),
        api.getPatientPrescriptions().catch(() => []),
      ]);
      if (!active) return;
      setProfile(profileRes);
      setConsents(consentsRes);
      setRecords(recordsRes);
      setEvents(eventsRes);
      setPrescriptionCount(prescriptionsRes.length);
      setLoaded(true);
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const displayName = profile?.patientName || storedUser?.name || "";

  return (
    <PortalShell
      role="patient"
      eyebrow="Patient Portal"
      title={loaded ? `Welcome back${displayName ? `, ${displayName.split(" ")[0]}` : ""}` : "Welcome back"}
      subtitle={loaded ? "Here's what's happening with your records." : "Loading your overview…"}
    >
      {loaded && (
        <>
          <div className="card card-pad" style={{ marginBottom: 20, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>Your Health ID</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{storedUser?.patientId || storedUser?.healthId || "—"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                Give this to a doctor so they can request access to your records.
              </div>
            </div>
            <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 24 }}>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>Prescriptions</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{prescriptionCount ?? "—"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                Each has its own ID — see{" "}
                <a href="/patient/prescriptions" style={{ color: "var(--primary)" }}>
                  Prescriptions
                </a>{" "}
                to copy one for a pharmacy.
              </div>
            </div>
          </div>

          {!profile && (
            <div className="card card-pad" style={{ marginBottom: 20, borderLeft: "4px solid var(--amber)" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Your profile is not active yet</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                Give a doctor access with their license ID on the{" "}
                <a href="/patient/consents" style={{ color: "var(--primary)" }}>Consent wallet</a> page. They will
                ask permission to create your basic profile, and once they sign it, records and prescriptions can be added.
              </div>
            </div>
          )}

          <div className="grid grid-4" style={{ marginBottom: 20 }}>
            <StatCard label="Doctors with access" value={consents.length} icon={<ShieldIcon />} />
            <StatCard label="Medical records" value={records.length} icon={<FileIcon />} />
            <StatCard
              label="Records on-chain"
              value={records.filter((r) => r.blockchainStatus === "registered").length}
              icon={<PillIcon />}
            />
            <StatCard label="Recent events" value={events.length} icon={<IdIcon />} />
          </div>

          <div className="card card-pad">
            <h3 style={{ fontSize: 15, margin: "0 0 14px" }}>Recent activity</h3>
            {events.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>No activity yet.</div>}
            {events.length > 0 && (
              <table>
                <tbody>
                  {events.slice(0, 10).map((item) => (
                    <tr key={item.id}>
                      <td style={{ width: 170, color: "var(--muted)", fontSize: 12.5 }}>{fmtDateTime(item.createdAt)}</td>
                      <td style={{ fontWeight: 600 }}>{ACTION_LABEL[item.eventType] || item.eventType}</td>
                      <td style={{ color: "var(--muted)" }}>{item.resourceType || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </PortalShell>
  );
}

function ShieldIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0E7C7B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0E7C7B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    </svg>
  );
}
function PillIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0E7C7B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="18" height="6" rx="3" />
      <path d="M12 9v6" />
    </svg>
  );
}
function IdIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0E7C7B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2" />
      <path d="M14 10h4M14 14h4" />
    </svg>
  );
}