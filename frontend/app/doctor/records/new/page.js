"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../../components/PortalShell";
import { VerifyChip } from "../../../../components/ui";
import { api } from "../../../../lib/api";

const TYPES = [
  { id: "lab-result", label: "Lab report" },
  { id: "clinical-note", label: "Consultation note" },
  { id: "imaging", label: "Imaging" },
];

export default function NewRecord() {
  const router = useRouter();
  const [patients, setPatients] = useState(null);
  const [patientId, setPatientId] = useState("");
  const [recordType, setRecordType] = useState("lab-result");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.getDoctorPatients().then((list) => {
      setPatients(list);
      const preset = new URLSearchParams(window.location.search).get("patient");
      if (preset && list.some((p) => p.patientUserId === preset))
        setPatientId(preset);
      else if (list.length > 0) setPatientId(list[0].patientUserId);
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!patientId) {
      setError("Choose a patient you have active access for.");
      return;
    }
    if (!file) {
      setError("Attach a file to encrypt and store.");
      return;
    }
    setSubmitting(true);
    try {
      // The backend encrypts (AES-256-GCM), hashes (SHA-256), and calls
      // ChainService.storeRecordHash — this call submits exactly what the
      // medical_records table stores: patient, doctor (from auth), record
      // type, and the file itself (from which original_filename, mime_type,
      // file_size_bytes, iv, and auth_tag are derived server-side).
      const res = await api.createRecord({
        patientId,
        category: recordType,
        title: title.trim(),
        file,
      });
      setResult(res);
    } catch (err) {
      console.error("Medical record upload failed:", err);
      setError(
        err?.message ||
          "Upload failed. Check the backend terminal for the actual error.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Upload medical record"
      subtitle="The file is encrypted before it ever leaves this form's submission — only its hash is recorded on-chain."
    >
      <div className="grid grid-2">
        <form className="card card-pad" onSubmit={handleSubmit}>
          <div className="field">
            <label>Patient</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              disabled={!patients || patients.length === 0}
            >
              {patients && patients.length === 0 && (
                <option value="">No patients with active access</option>
              )}
              {patients?.map((p) => (
                <option key={p.patientUserId} value={p.patientUserId}>
                  {p.patientEmail}
                </option>
              ))}
            </select>
            <div className="field-hint">
              Only patients who've granted you access appear here.
            </div>
          </div>

          <div className="field">
            <label htmlFor="record-title">Record title</label>
            <textarea id="record-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Complete blood count — October 2026" rows={3} />
          </div>

          <div className="field">
            <label>Record type</label>
            <select
              value={recordType}
              onChange={(e) => setRecordType(e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="field-hint">
              Encrypted with AES-256-GCM on upload; the plaintext file never
              touches the chain.
            </div>
          </div>

          {error && <div className="error-text">{error}</div>}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "11px 14px",
            }}
          >
            {submitting ? "Encrypting & storing…" : "Encrypt & store record"}
          </button>
        </form>

        <div className="card card-pad">
          <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>
            What happens on submit
          </h3>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "var(--muted)",
              fontSize: 13,
              lineHeight: 1.8,
            }}
          >
            <li>File is encrypted (AES-256-GCM) and stored off-chain</li>
            <li>SHA-256 hash is computed from the encrypted blob</li>
            <li>
              <code className="mono">ChainService.storeRecordHash</code> records
              the hash and returns a tx ID
            </li>
            <li>
              An audit log entry (<code className="mono">record.create</code>)
              is written
            </li>
          </ol>

          {result && (
            <div
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
                Record stored
              </div>
              <VerifyChip
                hash={result.record_hash || "pending"}
                txId={result.chain_tx_id}
              />
              <button
                className="btn btn-ghost btn-sm"
                style={{ display: "block", marginTop: 14 }}
                onClick={() => router.push("/doctor/patients")}
              >
                Back to patients
              </button>
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
