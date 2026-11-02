import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE, type ClientVersion } from "@annotinder/contracts";

/**
 * The build's commit: `ANNOTINDER_COMMIT` (the Docker image sets it from a
 * build argument, docs/hosting.md), else the git checkout it runs from (in
 * development), else "unknown".
 */
function commit(): string {
  const fromEnv = process.env.ANNOTINDER_COMMIT?.trim();
  if (fromEnv) return fromEnv.slice(0, 64);
  try {
    const cwd = dirname(fileURLToPath(import.meta.url));
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * The release and commit this server (and the client it serves) is: recorded
 * with each deployment, so a study says what coders' screens were
 * (docs/plans/design-viewer.md §1).
 */
export const CLIENT_VERSION: ClientVersion = { release: RELEASE, commit: commit() };
