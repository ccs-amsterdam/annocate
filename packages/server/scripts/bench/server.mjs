// Starts the server for a benchmark (development auth, no rate limits, a
// free port on localhost), and reads its memory and processor use.
import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { clearInterval, setInterval } from "node:timers";
import { fileURLToPath, URL } from "node:url";
import { paths } from "./names.mjs";
import { sleep } from "./stats.mjs";

const SERVER_DIR = fileURLToPath(new URL("../../", import.meta.url));
const START_TIMEOUT_MS = 120_000;

/** A port nothing listens on. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "localhost", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Waits until the server answers its health check; fails if it stopped or takes too long. */
async function waitForHealth(base, child, output) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The server stopped while starting:\n${output.join("")}`);
    const ok = await fetch(`${base}/api${paths.health}`).then(
      (res) => res.ok,
      () => false,
    );
    if (ok) return;
    await sleep(200);
  }
  throw new Error(`The server didn't answer within ${START_TIMEOUT_MS / 1000} s:\n${output.join("")}`);
}

/**
 * Starts the server on the database of `database` (`{ url }`: Postgres;
 * `{ pgliteDir }`: PGlite in that directory), on `port` or a free one.
 * Returns `{ base, port, pid, stopped, stop }`.
 */
export async function startServer(database, port) {
  port ??= await freePort();
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "localhost",
    AUTH_DEV_MODE: "1",
    ANNOTINDER_RATE_LIMITS: "off",
    ANNOTINDER_DEMO: "",
    ...(database.url ? { DATABASE_URL: database.url } : { DATABASE_URL: "", PGLITE_DIR: database.pgliteDir }),
  };
  // One process (no `tsx` wrapper), so its pid is the server's
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: SERVER_DIR, env });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  const base = `http://localhost:${port}`;
  await waitForHealth(base, child, output);
  return { base, port, pid: child.pid, stopped: () => stoppedOutput(child, output), stop: () => stopServer(child) };
}

/** If the server stopped by itself (a crash): the end of what it printed; else null. */
function stoppedOutput(child, output) {
  if (child.exitCode === null && child.signalCode === null) return null;
  return `${output.join("").slice(-4000)}\n(exit code ${child.exitCode}, signal ${child.signalCode})`;
}

/** Stops the server and waits until it is gone (PGlite must close before its directory is read). */
function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
  });
}

/** A process's memory (resident, MB) and processor time so far (seconds); null where it can't be read. */
export function processUsage(pid) {
  try {
    return linuxUsage(pid);
  } catch {
    return psUsage(pid);
  }
}

function linuxUsage(pid) {
  const status = readFileSync(`/proc/${pid}/status`, "utf8");
  const rssKb = Number(/VmRSS:\s+(\d+)/.exec(status)[1]);
  // /proc/<pid>/stat: after the command name in brackets, fields 14 and 15 are user and system time in ticks (100 per second)
  const fields = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ").pop().split(" ");
  const ticks = Number(fields[11]) + Number(fields[12]);
  return { rssMB: Math.round(rssKb / 1024), cpuSeconds: ticks / 100 };
}

function psUsage(pid) {
  try {
    const [rssKb, time] = execFileSync("ps", ["-o", "rss=,time=", "-p", String(pid)], { encoding: "utf8" })
      .trim()
      .split(/\s+/);
    const seconds = time
      .split(/[-:]/)
      .map(Number)
      .reduce((total, part) => total * 60 + part, 0);
    return { rssMB: Math.round(Number(rssKb) / 1024), cpuSeconds: seconds };
  } catch {
    return null;
  }
}

/**
 * Samples the server's memory every second. `stop()` returns its memory at
 * the start, the highest seen and at the end (MB), and the processor time
 * it used in between (seconds, and as a share of one core).
 */
export function watchUsage(pid) {
  const first = processUsage(pid);
  if (!first) return { stop: () => null };
  const startedAt = Date.now();
  let highest = first.rssMB;
  const timer = setInterval(() => {
    highest = Math.max(highest, processUsage(pid)?.rssMB ?? 0);
  }, 1000);
  return {
    stop() {
      clearInterval(timer);
      const last = processUsage(pid) ?? first;
      const cpuSeconds = Number((last.cpuSeconds - first.cpuSeconds).toFixed(2));
      const seconds = (Date.now() - startedAt) / 1000;
      return {
        rssStartMB: first.rssMB,
        rssMaxMB: Math.max(highest, last.rssMB),
        rssEndMB: last.rssMB,
        cpuSeconds,
        cpuShareOfOneCore: Number((cpuSeconds / seconds).toFixed(2)),
      };
    },
  };
}
