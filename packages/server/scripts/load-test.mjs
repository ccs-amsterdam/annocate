// Load test against a server that is already running (docs/hosting.md
// "Capacity"): STUDIES studies with UNITS units each, CODERS simulated
// coders spread over them. Each coder starts a session, answers a question
// about themselves, then fetches batches of BATCH units and submits them,
// with THINK_MS (+-50%) per unit, for DURATION seconds. Prints the mode it
// measured, the latencies and requests per second per kind of request, and
// the errors.
//
// MODE: how the units reach the coders.
//   shared   a crowd shares the units (a shared queue on the loop: two coders per unit)
//   all      a crowd, every coder codes all units
//   experts  every coder has their own units (a link each)
// The script fails if the server stores or runs another mode than asked.
//
// Against a server with development auth (never a reachable one), e.g.
//   DATABASE_URL=postgres://... AUTH_DEV_MODE=1 HOST=localhost ANNOTINDER_RATE_LIMITS=off PORT=8797 pnpm --filter @annotinder/server exec tsx src/index.ts
//   BASE=http://localhost:8797 MODE=shared CODERS=300 THINK_MS=10000 node packages/server/scripts/load-test.mjs
// `pnpm bench <preset>` (bench.mjs) starts the server itself and runs fixed scenarios.
import { MODES } from "./bench/names.mjs";
import { runScenario } from "./bench/run.mjs";
import { formatSummary } from "./bench/stats.mjs";

const number = (name, fallback) => Number(process.env[name] ?? fallback);

const BASE = process.env.BASE ?? "http://localhost:8797";
const MODE = process.env.MODE ?? "shared";
if (!MODES.includes(MODE)) throw new Error(`MODE must be one of ${MODES.join(", ")}, not "${MODE}"`);

const scenario = {
  groups: [{ mode: MODE, studies: number("STUDIES", 1), units: number("UNITS", 10000), coders: number("CODERS", 300) }],
  thinkMs: number("THINK_MS", 1000),
  durationS: number("DURATION", 120),
  batch: number("BATCH", 5),
  seed: number("SEED", 1),
};

const result = await runScenario(BASE, scenario);
const { run } = result;
console.log(
  `\nmode ${MODE}: ${run.coders} coders (${run.codersOutOfUnits} ran out of units), batch ${scenario.batch}, ` +
    `think ~${scenario.thinkMs} ms, ${run.seconds} s: ${run.unitsSubmitted} units submitted`,
);
console.log(formatSummary(result.endpoints));
for (const [kind, count] of Object.entries(result.errors)) console.log(`error x${count}: ${kind}`);
process.exit(result.errorCount === 0 ? 0 : 1);
