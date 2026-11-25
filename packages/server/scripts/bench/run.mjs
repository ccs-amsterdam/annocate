// Runs a scenario against a server: sets up its studies, lets the coders
// code for the scenario's duration, and returns the numbers.
//
// A scenario: `groups` (each `{ mode, studies, units, coders }`: that many
// studies of `units` units each, with `coders` coders spread over them),
// `thinkMs` per unit, `durationS`, `batch` (units per fetch) and `seed`.
import { coderClient, researcherClient } from "./http.mjs";
import { paths } from "./names.mjs";
import { simulateCoder } from "./coder.mjs";
import { createStudy } from "./study.mjs";
import { Recorder, seededRandom, sleep } from "./stats.mjs";

const PROBE_MS = 100;
const sum = (list) => list.reduce((a, b) => a + b, 0);

/** The studies of a group: its coders dealt over them. */
function groupStudies(group, label) {
  return Array.from({ length: group.studies }, (_, s) => ({
    name: `Bench ${label} ${group.mode} ${s + 1}`,
    mode: group.mode,
    units: group.units,
    coders: Math.floor(group.coders / group.studies) + (s < group.coders % group.studies ? 1 : 0),
  })).filter((study) => study.coders > 0);
}

/** Creates every study of the scenario, one after the other: `{ studies, setup }`. */
export async function setUpStudies(base, scenario, log) {
  const label = new Date().toISOString();
  const start = Date.now();
  const studies = [];
  for (const spec of scenario.groups.flatMap((group) => groupStudies(group, label))) {
    studies.push(await createStudy(researcherClient(base, studies.length), spec));
  }
  const seconds = (Date.now() - start) / 1000;
  const units = sum(studies.map((s) => s.units));
  log(`setup: ${studies.length} studies, ${units} units in ${seconds.toFixed(1)} s`);
  return { studies, setup: { seconds, studies: studies.length, units, unitsPerSecond: Math.round(units / seconds) } };
}

/**
 * Calls `GET /api/health` every 100 ms while the coders work: the server
 * does nothing for it, so a slow answer means its event loop was busy.
 */
function startProbe(base, recorder) {
  let running = true;
  const loop = (async () => {
    while (running) {
      const start = performance.now();
      const ok = await fetch(`${base}/api${paths.health}`).then(
        (res) => res.text().then(() => res.ok),
        () => false,
      );
      recorder.record("health probe", performance.now() - start);
      if (!ok) recorder.recordError("health probe", "no answer");
      await sleep(PROBE_MS);
    }
  })();
  return async () => {
    running = false;
    await loop;
  };
}

/** Every coder of every study, each with their own client and their own random numbers (from the seed and their number). */
function startCoders(base, studies, recorder, run) {
  let n = 0;
  return studies.flatMap((study) =>
    study.secrets.map((secret) => {
      const random = seededRandom(run.seed * 100_003 + n++);
      return simulateCoder(coderClient(base, study.coderStudyId, secret, recorder), study, { ...run, random });
    }),
  );
}

/**
 * Coders don't all start at once: they arrive over 10 s, or with many
 * coders at ten a second (500 coders: 50 s), within the run's first quarter.
 */
function arrivalMs(scenario, studies) {
  const coders = sum(studies.map((study) => study.coders));
  return Math.min((scenario.durationS * 1000) / 4, Math.max(10_000, coders * 100));
}

/** Lets the coders of `studies` code for the scenario's duration: `{ run, endpoints, errors, errorCount }`. */
export async function runCoders(base, scenario, studies) {
  const recorder = new Recorder();
  const arriveWithinMs = arrivalMs(scenario, studies);
  const start = performance.now();
  const run = {
    thinkMs: scenario.thinkMs,
    batch: scenario.batch,
    arriveWithinMs,
    until: Date.now() + scenario.durationS * 1000,
    seed: scenario.seed,
  };
  const stopProbe = startProbe(base, recorder);
  const coders = await Promise.all(startCoders(base, studies, recorder, run)).finally(stopProbe);
  const end = performance.now();
  const seconds = (end - start) / 1000;
  const submitted = sum(coders.map((c) => c.submitted));
  return {
    run: {
      seconds: Number(seconds.toFixed(1)),
      arrivalSeconds: arriveWithinMs / 1000,
      coders: coders.length,
      codersStarted: coders.filter((c) => c.started).length,
      codersOutOfUnits: coders.filter((c) => c.ranOut).length,
      unitsSubmitted: submitted,
    },
    endpoints: recorder.summary(start + arriveWithinMs, end),
    errors: Object.fromEntries(recorder.errors),
    errorCount: recorder.errorCount(),
  };
}

/** Sets up and runs a scenario: `{ scenario, setup, run, endpoints, errors, errorCount }`. */
export async function runScenario(base, scenario, log = console.log) {
  const { studies, setup } = await setUpStudies(base, scenario, log);
  return { scenario, setup, ...(await runCoders(base, scenario, studies)) };
}
