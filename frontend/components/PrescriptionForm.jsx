"use client";

// The prescription half of "Add a medical record": diagnosis, symptoms,
// medicines, advice and follow-up. The patient approves each one first.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";

const EMPTY_MED = { name: "", dose: "", frequency: "", duration: "", instructions: "" };
const MED_FIELDS = [
  { id: "name", label: "Medicine", placeholder: "e.g. Amoxicillin" },
  { id: "dose", label: "Dose", placeholder: "500 mg" },
  { id: "frequency", label: "How often", placeholder: "Three times a day" },
  { id: "duration", label: "For how long", placeholder: "5 days" },
  { id: "instructions", label: "Instructions (optional)", placeholder: "After food" },
];
const EMPTY = { title: "", diagnosis: "", symptoms: "", notes: "", followUp: "" };

export default function PrescriptionForm({ patientId, patient }) {
  const [approval, setApproval] = useState(undefined);
  const [fields, setFields] = useState(EMPTY);
  const [medications, setMedications] = useState([{ ...EMPTY_MED }]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);

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

  const set = (key, value) => setFields((f) => ({ ...f, [key]: value }));

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
    if (!fields.diagnosis.trim()) return setError("Enter the diagnosis.");
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
        title: fields.title.trim(),
        medications: meds.map((m) => ({ ...m, instructions: m.instructions.trim() || undefined })),
        diagnosis: fields.diagnosis.trim(),
        symptoms: fields.symptoms.trim(),
        notes: fields.notes.trim(),
        followUp: fields.followUp.trim(),
        password,
      });
      setIssued(result);
      setPassword("");
      setMedications([{ ...EMPTY_MED }]);
      setFields(EMPTY);
      await loadApproval();
    } catch (err) {
      setError(err.message || "Couldn't save this prescription.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {issued && (
        <p style={{ color: "var(--primary)", fontWeight: 600 }}>
          Prescription saved. That approval is now used; ask again to add another.{" "}
          <Link href="/doctor/patients">Back to patients</Link>
        </p>
      )}

      {patientId && approval === null && (
        <div>
          <p style={{ fontSize: 13.5 }}>{patient?.name || "The patient"} has to approve before you add a prescription.</p>
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
            Approved by the patient. You can save one prescription with this approval.
          </p>
          <div className="field">
            <label htmlFor="rx-title">Title (optional)</label>
            <input id="rx-title" maxLength={200} value={fields.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Chest infection" />
          </div>
          <div className="field">
            <label htmlFor="rx-diagnosis">Diagnosis</label>
            <textarea id="rx-diagnosis" rows={2} maxLength={2000} value={fields.diagnosis} onChange={(e) => set("diagnosis", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rx-symptoms">Symptoms (optional)</label>
            <textarea id="rx-symptoms" rows={2} maxLength={2000} value={fields.symptoms} onChange={(e) => set("symptoms", e.target.value)} />
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Medicines</label>
          {medications.map((med, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, alignItems: "end", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
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
            <label htmlFor="rx-notes">Advice for the patient (optional)</label>
            <textarea id="rx-notes" rows={2} maxLength={2000} value={fields.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rx-follow">Follow-up (optional)</label>
            <input id="rx-follow" maxLength={500} value={fields.followUp} onChange={(e) => set("followUp", e.target.value)} placeholder="e.g. Review in 5 days" />
            <div className="field-hint">The pharmacy sees the medicines only, never the diagnosis, symptoms or advice.</div>
          </div>
          <div className="field">
            <label htmlFor="rx-password">Your password</label>
            <input id="rx-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save prescription"}
          </button>
        </form>
      )}
      {approval?.status !== "approved" && error && <div className="error-text">{error}</div>}
    </>
  );
}
