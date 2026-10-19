"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { EmptyState, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function PatientRecords() {
  const [records, setRecords] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  async function load() {
    try { const rows = await api.getPatientRecords(); setRecords(rows); } catch (e) { setError(e.message || "Could not load records."); }
    try { setRequests(await api.getRecordAccessRequests()); } catch {}
  }
  useEffect(() => {
    let active = true;
    const refresh = async () => { if (document.visibilityState === "visible" && active) await load(); };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  async function decide(id, action) { setBusyId(id); setError(""); try { if (action === "approve") await api.approveRecordAccess(id); else await api.rejectRecordAccess(id); await load(); } catch (e) { setError(e.message || "Could not update access request."); } finally { setBusyId(null); } }
  return <PortalShell role="patient" eyebrow="Patient Portal" title="Medical records" subtitle="View and download your records. Patients cannot create medical records; doctors must request access to each file.">
    {error && <div className="error-text" role="alert">{error}</div>}
    <div className="card" style={{ marginBottom: 20 }}><h3 style={{ marginTop: 0 }}>Doctor access requests</h3>
      {requests.filter(r => r.status === "pending").length === 0 ? <p style={{ color: "var(--muted)" }}>No pending record access requests.</p> : <table><thead><tr><th>Record</th><th>Doctor</th><th>Requested</th><th>Decision</th></tr></thead><tbody>{requests.filter(r => r.status === "pending").map(r => <tr key={r.id}><td>{r.title || r.originalFilename || r.record_id || "Medical record"}</td><td>{r.doctor_name || r.doctor_email || r.doctor_user_id}</td><td>{fmtDate(r.created_at || r.requested_at)}</td><td><button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "approve")}>Allow</button> <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "reject")}>Deny</button></td></tr>)}</tbody></table>}
    </div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Your records</h3>{records === null ? <p>Loading records…</p> : records.length === 0 ? <EmptyState title="No records yet" body="Records added by your doctor will appear here." /> : <table><thead><tr><th>Title</th><th>File</th><th>Type</th><th>Date</th><th>Action</th></tr></thead><tbody>{records.map(r => <tr key={r.id}><td>{r.title || "—"}</td><td>{r.originalFilename}</td><td>{r.contentType || "Unknown"}</td><td>{fmtDate(r.createdAt)}</td><td><button className="btn btn-primary btn-sm" onClick={() => api.downloadOwnRecord(r.id, r.originalFilename || "medical-record").catch(e => setError(e.message))}>Download</button></td></tr>)}</tbody></table>}</div>
  </PortalShell>;
}
