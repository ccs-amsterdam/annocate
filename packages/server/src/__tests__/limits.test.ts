import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoderUnitResponse } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import { DEMO_PUBLIC_ID } from "../db/publicId.js";
import { seed } from "../seed.js";
import { ensureUser } from "../shared/accounts.js";
import { emptyDb, query } from "./testDb.js";

// Limits on what coders send (shared/limits.ts, docs/accounts.md): the size
// of one answer, and how many answers a study's owner may have in it.

let db: Db;
let app: ReturnType<typeof createApp>;
let cookie: string;

beforeEach(async () => {
  db = await emptyDb();
  await seed(db);
  app = createApp(db, { devMode: true });
  cookie = "";
});
afterEach(() => vi.useRealTimers());

/** A request of one coder on the demo study's link; keeps the device cookie. */
async function call(path: string, body?: object): Promise<Response> {
  const res = await app.request(`/api/d/${DEMO_PUBLIC_ID}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      "x-annotinder": "1",
      "x-link-secret": "demo-secret",
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const given = res.headers.getSetCookie()[0]?.split(";")[0];
  if (given) cookie = given;
  return res;
}

async function nextUnit(): Promise<CoderUnitResponse> {
  const res = await call("/loop/loop_1/next");
  expect(res.status).toBe(200);
  return ((await res.json()) as { units: CoderUnitResponse[] }).units[0]!;
}

/** A finished unit in the demo codebook: six answers. */
const answers = (sentiment: string) => ({
  sentiment: { done: true, values: [{ value: sentiment }] },
  is_news: { done: true, skip: true },
  topics: { done: true, skip: true },
  actors_and_issues: { done: true, skip: true },
  framing: { done: true, skip: true },
  usefulness: { done: true, skip: true },
});
const ANSWERS_PER_UNIT = Object.keys(answers("positive")).length;

const submit = (unit: CoderUnitResponse, sentiment = "positive") =>
  call("/variables/unit", { unitId: unit.id, variables: answers(sentiment) });

async function setAnswerLimit(answersPerStudy: number): Promise<void> {
  const owner = await ensureUser(db, "owner@uni.nl");
  await query(db, "UPDATE users SET limits = $1 WHERE id = $2", [JSON.stringify({ answersPerStudy }), owner.id]);
  await query(db, "UPDATE studies SET owner_id = $1 WHERE id = 1", [owner.id]);
}

describe("limits on answers", () => {
  it("an answer larger than the server allows is refused: 413 answer_too_large", async () => {
    expect((await call("/session")).status).toBe(200);
    const unit = await nextUnit();
    // Less than the answer to a question takes
    await query(db, "UPDATE server_settings SET answer_bytes = 30");
    const refused = await submit(unit);
    expect(refused.status).toBe(413);
    expect(await refused.json()).toMatchObject({
      error: "The answer to 'sentiment' takes 58 bytes; at most 30 bytes",
      code: "answer_too_large",
    });
    expect(await query(db, "SELECT 1 FROM annotation_values")).toEqual([]);
  });

  it("a study past its owner's limit on answers takes no more: 403 study_full; the count is read again after a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await setAnswerLimit(ANSWERS_PER_UNIT);
    expect((await call("/session")).status).toBe(200);
    expect((await submit(await nextUnit())).status).toBe(200);
    const second = await nextUnit();
    const refused = await submit(second);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "study_full" });

    // A higher limit counts once the study's limit is read again
    await setAnswerLimit(2 * ANSWERS_PER_UNIT);
    expect((await submit(second)).status).toBe(403);
    vi.setSystemTime(Date.now() + 61_000);
    expect((await submit(second)).status).toBe(200);
  });
});
