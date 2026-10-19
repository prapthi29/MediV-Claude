"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import TimeLeft from "../../../components/TimeLeft";
import { EmptyState, fmtDate } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function DoctorPatients() {
  const [patients, setPatients] = useState(null);
  const [expandedPatient, setExpandedPatient] = useState(null);
  const [recordsByPatient, setRecordsByPatient] = useState({});
  const [loadingPatient, setLoadingPatient] = useState(null);
  const [requestingRecord, setRequestingRecord] = useState(null);
  const [requestStatus, setRequestStatus] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    api.getDoctorPatients()
      .then((data) => {
        if (active) setPatients(data);
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Unable to load patients.");
          setPatients([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function togglePatient(patientId) {
    setError("");

    if (expandedPatient === patientId) {
      setExpandedPatient(null);
      return;
    }

    setExpandedPatient(patientId);

    if (recordsByPatient[patientId]) {
      return;
    }

    setLoadingPatient(patientId);

    try {
      const records = await api.getPatientRecordsForDoctor(patientId);

      setRecordsByPatient((previous) => ({
        ...previous,
        [patientId]: records,
      }));
    } catch (err) {
      setError(
        err.message ||
          "Unable to load medical files for this patient."
      );
    } finally {
      setLoadingPatient(null);
    }
  }

  async function requestAccess(patientId, recordId) {
    const key = `${patientId}:${recordId}`;

    setError("");
    setRequestingRecord(key);

    try {
      const request = await api.requestRecordAccess(
        patientId,
        recordId
      );

      setRequestStatus((previous) => ({
        ...previous,
        [key]: request?.status || "pending",
      }));
    } catch (err) {
      setError(
        err.message || "Unable to submit the access request."
      );
    } finally {
      setRequestingRecord(null);
    }
  }

  function filename(record) {
    return (
      record.originalFilename ||
      record.original_filename ||
      record.title ||
      "Medical document"
    );
  }

  function recordDate(record) {
    return record.createdAt || record.created_at;
  }

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="My patients"
      subtitle="View patient medical-file names and request access to individual records."
    >
      {error && (
        <div className="card" role="alert" style={{ marginBottom: 16 }}>
          <p style={{ color: "var(--danger, #dc2626)", margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      <div className="card">
        {patients === null && (
          <p>Loading patients...</p>
        )}

        {patients?.length === 0 && (
          <EmptyState
            title="No patients available"
            body="Patients who grant you access will appear here."
          />
        )}

        {patients?.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Granted</th>
                <th>Access left</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {patients.map((patient) => {
                const patientId =
                  patient.patientUserId || patient.id;

                const isExpanded =
                  expandedPatient === patientId;

                const records = recordsByPatient[patientId];

                return (
                  <>
                    <tr key={patientId}>
                      <td style={{ fontWeight: 600 }}>
                        {patient.name || patient.patientEmail || "Patient"}
                      </td>

                      <td style={{ color: "var(--muted)" }}>
                        {fmtDate(
                          patient.createdAt ||
                            patient.granted_at
                        )}
                      </td>

                      <td>
                        <TimeLeft
                          until={
                            patient.expiresAt ||
                            patient.expires_at
                          }
                        />
                      </td>

                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => togglePatient(patientId)}
                        >
                          {isExpanded
                            ? "Hide files"
                            : "View files"}
                        </button>

                        {" "}

                        <Link
                          href={`/doctor/records/new?patient=${patientId}`}
                          className="btn btn-ghost btn-sm"
                        >
                          Add record
                        </Link>

                        {" "}

                        <Link
                          href={`/doctor/prescriptions/new?patient=${patientId}`}
                          className="btn btn-ghost btn-sm"
                        >
                          Prescribe
                        </Link>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${patientId}-records`}>
                        <td colSpan={4}>
                          <div style={{ padding: "12px 0" }}>
                            <h3 style={{ marginTop: 0 }}>
                              Medical files
                            </h3>

                            {loadingPatient === patientId && (
                              <p>Loading medical files...</p>
                            )}

                            {records && records.length === 0 && (
                              <p>
                                No medical files found for this patient.
                              </p>
                            )}

                            {records && records.length > 0 && (
                              <div style={{ overflowX: "auto" }}>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Filename</th>
                                      <th>Category</th>
                                      <th>Uploaded</th>
                                      <th>Access</th>
                                    </tr>
                                  </thead>

                                  <tbody>
                                    {records.map((record) => {
                                      const key =
                                        `${patientId}:${record.id}`;

                                      const status =
                                        requestStatus[key];

                                      return (
                                        <tr key={record.id}>
                                          <td>
                                            {filename(record)}
                                          </td>

                                          <td>
                                            {record.category || "—"}
                                          </td>

                                          <td>
                                            {fmtDate(recordDate(record))}
                                          </td>

                                          <td>
                                            {status === "pending" ? (
                                              <span>
                                                Request pending
                                              </span>
                                            ) : status === "approved" ? (
                                              <span>
                                                Access approved
                                              </span>
                                            ) : status === "rejected" ? (
                                              <span>
                                                Request rejected
                                              </span>
                                            ) : (
                                              <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                disabled={
                                                  requestingRecord === key
                                                }
                                                onClick={() =>
                                                  requestAccess(
                                                    patientId,
                                                    record.id
                                                  )
                                                }
                                              >
                                                {requestingRecord === key
                                                  ? "Requesting..."
                                                  : "Request access"}
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PortalShell>
  );
}
