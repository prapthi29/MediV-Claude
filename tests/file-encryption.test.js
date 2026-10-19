import { describe, expect, it } from 'vitest';
import { FileEncryptionService } from '../src/encryption/file-encryption-service.js';

describe('file encryption', () => {
  it('encrypts with a unique data key and restores the original bytes', () => {
    const encryption = new FileEncryptionService({ masterKey: Buffer.alloc(32, 9) });
    const plaintext = Buffer.from('private medical document');
    const encrypted = encryption.encrypt(plaintext);
    expect(encrypted.encryptionAlgorithm).toBe('AES-256-GCM');
    expect(encrypted.ciphertext).not.toEqual(plaintext);
    const restored = encryption.decrypt(encrypted.ciphertext, {
      encryption_algorithm: encrypted.encryptionAlgorithm,
      encrypted_data_key: encrypted.encryptedDataKey,
      data_key_iv: encrypted.dataKeyIv,
      data_key_auth_tag: encrypted.dataKeyAuthTag,
      file_iv: encrypted.fileIv,
      file_auth_tag: encrypted.fileAuthTag
    });
    expect(restored).toEqual(plaintext);
  });

  it('rejects modified ciphertext', () => {
    const encryption = new FileEncryptionService({ masterKey: Buffer.alloc(32, 4) });
    const encrypted = encryption.encrypt(Buffer.from('private medical document'));
    encrypted.ciphertext[0] ^= 0xff;
    expect(() => encryption.decrypt(encrypted.ciphertext, {
      encryption_algorithm: encrypted.encryptionAlgorithm,
      encrypted_data_key: encrypted.encryptedDataKey,
      data_key_iv: encrypted.dataKeyIv,
      data_key_auth_tag: encrypted.dataKeyAuthTag,
      file_iv: encrypted.fileIv,
      file_auth_tag: encrypted.fileAuthTag
    })).toThrow('Medical record could not be decrypted.');
  });
});
