import "dotenv/config";
import crypto from "node:crypto";
import { SupabaseMedicalStorage } from "../services/supabase-medical-storage.js";
import { FileEncryptionService } from "../encryption/file-encryption-service.js";

const storage = new SupabaseMedicalStorage({
  url: process.env.SUPABASE_URL,
  bucket: process.env.SUPABASE_STORAGE_BUCKET,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const keyBytes = Buffer.from(process.env.FILE_ENCRYPTION_KEY ?? "", "base64");
const encryption = new FileEncryptionService({ masterKey: keyBytes });

const key = `integration-test/${crypto.randomUUID()}.bin`;
const original = Buffer.from(
  "MediVault Supabase integration test - confidential sample",
);

let uploaded = false;

try {
  const encrypted = encryption.encrypt(original);

  await storage.put({
    key,
    body: encrypted.ciphertext,
    contentType: "application/octet-stream",
  });
  uploaded = true;
  console.log("PASS: Encrypted upload");

  const downloaded = await storage.get({ key });

  const decrypted = encryption.decrypt(downloaded.body, {
    encryption_algorithm: encrypted.encryptionAlgorithm,
    encrypted_data_key: encrypted.encryptedDataKey,
    data_key_iv: encrypted.dataKeyIv,
    data_key_auth_tag: encrypted.dataKeyAuthTag,
    file_iv: encrypted.fileIv,
    file_auth_tag: encrypted.fileAuthTag,
  });
  if (!decrypted.equals(original)) {
    throw new Error("Downloaded content did not match the original.");
  }
  console.log("PASS: Download and decryption");

  await storage.delete({ key });
  uploaded = false;
  console.log("PASS: Delete");

  try {
    await storage.get({ key });
    throw new Error("Deleted object is still accessible.");
  } catch (error) {
    if (error.message === "Deleted object is still accessible.") {
      throw error;
    }

    if (error.code === "FILE_NOT_FOUND") {
      console.log("PASS: Deleted object is no longer available");
    } else {
      console.error("Unexpected verification error:", error);
      throw error;
    }
  }
} finally {
  if (uploaded) {
    try {
      await storage.delete({ key });
      console.log("Cleanup: Temporary object deleted");
    } catch {
      console.error("WARNING: Could not delete temporary object:", key);
    }
  }
  keyBytes.fill(0);
}
