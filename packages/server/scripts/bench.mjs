// The benchmark (docs/hosting.md "Capacity"):
//
//   pnpm bench <preset>            from the repository's root
//   pnpm --filter @annotinder/server bench <preset>
//
// Starts the server (development auth, no rate limits, a free port on
// localhost) on a fresh PGlite database, or on the Postgres of
// DATABASE_URL (give it a database of its own: the studies stay in it).
// Creates the preset's studies, lets its simulated coders fetch and submit
// units, and stops the server. Prints, per kind of request, the latencies
// (p50 / p95 / p99 / max) and requests per second, the errors, and the
// server's memory and processor time; writes all of it to
// bench/<date>-<preset>-<database>.json; exits with 1 when the preset's
// thresholds aren't met.
//
// Presets: bench/presets.mjs (`pnpm bench` without one lists them).
// SEED, DURATION (seconds), THINK_MS and BATCH override the preset.
// PGlite is one connection in WebAssembly: never quote capacity from it.
import { benchDatabase, databaseFacts } from "./bench/db.mjs";
import { PRESETS, checkThresholds, presetScenario } from "./bench/presets.mjs";
import { environment, writeResult } from "./bench/report.mjs";
import { runCoders, setUpStudies } from "./bench/run.mjs";
import { startServer, watchUsage } from "./bench/server.mjs";
import { formatSummary } from "./bench/stats.mjs";

function listPresets() {
  console.log("Usage: pnpm bench <preset>\n");
  for (const [name, preset] of Object.entries(PRESETS)) console.log(`  ${name.padEnd(14)}${preset.about}`);
}

/** The scenario in a line per group. */
function describeScenario(scenario) {
  const groups = scenario.groups.map((g) => `  ${g.mode}: ${g.studies} x ${g.units} units, ${g.coders} coders`);
  return [`${scenario.preset}: ${scenario.about}`, ...groups].join("\n");
}

/** Setup, then the coders while the server's memory and processor time are watched. */
async function measure(server, scenario) {
  const { studies, setup } = await setUpStudies(server.base, scenario, console.log);
  const usage = watchUsage(server.pid);
  const measured = await runCoders(server.base, scenario, studies);
  return { setup, ...measured, server: usage.stop() };
}

function printResult(result) {
  const { run, server } = result;
  console.log(
    `\n${run.coders} coders (${run.codersOutOfUnits} ran out of units), ${run.seconds} s, ` +
      `think ~${result.scenario.thinkMs} ms: ${run.unitsSubmitted} units submitted`,
  );
  console.log(formatSummary(result.endpoints));
  for (const [kind, count] of Object.entries(result.errors)) console.log(`error x${count}: ${kind}`);
  if (server) {
    console.log(
      `server: memory ${server.rssStartMB} MB at the start, ${server.rssMaxMB} MB at most; ` +
        `${server.cpuSeconds} s of processor time (${server.cpuShareOfOneCore} of one core)`,
    );
  }
  console.log(`database: ${result.database.kind}, ${result.database.sizeMB} MB`);
  for (const t of result.thresholds) {
    console.log(`${t.pass ? "pass" : "FAIL"}  ${t.name}: ${t.value} (at most ${t.limit})`);
  }
}

async function main(name) {
  const scenario = presetScenario(name);
  const database = benchDatabase();
  console.log(`${describeScenario(scenario)}\n  database: ${database.kind}`);
  const server = await startServer(database);
  let result;
  try {
    const measured = await measure(server, scenario);
    const crash = server.stopped();
    if (crash !== null) console.error(`\nThe server stopped during the run:\n${crash}`);
    const thresholds = checkThresholds(name, measured);
    result = {
      ...environment(),
      scenario,
      ...measured,
      database: await databaseFacts(database),
      thresholds,
      serverStopped: crash !== null,
      pass: crash === null && thresholds.every((t) => t.pass),
    };
  } finally {
    await server.stop();
    database.remove();
  }
  printResult(result);
  console.log(`\n${result.pass ? "PASS" : "FAIL"}: ${writeResult(name, database.kind, result)}`);
  return result.pass;
}

const preset = process.argv[2];
if (!preset) {
  listPresets();
  process.exit(1);
}
process.exit((await main(preset)) ? 0 : 1);
