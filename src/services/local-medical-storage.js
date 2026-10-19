import fs from 'node:fs/promises';
import path from 'node:path';

export class LocalMedicalStorage {
  constructor({ baseDir = './uploads' } = {}) {
    this.baseDir = path.resolve(baseDir);
  }

  async put({ key, body, contentType }) {
    const filePath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body);
    return { key, location: filePath };
  }

  async get({ key }) {
    const filePath = path.join(this.baseDir, key);
    const body = await fs.readFile(filePath);
    return { body };
  }

  async delete({ key }) {
    const filePath = path.join(this.baseDir, key);
    await fs.unlink(filePath);
  }

  async exists({ key }) {
    const filePath = path.join(this.baseDir, key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
