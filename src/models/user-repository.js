export class UserRepository {
  constructor(database) {
    this.database = database;
  }

  async findByEmail(email) {
    const result = await this.database.query(
      'SELECT id, name, email, password_hash, role, status, patient_id, license_id, created_at, blockchain_address FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] ?? null;
  }

  async findById(id) {
    const result = await this.database.query(
      'SELECT id, name, email, role, status, patient_id, license_id, blockchain_address FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findActiveDoctorByLicenseId(licenseId) {
    const result = await this.database.query(
      `SELECT id, name, email, role, status, patient_id, license_id, created_at
       FROM users
       WHERE LOWER(BTRIM(license_id)) = LOWER(BTRIM($1))
         AND role = 'doctor' AND status = 'active'
       LIMIT 1`,
      [licenseId]
    );
    return result.rows[0] ?? null;
  }

  async updateBlockchainAddress(id, blockchainAddress) {
    const result = await this.database.query(
      'UPDATE users SET blockchain_address = $2, updated_at = NOW() WHERE id = $1 RETURNING id, blockchain_address',
      [id, blockchainAddress]
    );
    return result.rows[0];
  }

  async create({ name, email, passwordHash, role, status = 'active', blockchainAddress, licenseId }) {
    const result = await this.database.query(
      `INSERT INTO users (name, email, password_hash, role, status, blockchain_address, license_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, status, patient_id, license_id, created_at, blockchain_address`,
      [name || email.split('@')[0], email, passwordHash, role, status, blockchainAddress, licenseId || null]
    );
    return result.rows[0];
  }

  async listPending() {
    const result = await this.database.query(
      `SELECT id, name, email, role, status, license_id, blockchain_address, created_at FROM users
       WHERE status = 'pending' ORDER BY created_at ASC`
    );
    return result.rows;
  }

  // Admin directory: doctors, pharmacies and admins only. Patient accounts are not listed.
  async listNonPatients({ limit = 200 } = {}) {
    const result = await this.database.query(
      `SELECT id, name, email, role, status, license_id, blockchain_address, created_at FROM users
       WHERE role <> 'patient'
       ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async setStatus(id, status) {
    const result = await this.database.query(
      `UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1
       RETURNING id, email, role, status`,
      [id, status]
    );
    return result.rows[0] ?? null;
  }
}