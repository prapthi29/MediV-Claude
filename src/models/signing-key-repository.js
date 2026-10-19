export class SigningKeyRepository {
  constructor(database) {
    this.database = database;
  }

  async create({ userId, address, encryptedPrivateKey, kdfSalt, keyIv, keyAuthTag }) {
    const result = await this.database.query(
      `INSERT INTO signing_keys (user_id, address, encrypted_private_key, kdf_salt, key_iv, key_auth_tag)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, address, status, created_at`,
      [userId, address, encryptedPrivateKey, kdfSalt, keyIv, keyAuthTag]
    );
    return result.rows[0];
  }

  async findActiveForUser(userId) {
    const result = await this.database.query(
      `SELECT * FROM signing_keys WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
    return result.rows[0] ?? null;
  }

  async findByAddress(address) {
    const result = await this.database.query(
      'SELECT id, user_id, address, status, created_at FROM signing_keys WHERE LOWER(address) = LOWER($1)',
      [address]
    );
    return result.rows[0] ?? null;
  }
}
