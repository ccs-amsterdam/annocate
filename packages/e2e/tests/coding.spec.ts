import { expect, test } from "./fixtures";
import { answers, api, coders, fromExample, question, shortcutStyle } from "./helpers";

// Coders at work, in a real browser, on studies made from the examples.

test("a coder swipes through their set with the arrow keys; every answer is saved", async ({ page, request }) => {
  const { study, link } = await fromExample(request, "swipe-sentiment");
  const examples = (await coders(request, study.id)).map((c) => c.id);
  await page.goto(link);
  // 5 own units + 5 overlap units, by keyboard (right: good news)
  for (let i = 0; i < 10; i++) {
    await question(page, "Is this headline good news or bad news?");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
  }
  await expect(page.getByText(/completed|Thank you/i).first()).toBeVisible();
  const mine = (await answers(request, study.id)).filter((a) => !examples.includes(a.sessionId) && a.unitId !== null);
  expect(mine).toHaveLength(10);
  expect(new Set(mine.map((a) => a.unitId)).size).toBe(10);
});

test("a swipe starts anywhere on the screen, and 1, 2, 3 answer too", async ({ page, request }) => {
  const { study, link } = await fromExample(request, "swipe-sentiment");
  const examples = (await coders(request, study.id)).map((c) => c.id);
  const mine = async () =>
    (await answers(request, study.id)).filter((a) => !examples.includes(a.sessionId) && a.unitId !== null);
  await page.goto(link);
  await question(page, "Is this headline good news or bad news?");
  await page.waitForTimeout(500);
  // Drag sideways over the question (not the unit): the unit flies off
  const box = (await page.getByText("Is this headline good news or bad news?").first().boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await mine()).length).toBe(1);
  await page.waitForTimeout(500);
  await page.keyboard.press("1");
  await expect.poll(async () => (await mine()).length).toBe(2);
  const values = (await mine()).map((a) => (a.value as { values: { value: string }[] }).values[0].value);
  expect(values).toEqual(["positive", "negative"]);
});

test("a respondent under 18 is screened out; an adult fills in the whole survey, follow-up included", async ({
  page,
  request,
  browser,
}) => {
  const { study, link } = await fromExample(request, "simple-survey");
  const examples = (await coders(request, study.id)).map((c) => c.id);

  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await question(page, "How old are you?");
  await page.getByRole("spinbutton").fill("15");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("This survey is for people aged 18 and older")).toBeVisible();

  const adult = await (await browser.newContext()).newPage();
  await adult.goto(link);
  await adult.getByRole("button", { name: "I confirm", exact: true }).click();
  await adult.getByRole("spinbutton").fill("30");
  await adult.getByRole("button", { name: "Continue", exact: true }).click();
  await question(adult, "How often do you follow the news?");
  await adult.getByRole("button", { name: "Daily" }).click();
  await question(adult, "Where do you get your news?");
  await adult.getByRole("button", { name: "Social media" }).click();
  await adult.getByRole("button", { name: "Television" }).click();
  await adult.getByRole("button", { name: "Continue (2)" }).click();
  await question(adult, "Which social media platform");
  await adult.getByRole("combobox").click();
  await adult.getByRole("option", { name: /Instagram/ }).click();
  await question(adult, "How much do you trust news from these sources?");
  for (const row of ["Television", "Newspapers", "Social media"]) {
    await adult.getByRole("radiogroup", { name: row }).getByRole("radio", { name: "somewhat" }).click();
  }
  await adult.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(adult.getByText("Thank you for taking part!")).toBeVisible();

  const rows = (await answers(request, study.id)).filter((a) => !examples.includes(a.sessionId));
  const byVariable = (name: string) =>
    rows.filter((a) => a.variable === name).map((a) => a.value.values?.map((v) => v.value));
  expect(byVariable("age").sort()).toEqual([[15], [30]]);
  expect(byVariable("social_platform")).toEqual([["instagram"]]);
  const ended = (await coders(request, study.id))
    .filter((c) => !examples.includes(c.id))
    .map((c) => c.ended?.outcome)
    .sort();
  expect(ended).toEqual(["complete", "screenout"]);
});

test("a participant in the experiment reads their version of the article and answers", async ({ page, request }) => {
  const { study, link } = await fromExample(request, "simple-experiment");
  const examples = (await coders(request, study.id)).map((c) => c.id);
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await question(page, "New wind farm planned off the coast");
  // One of the two versions, never both
  const economic = await page.getByText("six hundred jobs").isVisible();
  const human = await page.getByText("Kees Jansen").isVisible();
  expect(economic !== human).toBe(true);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await page
    .getByRole("button", { name: /Support/ })
    .first()
    .click();
  for (const row of ["Hopeful", "Worried", "Angry"]) {
    await page.getByRole("radiogroup", { name: row }).getByRole("radio", { name: "a little" }).click();
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: economic ? /Costs and jobs/ : /fisherman/ }).click();
  await expect(page.getByText(/the wind farm is not real/)).toBeVisible();

  const rows = (await answers(request, study.id)).filter((a) => !examples.includes(a.sessionId));
  const condition = rows.find((a) => a.variable === "condition");
  expect(condition?.assigned).toBe(true);
  expect(condition?.value.values?.[0].value).toBe(economic ? "economic" : "human_interest");
});

test("a coder selects actors in a text and labels them", async ({ page, request }) => {
  const { study, link } = await fromExample(request, "actor-spans");
  const examples = (await coders(request, study.id)).map((c) => c.id);
  await page.goto(link);
  await question(page, "Select every person and organisation mentioned in the text.");
  // Select "Anna de Wit" by dragging over the words (once the unit has slid in)
  await page.waitForTimeout(800);
  // In the visible text (the first text node on the page with the phrase can be a hidden copy)
  const box = await page
    .getByText("Anna de Wit")
    .first()
    .evaluate((el, phrase) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n as Text;
        const at = text.data.indexOf(phrase);
        if (at < 0) continue;
        // Just inside the phrase's left and right edges (headless Chromium
        // sometimes starts no selection from a character's exact middle)
        const range = document.createRange();
        range.setStart(text, at);
        range.setEnd(text, at + phrase.length);
        const r = range.getBoundingClientRect();
        const y = r.top + r.height / 2;
        return { ax: r.left + 2, ay: y, bx: r.right - 2, by: y };
      }
      return null;
    }, "Anna de Wit");
  expect(box).not.toBeNull();
  await page.mouse.move(box!.ax, box!.ay);
  await page.mouse.down();
  await page.mouse.move(box!.bx, box!.by, { steps: 8 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: /Person/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Done (1)" }).click();
  await question(page, "Select every person and organisation mentioned in the text.");
  await expect
    .poll(async () => (await answers(request, study.id)).filter((x) => !examples.includes(x.sessionId)).length)
    .toBe(1);
  const [row] = (await answers(request, study.id)).filter((x) => !examples.includes(x.sessionId));
  expect(row.value.spans).toMatchObject([{ value: "person", field: "text", slices: [{ text: "Anna de Wit" }] }]);
});

test("spans by keyboard: the arrows move over the words, Space selects from there to there, then the labels", async ({
  page,
  request,
}) => {
  const { study, link } = await fromExample(request, "actor-spans");
  const examples = (await coders(request, study.id)).map((c) => c.id);
  await page.goto(link);
  await question(page, "Select every person and organisation mentioned in the text.");
  await page.waitForTimeout(800);
  await shortcutStyle(page, "Fast type");
  // (The menu's button keeps focus when it closes: Space would open it again)
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  // "Mayor Anna de Wit met the board of the Harbour Company ...": the first arrow is on Mayor, the next on Anna
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-cursor]").first()).toHaveText("Anna");
  // Space starts a selection, the arrows extend it, Space ends it: the first label has focus
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.locator("[data-span-label]:focus")).toHaveText(/Person/);
  await page.keyboard.press("Space");
  // On from there to Harbour Company; this time the label by its key (Fast type: o)
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-cursor]").first()).toHaveText("Harbour");
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await page.keyboard.press("o");
  // Shift + Enter: Done
  await expect(page.getByRole("button", { name: /Done \(2\)/ })).toBeVisible();
  await page.keyboard.press("Shift+Enter");
  await expect
    .poll(async () => (await answers(request, study.id)).filter((x) => !examples.includes(x.sessionId)).length)
    .toBe(1);
  const [row] = (await answers(request, study.id)).filter((x) => !examples.includes(x.sessionId));
  expect(row.value.spans).toMatchObject([
    { value: "person", slices: [{ text: "Anna de Wit" }] },
    { value: "organisation", slices: [{ text: "Harbour Company" }] },
  ]);
});

test("an ::html field shows in its sandboxed frame, sized by its script, within the page's security policy", async ({
  page,
  request,
}) => {
  const study = await api<{ id: number }>(request, "POST", "/study/from-recipe", {
    name: "HTML unit",
    units: [
      {
        id: "h1",
        data: {
          table: "<table><tr><th>Party</th><th>Seats</th></tr><tr><td>A</td><td>12</td></tr></table><p>Below</p>",
        },
      },
    ],
    design: {
      items: [
        {
          type: "unit_loop",
          children: [
            { type: "layout", template: "$unit.table::html" },
            { type: "question", name: "ok", variable: { type: "confirm", question: "Seen it?" } },
          ],
        },
      ],
    },
    publish: true,
  });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${study.id}/links`);
  await page.goto(`/code/${study.id}?link=${link.secret}`);
  await question(page, "Seen it?");
  const frame = page.locator("iframe[sandbox]");
  await expect(frame).toBeVisible();
  // The frame's height script ran (allowed by its hash): it is taller than an empty frame
  await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(40);
  await expect(page.frameLocator("iframe[sandbox]").getByText("Seats")).toBeVisible();
});

test("the menus list only what the coder got to; the loop's own menu keeps number keys from the question", async ({
  page,
  request,
}) => {
  const { link } = await fromExample(request, "survey-annotations");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await page.getByRole("button", { name: /18 to 29/ }).click();

  // On the third question: the menu shows the three, not the loop after them
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("button")).toHaveCount(3);
  await expect(menu.getByText("Headlines", { exact: true })).toHaveCount(0);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/menu-main.png` });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Quite/ }).first().click();
  await question(page, "What is this headline about?");
  // In the loop: its button; its menu shows the unit's first question only
  await page.getByRole("button", { name: /open the units/ }).click();
  await expect(page.getByText("Unit 1")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("How relevant is this news")).toHaveCount(0);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/menu-loop.png` });
  // A number key opens the number pad, it doesn't answer the question
  await page.keyboard.press("2");
  await expect(page.getByText("You can go up to unit 1")).toBeVisible();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/menu-pad.png` });
  await page.keyboard.press("Escape");
  await question(page, "What is this headline about?");

  // The main menu now lists the loop too
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Headlines", { exact: true })).toBeVisible();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/menu-main-loop.png` });
});
