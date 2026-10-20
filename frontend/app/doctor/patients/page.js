"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import TimeLeft from "../../../components/TimeLeft";
import { RecordView, base64ToBlob, typeLabel } from "../../../components/DiagnosisRecord";
import { PrescriptionView, savePrescriptionPdf } from "../../../components/PrescriptionView";
import { EmptyState, fmtDate, fmtDateTime } from "../../../components/ui";
import { api } from "../../../lib/api";

const VIEW_STATUS = {
  pending: "View requested",
  rejected: "View declined",
  used: "Already viewed",
  revoked: "View revoked",
};

export default function DoctorPatients() {
  const [patients, setPatients] = useState(null);
  const [expandedPatient, setExpandedPatient] = useState(null);
  const [recordsByPatient, setRecordsByPatient] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [prescriptionsByPatient, setPrescriptionsByPatient] = useState({});
  const [viewingRx, setViewingRx] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getDoctorPatients()
      .then(setPatients)
      .catch((err) => {
        setError(err.message || "Unable to load patients.");
        setPatients([]);
      });
  }, []);

  async function loadRecords(patientId) {
    try {
      const records = await api.getPatientRecordsForDoctor(patientId);
      setRecordsByPatient((prev) => ({ ...prev, [patientId]: records }));
    } catch (err) {
      setError(err.message || "Unable to load records for this patient.");
    }
    api
      .getPatientPrescriptionsForDoctor(patientId)
      .then((rows) => setPrescriptionsByPatient((prev) => ({ ...prev, [patientId]: rows })))
      .catch(() => setPrescriptionsByPatient((prev) => ({ ...prev, [patientId]: [] })));
  }

  function viewPrescription(patientId, prescriptionId) {
    if (viewingRx?.prescription.id === prescriptionId) return setViewingRx(null);
    return run(`rx:${prescriptionId}`, async () => {
      setViewingRx({ ...(await api.viewPrescriptionForDoctor(patientId, prescriptionId)), patientId });
    });
  }

  // Typed prescriptions download as a PDF; older uploaded ones as the file.
  function downloadPrescription(patientId, prescription) {
    return run(`rx:${prescription.id}`, async () => {
      const view =
        viewingRx?.prescription.id === prescription.id ? viewingRx : await api.viewPrescriptionForDoctor(patientId, prescription.id);
      if (view.medications) savePrescriptionPdf(view);
      else await api.downloadPrescriptionForDoctor(patientId, prescription.id, prescription.originalFilename || "prescription");
    });
  }

  // Refresh the open patient's records so approvals show up without a reload.
  useEffect(() => {
    if (!expandedPatient) return undefined;
    const timer = setInterval(() => loadRecords(expandedPatient), 5000);
    return () => clearInterval(timer);
  }, [expandedPatient]);

  async function togglePatient(patientId) {
    setError("");
    setViewing(null);
    setViewingRx(null);
    if (expandedPatient === patientId) {
      setExpandedPatient(null);
      return;
    }
    setExpandedPatient(patientId);
    await loadRecords(patientId);
  }

  async function run(key, action) {
    setError("");
    setBusyKey(key);
    try {
      await action();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusyKey(null);
    }
  }

  function requestView(patientId, recordId) {
    return run(`view:${recordId}`, async () => {
      await api.requestRecordAccess(patientId, recordId);
      await loadRecords(patientId);
    });
  }

  function openOnce(patientId, recordId) {
    return run(`view:${recordId}`, async () => {
      const view = await api.viewRecordForDoctor(patientId, recordId);
      setViewing({ ...view, patientId });
      await loadRecords(patientId);
    });
  }

  function viewAction(patientId, record) {
    const status = record.viewRequest?.status;
    const busy = busyKey === `view:${record.id}`;
    if (status === "approved") {
      return (
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => openOnce(patientId, record.id)}>
          View now (once)
        </button>
      );
    }
    if (status === "pending") return <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{VIEW_STATUS.pending}</span>;
    return (
      <>
        {status && <span style={{ color: "var(--muted)", fontSize: 12, marginRight: 6 }}>{VIEW_STATUS[status]}.</span>}
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => requestView(patientId, record.id)}>
          {status ? "Request again" : "Request to view"}
        </button>
      </>
    );
  }

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="My patients"
      subtitle="Patients who linked you in the last 30 minutes. Each view, new record and edit needs the patient's approval."
    >
      {error && (
        <div className="card card-pad" role="alert" style={{ marginBottom: 16, color: "var(--red)" }}>
          {error}
        </div>
      )}

      {viewing && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <RecordView
            view={viewing}
            loadFile={viewing.attachment?.base64 ? async () => base64ToBlob(viewing.attachment.base64, viewing.attachment.contentType) : null}
            autoOpenFile
          />
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginBottom: 0 }}>
            This approval is now used. Closing this panel means you need a new approval to see it again.{" "}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewing(null)}>
              Close
            </button>
          </p>
        </div>
      )}

      {viewingRx && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <PrescriptionView
            view={viewingRx}
            onDownload={() => savePrescriptionPdf(viewingRx)}
            loadFile={() => api.fetchPrescriptionFileForDoctor(viewingRx.patientId, viewingRx.prescription.id)}
          />
          <p style={{ marginBottom: 0, marginTop: 12 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewingRx(null)}>
              Close
            </button>
          </p>
        </div>
      )}

      <div className="card">
        {patients === null && <p className="card-pad">Loading patients...</p>}
        {patients?.length === 0 && <EmptyState title="No patients available" body="Patients who link you will appear here." />}
        {patients?.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Linked</th>
                <th>Access left</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => {
                const patientId = patient.patientUserId || patient.id;
                const isExpanded = expandedPatient === patientId;
                const records = recordsByPatient[patientId];
                return (
                  <Fragment key={patientId}>
                    <tr>
                      <td style={{ fontWeight: 600 }}>{patient.name || patient.patientEmail || "Patient"}</td>
                      <td style={{ color: "var(--muted)" }}>{fmtDateTime(patient.createdAt || patient.granted_at)}</td>
                      <td>
                        <TimeLeft until={patient.expiresAt || patient.expires_at} />
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => togglePatient(patientId)}>
                          {isExpanded ? "Hide records" : "Medical records"}
                        </button>{" "}
                        <Link href={`/doctor/records/new?patient=${patientId}`} className="btn btn-ghost btn-sm">
                          Add medical record
                        </Link>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={4}>
                          <h4 style={{ margin: "8px 0 8px" }}>Lab reports</h4>
                          {!records && <p>Loading lab reports...</p>}
                          {records?.length === 0 && <p>No lab reports for this patient yet.</p>}
                          {records?.length > 0 && (
                            <table>
                              <thead>
                                <tr>
                                  <th>Report</th>
                                  <th>Type</th>
                                  <th>Version</th>
                                  <th>Added</th>
                                  <th>View</th>
                                  <th>Edit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {records.map((record) => (
                                  <tr key={record.id}>
                                    <td>
                                      {record.title || record.originalFilename || "Medical record"}
                                      {record.doctorName && <div style={{ color: "var(--muted)", fontSize: 12 }}>by {record.doctorName}</div>}
                                    </td>
                                    <td>{typeLabel(record.category)}</td>
                                    <td>{record.version}</td>
                                    <td>{fmtDate(record.createdAt)}</td>
                                    <td style={{ whiteSpace: "nowrap" }}>{viewAction(patientId, record)}</td>
                                    <td>
                                      <Link href={`/doctor/records/edit?patient=${patientId}&record=${record.id}`} className="btn btn-ghost btn-sm">
                                        {record.editRequest?.status === "approved" ? "Edit now" : record.editRequest?.status === "pending" ? "Edit requested" : "Edit"}
                                      </Link>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <h4 style={{ margin: "20px 0 8px" }}>Prescriptions</h4>
                          {!prescriptionsByPatient[patientId] && <p>Loading prescriptions...</p>}
                          {prescriptionsByPatient[patientId]?.length === 0 && <p>No prescriptions for this patient yet.</p>}
                          {prescriptionsByPatient[patientId]?.length > 0 && (
                            <table>
                              <thead>
                                <tr>
                                  <th>Prescription</th>
                                  <th>Prescribed by</th>
                                  <th>Issued</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {prescriptionsByPatient[patientId].map((p) => (
                                  <tr key={p.id}>
                                    <td>
                                      {p.title || "Prescription"}
                                      {p.dispensedAt && <span className="badge badge-muted" style={{ marginLeft: 8 }}>Dispensed</span>}
                                    </td>
                                    <td>{p.doctorName || "—"}</td>
                                    <td>{fmtDate(p.createdAt)}</td>
                                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                                      <button type="button" className="btn btn-ghost btn-sm" disabled={busyKey === `rx:${p.id}`} onClick={() => downloadPrescription(patientId, p)}>
                                        Download
                                      </button>{" "}
                                      <button type="button" className="btn btn-primary btn-sm" disabled={busyKey === `rx:${p.id}`} onClick={() => viewPrescription(patientId, p.id)}>
                                        {viewingRx?.prescription.id === p.id ? "Close" : "View"}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PortalShell>
  );
}
