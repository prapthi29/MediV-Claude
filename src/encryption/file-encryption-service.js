import crypto from 'node:crypto';
import { AppError } from '../utils/app-error.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export class FileEncryptionService {
  constructor({ masterKey }) {
    if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
      throw new Error('File encryption master key must be 32 bytes.');
    }
    this.masterKey = masterKey;
  }

  encrypt(plaintext) {
    const dataKey = crypto.randomBytes(32);
    const file = encryptBuffer(plaintext, dataKey);
    const protectedDataKey = encryptBuffer(dataKey, this.masterKey);
    dataKey.fill(0);
    return {
      ciphertext: file.ciphertext,
      encryptionAlgorithm: 'AES-256-GCM',
      encryptedDataKey: protectedDataKey.ciphertext,
      dataKeyIv: protectedDataKey.iv,
      dataKeyAuthTag: protectedDataKey.authTag,
      fileIv: file.iv,
      fileAuthTag: file.authTag
    };
  }

  decrypt(ciphertext, metadata) {
    if (metadata.encryption_algorithm !== 'AES-256-GCM') {
      throw new AppError(500, 'Record encryption metadata is unsupported.', 'UNSUPPORTED_ENCRYPTION');
    }
    let dataKey;
    try {
      dataKey = decryptBuffer(metadata.encrypted_data_key, this.masterKey, metadata.data_key_iv, metadata.data_key_auth_tag);
      return decryptBuffer(ciphertext, dataKey, metadata.file_iv, metadata.file_auth_tag);
    } catch {
      throw new AppError(500, 'Medical record could not be decrypted.', 'DECRYPTION_FAILED');
    } finally {
      dataKey?.fill(0);
    }
  }
}

function encryptBuffer(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  return { ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]), iv, authTag: cipher.getAuthTag() };
}

function decryptBuffer(ciphertext, key, iv, authTag) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(authTag));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
