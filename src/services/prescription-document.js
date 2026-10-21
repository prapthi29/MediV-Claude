import crypto from 'node:crypto';
import { stableStringify } from './basic-profile-signature.js';

// A typed prescription is split into two parts so a pharmacy can check the
// doctor's signature while seeing only the medications:
//   root = sha256({ type, patientUserId, medicationsSha256, clinicalSha256 })
// The doctor signs the root, and the root is what goes on the blockchain.

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export const PRESCRIPTION_CONTENT_TYPE = 'application/vnd.medivault.prescription+json';

export function normaliseMedications(medications) {
  return medications.map((m) => ({
    name: m.name.trim(),
    dose: m.dose.trim(),
    frequency: m.frequency.trim(),
    duration: m.duration.trim(),
    instructions: m.instructions?.trim() || null
  }));
}

export function medicationsSha256(medications) {
  return sha256Hex(stableStringify(medications));
}

// Symptoms and follow-up are hashed only when present, so prescriptions
// written before they existed keep the same hash.
export function clinicalSha256({ diagnosis = null, notes = null, symptoms = null, followUp = null, followUpDate = null }) {
  const clinical = { diagnosis: diagnosis || null, notes: notes || null };
  if (symptoms) clinical.symptoms = symptoms;
  if (followUp) clinical.followUp = followUp;
  if (followUpDate) clinical.followUpDate = followUpDate;
  return sha256Hex(stableStringify(clinical));
}

export function prescriptionRootSha256({ patientUserId, medicationsHash, clinicalHash }) {
  return sha256Hex(
    stableStringify({
      type: 'medivault-prescription/1',
      patientUserId,
      medicationsSha256: medicationsHash,
      clinicalSha256: clinicalHash
    })
  );
}

// Builds the stored document and every hash for a new prescription.
export function buildPrescription({ patientUserId, medications, diagnosis, notes, symptoms, followUp, followUpDate }) {
  const meds = normaliseMedications(medications);
  const clinical = { diagnosis: diagnosis?.trim() || null, notes: notes?.trim() || null };
  if (symptoms?.trim()) clinical.symptoms = symptoms.trim();
  if (followUp?.trim()) clinical.followUp = followUp.trim();
  if (followUpDate) clinical.followUpDate = followUpDate;
  const medicationsHash = medicationsSha256(meds);
  const clinicalHash = clinicalSha256(clinical);
  const document = { medications: meds, ...clinical };

  return {
    document,
    buffer: Buffer.from(stableStringify(document), 'utf8'),
    medicationsHash,
    clinicalHash,
    rootHash: prescriptionRootSha256({ patientUserId, medicationsHash, clinicalHash })
  };
}
