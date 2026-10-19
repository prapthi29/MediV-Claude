"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/PortalShell";
import { DiagnosisFields, RECORD_TYPES } from "../../../../components/DiagnosisRecord";
import { api } from "../../../../lib/api";

const CONTENT_MODES = [
  { id: "form", label: "Form" },
  { id: "file", label: "File" },
  { id: "both", label: "Both" },
];

export default function NewRecord() {
  const [patients, setPatients] = useState(null);
  const [patientId, setPatientId] = useState("");
  const [approval, setApproval] = useState(undefined);
  const [category, setCategory] = useState("diagnosis");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("form");
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    api.getDoctorPatients().then((list) => {
      setPatients(list);
      const preset = new URLSearchParams(window.location.search).get("patient");
      if (preset && list.some((p) => p.patientUserId === preset)) setPatientId(preset);
      else if (list.length > 0) setPatientId(list[0].patientUserId);
    });
  }, []);

  // The newest creation request that is still waiting or ready to use.
  const loadApproval = useCallback(async () => {
    if (!patientId) return;
    try {
      const rows = await api.getRecordCreationRequestsForDoctor(patientId);
      setApproval(rows.find((r) => r.status === "approved" || r.status === "pending") || null);
    } catch (err) {
      setError(err.message || "Couldn't load approval status.");
    }
  }, [patientId]);

  useEffect(() => {
    setApproval(undefined);
    setSaved(null);
    loadApproval();
  }, [loadApproval]);

  useEffect(() => {
    if (approval?.status !== "pending") return undefined;
    const timer = setInterval(loadApproval, 5000);
    return () => clearInterval(timer);
  }, [approval, loadApproval]);

  async function askPatient() {
    setError("");
    setBusy(true);
    try {
      await api.requestRecordCreation(patientId);
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
    const useForm = mode !== "file";
    const useFile = mode !== "form";
    if (useForm && !form.diagnosis?.trim()) return setError("Enter the diagnosis.");
    if (useFile && !file) return setError("Choose a file to attach.");
    if (!password) return setError("Enter your password to sign the record.");
    setBusy(true);
    try {
      const record = await api.saveRecord({
        patientId,
        approvalId: approval.id,
        title: title.trim(),
        category,
        form: useForm ? form : null,
        file: useFile ? file : null,
        password,
      });
      setSaved(record);
      setPassword("");
      setForm({});
      setFile(null);
      setTitle("");
      await loadApproval();
    } catch (err) {
      setError(err.message || "Couldn't save the record.");
    } finally {
      setBusy(false);
    }
  }

  const patient = patients?.find((p) => p.patientUserId === patientId);

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Add a medical record"
      subtitle="The patient approves each new record first. You sign it with your password, it is encrypted with AES-256, and its SHA-256 hash goes on the blockchain."
    >
      <div className="card card-pad" style={{ maxWidth: 760 }}>
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
          <div className="field-hint">Only patients who have linked you in the last 30 minutes appear here.</div>
        </div>

        {saved && (
          <p style={{ color: "var(--primary)", fontWeight: 600 }}>
            Saved and signed: “{saved.title || "Medical record"}”. That approval is now used; ask again to add another record.{" "}
            <Link href="/doctor/patients">Back to patients</Link>
          </p>
        )}

        {patientId && approval === null && (
          <div>
            <p style={{ fontSize: 13.5 }}>
              {patient?.name || "The patient"} has to approve before you add a record.
            </p>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={askPatient}>
              {busy ? "Sending…" : "Ask patient to approve"}
            </button>
          </div>
        )}

        {approval?.status === "pending" && (
          <p style={{ fontSize: 13.5 }}>
            Waiting for {patient?.name || "the patient"} to approve. This page updates on its own.
          </p>
        )}

        {approval?.status === "approved" && (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: 13, color: "var(--primary)", fontWeight: 600, marginTop: 0 }}>
              Approved by the patient. You can save one record with this approval.
            </p>
            <div className="field">
              <label htmlFor="record-title">Title</label>
              <input id="record-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow-up for fever, October 2026" />
            </div>
            <div className="field">
              <label>Record type</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {RECORD_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Content</label>
              <div style={{ display: "flex", gap: 16 }}>
                {CONTENT_MODES.map((m) => (
                  <label key={m.id} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 500 }}>
                    <input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
            {mode !== "file" && <DiagnosisFields value={form} onChange={setForm} />}
            {mode !== "form" && (
              <div className="field">
                <label>File</label>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <div className="field-hint">PDF, image or Word document, up to 10 MB.</div>
              </div>
            )}
            <div className="field">
              <label htmlFor="sign-password">Your password (signs the record)</label>
              <input id="sign-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Signing and saving…" : "Sign and save record"}
            </button>
          </form>
        )}

        {approval?.status !== "approved" && error && <div className="error-text">{error}</div>}
      </div>
    </PortalShell>
  );
}
