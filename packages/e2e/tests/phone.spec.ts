import { devices, type Browser, type Page } from "@playwright/test";
import type { StudyResponse, UnitResponse } from "@annotinder/contracts";
import { expect, test } from "./fixtures";
import { answers, api, coders, fromExample, question } from "./helpers";

// The main coding flows on a phone: a touch screen, a narrow viewport.

async function phone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  return context.newPage();
}

/** A real touch drag (pointerType "touch"), from (x, y) by dx sideways. */
async function swipe(page: Page, x: number, y: number, dx: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", px: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: px, y }],
    });
  await touch("touchStart", x);
  for (let i = 1; i <= 10; i++) await touch("touchMove", x + (dx * i) / 10);
  await touch("touchEnd", x + dx);
  await cdp.detach();
}

/** The middle of `word` within `phrase` in the selectable text. */
async function wordAt(page: Page, phrase: string, word: string): Promise<{ x: number; y: number }> {
  const at = await page
    .locator("[data-keys-own]")
    .first()
    .evaluate(
      (el, [phrase, word]) => {
        // The text can be split over several nodes (a pending selection is a mark)
        const target = (el.textContent ?? "").indexOf(phrase) + phrase.indexOf(word);
        if (target < phrase.indexOf(word)) return null;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let seen = 0;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n as Text;
          if (target < seen + text.length) {
            const range = document.createRange();
            range.setStart(text, target - seen);
            range.setEnd(text, target - seen + word.length);
            const r = range.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
          seen += text.length;
        }
        return null;
      },
      [phrase, word],
    );
  expect(at).not.toBeNull();
  return at!;
}

/** Nothing wider than the screen: no sideways scrolling. */
async function fitsWidth(page: Page): Promise<void> {
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(client);
}

async function deploy(request: Parameters<typeof api>[0], name: string, units: string[], items: unknown[]) {
  const created = await api<StudyResponse>(request, "POST", "/study", { name });
  await api<UnitResponse[]>(request, "POST", `/study/${created.id}/units`, {
    units: units.map((text, i) => ({ externalId: `u${i + 1}`, data: { text } })),
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, { items });
  await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${created.id}/links`);
  return { id: created.id, link: `/code/${created.id}?link=${link.secret}` };
}

test("on a phone, a swipe with a finger answers", async ({ request, browser }) => {
  const { study, link } = await fromExample(request, "swipe-sentiment");
  const examples = (await coders(request, study.id)).map((c) => c.id);
  const mine = async () =>
    (await answers(request, study.id)).filter((a) => !examples.includes(a.sessionId) && a.unitId !== null);
  const page = await phone(browser);
  await page.goto(link);
  await question(page, "Is this headline good news or bad news?");
  await page.waitForTimeout(500);
  await fitsWidth(page);
  const { width, height } = page.viewportSize()!;
  await swipe(page, width * 0.3, height * 0.4, width * 0.5);
  await expect.poll(async () => (await mine()).length).toBe(1);
  await page.waitForTimeout(500);
  await swipe(page, width * 0.7, height * 0.4, -width * 0.5);
  await expect.poll(async () => (await mine()).length).toBe(2);
  const values = (await mine()).map((a) => (a.value as { values: { value: string }[] }).values[0].value);
  expect(values).toEqual(["positive", "negative"]);
});

test("on a phone, a span is two taps: its first and last word", async ({ request, browser }) => {
  const { study, link } = await fromExample(request, "actor-spans");
  const examples = (await coders(request, study.id)).map((c) => c.id);
  const page = await phone(browser);
  await page.goto(link);
  await question(page, "Select every person and organisation mentioned in the text.");
  await page.waitForTimeout(800);
  await fitsWidth(page);
  // Tap the first word, then the last
  const anna = await wordAt(page, "Anna de Wit", "Anna");
  await page.touchscreen.tap(anna.x, anna.y);
  const wit = await wordAt(page, "Anna de Wit", "Wit");
  await page.touchscreen.tap(wit.x, wit.y);
  await page
    .getByRole("button", { name: /Person/ })
    .first()
    .tap();
  await page.getByRole("button", { name: "Done (1)" }).tap();
  await expect
    .poll(async () => (await answers(request, study.id)).filter((x) => !examples.includes(x.sessionId)).length)
    .toBe(1);
  const [row] = (await answers(request, study.id)).filter((x) => !examples.includes(x.sessionId));
  expect(row.value.spans).toMatchObject([{ value: "person", slices: [{ text: "Anna de Wit" }] }]);
});

test("on a phone: a scale, special options and the instruction fit and work by tapping", async ({
  request,
  browser,
}) => {
  const options = [
    { value: "politics" },
    { value: "other" },
    { value: "dk", label: "Don't know", special: "dont_know" },
  ];
  const { id, link } = await deploy(
    request,
    "Phone",
    ["A text about the election"],
    [
      {
        type: "unit_loop",
        layout: { template: "$unit.text" },
        children: [
          {
            type: "question",
            name: "topic",
            variable: { type: "nominal", question: "Topic?", options },
            instruction: "Pick the **main** topic.",
          },
          {
            type: "question",
            name: "trust",
            variable: {
              type: "scale",
              question: "How much do you trust it?",
              items: [{ name: "source" }, { name: "facts" }],
              options: [
                { value: 1, label: "not" },
                { value: 2, label: "somewhat" },
                { value: 3, label: "fully" },
              ],
            },
          },
        ],
      },
    ],
  );
  const page = await phone(browser);
  await page.goto(link);
  await question(page, "Topic?");
  await fitsWidth(page);

  // The instruction: a tap opens it, it fits the screen, and closes again
  await page.getByRole("button", { name: "Instruction" }).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("main")).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // A special option, tapped
  await page.locator("[data-special=dont_know]").tap();
  await question(page, "How much do you trust it?");
  await fitsWidth(page);
  for (const row of ["source", "facts"])
    await page.getByRole("radiogroup", { name: row }).getByRole("radio", { name: "somewhat" }).tap();
  await page.getByRole("button", { name: "Continue", exact: true }).tap();
  await expect.poll(async () => (await answers(request, id)).length).toBe(2);
  const topic = (await answers(request, id)).find((a) => a.variable === "topic")!;
  expect((topic.value as { values: { value: string }[] }).values[0].value).toBe("dk");
});

test("on a phone, a coder picks their name from the list", async ({ request, browser }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Pick on a phone" });
  const units = await api<UnitResponse[]>(request, "POST", `/study/${study.id}/units`, {
    units: [
      { externalId: "a1", data: { text: "Anna's text" } },
      { externalId: "b1", data: { text: "Bob's text" } },
    ],
  });
  await api(request, "PUT", `/study/${study.id}/sets/coder`, {
    sets: [
      { name: "anna", unitIds: [units[0].id] },
      { name: "bob", unitIds: [units[1].id] },
    ],
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", column: "coder", link: "pick_name" } },
    items: [
      {
        type: "unit_loop",
        layout: { template: "$unit.text" },
        children: [{ type: "question", name: "ok", variable: { type: "confirm", question: "Seen it?" } }],
      },
    ],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${study.id}/links`);
  const page = await phone(browser);
  await page.goto(`/code/${study.id}?link=${link.secret}`);
  await expect(page.getByText("Who are you?")).toBeVisible();
  await fitsWidth(page);
  await page.getByRole("button", { name: "bob", exact: true }).tap();
  await question(page, "Seen it?");
  await expect(page.getByText("Bob's text")).toBeVisible();
});

test("on a phone, a relation is two taps: the start span, then where it goes", async ({ request, browser }) => {
  const text = "Mayor Anna de Wit met the board of the Harbour Company on Monday.";
  const { id, link } = await deploy(
    request,
    "Phone relations",
    [text],
    [
      {
        type: "unit_loop",
        layout: { template: "$unit.text" },
        children: [
          {
            type: "question",
            name: "actors",
            variable: {
              type: "span",
              question: "Mark the actors.",
              fields: ["text"],
              options: [
                { value: "person", label: "Person" },
                { value: "organisation", label: "Organisation" },
              ],
            },
          },
          {
            type: "question",
            name: "links",
            variable: {
              type: "relation",
              question: "How are they related?",
              options: [{ value: "employs", label: "Employs" }],
              rules: [
                {
                  from: { variable: "actors", values: ["organisation"] },
                  to: { variable: "actors", values: ["person"] },
                },
              ],
            },
          },
        ],
      },
    ],
  );
  const page = await phone(browser);
  await page.goto(link);
  await question(page, "Mark the actors.");
  await page.waitForTimeout(800);
  for (const [phrase, first, last, label] of [
    ["Anna de Wit", "Anna", "Wit", "Person"],
    ["Harbour Company", "Harbour", "Company", "Organisation"],
  ]) {
    const a = await wordAt(page, phrase, first);
    await page.touchscreen.tap(a.x, a.y);
    const b = await wordAt(page, phrase, last);
    await page.touchscreen.tap(b.x, b.y);
    await page.getByRole("button", { name: label, exact: true }).first().tap();
  }
  await page.getByRole("button", { name: "Done (2)" }).tap();

  await question(page, "How are they related?");
  await fitsWidth(page);
  // A person can't start an "employs" relation here
  await expect(page.getByRole("button", { name: /Person: "Anna de Wit"/ })).toBeDisabled();
  await page.getByRole("button", { name: /Organisation: "Harbour Company"/ }).tap();
  await page.getByRole("button", { name: /Person: "Anna de Wit"/ }).tap();
  await expect(page.locator("[data-relation-arrow]")).toHaveCount(1);
  await page.getByRole("button", { name: "Done (1)" }).tap();
  await expect
    .poll(async () => (await answers(request, id)).find((a) => a.variable === "links")?.value.relations?.length)
    .toBe(1);
});
