// The benchmark's presets: a scenario (run.mjs) and what it must stay under
// to pass. `groups`: studies per mode (names.mjs `MODES`: a crowd's shared
// queue, a crowd coding all units, experts with their own units).
//
// PGlite is one connection in WebAssembly: `smoke` and `pilot` run on it to
// check that things work, but capacity is only read from a run on Postgres
// (`DATABASE_URL`).

const group = (mode, studies, units, coders) => ({ mode, studies, units, coders });

/** The launch criteria (docs/hosting.md "Capacity"): latencies in ms. */
const LAUNCH = { errors: 0, submitP95: 100, nextP95: 250, probeMax: 250 };
/** Only that it works: for PGlite, and for runs meant to find where the server saturates. */
const WORKS = { errors: 0 };

export const PRESETS = {
  smoke: {
    about: "does it run (CI): 20 coders, a shared queue and own units",
    groups: [group("shared", 1, 1000, 10), group("all", 1, 200, 5), group("experts", 1, 1000, 5)],
    thinkMs: 500,
    durationS: 20,
    thresholds: { errors: 0, submitP95: 1000, nextP95: 2000 },
  },
  pilot: {
    about: "the lab pilot: 5 studies, 50 coders at once, coding five times faster than people do",
    groups: [group("shared", 2, 2000, 24), group("experts", 2, 2000, 16), group("all", 1, 500, 10)],
    thinkMs: 2000,
    durationS: 90,
    thresholds: { errors: 0, submitP95: 250, nextP95: 500, probeMax: 500 },
  },
  public: {
    about: "the launch workload: 500 coders at once at 10 s per unit, shared queues and own units",
    groups: [group("shared", 2, 10000, 350), group("experts", 1, 10000, 100), group("all", 1, 2000, 50)],
    thinkMs: 10_000,
    durationS: 300,
    thresholds: LAUNCH,
  },
  stress: {
    about: "where it saturates: the launch workload at 1 s per unit",
    groups: [group("shared", 2, 10000, 350), group("experts", 1, 20000, 100), group("all", 1, 2000, 50)],
    thinkMs: 1000,
    durationS: 120,
    thresholds: WORKS,
  },
  "large-queue": {
    about: "one shared queue of 50,000 units: what picking from a long queue costs",
    groups: [group("shared", 1, 50000, 300)],
    thinkMs: 2000,
    durationS: 180,
    thresholds: WORKS,
  },
  "many-studies": {
    about: "50 studies live at once (50 deployments in memory), 500 coders over them",
    groups: [group("shared", 30, 2000, 300), group("experts", 15, 2000, 150), group("all", 5, 500, 50)],
    thinkMs: 10_000,
    durationS: 300,
    thresholds: LAUNCH,
  },
};

const numberFrom = (env, name, fallback) => (env[name] === undefined ? fallback : Number(env[name]));

/** A preset's scenario, with what the environment overrides: SEED, DURATION (s), THINK_MS, BATCH. */
export function presetScenario(name, env = process.env) {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Unknown preset "${name}": one of ${Object.keys(PRESETS).join(", ")}`);
  return {
    preset: name,
    about: preset.about,
    groups: preset.groups,
    thinkMs: numberFrom(env, "THINK_MS", preset.thinkMs),
    durationS: numberFrom(env, "DURATION", preset.durationS),
    batch: numberFrom(env, "BATCH", 5),
    seed: numberFrom(env, "SEED", 1),
  };
}

/** What each threshold is measured by: its value in a result's endpoints. */
const MEASURES = {
  errors: (result) => result.errorCount,
  submitP95: (result) => result.endpoints.submit?.p95,
  nextP95: (result) => result.endpoints.next?.p95,
  probeMax: (result) => result.endpoints["health probe"]?.max,
};

/** Per threshold of the preset: `{ name, limit, value, pass }`. A value that wasn't measured fails. */
export function checkThresholds(name, result) {
  return Object.entries(PRESETS[name].thresholds).map(([threshold, limit]) => {
    const value = MEASURES[threshold](result);
    return { name: threshold, limit, value: value ?? null, pass: value !== undefined && value <= limit };
  });
}
