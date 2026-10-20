"use client";

import { useEffect, useState } from "react";
import { makeTextPdf, safeFilename, saveBlob } from "../lib/pdf";

// Shared pieces for diagnosis records: the form fields a doctor fills in,
// and the read-only view a doctor or patient sees.

export const RECORD_TYPES = [
  { id: "diagnosis", label: "Diagnosis" },
  { id: "lab-result", label: "Lab report" },
  { id: "imaging", label: "Imaging" },
  { id: "clinical-note", label: "Consultation note" },
  { id: "other", label: "Other" },
];

// What a doctor can choose when uploading a lab report.
export const REPORT_TYPES = [
  { id: "lab-result", label: "Lab report" },
  { id: "imaging", label: "Imaging (X-ray, scan)" },
  { id: "other", label: "Other document" },
];

export const FORM_FIELDS = [
  { id: "diagnosis", label: "Diagnosis", required: true, rows: 2 },
  { id: "symptoms", label: "Symptoms", rows: 2 },
  { id: "findings", label: "Examination findings", rows: 3 },
  { id: "treatmentPlan", label: "Treatment plan", rows: 3 },
  { id: "followUp", label: "Follow-up", rows: 1 },
  { id: "notes", label: "Notes", rows: 2 },
];

export function typeLabel(id) {
  return RECORD_TYPES.find((t) => t.id === id)?.label || id || "—";
}

export function DiagnosisFields({ value, onChange }) {
  return FORM_FIELDS.map((f) => (
    <div className="field" key={f.id}>
      <label htmlFor={`dx-${f.id}`}>
        {f.label}
        {f.required ? "" : " (optional)"}
      </label>
      <textarea
        id={`dx-${f.id}`}
        rows={f.rows}
        maxLength={4000}
        value={value[f.id] || ""}
        onChange={(e) => onChange({ ...value, [f.id]: e.target.value })}
      />
    </div>
  ));
}

export function IntegrityLine({ integrity }) {
  if (!integrity) return null;
  const ok = integrity.verified;
  return (
    <p style={{ fontSize: 13, margin: "0 0 12px" }}>
      <strong style={{ color: ok ? "var(--primary)" : "var(--red)" }}>
        {ok ? "✓ Verified" : "Could not be verified"}
      </strong>
      {ok ? " · this record is genuine and has not been changed." : " · please contact your doctor about this record."}
    </p>
  );
}

export function base64ToBlob(base64, contentType) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
}

function integrityText(integrity) {
  return integrity?.verified ? "Verified: this record is genuine and has not been changed." : "This record could not be verified.";
}

// A typed record as a PDF the patient can keep.
export function saveRecordPdf(view) {
  const { record, form, attachment, integrity } = view;
  const blocks = [
    { type: "title", text: record.title || "Medical record" },
    { type: "row", label: "Type", text: typeLabel(record.category) },
    { type: "row", label: "Doctor", text: record.doctorName || "-" },
    { type: "row", label: "Version", text: String(record.version ?? 1) },
    { type: "row", label: "Date", text: record.createdAt ? new Date(record.createdAt).toLocaleString() : "-" },
    { type: "heading", text: "Record" },
    ...FORM_FIELDS.filter((f) => form?.[f.id]).map((f) => ({ type: "row", label: f.label, text: form[f.id] })),
  ];
  if (attachment) blocks.push({ type: "row", label: "Attached file", text: attachment.filename });
  blocks.push({ type: "heading", text: "Verification" }, { type: "muted", text: integrityText(integrity) });
  saveBlob(makeTextPdf(blocks), safeFilename(record.title || "medical-record", "pdf"));
}

// The attached file with "View file" (shown inline in the page) and
// "Download". loadFile returns the file as a Blob.
export function AttachmentPanel({ attachment, loadFile, autoOpen = false }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  useEffect(() => {
    if (autoOpen && loadFile) toggleView();
    // Open once when the panel first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getBlob() {
    const blob = await loadFile();
    // Use the stored content type so the browser can render the file.
    return attachment.contentType && blob.type !== attachment.contentType
      ? new Blob([blob], { type: attachment.contentType })
      : blob;
  }

  async function toggleView() {
    if (preview) return setPreview(null);
    setBusy(true);
    setError("");
    try {
      const blob = await getBlob();
      setPreview({ url: URL.createObjectURL(blob), type: blob.type });
    } catch (e) {
      setError(e.message || "Couldn't open the file.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setError("");
    try {
      saveBlob(await getBlob(), attachment.filename);
    } catch (e) {
      setError(e.message || "Couldn't download the file.");
    }
  }

  const isImage = preview?.type.startsWith("image/");
  const isPdf = preview?.type === "application/pdf";

  return (
    <div>
      <p style={{ margin: 0, fontSize: 13.5 }}>
        Attached file: <strong>{attachment.filename}</strong>{" "}
        {attachment.size ? <span style={{ color: "var(--muted)" }}>({Math.max(1, Math.round(attachment.size / 1024))} KB)</span> : null}{" "}
        {loadFile && (
          <span className="file-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={toggleView} disabled={busy}>
              {busy ? "Opening…" : preview ? "Hide file" : "View file"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={download}>
              Download
            </button>
          </span>
        )}
      </p>
      {error && <div className="error-text">{error}</div>}
      {preview && (
        <div className="file-preview">
          {isImage ? (
            <img src={preview.url} alt={attachment.filename} />
          ) : isPdf ? (
            <iframe src={preview.url} title={attachment.filename} />
          ) : (
            <p style={{ padding: 14, margin: 0 }}>
              This file type can't be shown here. Use Download to open it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// view = { record, form, attachment, integrity } as returned by the API.
export function RecordView({ view, loadFile, autoOpenFile = false }) {
  const { record, form, attachment, integrity } = view;
  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{record.title || "Medical record"}</h3>
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
          {typeLabel(record.category)} · version {record.version}
          {record.doctorName ? ` · by ${record.doctorName}` : ""}
        </span>
        {form && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => saveRecordPdf(view)}>
            Download record (PDF)
          </button>
        )}
      </div>
      <IntegrityLine integrity={integrity} />
      {form ? (
        <dl style={{ margin: "0 0 12px", display: "grid", gridTemplateColumns: "minmax(120px, 180px) 1fr", gap: "6px 14px", fontSize: 13.5 }}>
          {FORM_FIELDS.filter((f) => form[f.id]).map((f) => (
            <div key={f.id} style={{ display: "contents" }}>
              <dt style={{ color: "var(--muted)" }}>{f.label}</dt>
              <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{form[f.id]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {attachment ? (
        <AttachmentPanel key={record.id} attachment={attachment} loadFile={loadFile} autoOpen={autoOpenFile} />
      ) : (
        !form && <p style={{ color: "var(--muted)" }}>This record is empty.</p>
      )}
    </div>
  );
}
