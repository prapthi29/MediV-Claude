import { AppError } from "../utils/app-error.js";

export class SupabaseMedicalStorage {
  constructor({ url, bucket, serviceRoleKey }) {
    if (!url || !bucket || !serviceRoleKey) {
      throw new Error(
        "Supabase storage requires a URL, bucket name, and service-role key.",
      );
    }

    this.url = url.replace(/\/$/, "");
    this.bucket = bucket;
    this.serviceRoleKey = serviceRoleKey;
  }

  async put({ key, body, contentType }) {
    const response = await fetch(this.objectUrl(key), {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": contentType || "application/octet-stream",
        "x-upsert": "false",
      },
      body,
    });

    await this.ensureSuccess(response, "upload");
  }

  async get({ key }) {
    const response = await fetch(this.objectUrl(key), {
      method: "GET",
      headers: this.headers(),
    });

    if (response.status === 404 || response.status === 400) {
      const details = await response.clone().text();

      if (
        response.status === 404 ||
        /object not found|not found/i.test(details)
      ) {
        throw new AppError(
          404,
          "Medical file was not found in storage.",
          "FILE_NOT_FOUND",
        );
      }
    }

    await this.ensureSuccess(response, "download");

    return {
      body: Buffer.from(await response.arrayBuffer()),
    };
  }

  async delete({ key }) {
    const response = await fetch(this.objectUrl(key), {
      method: "DELETE",
      headers: this.headers(),
    });

    if (response.status === 404) {
      throw new AppError(
        404,
        "Medical file was not found in storage.",
        "FILE_NOT_FOUND",
      );
    }

    await this.ensureSuccess(response, "delete");
  }

  headers() {
    return {
      Authorization: `Bearer ${this.serviceRoleKey}`,
      apikey: this.serviceRoleKey,
    };
  }

  objectUrl(key) {
    const encodedKey = key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    return `${this.url}/storage/v1/object/${encodeURIComponent(
      this.bucket,
    )}/${encodedKey}`;
  }

  async ensureSuccess(response, action) {
    if (response.ok) {
      return;
    }

    throw new AppError(
      502,
      `Unable to ${action} the medical file.`,
      "STORAGE_UNAVAILABLE",
    );
  }
}
