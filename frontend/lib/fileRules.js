export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const FILE_HINT = "Allowed: PDF, JPG/JPEG, PNG · max 10 MB";

const OK_EXT = ["pdf", "jpg", "jpeg", "png"];
const OK_MIME = ["application/pdf", "image/jpeg", "image/png"];

export function validateFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!OK_EXT.includes(ext) || !OK_MIME.includes(file.type))
    return "Only PDF, JPG/JPEG and PNG files are allowed.";
  if (file.size > 10 * 1024 * 1024) return "File must be 10 MB or smaller.";
  return null;
}
