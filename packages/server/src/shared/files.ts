import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

// Files the server keeps (docs/plans/exports-and-files.md): exports now,
// multimedia later. Behind this interface so S3 can replace the disk; the
// API hands out download links, never the file itself.

/** Where files go. Keys are paths like `exports/12/abc.zip`. */
export interface FileStore {
  /** Writes a file from chunks, replacing one under the same key (only complete files become visible). */
  put(key: string, chunks: AsyncIterable<Uint8Array>): Promise<{ size: number }>;
  /** The file's size, or null if there is none. */
  size(key: string): Promise<number | null>;
  read(key: string): Readable;
  /** The keys under a prefix (`exports/12/`). */
  list(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
  /** Removes every file under a prefix (`exports/12/`). */
  removeAll(prefix: string): Promise<void>;
}

/** Files on this server's disk, under `root`. */
export class DiskFileStore implements FileStore {
  readonly root: string;

  constructor(root = join(tmpdir(), "annotinder-files")) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Not a file key: ${key}`);
    return path;
  }

  async put(key: string, chunks: AsyncIterable<Uint8Array>): Promise<{ size: number }> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    // Written next to it, then renamed: a reader never sees half a file
    const partial = `${path}.${process.pid}.${Date.now()}.partial`;
    const out = createWriteStream(partial);
    let size = 0;
    try {
      for await (const chunk of chunks) {
        size += chunk.length;
        if (!out.write(chunk)) await once(out, "drain");
      }
      out.end();
      await once(out, "finish");
      await rename(partial, path);
    } catch (e) {
      out.destroy();
      await rm(partial, { force: true });
      throw e;
    }
    return { size };
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }

  read(key: string): Readable {
    return createReadStream(this.path(key));
  }

  async list(prefix: string): Promise<string[]> {
    const folder = prefix.replace(/\/+$/, "");
    try {
      return (await readdir(this.path(folder)))
        .filter((name) => !name.endsWith(".partial"))
        .map((name) => `${folder}/${name}`);
    } catch {
      return [];
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async removeAll(prefix: string): Promise<void> {
    await rm(this.path(prefix.replace(/\/+$/, "")), { force: true, recursive: true });
  }
}

/** How long a download link works. */
export const LINK_SECONDS = 60 * 60;

const sign = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(`file.${payload}`).digest("base64url");

/** A download token for a file: its key, the name to save it as, and when it expires, signed. */
export function fileToken(secret: string, key: string, filename: string, expires: number): string {
  const payload = Buffer.from(JSON.stringify({ key, filename, expires })).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

/** The file a token names, if it is genuine and not expired. */
export function readFileToken(
  secret: string,
  token: string,
  now = Date.now(),
): { key: string; filename: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { key, filename, expires } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      key: string;
      filename: string;
      expires: number;
    };
    return expires > now ? { key, filename } : null;
  } catch {
    return null;
  }
}
