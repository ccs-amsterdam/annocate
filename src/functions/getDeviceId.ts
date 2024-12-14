import crypto from "crypto";
import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

/**
 * Generates a device ID based on the provided cookies and job ID.
 *
 * @param {ReadonlyRequestCookies} cookieStore - The cookie store containing the device ID.
 * @param {number} jobId - The job ID used to hash the device ID, so users are not identified across jobs.
 * @returns {string} - The hashed device ID or a new device ID if not found in the cookie store.
 */
export function getDeviceId(cookieStore: ReadonlyRequestCookies, jobId: number): string {
  const deviceId = cookieStore.get("secretId");
  if (deviceId) {
    cookieStore.set("secretId", deviceId.value, { maxAge: 60 * 60 * 24 * 365 * 10, httpOnly: true });
    return hashId(deviceId.value, jobId);
  }

  const newDeviceId = crypto.randomBytes(32).toString("base64");
  cookieStore.set("secretId", newDeviceId, { maxAge: 60 * 60 * 24 * 365 * 10, httpOnly: true });
  return hashId(newDeviceId, jobId);
}

function hashId(deviceId: string, jobId: number) {
  return crypto
    .createHash("sha256")
    .update(deviceId + jobId)
    .digest("base64");
}
