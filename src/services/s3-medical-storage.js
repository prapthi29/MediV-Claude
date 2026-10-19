import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { AppError } from '../utils/app-error.js';

export class S3MedicalStorage {
  constructor({ client, bucket }) {
    this.client = client;
    this.bucket = bucket;
  }

  async put({ key, body, contentType }) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: 'AES256'
    }));
  }

  async get(key) {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        throw new AppError(404, 'Medical file was not found in storage.', 'FILE_NOT_FOUND');
      }
      throw error;
    }
  }

  async delete(key) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
