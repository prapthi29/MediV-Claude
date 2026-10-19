import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { Wallet, getAddress, getBytes, verifyMessage } from 'ethers';
import { AppError } from '../utils/app-error.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SHA256_HEX = /^[a-f0-9]{64}$/i;

export const SIGNING_ROLES = ['doctor', 'pharmacy'];

// Password-locked ECDSA (secp256k1) keys. Signatures are Ethereum personal-sign
// signatures over the raw 32-byte SHA-256 digest, verifiable with ethers.verifyMessage.
export class SigningKeyService {
  constructor({ signingKeyRepository, userRepository, auditService }) {
    this.signingKeyRepository = signingKeyRepository;
    this.userRepository = userRepository;
    this.auditService = auditService;
  }

  // Creates a new keypair locked with the password. Nothing is stored yet.
  async generate(password) {
    const wallet = Wallet.createRandom();
    const kdfSalt = crypto.randomBytes(16);
    const derivedKey = await scrypt(password, kdfSalt, 32, SCRYPT_OPTIONS);
    const keyIv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, keyIv);
    const encryptedPrivateKey = Buffer.concat([
      cipher.update(Buffer.from(getBytes(wallet.privateKey))),
      cipher.final()
    ]);
    derivedKey.fill(0);
    return {
      address: wallet.address,
      encryptedPrivateKey,
      kdfSalt,
      keyIv,
      keyAuthTag: cipher.getAuthTag()
    };
  }

  async store(userId, generated) {
    const key = await this.signingKeyRepository.create({ userId, ...generated });
    await this.auditService?.record({
      eventType: 'signing_key_created',
      actorUserId: userId,
      subjectUserId: userId,
      resourceType: 'signing_key',
      resourceId: key.id,
      metadata: { address: key.address }
    });
    return key;
  }

  // Gives a doctor or pharmacy account a key if it has none (e.g. accounts created
  // before signing keys existed). Called at login, when the password is available.
  async ensureKey(user, password) {
    if (!SIGNING_ROLES.includes(user.role)) return null;
    const existing = await this.signingKeyRepository.findActiveForUser(user.id);
    if (existing) return existing;
    const generated = await this.generate(password);
    const key = await this.store(user.id, generated);
    await this.userRepository.updateBlockchainAddress(user.id, key.address);
    return key;
  }

  async getActiveKeyInfo(userId) {
    const key = await this.signingKeyRepository.findActiveForUser(userId);
    if (!key) {
      throw new AppError(404, 'No signing key exists for this account.', 'SIGNING_KEY_MISSING');
    }
    return { address: key.address, createdAt: key.created_at };
  }

  async signDigest(userId, password, sha256Hex) {
    if (typeof sha256Hex !== 'string' || !SHA256_HEX.test(sha256Hex)) {
      throw new AppError(400, 'A SHA-256 digest is required for signing.', 'INVALID_DIGEST');
    }
    if (typeof password !== 'string' || !password) {
      throw new AppError(400, 'Enter your password to sign.', 'SIGNING_PASSWORD_REQUIRED');
    }

    const key = await this.signingKeyRepository.findActiveForUser(userId);
    if (!key) {
      throw new AppError(409, 'No signing key exists for this account. Sign out and sign in again to create one.', 'SIGNING_KEY_MISSING');
    }

    let privateKey;
    let derivedKey;
    try {
      derivedKey = await scrypt(password, key.kdf_salt, 32, SCRYPT_OPTIONS);
      const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, Buffer.from(key.key_iv));
      decipher.setAuthTag(Buffer.from(key.key_auth_tag));
      privateKey = Buffer.concat([
        decipher.update(Buffer.from(key.encrypted_private_key)),
        decipher.final()
      ]);
    } catch {
      throw new AppError(401, 'Incorrect password. Nothing was signed.', 'INVALID_SIGNING_PASSWORD');
    } finally {
      derivedKey?.fill(0);
    }

    try {
      const wallet = new Wallet(`0x${privateKey.toString('hex')}`);
      const signature = await wallet.signMessage(getBytes(`0x${sha256Hex.toLowerCase()}`));
      return { signature, signerAddress: wallet.address };
    } finally {
      privateKey.fill(0);
    }
  }

  static verifyDigest(sha256Hex, signature, expectedAddress) {
    try {
      return Boolean(expectedAddress) &&
        getAddress(verifyMessage(getBytes(`0x${sha256Hex}`), signature)) === getAddress(expectedAddress);
    } catch {
      return false;
    }
  }

  // True when the address is one of this user's keys, current or retired.
  async isKeyOfUser(address, userId) {
    const key = await this.signingKeyRepository.findByAddress(address);
    return Boolean(key && key.user_id === userId);
  }
}
