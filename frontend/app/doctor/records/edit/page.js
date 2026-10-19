"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/PortalShell";
import { DiagnosisFields, RECORD_TYPES } from "../../../../components/DiagnosisRecord";
import { api } from "../../../../lib/api";

export default function EditRecord() {
  const [ids, setIds] = useState({ patientId: "", recordId: "" });
  const [record, setRecord] = useState(undefined);
  const [current, setCurrent] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("diagnosis");
  const [form, setForm] = useState({});
  const [keepFile, setKeepFile] = useState(true);
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setIds({ patientId: q.get("patient") || "", recordId: q.get("record") || "" });
  }, []);

  const load = useCallback(async () => {
    if (!ids.patientId || !ids.recordId) return;
    try {
      const records = await api.getPatientRecordsForDoctor(ids.patientId);
      const found = records.find((r) => r.id === ids.recordId) || null;
      setRecord(found);
      if (found?.editRequest?.status === "approved" && !current) {
        const view = await api.getRecordForEdit(ids.patientId, ids.recordId, found.editRequest.id);
        setCurrent(view);
        setTitle(view.record.title || "");
        setCategory(view.record.category || "diagnosis");
        setForm(view.form || {});
        setKeepFile(Boolean(view.attachment));
      }
    } catch (err) {
      setError(err.message || "Couldn't load the record.");
    }
  }, [ids, current]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (record?.editRequest?.status !== "pending") return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [record, load]);

  async function askPatient() {
    setError("");
    setBusy(true);
    try {
      await api.requestRecordUpdate(ids.patientId, ids.recordId);
      setSaved(null);
      await load();
    } catch (err) {
      setError(err.message || "Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const hasForm = Object.values(form).some((v) => v && String(v).trim());
    if (hasForm && !form.diagnosis?.trim()) return setError("Enter the diagnosis, or clear the form.");
    if (!hasForm && !file && !(keepFile && current?.attachment)) return setError("The record needs a form, a file, or both.");
    if (!password) return setError("Enter your password to sign the new version.");
    setBusy(true);
    try {
      const updated = await api.saveRecord({
        patientId: ids.patientId,
        recordId: ids.recordId,
        approvalId: record.editRequest.id,
        title: title.trim(),
        category,
        form: hasForm ? form : null,
        file,
        keepExistingFile: !file && keepFile,
        password,
      });
      setSaved(updated);
      setCurrent(null);
      setPassword("");
      await load();
    } catch (err) {
      setError(err.message || "Couldn't save the new version.");
    } finally {
      setBusy(false);
    }
  }

  const status = record?.editRequest?.status;
  const canAsk = record && !["pending", "approved"].includes(status);

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Edit a medical record"
      subtitle="Each edit needs the patient's approval and creates a new signed version. Earlier versions stay on record."
    >
      <div className="card card-pad" style={{ maxWidth: 760 }}>
        {record === null && <p>This record wasn't found, or your 30-minute access has ended.</p>}
        {record && (
          <p style={{ marginTop: 0, fontSize: 13.5 }}>
            <strong>{record.title || "Medical record"}</strong> · version {record.version}
          </p>
        )}
        {saved && (
          <p style={{ color: "var(--primary)", fontWeight: 600 }}>
            Saved and signed as version {saved.version}. <Link href="/doctor/patients">Back to patients</Link>
          </p>
        )}
        {canAsk && (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={askPatient}>
            {busy ? "Sending…" : "Ask patient to approve an edit"}
          </button>
        )}
        {status === "pending" && <p style={{ fontSize: 13.5 }}>Waiting for the patient to approve. This page updates on its own.</p>}

        {status === "approved" && current && (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="record-title">Title</label>
              <input id="record-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
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
            <DiagnosisFields value={form} onChange={setForm} />
            <div className="field">
              <label>File</label>
              {current.attachment && (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 500 }}>
                  <input type="checkbox" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)} />
                  Keep the current file ({current.attachment.filename})
                </label>
              )}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <div className="field-hint">A new file replaces the current one.</div>
            </div>
            <div className="field">
              <label htmlFor="sign-password">Your password (signs the new version)</label>
              <input id="sign-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Signing and saving…" : "Sign and save new version"}
            </button>
          </form>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
    </PortalShell>
  );
}
