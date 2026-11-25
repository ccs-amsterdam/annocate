// The two clients of the benchmark: a researcher (setting up studies) and a
// coder (one simulated browser, with its session cookie).
import { researcherHeaders, coderHeaders, errorCode, paths } from "./names.mjs";

/**
 * `api(method, path, body)` as a researcher: the parsed answer, or an error
 * with the status and the body. `study`: the number of the study the
 * client is for (names.mjs `researcherHeaders`).
 */
export function researcherClient(base, study = 0) {
  const headers = researcherHeaders(study);
  return async function api(method, path, body) {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 500)}`);
    return parseBody(res, text);
  };
}

/** JSON when the answer is JSON; a download (an export) only counts its size. */
function parseBody(res, text) {
  if (!text) return null;
  return res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : { bytes: text.length };
}

/** `read(method, path)` as a researcher, timed: `{ status, ms, kB }`. A status that isn't ok is returned, not thrown. */
export function timedReader(base) {
  return async function read(method, path) {
    const start = performance.now();
    const res = await fetch(`${base}/api${path}`, { method, headers: researcherHeaders() });
    const bytes = (await res.arrayBuffer()).byteLength;
    return { status: res.status, ms: Math.round(performance.now() - start), kB: Math.round(bytes / 1024) };
  };
}

/**
 * `call(name, method, path, body)` as one coder of a study: the parsed
 * answer, or null after an error. Every call is recorded under `name`.
 */
export function coderClient(base, coderStudyId, secret, recorder) {
  let cookie = "";
  const url = `${base}/api${paths.coderBase(coderStudyId)}`;
  async function send(name, method, path, body) {
    const res = await fetch(url + path, {
      method,
      headers: coderHeaders(secret, cookie),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : {};
    recorder.recordError(name, `${res.status} ${errorCode(text) || text.slice(0, 80)}`);
    return null;
  }
  return function call(name, method, path, body) {
    return recorder.time(name, () =>
      send(name, method, path, body).catch((error) => {
        recorder.recordError(name, `no answer (${error.cause?.code ?? error.message})`);
        return null;
      }),
    );
  };
}
