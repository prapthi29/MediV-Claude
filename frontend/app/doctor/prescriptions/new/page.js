"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../../components/PortalShell";
import { api } from "../../../../lib/api";

export default function NewPrescription() {
  const router = useRouter();
  const [patients, setPatients] = useState(null);
  const [patientId, setPatientId] = useState("");
  const [title, setTitle] = useState("");
  const [signature, setSignature] = useState("");
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
    if (!patientId)
      return setError("Choose a patient you have active access for.");
    if (!file) return setError("Attach the prescription document.");
    if (!signature.trim())
      return setError(
        "A wallet signature over the file's SHA-256 hash is required.",
      );
    setSubmitting(true);
    try {
      const res = await api.createPrescription({
        patientId,
        title: title.trim() || undefined,
        signature: signature.trim(),
        file,
      });
      setResult(res);
    } catch (err) {
      setError(
        err.message ||
          "Couldn't issue this prescription. Confirm you still have active access to this patient.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell
      role="doctor"
      eyebrow="Doctor Portal"
      title="Issue prescription"
      subtitle="Upload the signed prescription document. Your wallet signature over its hash is what a pharmacy verifies."
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
          </div>

          <div className="field">
            <label>Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Amoxicillin course"
            />
          </div>

          <div className="field">
            <label>Document</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="field">
            <label>Wallet signature</label>
            <input
              className="mono"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="0x…"
            />
            <div className="field-hint">
              Sign the SHA-256 hash of the document with your wallet (e.g.
              MetaMask) and paste the signature here.
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
              marginTop: 6,
            }}
          >
            {submitting ? "Issuing…" : "Issue prescription"}
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
            <li>Your signature is checked against your wallet address</li>
            <li>The file is encrypted (AES-256-GCM) and stored off-chain</li>
            <li>Its hash is registered on-chain</li>
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
                Prescription issued
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--muted)",
                  marginBottom: 8,
                }}
              >
                Share ID{" "}
                <span
                  className="mono"
                  style={{ color: "var(--ink)", fontWeight: 600 }}
                >
                  {result.id}
                </span>{" "}
                with the patient.
              </div>
              <button
                className="btn btn-ghost btn-sm"
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
