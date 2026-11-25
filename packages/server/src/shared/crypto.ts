import { createHash, randomBytes } from "node:crypto";

/** A text's SHA-256, in hex: how keys and secrets are stored and looked up. */
export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");

/** A random key nobody can guess (256 bits), in characters that are safe in a URL, a cookie and a header. */
export const randomToken = (): string => randomBytes(32).toString("base64url");
