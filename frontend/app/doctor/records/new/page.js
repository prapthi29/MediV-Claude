"use client";
import { useEffect, useState } from "react";
import PortalShell from "../../../../components/PortalShell";
import PrescriptionForm from "../../../../components/PrescriptionForm";
import LabReportForm from "../../../../components/LabReportForm";
import { api } from "../../../../lib/api";

const KINDS = [
  { id: "prescription", label: "Prescription", hint: "Diagnosis, symptoms, medicines and advice." },
  { id: "lab-report", label: "Lab report", hint: "Upload a lab report, scan or other document." },
];

export default function NewMedicalRecord() {
  const [patients, setPatients] = useState(null);
  const [patientId, setPatientId] = useState("");
  const [kind, setKind] = useState("prescription");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") === "lab-report") setKind("lab-report");
    api.getDoctorPatients().then((list) => {
      setPatients(list);
      const preset = params.get("patient");
      if (preset && list.some((p) => p.patientUserId === preset)) setPatientId(preset);
      else if (list.length > 0) setPatientId(list[0].patientUserId);
    });
  }, []);

  const patient = patients?.find((p) => p.patientUserId === patientId);

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Add a medical record"
      subtitle="Add a prescription or a lab report. The patient approves each one first, and you confirm it with your password."
    >
      <div className="card card-pad" style={{ maxWidth: 860 }}>
        <div className="field">
          <label htmlFor="record-patient">Patient</label>
          <select id="record-patient" value={patientId} onChange={(e) => setPatientId(e.target.value)} disabled={!patients || patients.length === 0}>
            {patients && patients.length === 0 && <option value="">No patients with active access</option>}
            {patients?.map((p) => (
              <option key={p.patientUserId} value={p.patientUserId}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="field-hint">Only patients who have linked you in the last 30 minutes appear here.</div>
        </div>

        <div className="field">
          <label>What are you adding?</label>
          <div className="kind-picker" role="radiogroup" aria-label="Record type">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                className={`kind-option ${kind === k.id ? "active" : ""}`}
                onClick={() => setKind(k.id)}
              >
                <strong>{k.label}</strong>
                <span>{k.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {patientId &&
          (kind === "prescription" ? (
            <PrescriptionForm key={`rx-${patientId}`} patientId={patientId} patient={patient} />
          ) : (
            <LabReportForm key={`lab-${patientId}`} patientId={patientId} patient={patient} />
          ))}
      </div>
    </PortalShell>
  );
}
