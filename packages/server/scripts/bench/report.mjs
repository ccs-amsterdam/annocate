// What a result says about where it was measured, and writing it to
// bench/<date>-<name>-<database>.json at the repository's root.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, loadavg, totalmem } from "node:os";
import { fileURLToPath, URL } from "node:url";
import { join } from "node:path";

const REPO_DIR = fileURLToPath(new URL("../../../../", import.meta.url));

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: REPO_DIR, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** The commit measured (and whether the working copy had changes), the machine and Node. */
export function environment() {
  return {
    date: new Date().toISOString(),
    commit: git("rev-parse", "--short", "HEAD"),
    uncommittedChanges: git("status", "--porcelain") !== "",
    node: process.version,
    machine: {
      cores: cpus().length,
      cpu: cpus()[0]?.model ?? "",
      memoryGB: Math.round(totalmem() / 1024 ** 3),
      platform: `${process.platform} ${process.arch}`,
      // The load over the last minute, when the result was written: above the run's own
      // (a core or two) means other work shared the machine, and the latencies are too high
      loadAverage: Number(loadavg()[0].toFixed(1)),
    },
    // The simulated coders ran on the same machine as the server (and its database)
    loadGenerator: "same machine",
  };
}

/** Writes the result; the file's path. `BENCH_DIR` overrides the folder. */
export function writeResult(name, databaseKind, result) {
  const dir = process.env.BENCH_DIR ?? join(REPO_DIR, "bench");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${result.date.slice(0, 10)}-${name}-${databaseKind}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  return file;
}
