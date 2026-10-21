// Any file type can be attached. PDFs and images open in the portal;
// other files can only be downloaded by the patient.
export const ACCEPT_ATTR = undefined;
export const FILE_HINT = "Any file type · max 10 MB";

export function validateFile(file) {
  if (file.size > 10 * 1024 * 1024) return "File must be 10 MB or smaller.";
  return null;
}
