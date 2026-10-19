"use client";

// Shared pieces for diagnosis records: the form fields a doctor fills in,
// and the read-only view a doctor or patient sees.

export const RECORD_TYPES = [
  { id: "diagnosis", label: "Diagnosis" },
  { id: "lab-result", label: "Lab report" },
  { id: "imaging", label: "Imaging" },
  { id: "clinical-note", label: "Consultation note" },
  { id: "other", label: "Other" },
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
  const legacy = integrity.signatureValid === null;
  return (
    <p style={{ fontSize: 13, margin: "0 0 12px" }}>
      <strong style={{ color: ok ? "var(--primary)" : "var(--red)" }}>
        {ok ? "Verified" : legacy ? "Not signed" : "Could not be verified"}
      </strong>
      {" · "}hash matches: {integrity.hashValid ? "yes" : "no"}; doctor signature:{" "}
      {legacy ? "none (added before signing)" : integrity.signatureValid ? "valid" : "invalid"}; on blockchain:{" "}
      {integrity.onChain ? "yes" : "no"}
    </p>
  );
}

function base64ToBlob(base64, contentType) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
}

export function saveBase64(attachment) {
  const url = URL.createObjectURL(base64ToBlob(attachment.base64, attachment.contentType));
  const a = document.createElement("a");
  a.href = url;
  a.download = attachment.filename || "attachment";
  a.click();
  URL.revokeObjectURL(url);
}

// view = { record, form, attachment, integrity } as returned by the API.
export function RecordView({ view, onDownload }) {
  const { record, form, attachment, integrity } = view;
  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{record.title || "Medical record"}</h3>
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
          {typeLabel(record.category)} · version {record.version}
          {record.doctorName ? ` · by ${record.doctorName}` : ""}
        </span>
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
        <p style={{ margin: 0, fontSize: 13.5 }}>
          Attached file: <strong>{attachment.filename}</strong>{" "}
          <span style={{ color: "var(--muted)" }}>({Math.max(1, Math.round((attachment.size || 0) / 1024))} KB)</span>{" "}
          {onDownload && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDownload}>
              Download
            </button>
          )}
        </p>
      ) : (
        !form && <p style={{ color: "var(--muted)" }}>This record is empty.</p>
      )}
    </div>
  );
}
