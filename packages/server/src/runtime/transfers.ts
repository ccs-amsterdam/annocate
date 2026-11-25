import { type TransferResponse } from "@annotinder/contracts";
import { HttpError } from "../shared/http.js";
import type { DeviceDetails } from "../shared/devices.js";
import type { Coder } from "./types.js";
import { type Deployed } from "./deployed.js";
import { sha256 } from "./session.js";

// "Continue on another device" links (docs/coder-identity.md §4).

/** A one-time token that lets another device continue this coder's session (docs/coder-identity.md §4). */
export async function createTransfer(d: Deployed, coder: Coder): Promise<TransferResponse> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const expires = new Date(d.options.now() + d.options.transferTtlMs);
  await d.store.createTransfer(await sha256(token), {
    sessionId: coder.sessionId,
    coder: coder.session.coder ?? null,
    expires,
  });
  return { token, expiresAt: expires };
}

/**
 * Redeems a transfer token (once): the new device joins the session, with
 * its keys for it (`keys`, from the session's coder id: coder.ts).
 */
export async function redeemTransfer(
  d: Deployed,
  token: string,
  keys: (coderId: string | null) => Promise<string[]>,
  device: DeviceDetails,
): Promise<void> {
  const transfer = await d.store.redeemTransfer(await sha256(token), new Date(d.options.now()));
  if (!transfer) throw new HttpError(404, "This link has expired or was already used", "transfer_invalid");
  for (const key of await keys(transfer.coder)) await d.store.addDevice(transfer.sessionId, key, device);
}
