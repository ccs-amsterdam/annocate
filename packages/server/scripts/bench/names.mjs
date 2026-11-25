// Everything the benchmark knows about the API's names: paths, headers, the
// design JSON and the fields it reads from responses. When the API renames
// something, this is the only file to change.

/**
 * Development auth (AUTH_DEV_MODE=1): the benchmark is an admin. A
 * researcher owns a limited number of studies (20), so the n-th study is
 * made by another researcher every `STUDIES_PER_RESEARCHER` studies.
 */
const STUDIES_PER_RESEARCHER = 10;
export function researcherHeaders(study = 0) {
  return {
    "content-type": "application/json",
    "x-dev-role": "ADMIN",
    "x-dev-email": `bench${Math.floor(study / STUDIES_PER_RESEARCHER)}@example.com`,
  };
}

/** What a coder's browser sends: the client header, the link's secret and the session cookie. */
export function coderHeaders(secret, cookie) {
  return {
    "content-type": "application/json",
    "x-annotinder": "1",
    "x-link-secret": secret,
    ...(cookie ? { cookie } : {}),
  };
}

/** Researcher paths, relative to /api. */
export const paths = {
  health: "/health",
  studies: "/study",
  units: (id) => `/study/${id}/units`,
  design: (id) => `/study/${id}/design`,
  designVersion: (id, version) => `/study/${id}/design/${version}`,
  coders: (id) => `/study/${id}/coders`,
  codersColumn: (id) => `/study/${id}/sets/coder_set`,
  deployment: (id) => `/study/${id}/deployment`,
  links: (id) => `/study/${id}/links`,
  coderBase: (publicId) => `/d/${publicId}`,
};

/** Coder paths, relative to `paths.coderBase(studyId)`. */
export const coderPaths = {
  session: "/session",
  summary: "/summary",
  coderAnswers: "/variables/coder",
  unitAnswers: "/variables/unit",
  next: (loop, count) => `/loop/${encodeURIComponent(loop)}/next?count=${count}`,
};

/** The researcher's reads the benchmark times on a large study (bench-seed.mjs): name -> [method, path]. */
export const readPaths = {
  "study list": ["GET", () => "/study"],
  overview: ["GET", (id) => `/study/${id}/overview`],
  "deployment status": ["GET", (id) => `/study/${id}/deployment/status`],
  coders: ["GET", (id) => `/study/${id}/coders`],
  sessions: ["GET", (id) => `/study/${id}/sessions`],
  "results answers": ["GET", (id) => `/study/${id}/results/answers`],
  "results agreement": ["GET", (id) => `/study/${id}/results/agreement`],
  "results units": ["GET", (id) => `/study/${id}/results/units`],
  "results coders": ["GET", (id) => `/study/${id}/results/coders`],
  "annotations page": ["GET", (id) => `/study/${id}/annotations`],
  "results export": ["POST", (id) => `/study/${id}/results/export`],
  "study export": ["GET", (id) => `/study/${id}/export`],
};

/** The id the coder API names a study by (from the answer of `POST /study`). */
export const coderStudyId = (study) => study.publicId;

/** A list response: the array itself, or the one array of a list object (`{ links: [...] }`); a whole list, not a page. */
export function asList(body) {
  if (Array.isArray(body)) return body;
  if (body?.next !== undefined) throw new Error("The list came in pages: the benchmark reads whole lists");
  const lists = Object.values(body ?? {}).filter(Array.isArray);
  if (lists.length !== 1) throw new Error(`Expected a list, got ${JSON.stringify(body).slice(0, 200)}`);
  return lists[0];
}

/** The code of an error response (`{ error, code }`), for counting errors by kind. */
export function errorCode(text) {
  try {
    return JSON.parse(text).code ?? "";
  } catch {
    return "";
  }
}

// --- The design ---

/** How a study's units reach its coders: a crowd's shared queue, a crowd coding all units, or experts with their own units. */
export const MODES = ["shared", "all", "experts"];

const nominal = (name, question, values) => ({
  type: "question",
  name,
  variable: { type: "nominal", question, options: values.map((value) => ({ value })) },
});

/** The coder-level question and the unit questions, with the answers a simulated coder picks from. */
export const CODER_QUESTION = { name: "age", values: ["young", "old"] };
export const UNIT_QUESTIONS = [
  { name: "sentiment", values: ["pos", "neg"] },
  { name: "topic", values: ["a", "b", "c"] },
];

/** A shared queue: every unit is coded by two coders of the crowd. */
const SHARED_QUEUE = { codersPerUnit: { min: 2, max: 2 } };

const LOOP_ID = "loop_1";

/** The body of `POST /design` for a mode: one question about the coder, then one unit loop with two questions. */
export function designBody(mode) {
  const loop = {
    type: "unit_loop",
    id: LOOP_ID,
    label: "Headlines",
    ...(mode === "shared" ? { units: { divide: SHARED_QUEUE } } : {}),
    children: [
      { type: "layout", template: "# $unit.headline\n\n$unit.text" },
      ...UNIT_QUESTIONS.map((q) => nominal(q.name, `${q.name}?`, q.values)),
    ],
  };
  const invite = mode === "experts" ? { mode: "coders", link: "per_coder" } : { mode: "crowd" };
  return { session: { invite }, items: [nominal(CODER_QUESTION.name, "Your age?", CODER_QUESTION.values), loop] };
}

/** The mode a stored design resolves to, read back from the server (`GET /design/:id`). */
export function modeOfDesign(design) {
  if (design.session?.invite?.mode === "coders") return "experts";
  const loop = design.items.find((item) => item.type === "unit_loop");
  return loop?.units?.divide ? "shared" : "all";
}

/** A unit of the benchmark: a headline and some text (about 500 characters). */
export function unitBody(n) {
  return { externalId: `u${n}`, data: { headline: `Headline ${n}`, text: `Some text of unit ${n}. `.repeat(20) } };
}

/** The name of the n-th expert coder (a value of the coders' column). */
export const expertName = (n) => `coder${n + 1}`;

/** The body of `POST /coders`: `coders` expert coders. */
export const expertCodersBody = (coders) => ({
  coders: Array.from({ length: coders }, (_, c) => ({ coder: expertName(c) })),
});

/** The body of `PUT /sets/coder_set`: the units dealt round-robin to `coders` expert coders. */
export function codersColumnBody(unitIds, coders) {
  const sets = Array.from({ length: coders }, (_, c) => ({
    name: expertName(c),
    unitIds: unitIds.filter((_, i) => i % coders === c),
  }));
  return { sets };
}

/** The coder a per-coder link is for. */
export const linkCoder = (link) => link.params?.coder;

// --- What a coder reads and writes ---

const answer = (value) => ({ done: true, skip: false, values: [{ value }] });
const TIMING = { firstMs: 800, totalMs: 1200, hiddenMs: 0, edits: 1 };
const timings = (questions) => Object.fromEntries(questions.map((q) => [q.name, TIMING]));
const answers = (questions, pick) => Object.fromEntries(questions.map((q) => [q.name, answer(pick(q.values))]));

/** The first loop of a session (`GET /session`): its key, and how many units the coder will get (null: it depends on other coders). */
export function firstLoop(session) {
  const progress = session.progress[0];
  return { key: progress.loop, totalUnits: progress.totalUnits ?? null, finishedUnits: progress.doneUnitIds.length };
}

/** The body of `POST /variables/coder`; `pick` chooses one of a question's values. */
export function coderAnswersBody(pick) {
  return { variables: answers([CODER_QUESTION], pick), timings: timings([CODER_QUESTION]) };
}

/** The body of `POST /variables/unit` for a unit of a batch. */
export function unitAnswersBody(unit, loop, pick) {
  return { unitId: unit.id, loop, variables: answers(UNIT_QUESTIONS, pick), timings: timings(UNIT_QUESTIONS) };
}

/** The units of a `GET /loop/:loop/next` response. */
export const batchUnits = (batch) => batch.units;
