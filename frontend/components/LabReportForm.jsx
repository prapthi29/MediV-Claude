"use client";

// The lab report half of "Add a medical record": a report file (PDF or
// image) with optional findings. The patient approves each one first.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { REPORT_TYPES } from "./DiagnosisRecord";
import { ACCEPT_ATTR, FILE_HINT, validateFile } from "../lib/fileRules";

export default function LabReportForm({ patientId, patient }) {
  const [approval, setApproval] = useState(undefined);
  const [category, setCategory] = useState(REPORT_TYPES[0].id);
  const [title, setTitle] = useState("");
  const [findings, setFindings] = useState("");
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);

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

  function chooseFile(e) {
    const chosen = e.target.files?.[0] || null;
    const problem = chosen && validateFile(chosen);
    setError(problem || "");
    setFile(problem ? null : chosen);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!file) return setError("Choose the report file to upload.");
    if (!password) return setError("Enter your password to confirm the report.");
    setBusy(true);
    try {
      const record = await api.saveRecord({
        patientId,
        approvalId: approval.id,
        title: title.trim(),
        category,
        form: findings.trim() ? { findings: findings.trim() } : null,
        file,
        password,
      });
      setSaved(record);
      setPassword("");
      setFindings("");
      setFile(null);
      setTitle("");
      await loadApproval();
    } catch (err) {
      setError(err.message || "Couldn't save the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {saved && (
        <p style={{ color: "var(--primary)", fontWeight: 600 }}>
          Saved: “{saved.title || "Lab report"}”. That approval is now used; ask again to add another.{" "}
          <Link href="/doctor/patients">Back to patients</Link>
        </p>
      )}

      {patientId && approval === null && (
        <div>
          <p style={{ fontSize: 13.5 }}>{patient?.name || "The patient"} has to approve before you add a lab report.</p>
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
            Approved by the patient. You can save one report with this approval.
          </p>
          <div className="field">
            <label htmlFor="report-title">Title</label>
            <input id="report-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Complete blood count, October 2026" />
          </div>
          <div className="field">
            <label htmlFor="report-type">Report type</label>
            <select id="report-type" value={category} onChange={(e) => setCategory(e.target.value)}>
              {REPORT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-file">Report file</label>
            <input id="report-file" type="file" accept={ACCEPT_ATTR} onChange={chooseFile} />
            <div className="field-hint">{FILE_HINT}</div>
          </div>
          <div className="field">
            <label htmlFor="report-findings">Findings or notes (optional)</label>
            <textarea id="report-findings" rows={3} maxLength={4000} value={findings} onChange={(e) => setFindings(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="report-password">Your password</label>
            <input id="report-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save lab report"}
          </button>
        </form>
      )}
      {approval?.status !== "approved" && error && <div className="error-text">{error}</div>}
    </>
  );
}
