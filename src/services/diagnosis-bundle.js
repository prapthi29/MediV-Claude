import crypto from 'node:crypto';
import { stableStringify } from './basic-profile-signature.js';

// A diagnosis record is stored as one encrypted object so that the form, the
// attached file, or both are covered by a single SHA-256 hash, signature and
// on-chain registration. Layout: MAGIC, 4-byte big-endian header length,
// header JSON ({ form, attachment metadata }), then the raw attachment bytes.
const MAGIC = Buffer.from('MVDX1\n', 'ascii');

export const BUNDLE_CONTENT_TYPE = 'application/vnd.medivault.diagnosis';
export const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;

export const DIAGNOSIS_FORM_FIELDS = [
  'diagnosis',
  'symptoms',
  'findings',
  'treatmentPlan',
  'followUp',
  'notes',
  // The doctor's own name for an "Other document" report.
  'reportType'
];

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function encodeBundle({ form = null, attachment = null }) {
  const header = {
    format: 'medivault-diagnosis/1',
    form,
    attachment: attachment
      ? {
          filename: attachment.filename,
          contentType: attachment.contentType,
          size: attachment.buffer.length,
          sha256: sha256Hex(attachment.buffer)
        }
      : null
  };
  const headerBytes = Buffer.from(stableStringify(header), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(headerBytes.length);

  return Buffer.concat([
    MAGIC,
    length,
    headerBytes,
    attachment ? attachment.buffer : Buffer.alloc(0)
  ]);
}

export function isBundle(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= MAGIC.length + 4 &&
    buffer.subarray(0, MAGIC.length).equals(MAGIC)
  );
}

// Returns { form, attachment } for a bundle. Records stored before bundles
// existed are plain files, which are returned as an attachment with no form.
export function decodeBundle(buffer, { filename, contentType } = {}) {
  if (!isBundle(buffer)) {
    return {
      form: null,
      attachment: { filename, contentType, size: buffer.length, buffer }
    };
  }

  const headerLength = buffer.readUInt32BE(MAGIC.length);
  const headerStart = MAGIC.length + 4;
  const header = JSON.parse(
    buffer.subarray(headerStart, headerStart + headerLength).toString('utf8')
  );
  const body = buffer.subarray(headerStart + headerLength);

  return {
    form: header.form ?? null,
    attachment: header.attachment
      ? { ...header.attachment, buffer: body }
      : null
  };
}

// What the doctor signs for each version of a record. The record id is left
// out because it does not exist until the row is written; the patient, version
// and content hash pin the signature to this record's contents.
export function recordSignatureDigest({
  patientUserId,
  version,
  contentSha256,
  title,
  category
}) {
  return sha256Hex(
    Buffer.from(
      stableStringify({
        type: 'medivault-medical-record',
        patientUserId,
        version,
        contentSha256,
        title: title ?? null,
        category: category ?? null
      }),
      'utf8'
    )
  );
}
