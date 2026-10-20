"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../components/PortalShell";
import { RecordView, saveRecordPdf, typeLabel } from "../../../components/DiagnosisRecord";
import { EmptyState, fmtDate, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";

const live = (r) => !r.expires_at || new Date(r.expires_at) > new Date();

// Every doctor request (new record, one view, one edit) in one list.
function collectRequests(creation, access, update) {
  return [
    ...creation.filter(live).map((r) => ({
      key: `create:${r.id}`, kind: "create", id: r.id, status: r.status,
      doctor: r.doctor_name || r.doctor_email, license: r.doctor_license_id,
      what: "Add a new record", at: r.requested_at,
    })),
    ...access.map((r) => ({
      key: `view:${r.id}`, kind: "view", id: r.id, status: r.status,
      doctor: r.doctor_name || r.doctor_email, license: r.doctor_license_id,
      what: `View “${r.title || r.original_filename || "a record"}” once`, at: r.requested_at,
    })),
    ...update.filter(live).map((r) => ({
      key: `edit:${r.id}`, kind: "edit", id: r.id, status: r.status,
      doctor: r.doctor_name || r.doctor_email,
      what: `Edit “${r.record_title || r.original_filename || "a record"}”`, at: r.requested_at,
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
}

async function decide(request, decision) {
  if (request.kind === "create") return api.decideRecordCreation(request.id, decision);
  if (request.kind === "edit") return api.decideRecordUpdate(request.id, decision);
  if (decision === "approve") return api.approveRecordAccess(request.id);
  if (decision === "reject") return api.rejectRecordAccess(request.id);
  return api.revokeRecordAccess(request.id);
}

export default function PatientRecords() {
  const [records, setRecords] = useState(null);
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(null);
  const [verification, setVerification] = useState({});
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState(null);

  async function load() {
    try {
      setRecords(await api.getPatientRecords());
    } catch (e) {
      setError(e.message || "Could not load records.");
    }
    const [creation, access, update] = await Promise.all([
      api.getRecordCreationRequests().catch(() => []),
      api.getRecordAccessRequests().catch(() => []),
      api.getRecordUpdateRequests().catch(() => []),
    ]);
    setRequests(collectRequests(creation, access, update));
  }

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === "visible" && active) await load();
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function act(request, decision) {
    setBusyKey(request.key);
    setError("");
    try {
      await decide(request, decision);
      await load();
    } catch (e) {
      setError(e.message || "Could not update the request.");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggle(recordId) {
    setError("");
    if (open?.record.id === recordId) return setOpen(null);
    try {
      setOpen(await api.viewOwnRecord(recordId));
    } catch (e) {
      setError(e.message || "Could not open the record.");
    }
  }

  // Typed records download as a PDF; uploaded files download as they are.
  async function download(recordId) {
    setError("");
    try {
      const view = open?.record.id === recordId ? open : await api.viewOwnRecord(recordId);
      if (view.form) saveRecordPdf(view);
      else if (view.attachment) await api.downloadOwnRecord(recordId, view.attachment.filename);
      else setError("This record is empty.");
    } catch (e) {
      setError(e.message || "Could not download the record.");
    }
  }

  async function verify(recordId) {
    try {
      const v = await api.verifyRecord(recordId);
      setVerification((prev) => ({ ...prev, [recordId]: v.valid ? "Verified" : "Not verified" }));
    } catch (e) {
      setVerification((prev) => ({ ...prev, [recordId]: e.message || "Check failed" }));
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const unused = requests.filter((r) => r.status === "approved");

  return (
    <PortalShell
      role="patient"
      eyebrow="Patient Portal"
      title="Medical records"
      subtitle="Doctors ask you before they add a record, view one, or edit one. Each approval works once."
    >
      {error && <div className="error-text" role="alert">{error}</div>}

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Doctor requests</h3>
        {pending.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>No requests waiting for you.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Doctor</th>
                <th>Wants to</th>
                <th>Requested</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.key}>
                  <td>
                    {r.doctor}
                    {r.license && <div style={{ color: "var(--muted)", fontSize: 12 }}>License: {r.license}</div>}
                  </td>
                  <td>{r.what}</td>
                  <td>{fmtDateTime(r.at)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-primary btn-sm" disabled={busyKey === r.key} onClick={() => act(r, "approve")}>
                      Allow
                    </button>{" "}
                    <button className="btn btn-danger btn-sm" disabled={busyKey === r.key} onClick={() => act(r, "reject")}>
                      Deny
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {unused.length > 0 && (
          <>
            <h4 style={{ margin: "18px 0 6px", fontSize: 13.5 }}>Approved, not used yet</h4>
            <table>
              <tbody>
                {unused.map((r) => (
                  <tr key={r.key}>
                    <td>{r.doctor}</td>
                    <td>{r.what}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-danger btn-sm" disabled={busyKey === r.key} onClick={() => act(r, "revoke")}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {open && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <RecordView
            view={open}
            loadFile={() => api.fetchOwnRecordFile(open.record.id)}
          />
        </div>
      )}

      <div className="card">
        {records === null ? (
          <p className="card-pad">Loading records…</p>
        ) : records.length === 0 ? (
          <EmptyState title="No records yet" body="Records your doctor adds will appear here." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Doctor</th>
                <th>Version</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{r.title || r.originalFilename || "—"}</td>
                  <td>{typeLabel(r.category)}</td>
                  <td>{r.doctorName || "—"}</td>
                  <td>{r.version}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    {verification[r.id] && <span style={{ fontSize: 12, marginRight: 8 }}>{verification[r.id]}</span>}
                    <button className="btn btn-ghost btn-sm" onClick={() => verify(r.id)}>
                      Verify
                    </button>{" "}
                    <button className="btn btn-ghost btn-sm" onClick={() => download(r.id)}>
                      Download
                    </button>{" "}
                    <button className="btn btn-primary btn-sm" onClick={() => toggle(r.id)}>
                      {open?.record.id === r.id ? "Close" : "Open"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PortalShell>
  );
}
