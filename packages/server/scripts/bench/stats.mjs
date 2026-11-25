// Latencies, throughput and errors per kind of request.

/** A random number generator from a seed (mulberry32): the same seed gives the same think times and answers. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const round = (x, digits = 1) => Number(x.toFixed(digits));

/** The p-th percentile of a sorted list. */
function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
}

/** Collects every request's latency, and the errors by kind. */
export class Recorder {
  constructor() {
    this.requests = new Map(); // name -> [{ ms, at }]
    this.errors = new Map(); // "name status code" -> count
    this.failed = new Map(); // name -> count
  }

  /** A finished request: how long it took, and when it ended (ms, `performance.now()`). */
  record(name, ms, at = performance.now()) {
    if (!this.requests.has(name)) this.requests.set(name, []);
    this.requests.get(name).push({ ms, at });
  }

  /** A request that failed: a status that isn't ok, or no answer at all. */
  recordError(name, kind) {
    const key = `${name}: ${kind}`;
    this.errors.set(key, (this.errors.get(key) ?? 0) + 1);
    this.failed.set(name, (this.failed.get(name) ?? 0) + 1);
  }

  /** Times `fn` as a request called `name`. */
  async time(name, fn) {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.record(name, performance.now() - start);
    }
  }

  errorCount() {
    return [...this.errors.values()].reduce((a, b) => a + b, 0);
  }

  /**
   * Per kind of request: how many, the errors, the latency percentiles (ms)
   * and the requests per second in the steady window (`from` to `to`, ms:
   * after the coders arrived, until the run ended).
   */
  summary(from, to) {
    const result = {};
    for (const [name, list] of this.requests) {
      const sorted = list.map((r) => r.ms).sort((a, b) => a - b);
      const steady = list.filter((r) => r.at >= from && r.at <= to).length;
      result[name] = {
        n: sorted.length,
        errors: this.failed.get(name) ?? 0,
        p50: round(percentile(sorted, 50)),
        p95: round(percentile(sorted, 95)),
        p99: round(percentile(sorted, 99)),
        max: round(sorted[sorted.length - 1]),
        perSecond: round(steady / ((to - from) / 1000), 2),
      };
    }
    return result;
  }
}

/** The summary as a table for the terminal. */
export function formatSummary(summary) {
  const cell = (x) => String(x).padStart(9);
  const header = `${"request".padEnd(16)}${["n", "errors", "p50 ms", "p95 ms", "p99 ms", "max ms", "per s"].map(cell).join("")}`;
  const lines = Object.entries(summary).map(
    ([name, s]) => `${name.padEnd(16)}${[s.n, s.errors, s.p50, s.p95, s.p99, s.max, s.perSecond].map(cell).join("")}`,
  );
  return [header, ...lines].join("\n");
}
