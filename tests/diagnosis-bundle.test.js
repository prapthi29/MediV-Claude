import { describe, expect, it } from 'vitest';
import { decodeBundle, encodeBundle, isBundle, recordSignatureDigest } from '../src/services/diagnosis-bundle.js';

describe('diagnosis bundle', () => {
  it('round-trips a form and an attached file', () => {
    const file = Buffer.from('%PDF-1.7 scan');
    const bundle = encodeBundle({
      form: { diagnosis: 'Asthma', treatmentPlan: 'Inhaler' },
      attachment: { filename: 'scan.pdf', contentType: 'application/pdf', buffer: file }
    });

    expect(isBundle(bundle)).toBe(true);
    const decoded = decodeBundle(bundle);
    expect(decoded.form).toEqual({ diagnosis: 'Asthma', treatmentPlan: 'Inhaler' });
    expect(decoded.attachment.filename).toBe('scan.pdf');
    expect(decoded.attachment.buffer.equals(file)).toBe(true);
  });

  it('round-trips a form with no file', () => {
    const decoded = decodeBundle(encodeBundle({ form: { diagnosis: 'Migraine' } }));
    expect(decoded.form).toEqual({ diagnosis: 'Migraine' });
    expect(decoded.attachment).toBeNull();
  });

  it('treats a record stored before bundles as a plain file', () => {
    const legacy = Buffer.from('%PDF-1.4 old');
    const decoded = decodeBundle(legacy, { filename: 'old.pdf', contentType: 'application/pdf' });
    expect(decoded.form).toBeNull();
    expect(decoded.attachment.filename).toBe('old.pdf');
    expect(decoded.attachment.buffer.equals(legacy)).toBe(true);
  });

  it('produces a different signed digest for each version and patient', () => {
    const base = { patientUserId: 'p1', version: 1, contentSha256: 'a'.repeat(64), title: 'T', category: 'diagnosis' };
    const d1 = recordSignatureDigest(base);
    expect(d1).toMatch(/^[a-f0-9]{64}$/);
    expect(recordSignatureDigest({ ...base, version: 2 })).not.toBe(d1);
    expect(recordSignatureDigest({ ...base, patientUserId: 'p2' })).not.toBe(d1);
    expect(recordSignatureDigest({ ...base })).toBe(d1);
  });
});
