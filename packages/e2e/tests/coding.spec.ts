import { expect, test } from "@playwright/test";
import { answers, coders, fromExample, question } from "./helpers";

// Coders at work, in a real browser, on jobs made from the examples.

test("a coder swipes through their set with the arrow keys; every answer is saved", async ({ page, request }) => {
  const { job, link } = await fromExample(request, "swipe-sentiment");
  const examples = (await coders(request, job.id)).map((c) => c.id);
  await page.goto(link);
  // 5 own units + 5 overlap units, by keyboard (right: good news)
  for (let i = 0; i < 10; i++) {
    await question(page, "Is this headline good news or bad news?");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
  }
  await expect(page.getByText(/completed|Thank you/i).first()).toBeVisible();
  const mine = (await answers(request, job.id)).filter((a) => !examples.includes(a.coderId) && a.unitId !== null);
  expect(mine).toHaveLength(10);
  expect(new Set(mine.map((a) => a.unitId)).size).toBe(10);
});

test("a swipe starts anywhere on the screen, and 1, 2, 3 answer too", async ({ page, request }) => {
  const { job, link } = await fromExample(request, "swipe-sentiment");
  const examples = (await coders(request, job.id)).map((c) => c.id);
  const mine = async () => (await answers(request, job.id)).filter((a) => !examples.includes(a.coderId) && a.unitId !== null);
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

test("a respondent under 18 is screened out; an adult fills in the whole survey, follow-up included", async ({ page, request, browser }) => {
  const { job, link } = await fromExample(request, "simple-survey");
  const examples = (await coders(request, job.id)).map((c) => c.id);

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

  const rows = (await answers(request, job.id)).filter((a) => !examples.includes(a.coderId));
  const byVariable = (name: string) => rows.filter((a) => a.variable === name).map((a) => a.value.values?.map((v) => v.value));
  expect(byVariable("age").sort()).toEqual([[15], [30]]);
  expect(byVariable("social_platform")).toEqual([["instagram"]]);
  const ended = (await coders(request, job.id)).filter((c) => !examples.includes(c.id)).map((c) => c.ended?.outcome).sort();
  expect(ended).toEqual(["complete", "screenout"]);
});

test("a participant in the experiment reads their version of the article and answers", async ({ page, request }) => {
  const { job, link } = await fromExample(request, "simple-experiment");
  const examples = (await coders(request, job.id)).map((c) => c.id);
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await question(page, "New wind farm planned off the coast");
  // One of the two versions, never both
  const economic = await page.getByText("six hundred jobs").isVisible();
  const human = await page.getByText("Kees Jansen").isVisible();
  expect(economic !== human).toBe(true);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await page.getByRole("button", { name: /Support/ }).first().click();
  for (const row of ["Hopeful", "Worried", "Angry"]) {
    await page.getByRole("radiogroup", { name: row }).getByRole("radio", { name: "a little" }).click();
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: economic ? /Costs and jobs/ : /fisherman/ }).click();
  await expect(page.getByText(/the wind farm is not real/)).toBeVisible();

  const rows = (await answers(request, job.id)).filter((a) => !examples.includes(a.coderId));
  const condition = rows.find((a) => a.variable === "condition");
  expect(condition?.assigned).toBe(true);
  expect(condition?.value.values?.[0].value).toBe(economic ? "economic" : "human_interest");
});

test("a coder selects actors in a text and labels them", async ({ page, request }) => {
  const { job, link } = await fromExample(request, "actor-spans");
  const examples = (await coders(request, job.id)).map((c) => c.id);
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
  await page.getByRole("button", { name: /Person/ }).first().click();
  await page.getByRole("button", { name: "Done (1)" }).click();
  await question(page, "Select every person and organisation mentioned in the text.");
  await expect.poll(async () => (await answers(request, job.id)).filter((x) => !examples.includes(x.coderId)).length).toBe(1);
  const [row] = (await answers(request, job.id)).filter((x) => !examples.includes(x.coderId));
  expect(row.value.spans).toMatchObject([{ value: "person", field: "text", slices: [{ text: "Anna de Wit" }] }]);
});
