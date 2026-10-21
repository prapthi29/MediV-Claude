"use client";

// The read-only view of a prescription, for the patient and a linked doctor.
import { AttachmentPanel } from "./DiagnosisRecord";
import { fmtDate, fmtDateTime } from "./ui";
import { makeTextPdf, safeFilename, saveBlob } from "../lib/pdf";

// A typed prescription as a PDF to keep.
export function savePrescriptionPdf(view) {
  const { prescription, medications, diagnosis, symptoms, notes, followUp, followUpDate, integrity } = view;
  const blocks = [
    { type: "title", text: prescription.title || "Prescription" },
    { type: "row", label: "Prescribed by", text: prescription.doctorName || "-" },
    { type: "row", label: "Issued", text: prescription.createdAt ? new Date(prescription.createdAt).toLocaleString() : "-" },
    { type: "row", label: "Prescription ID", text: prescription.id },
  ];
  if (prescription.dispensedAt) blocks.push({ type: "row", label: "Dispensed", text: new Date(prescription.dispensedAt).toLocaleString() });
  if (diagnosis) blocks.push({ type: "heading", text: "Diagnosis" }, { type: "text", text: diagnosis });
  if (symptoms) blocks.push({ type: "heading", text: "Symptoms" }, { type: "text", text: symptoms });
  blocks.push({ type: "heading", text: "Medicines" });
  (medications || []).forEach((m, i) => {
    blocks.push({ type: "text", text: `${i + 1}. ${m.name}: ${[m.dose, m.frequency, m.duration].filter(Boolean).join(", ")}` });
    if (m.instructions) blocks.push({ type: "muted", text: `    ${m.instructions}` });
  });
  if (notes) blocks.push({ type: "heading", text: "Advice" }, { type: "text", text: notes });
  if (followUp || followUpDate) {
    blocks.push({ type: "heading", text: "Follow-up" }, { type: "text", text: [followUpDate && `On ${fmtDate(followUpDate)}`, followUp].filter(Boolean).join(". ") });
  }
  blocks.push(
    { type: "heading", text: "Verification" },
    { type: "muted", text: integrity?.valid ? "Verified: this prescription is genuine and has not been changed." : "This prescription could not be verified." }
  );
  saveBlob(makeTextPdf(blocks), safeFilename(prescription.title || "prescription", "pdf"));
}

export function PrescriptionView({ view, onDownload, loadFile }) {
  const { prescription, medications, diagnosis, symptoms, notes, followUp, followUpDate, integrity } = view;
  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{prescription.title || "Prescription"}</h3>
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
          {prescription.doctorName ? `by ${prescription.doctorName} · ` : ""}
          {fmtDateTime(prescription.createdAt)}
        </span>
        {medications && onDownload && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onDownload}>
            Download PDF
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, margin: "0 0 12px" }}>
        <strong style={{ color: integrity.valid ? "var(--primary)" : "var(--red)" }}>{integrity.valid ? "Verified" : "Could not be verified"}</strong>
        {integrity.valid ? " · this prescription is genuine and has not been changed." : " · please contact your doctor about this prescription."}
      </p>
      {medications ? (
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Dose</th>
              <th>How often</th>
              <th>For how long</th>
              <th>Instructions</th>
            </tr>
          </thead>
          <tbody>
            {medications.map((m, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{m.name}</td>
                <td>{m.dose}</td>
                <td>{m.frequency}</td>
                <td>{m.duration}</td>
                <td>{m.instructions || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <AttachmentPanel
          key={prescription.id}
          attachment={{ filename: prescription.originalFilename || "prescription", contentType: prescription.contentType, size: prescription.sizeBytes }}
          loadFile={loadFile}
          autoOpen
          canDownload={Boolean(onDownload)}
        />
      )}
      {[diagnosis, symptoms, notes, followUp, followUpDate].some(Boolean) && (
        <dl style={{ margin: "14px 0 0", display: "grid", gridTemplateColumns: "minmax(110px, 160px) 1fr", gap: "6px 14px", fontSize: 13.5 }}>
          {[
            ["Diagnosis", diagnosis],
            ["Symptoms", symptoms],
            ["Advice", notes],
            ["Follow-up", [followUpDate && `On ${fmtDate(followUpDate)}`, followUp].filter(Boolean).join(". ")],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <dt style={{ color: "var(--muted)" }}>{label}</dt>
                <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{value}</dd>
              </div>
            ))}
        </dl>
      )}
    </div>
  );
}
