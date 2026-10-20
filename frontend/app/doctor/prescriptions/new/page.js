"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/PortalShell";
import { api } from "../../../../lib/api";

const EMPTY_MED = { name: "", dose: "", frequency: "", duration: "", instructions: "" };
const MED_FIELDS = [
  { id: "name", label: "Medicine", placeholder: "e.g. Amoxicillin" },
  { id: "dose", label: "Dose", placeholder: "500 mg" },
  { id: "frequency", label: "How often", placeholder: "Three times a day" },
  { id: "duration", label: "For how long", placeholder: "5 days" },
  { id: "instructions", label: "Instructions (optional)", placeholder: "After food" },
];

export default function NewPrescription() {
  const [patients, setPatients] = useState(null);
  const [patientId, setPatientId] = useState("");
  const [approval, setApproval] = useState(undefined);
  const [title, setTitle] = useState("");
  const [medications, setMedications] = useState([{ ...EMPTY_MED }]);
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);

  useEffect(() => {
    api.getDoctorPatients().then((list) => {
      setPatients(list);
      const preset = new URLSearchParams(window.location.search).get("patient");
      if (preset && list.some((p) => p.patientUserId === preset)) setPatientId(preset);
      else if (list.length > 0) setPatientId(list[0].patientUserId);
    });
  }, []);

  const loadApproval = useCallback(async () => {
    if (!patientId) return;
    try {
      const rows = await api.getPrescriptionApprovalsForDoctor(patientId);
      setApproval(rows.find((r) => r.status === "approved" || r.status === "pending") || null);
    } catch (err) {
      setError(err.message || "Couldn't load approval status.");
    }
  }, [patientId]);

  useEffect(() => {
    setApproval(undefined);
    setIssued(null);
    loadApproval();
  }, [loadApproval]);

  useEffect(() => {
    if (approval?.status !== "pending") return undefined;
    const timer = setInterval(loadApproval, 5000);
    return () => clearInterval(timer);
  }, [approval, loadApproval]);

  function updateMed(index, field, value) {
    setMedications((meds) => meds.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  }

  async function askPatient() {
    setError("");
    setBusy(true);
    try {
      await api.requestPrescriptionApproval(patientId);
      await loadApproval();
    } catch (err) {
      setError(err.message || "Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const meds = medications.filter((m) => Object.values(m).some((v) => v.trim()));
    if (meds.length === 0) return setError("Add at least one medicine.");
    if (meds.some((m) => !m.name.trim() || !m.dose.trim() || !m.frequency.trim() || !m.duration.trim())) {
      return setError("Each medicine needs a name, dose, how often and for how long.");
    }
    if (!password) return setError("Enter your password to confirm the prescription.");
    setBusy(true);
    try {
      const result = await api.createPrescription({
        patientId,
        approvalId: approval.id,
        title: title.trim(),
        medications: meds.map((m) => ({ ...m, instructions: m.instructions.trim() || undefined })),
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        password,
      });
      setIssued(result);
      setPassword("");
      setMedications([{ ...EMPTY_MED }]);
      setTitle("");
      setDiagnosis("");
      setNotes("");
      await loadApproval();
    } catch (err) {
      setError(err.message || "Couldn't issue this prescription.");
    } finally {
      setBusy(false);
    }
  }

  const patient = patients?.find((p) => p.patientUserId === patientId);

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Write a prescription"
      subtitle="The patient approves each prescription first. You confirm it with your password."
    >
      <div className="card card-pad" style={{ maxWidth: 860 }}>
        <div className="field">
          <label>Patient</label>
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} disabled={!patients || patients.length === 0}>
            {patients && patients.length === 0 && <option value="">No patients with active access</option>}
            {patients?.map((p) => (
              <option key={p.patientUserId} value={p.patientUserId}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {issued && (
          <p style={{ color: "var(--primary)", fontWeight: 600 }}>
            Prescription issued. That approval is now used; ask again for another prescription.{" "}
            <Link href="/doctor/patients">Back to patients</Link>
          </p>
        )}

        {patientId && approval === null && (
          <div>
            <p style={{ fontSize: 13.5 }}>{patient?.name || "The patient"} has to approve before you write a prescription.</p>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={askPatient}>
              {busy ? "Sending…" : "Ask patient to approve"}
            </button>
          </div>
        )}

        {approval?.status === "pending" && (
          <p style={{ fontSize: 13.5 }}>Waiting for {patient?.name || "the patient"} to approve. This page updates on its own.</p>
        )}

        {approval?.status === "approved" && (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: 13, color: "var(--primary)", fontWeight: 600, marginTop: 0 }}>
              Approved by the patient. You can issue one prescription with this approval.
            </p>
            <div className="field">
              <label htmlFor="rx-title">Title (optional)</label>
              <input id="rx-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chest infection" />
            </div>

            <label style={{ fontSize: 13, fontWeight: 600 }}>Medicines</label>
            {medications.map((med, index) => (
              <div key={index} className="rx-med" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, alignItems: "end", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                {MED_FIELDS.map((f) => (
                  <div className="field" style={{ marginBottom: 0 }} key={f.id}>
                    <label htmlFor={`med-${index}-${f.id}`} style={{ fontSize: 12 }}>
                      {f.label}
                    </label>
                    <input id={`med-${index}-${f.id}`} value={med[f.id]} placeholder={f.placeholder} maxLength={f.id === "instructions" ? 500 : 200} onChange={(e) => updateMed(index, f.id, e.target.value)} />
                  </div>
                ))}
                {medications.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMedications((meds) => meds.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" style={{ margin: "10px 0 16px" }} onClick={() => setMedications((meds) => [...meds, { ...EMPTY_MED }])}>
              Add another medicine
            </button>

            <div className="field">
              <label htmlFor="rx-diagnosis">Diagnosis (optional, not shown to the pharmacy)</label>
              <textarea id="rx-diagnosis" rows={2} maxLength={2000} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rx-notes">Advice for the patient (optional, not shown to the pharmacy)</label>
              <textarea id="rx-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sign-password">Your password</label>
              <input id="sign-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Issuing…" : "Issue prescription"}
            </button>
          </form>
        )}
        {approval?.status !== "approved" && error && <div className="error-text">{error}</div>}
      </div>
    </PortalShell>
  );
}
