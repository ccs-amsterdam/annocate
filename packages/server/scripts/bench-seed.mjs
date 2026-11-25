// A large existing data set, and how long the reads take on it
// (docs/hosting.md "Capacity"):
//
//   pnpm bench:seed
//
// 1. Starts the server (like bench.mjs: a fresh PGlite database, or the
//    Postgres of DATABASE_URL) and creates STUDIES studies of UNITS units
//    each through the API; in each, TEMPLATES coders code one unit.
// 2. Stops the server and copies those coders in SQL (bench/seedSql.mjs):
//    SESSIONS sessions per study, each with UNITS_PER_SESSION finished
//    units. The defaults give 50 studies, 100,000 units, 5,200 sessions and
//    a million answers (two per finished unit).
// 3. Starts the server again and times, on the first study: the
//    researcher's pages (overview, status, coders, results), the exports,
//    and a coder coming back to a session with many finished units. Each
//    twice: the first call after a start, and the next.
// Writes bench/<date>-seed-<STUDIES>-studies-<database>.json.
//
// REDERIVE=1 also makes the server derive the finished units again from the
// answers at the first request (as after a deploy that changes a loop).
// To measure coding next to the data: give PGLITE_DIR or DATABASE_URL, and
// run `pnpm bench <preset>` with the same one afterwards.
import { nextUnits, startSession, submitUnit } from "./bench/coder.mjs";
import { benchDatabase, databaseFacts, openSql } from "./bench/db.mjs";
import { coderClient, researcherClient, timedReader } from "./bench/http.mjs";
import { coderPaths, firstLoop, readPaths } from "./bench/names.mjs";
import { environment, writeResult } from "./bench/report.mjs";
import { countRows, seedStudy } from "./bench/seedSql.mjs";
import { startServer, processUsage } from "./bench/server.mjs";
import { Recorder } from "./bench/stats.mjs";
import { createStudy } from "./bench/study.mjs";

const number = (name, fallback) => Number(process.env[name] ?? fallback);
const SIZE = {
  studies: number("STUDIES", 50),
  units: number("UNITS", 2000),
  sessions: number("SESSIONS", 100),
  unitsPerSession: number("UNITS_PER_SESSION", 100),
  templates: number("TEMPLATES", 4),
  rederive: process.env.REDERIVE === "1",
};

const seconds = (since) => Number(((Date.now() - since) / 1000).toFixed(1));

/** One template coder: a session, the answer about themselves and one unit, each coder with another answer. */
async function codeOneUnit(call, study, n) {
  const pick = (values) => values[n % values.length];
  const loop = await startSession(call, study, pick);
  const [unit] = (await nextUnits(call, loop, 1)) ?? [];
  if (!unit || !(await submitUnit(call, loop, unit, pick)))
    throw new Error(`Study ${study.studyId}: a template coder couldn't code a unit`);
  return loop;
}

/** The studies, each with its template coders; the first study's first coder (to come back later). */
async function createStudies(base) {
  const recorder = new Recorder();
  const studies = [];
  let returning;
  for (let s = 0; s < SIZE.studies; s++) {
    const spec = { name: `Bench seed ${s + 1}`, mode: "all", units: SIZE.units, coders: SIZE.templates };
    const study = await createStudy(researcherClient(base, s), spec);
    for (let n = 0; n < SIZE.templates; n++) {
      const call = coderClient(base, study.coderStudyId, study.secrets[n], recorder);
      const loop = await codeOneUnit(call, study, n);
      returning ??= { call, loop, recorder };
    }
    studies.push(study);
  }
  if (recorder.errorCount() > 0) throw new Error(`Setting up: ${JSON.stringify(Object.fromEntries(recorder.errors))}`);
  return { studies, returning };
}

/** Copies the template coders in SQL, study by study (the server is stopped: PGlite takes one process). */
async function seed(database, studies) {
  const sql = await openSql(database);
  try {
    for (const study of studies) await seedStudy(sql, study.studyId, SIZE);
    await sql.query("ANALYZE");
    return await countRows(sql);
  } finally {
    await sql.close();
  }
}

/** Each of the researcher's reads on a study, twice: `{ name: { status, firstMs, secondMs, kB } }`. */
async function timeReads(base, studyId) {
  const read = timedReader(base);
  const timings = {};
  for (const [name, [method, path]] of Object.entries(readPaths)) {
    const first = await read(method, path(studyId));
    const second = await read(method, path(studyId));
    timings[name] = { status: first.status, firstMs: first.ms, secondMs: second.ms, kB: second.kB };
  }
  return timings;
}

/** A coder with many finished units comes back: their session, their home's summary, their next units (ms). */
async function timeReturningCoder({ call, loop, recorder }) {
  const session = await call("coder: session", "GET", coderPaths.session);
  await call("coder: summary", "GET", coderPaths.summary);
  await call("coder: next units", "GET", coderPaths.next(loop, 5));
  const summary = recorder.summary(0, Infinity);
  const names = ["coder: session", "coder: summary", "coder: next units"];
  const timings = names.map((name) => [name, { ms: summary[name].max, errors: summary[name].errors }]);
  return { finishedUnits: session ? firstLoop(session).finishedUnits : null, ...Object.fromEntries(timings) };
}

function printTimings(reads, coder) {
  console.log(
    `\n${"read".padEnd(22)}${"status".padStart(8)}${"first ms".padStart(10)}${"again ms".padStart(10)}${"kB".padStart(9)}`,
  );
  for (const [name, t] of Object.entries(reads)) {
    console.log(
      `${name.padEnd(22)}${String(t.status).padStart(8)}${String(t.firstMs).padStart(10)}${String(t.secondMs).padStart(10)}${String(t.kB).padStart(9)}`,
    );
  }
  for (const [name, t] of Object.entries(coder)) {
    if (name !== "finishedUnits") console.log(`${name.padEnd(22)}${"".padStart(8)}${String(t.ms).padStart(10)}`);
  }
  console.log(`(the coder had ${coder.finishedUnits} finished units)`);
}

async function main() {
  const database = benchDatabase();
  console.log(`seed: ${JSON.stringify(SIZE)}\n  database: ${database.kind}`);
  const result = { ...environment(), size: SIZE };
  try {
    let started = Date.now();
    let server = await startServer(database);
    const { studies, returning } = await createStudies(server.base).finally(() => server.stop());
    result.createSeconds = seconds(started);
    console.log(`studies and units through the API: ${result.createSeconds} s`);

    started = Date.now();
    result.rows = await seed(database, studies);
    result.seedSeconds = seconds(started);
    console.log(`copied in SQL in ${result.seedSeconds} s: ${JSON.stringify(result.rows)}`);

    // On the same port: the returning coder's client keeps its address and cookie
    server = await startServer(database, server.port);
    try {
      returning.recorder.requests.clear();
      result.coder = await timeReturningCoder(returning);
      result.reads = await timeReads(server.base, studies[0].studyId);
      result.serverMemoryMB = processUsage(server.pid)?.rssMB ?? null;
      result.database = await databaseFacts(database);
    } finally {
      await server.stop();
    }
  } finally {
    database.remove();
  }
  printTimings(result.reads, result.coder);
  console.log(`server memory after the reads: ${result.serverMemoryMB} MB; database: ${result.database.sizeMB} MB`);
  console.log(`\n${writeResult(`seed-${SIZE.studies}-studies`, database.kind, result)}`);
  const failed = Object.values(result.reads).some((t) => t.status >= 400);
  return !failed;
}

process.exit((await main()) ? 0 : 1);
