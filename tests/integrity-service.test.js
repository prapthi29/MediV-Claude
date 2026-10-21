import { describe, expect, it } from 'vitest';
import { chainHash } from '../src/services/integrity-service.js';

const entry = (id, overrides = {}) => ({
  id: String(id),
  occurred_us: '1792000000000000',
  db_user: 'postgres',
  client: 'api',
  application_name: 'medivault-api',
  table_name: 'prescriptions',
  row_key: 'abc',
  operation: 'INSERT',
  row_sha256: 'f'.repeat(64),
  detail: null,
  ...overrides
});

describe('change log hash chain', () => {
  it('links each entry to the one before it', () => {
    const first = chainHash(null, entry(1));
    const second = chainHash(first, entry(2));

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(chainHash(first, entry(2))).toBe(second);
    expect(chainHash(null, entry(2))).not.toBe(second);
  });

  it('changes when any logged detail changes', () => {
    const original = chainHash(null, entry(1));

    expect(chainHash(null, entry(1, { operation: 'DELETE' }))).not.toBe(original);
    expect(chainHash(null, entry(1, { db_user: 'someone' }))).not.toBe(original);
    expect(chainHash(null, entry(1, { row_sha256: '0'.repeat(64) }))).not.toBe(original);
  });
});
