"use client";

// The lab report half of "Add a medical record": a report file (PDF or
// image) with optional findings. The patient approves each one first.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { REPORT_TYPES } from "./DiagnosisRecord";
import { ACCEPT_ATTR, FILE_HINT, validateFile } from "../lib/fileRules";
import { FieldError, scrollToField } from "./FieldError";
import { toast } from "./Toast";

export default function LabReportForm({ patientId, patient }) {
  const [approval, setApproval] = useState(undefined);
  const [category, setCategory] = useState(REPORT_TYPES[0].id);
  const [title, setTitle] = useState("");
  const [otherType, setOtherType] = useState("");
  const [findings, setFindings] = useState("");
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
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
      toast.success("Request sent. The form opens once the patient approves.");
      await loadApproval();
    } catch (err) {
      setError(err.message || "Couldn't send the request.");
      toast.error(err.message || "Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  }

  function clearFieldError(key) {
    setFieldErrors((errs) => {
      if (!errs[key] && !errs.submit) return errs;
      const { [key]: _gone, submit: _submit, ...rest } = errs;
      return rest;
    });
  }

  function chooseFile(e) {
    const chosen = e.target.files?.[0] || null;
    const problem = chosen && validateFile(chosen);
    clearFieldError("file");
    if (problem) setFieldErrors((errs) => ({ ...errs, file: problem }));
    setFile(problem ? null : chosen);
  }

  function reportForm() {
    const form = {};
    if (findings.trim()) form.findings = findings.trim();
    if (category === "other" && otherType.trim()) form.reportType = otherType.trim();
    return Object.keys(form).length ? form : null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    // Each problem is shown under its own field; the page scrolls to the first.
    const errs = {};
    if (!title.trim()) errs.title = "Enter a title for the report.";
    if (category === "other" && !otherType.trim()) errs.otherType = "Name the type of report.";
    if (!file) errs.file = fieldErrors.file || "Choose the report file to upload.";
    if (!password) errs.password = "Enter your password to confirm the report.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return scrollToField(Object.keys(errs));
    setBusy(true);
    try {
      const record = await api.saveRecord({
        patientId,
        approvalId: approval.id,
        title: title.trim(),
        category,
        form: reportForm(),
        file,
        password,
      });
      setSaved(record);
      toast.success("Lab report saved.");
      setPassword("");
      setFindings("");
      setOtherType("");
      setFile(null);
      setTitle("");
      await loadApproval();
    } catch (err) {
      setFieldErrors({ submit: err.message || "Couldn't save the report." });
      toast.error(err.message || "Couldn't save the report.");
      scrollToField("submit");
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
        <form onSubmit={handleSubmit} noValidate>
          <p style={{ fontSize: 13, color: "var(--primary)", fontWeight: 600, marginTop: 0 }}>
            Approved by the patient. You can save one report with this approval.
          </p>
          <div className="field">
            <label htmlFor="report-title">Title</label>
            <input
              id="report-title"
              data-field="title"
              maxLength={200}
              value={title}
              onChange={(e) => {
                clearFieldError("title");
                setTitle(e.target.value);
              }}
              placeholder="e.g. Complete blood count, October 2026"
            />
            <FieldError message={fieldErrors.title} />
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
          {category === "other" && (
            <div className="field">
              <label htmlFor="report-other-type">Specify the report type</label>
              <input
                id="report-other-type"
                data-field="otherType"
                maxLength={200}
                value={otherType}
                onChange={(e) => {
                  clearFieldError("otherType");
                  setOtherType(e.target.value);
                }}
                placeholder="e.g. ECG, discharge summary, vaccination card"
              />
              <FieldError message={fieldErrors.otherType} />
            </div>
          )}
          <div className="field">
            <label htmlFor="report-file">Report file</label>
            <input id="report-file" data-field="file" type="file" accept={ACCEPT_ATTR} onChange={chooseFile} />
            <div className="field-hint">{FILE_HINT}</div>
            <FieldError message={fieldErrors.file} />
          </div>
          <div className="field">
            <label htmlFor="report-findings">Findings or notes (optional)</label>
            <textarea id="report-findings" rows={3} maxLength={4000} value={findings} onChange={(e) => setFindings(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="report-password">Your password</label>
            <input
              id="report-password"
              data-field="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                clearFieldError("password");
                setPassword(e.target.value);
              }}
            />
            <FieldError message={fieldErrors.password} />
          </div>
          <div data-field="submit">
            <FieldError message={fieldErrors.submit || error} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save lab report"}
          </button>
        </form>
      )}
      {approval?.status !== "approved" && error && <div className="error-text">{error}</div>}
    </>
  );
}
