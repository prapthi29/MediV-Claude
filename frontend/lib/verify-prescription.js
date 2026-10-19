import { getBytes, verifyMessage } from "ethers";

// Checks a doctor's prescription signature in the browser, so the pharmacy
// does not have to take the server's word for it. Mirrors
// src/services/prescription-document.js on the backend.

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns { medicinesMatch, signatureMatches, recoveredAddress }.
export async function verifyPrescriptionInBrowser(medications, proof) {
  const medicationsSha256 = await sha256Hex(stableStringify(medications));
  const rootSha256 = await sha256Hex(
    stableStringify({
      type: proof.type,
      patientUserId: proof.patientUserId,
      medicationsSha256,
      clinicalSha256: proof.clinicalSha256,
    })
  );
  const medicinesMatch = medicationsSha256 === proof.medicationsSha256 && rootSha256 === proof.rootSha256;
  let recoveredAddress = null;
  try {
    recoveredAddress = verifyMessage(getBytes(`0x${rootSha256}`), proof.signature);
  } catch {
    recoveredAddress = null;
  }
  return {
    medicinesMatch,
    signatureMatches: Boolean(recoveredAddress) && recoveredAddress.toLowerCase() === String(proof.signerAddress).toLowerCase(),
    recoveredAddress,
  };
}
