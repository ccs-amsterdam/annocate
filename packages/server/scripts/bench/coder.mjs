// One simulated coder: starts a session, answers the question about
// themselves, then fetches batches of units and submits them one by one,
// thinking in between, until the run ends or their units run out.
import { batchUnits, coderAnswersBody, coderPaths, firstLoop, unitAnswersBody } from "./names.mjs";
import { checkSessionMode } from "./study.mjs";
import { sleep } from "./stats.mjs";

/** Starts the session and answers the coder-level question; the loop's key, or null after an error. */
export async function startSession(call, study, pick) {
  const session = await call("session", "GET", coderPaths.session);
  if (!session) return null;
  const loop = firstLoop(session);
  checkSessionMode(study, loop.totalUnits);
  await call("coder answers", "POST", coderPaths.coderAnswers, coderAnswersBody(pick));
  return loop.key;
}

/** The coder's next units in the loop (empty: none left), or null after an error. */
export async function nextUnits(call, loop, count) {
  const batch = await call("next", "GET", coderPaths.next(loop, count));
  return batch ? batchUnits(batch) : null;
}

/** Submits a unit's answers; whether it was saved. */
export async function submitUnit(call, loop, unit, pick) {
  return (await call("submit", "POST", coderPaths.unitAnswers, unitAnswersBody(unit, loop, pick))) !== null;
}

/**
 * Runs a coder until `run.until` (ms, `Date.now()`). `run`: `thinkMs` (per
 * unit, +-50%), `batch` (units per fetch), `arriveWithinMs` (coders don't
 * all start at once), `random` (seeded). Returns the units submitted and
 * whether the coder ran out of units.
 */
export async function simulateCoder(call, study, run) {
  const { random } = run;
  const pick = (values) => values[Math.floor(random() * values.length)];
  await sleep(random() * run.arriveWithinMs);
  const loop = await startSession(call, study, pick);
  const result = { submitted: 0, ranOut: false, started: loop !== null };
  while (loop !== null && Date.now() < run.until) {
    const units = await nextUnits(call, loop, run.batch);
    if (!units) break;
    result.ranOut = units.length === 0;
    if (result.ranOut) break;
    for (const unit of units) {
      await sleep(run.thinkMs * (0.5 + random()));
      if (Date.now() >= run.until) break;
      if (await submitUnit(call, loop, unit, pick)) result.submitted++;
    }
  }
  return result;
}
