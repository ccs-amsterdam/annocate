import type { Page } from "@playwright/test";
import type { StudyResponse, UnitResponse } from "@annotinder/contracts";
import { expect, test } from "./fixtures";
import { answers, api, coders, question, shortcutStyle } from "./helpers";

// Navigating while coding, in a real browser against the real server:
// Previous and Next, the menu, changing an earlier answer, a reload, and
// quick repeated input. The rules themselves are tested in the client
// (studyManager/navigation.test.ts); these check the screen follows them.

const TEXTS = ["First text", "Second text", "Third text"];

const nominal = (name: string, text: string, options: string[]) => ({
  type: "question",
  name,
  variable: { type: "nominal", question: text, options: options.map((value) => ({ value })) },
});

/** A deployed study: a question, a loop over three units with two questions each, a last question. */
async function study(request: Parameters<typeof api>[0]): Promise<{ id: number; link: string }> {
  const created = await api<StudyResponse>(request, "POST", "/study", { name: "Navigation" });
  await api<UnitResponse[]>(request, "POST", `/study/${created.id}/units`, {
    units: TEXTS.map((text, i) => ({ externalId: `u${i + 1}`, data: { text } })),
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, {
    items: [
      { type: "question", name: "ready", variable: { type: "confirm", question: "Ready to start?" } },
      {
        type: "unit_loop",
        label: "Texts",
        children: [
          { type: "layout", template: "$unit.text" },
          nominal("topic", "Topic?", ["politics", "other"]),
          nominal("tone", "Tone?", ["positive", "negative"]),
        ],
      },
      { type: "question", name: "done", variable: { type: "confirm", question: "All done?" } },
    ],
  });
  await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${created.id}/links`);
  return { id: created.id, link: `/code/${created.id}?link=${link.secret}` };
}

/** The unit on screen and its question. */
async function at(page: Page, text: string, q: string): Promise<void> {
  await question(page, q);
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

const previous = (page: Page) => page.getByRole("button", { name: "Previous", exact: true }).click();
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true }).click();
/** An answer option's button (its label: the key badge isn't part of the name). */
const option = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

/** The coder's unit answers saved so far, per unit and question (one row each). */
async function saved(request: Parameters<typeof api>[0], id: number): Promise<string[]> {
  const rows = (await answers(request, id)).filter((a) => a.unitId !== null);
  return rows.map((a) => `${a.unitId}/${a.variable}`).sort();
}

test("Previous and Next: within a unit, between units, and out of and back into the loop", async ({
  page,
  request,
}) => {
  const { link } = await study(request);
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await at(page, TEXTS[0], "Topic?");
  await option(page, "politics").click();
  await at(page, TEXTS[0], "Tone?");

  // Back to the question before the loop, and forward again: the same unit, the answer kept
  await previous(page);
  await at(page, TEXTS[0], "Topic?");
  await expect(option(page, "politics")).toHaveAttribute("aria-pressed", "true");
  await previous(page);
  await question(page, "Ready to start?");
  await next(page);
  await at(page, TEXTS[0], "Topic?");
  await next(page);
  await at(page, TEXTS[0], "Tone?");
  await option(page, "negative").click();
  await at(page, TEXTS[1], "Topic?");

  // Back to the previous unit's last question, with its answer; the progress bar marks where the coder is
  await expect(page.locator("[data-progress-current]")).toHaveCount(0);
  await previous(page);
  await at(page, TEXTS[0], "Tone?");
  await expect(option(page, "negative")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-progress-current]")).toHaveCount(1);
  await next(page);
  await at(page, TEXTS[1], "Topic?");
  await expect(page.locator("[data-progress-current]")).toHaveCount(0);
});

test("after the loop, one press of Previous goes to the last unit; changing it saves it again", async ({
  page,
  request,
}) => {
  const { id, link } = await study(request);
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  for (const text of TEXTS) {
    await at(page, text, "Topic?");
    await option(page, "politics").click();
    await at(page, text, "Tone?");
    await option(page, "positive").click();
  }
  await question(page, "All done?");
  await previous(page);
  await at(page, TEXTS[2], "Tone?");
  await option(page, "negative").click();
  await question(page, "All done?");
  await expect
    .poll(async () => {
      const rows = (await answers(request, id)).filter((a) => a.unitId !== null && a.variable === "tone");
      return rows.map((a) => (a.value as { values: { value: string }[] }).values[0].value);
    })
    .toEqual(["positive", "positive", "negative"]);
  // Each unit once
  expect(await saved(request, id)).toHaveLength(6);
});

test("the menu: back to the first question, then to the loop where the coder was", async ({ page, request }) => {
  const { link } = await study(request);
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await option(page, "politics").click();
  await option(page, "positive").click();
  await at(page, TEXTS[1], "Topic?");

  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Ready to start/ })
    .click();
  await question(page, "Ready to start?");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Texts/ }).click();
  await at(page, TEXTS[1], "Topic?");
});

test("a reload mid-unit continues on that unit with its answers; finished units stay reachable", async ({
  page,
  request,
}) => {
  const { link } = await study(request);
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await option(page, "other").click();
  await option(page, "positive").click();
  await at(page, TEXTS[1], "Topic?");
  await option(page, "politics").click();
  await at(page, TEXTS[1], "Tone?");

  await page.reload();
  await at(page, TEXTS[1], "Tone?");
  await previous(page);
  await at(page, TEXTS[1], "Topic?");
  await expect(option(page, "politics")).toHaveAttribute("aria-pressed", "true");
  await previous(page);
  await at(page, TEXTS[0], "Tone?");
  await expect(option(page, "positive")).toHaveAttribute("aria-pressed", "true");
});

test("a double click, or a key held down, answers one question; the next isn't skipped", async ({ page, request }) => {
  const { id, link } = await study(request);
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await at(page, TEXTS[0], "Topic?");
  await option(page, "politics").dblclick();
  await at(page, TEXTS[0], "Tone?");
  await option(page, "positive").dblclick();
  await at(page, TEXTS[1], "Topic?");
  await expect.poll(() => saved(request, id)).toHaveLength(2);

  // "1" held down: the first press answers, its repeats don't
  await page.keyboard.press("1");
  await at(page, TEXTS[1], "Tone?");
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++)
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "1", repeat: true, bubbles: true }));
  });
  await page.waitForTimeout(300);
  await at(page, TEXTS[1], "Tone?");
});

test("the keyboard: arrows move between answers and Space chooses; Shift + arrows go back and forth, Shift + Enter continues", async ({
  page,
  request,
}) => {
  const { link } = await study(request);
  await page.goto(link);
  await page.keyboard.press("Shift+Enter"); // the confirm question: not answered yet, so nothing happens
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await at(page, TEXTS[0], "Topic?");
  // The unit's first question is numbered too (the loop has two), not just "1"
  await expect(page.getByRole("button", { name: /Unit 1, question 1: open the units/ })).toHaveText("1 · 1");

  // Arrows focus an answer, then the next one; Space chooses the focused one
  await page.keyboard.press("ArrowRight");
  await expect(option(page, "politics")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(option(page, "other")).toBeFocused();
  await page.keyboard.press(" ");
  await at(page, TEXTS[0], "Tone?");

  // Shift + Left: back to the previous question, its answer focused to change it at once (kept, not cleared)
  await page.keyboard.press("Shift+ArrowLeft");
  await at(page, TEXTS[0], "Topic?");
  await expect(option(page, "other")).toHaveAttribute("aria-pressed", "true");
  await expect(option(page, "other")).toBeFocused();

  // Backspace no longer goes back (it could while deleting typed text)
  await page.keyboard.press("Backspace");
  await at(page, TEXTS[0], "Topic?");
  // Shift + Right: next (the question was answered); Shift + Left: previous
  await page.keyboard.press("Shift+ArrowRight");
  await at(page, TEXTS[0], "Tone?");
  await page.keyboard.press("Shift+ArrowLeft");
  await at(page, TEXTS[0], "Topic?");
  // Shift + Enter continues an answered question
  await page.keyboard.press("Shift+Enter");
  await at(page, TEXTS[0], "Tone?");
});

test("special options: apart from the others, chosen with 0 and . in every question, the only answer of several", async ({
  page,
  request,
}) => {
  const created = await api<StudyResponse>(request, "POST", "/study", { name: "Special options" });
  await api<UnitResponse[]>(request, "POST", `/study/${created.id}/units`, {
    units: [{ externalId: "u1", data: { text: "First text" } }],
  });
  const options = [
    { value: "politics" },
    { value: "other" },
    { value: "dk", label: "Don't know", special: "dont_know" },
    { value: "na", label: "Not about anything", special: "not_applicable" },
  ];
  const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, {
    items: [
      {
        type: "unit_loop",
        children: [
          { type: "layout", template: "$unit.text" },
          { type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options } },
          {
            type: "question",
            name: "topics",
            variable: { type: "nominal", question: "Topics?", options, multiple: true },
          },
        ],
      },
    ],
  });
  await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${created.id}/links`);
  await page.goto(`/code/${created.id}?link=${link.secret}`);
  await question(page, "Topic?");
  // Their badges: . and 0 (the others are numbered 1, 2)
  const special = page.locator("[data-special]");
  await expect(special).toHaveCount(2);
  await expect(page.locator("[data-special=dont_know] kbd")).toHaveText(".");
  await expect(page.locator("[data-special=not_applicable] kbd")).toHaveText("0");
  await page.keyboard.press(".");
  await question(page, "Topics?");
  // Several answers: a special option clears the others, and they clear it
  await page.keyboard.press("1");
  await page.keyboard.press("2");
  await page.keyboard.press("0");
  await expect(page.locator("[aria-pressed=true]")).toHaveCount(1);
  await expect(page.locator("[data-special=not_applicable]")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("1");
  await expect(page.locator("[data-special=not_applicable]")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Shift+Enter");
  await expect.poll(async () => (await answers(request, created.id)).length).toBe(2);
  const saved = await answers(request, created.id);
  const values = (name: string) =>
    (saved.find((a) => a.variable === name)!.value as { values: { value: string }[] }).values.map((v) => v.value);
  expect(values("topic")).toEqual(["dk"]);
  expect(values("topics")).toEqual(["politics"]);
});

test("the coder chooses the keys for answers: letters, or typing to filter", async ({ page, request }) => {
  const { link } = await study(request);
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await at(page, TEXTS[0], "Topic?");

  // Letters: the start of each label no other label shares (their badges too)
  await shortcutStyle(page, "Fast type");
  await expect(page.locator("[data-key-target] kbd").first()).toHaveText("p");
  await page.keyboard.press("o");
  await at(page, TEXTS[0], "Tone?");

  // Type to filter: typed letters dim the others; Enter chooses the first match
  await shortcutStyle(page, "Type to filter");
  await page.keyboard.type("neg");
  await expect(page.getByRole("status").filter({ hasText: "neg" })).toBeVisible();
  await page.keyboard.press("Enter");
  await at(page, TEXTS[1], "Topic?");
  // Kept for the next visit (the browser's storage)
  await page.reload();
  await at(page, TEXTS[1], "Topic?");
  await page.keyboard.type("oth");
  await page.keyboard.press("Enter");
  await at(page, TEXTS[1], "Tone?");
});

test("display: the numpad only in a responsive study (three columns, 7 8 9 at the top); a study shown dark", async ({
  page,
  request,
}) => {
  const make = async (name: string, display: object) => {
    const created = await api<StudyResponse>(request, "POST", "/study", { name });
    await api<UnitResponse[]>(request, "POST", `/study/${created.id}/units`, {
      units: [{ externalId: "u1", data: { text: "First text" } }],
    });
    const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, {
      session: { display },
      items: [
        {
          type: "unit_loop",
          children: [
            { type: "layout", template: "$unit.text" },
            nominal("topic", "Topic?", ["politics", "economy", "sports", "other"]),
          ],
        },
      ],
    });
    await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
    const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${created.id}/links`);
    return `/code/${created.id}?link=${link.secret}`;
  };
  const settings = () => page.getByRole("button", { name: "Coder Settings" }).click();

  // Fixed (the default): no numpad
  await page.goto(await make("Fixed display", { theme: "dark" }));
  await question(page, "Topic?");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await settings();
  await expect(page.getByText("This study is shown dark for everyone.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await page.getByRole("button", { name: /^Shortcut style/ }).click();
  await expect(page.getByRole("option", { name: /^Numpad/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Responsive: the numpad, buttons in three columns
  await page.goto(await make("Responsive display", { layouts: "responsive" }));
  await question(page, "Topic?");
  await shortcutStyle(page, "Numpad");
  const badges = page.locator("[data-key-target] kbd");
  await expect(badges).toHaveText(["7", "8", "9", "4"]);
  await page.keyboard.press("8");
  await expect(page.getByRole("button", { name: /economy/ })).toHaveAttribute("aria-pressed", "true");
});

test("display: each coder's keys and screen are recorded when they change; quick resizes only where they end", async ({
  page,
  request,
}) => {
  const created = await api<StudyResponse>(request, "POST", "/study", { name: "Display log" });
  await api<UnitResponse[]>(request, "POST", `/study/${created.id}/units`, {
    units: [{ externalId: "u1", data: { text: "First text" } }],
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, {
    session: { display: { layouts: "responsive" } },
    items: [
      {
        type: "unit_loop",
        children: [{ type: "layout", template: "$unit.text" }, nominal("topic", "Topic?", ["politics", "other"])],
      },
    ],
  });
  await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${created.id}/links`);
  const logged = async () =>
    (await coders(request, created.id))[0]?.display.map((d) => [d.keys, d.width ?? "", d.theme ?? ""].join(" ")) ?? [];

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/code/${created.id}?link=${link.secret}`);
  await question(page, "Topic?");
  await expect.poll(logged).toEqual([expect.stringMatching(/^numbers narrow (light|dark)$/)]);

  // A change of keys: recorded right away
  await shortcutStyle(page, "Fast type");
  await expect.poll(logged).toHaveLength(2);

  // Wide, then narrow again within 3 seconds: nothing; then wide for good: one entry
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForTimeout(500);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(3500);
  expect(await logged()).toHaveLength(2);
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect.poll(logged, { timeout: 8000 }).toHaveLength(3);
  expect((await logged())[2]).toMatch(/^letters wide/);
});

test("an instruction: behind the ? button or key, a dot until read; it can open by itself the first time", async ({
  page,
  request,
}) => {
  const created = await api<StudyResponse>(request, "POST", "/study", { name: "Instructions" });
  await api<UnitResponse[]>(request, "POST", `/study/${created.id}/units`, {
    units: TEXTS.map((text, i) => ({ externalId: `u${i + 1}`, data: { text } })),
  });
  const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, {
    items: [
      {
        type: "question",
        name: "intro",
        variable: { type: "confirm", question: "## Welcome\n\nRead each text, then answer two questions." },
      },
      {
        type: "unit_loop",
        children: [
          { type: "layout", template: "$unit.text" },
          { ...nominal("topic", "Topic?", ["politics", "other"]), instruction: "The topic with **most words**." },
          {
            ...nominal("tone", "Tone?", ["positive", "negative"]),
            instruction: "The tone of the *whole* text.",
            instructionOpen: "first",
          },
        ],
      },
    ],
  });
  await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${created.id}/links`);
  await page.goto(`/code/${created.id}?link=${link.secret}`);
  // Markdown with a heading: shown as written (the question's own heading)
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await at(page, TEXTS[0], "Topic?");

  // Not in the answer area: behind the ? button, with a dot until opened
  await expect(page.getByText("The topic with")).toHaveCount(0);
  const button = page.getByRole("button", { name: "Instruction" });
  await expect(button.getByLabel("Not read yet")).toBeVisible();
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("most words")).toBeVisible();
  // While open, answer keys don't reach the question
  await page.keyboard.press("1");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button.getByLabel("Not read yet")).toHaveCount(0);
  await page.keyboard.press("1");

  // Opens by itself the first time the question comes up
  await at(page, TEXTS[0], "Tone?");
  await expect(page.getByRole("dialog").getByText("whole")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("1");
  await at(page, TEXTS[1], "Topic?");
  await page.keyboard.press("1");
  await at(page, TEXTS[1], "Tone?");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the keyboard reaches Continue below a question with several answers", async ({ page, request }) => {
  const created = await api<StudyResponse>(request, "POST", "/study", { name: "Several answers" });
  const question_ = {
    type: "question",
    name: "topics",
    variable: {
      type: "nominal",
      multiple: true,
      question: "Topics?",
      options: [{ value: "politics" }, { value: "sports" }],
    },
  };
  const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, { items: [question_] });
  await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${created.id}/links`);
  await page.goto(`/code/${created.id}?link=${link.secret}`);
  await question(page, "Topics?");
  // Choose one with the arrows and Space, then down to Continue and Enter
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Continue (1)" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await answers(request, created.id)).length).toBe(1);
});

test("a dropdown: the arrows open it to browse; typing opens it with the filter", async ({ page, request }) => {
  const created = await api<StudyResponse>(request, "POST", "/study", { name: "Dropdown keys" });
  const country = {
    type: "question",
    name: "country",
    variable: {
      type: "nominal",
      layout: "dropdown",
      question: "Country?",
      options: ["Belgium", "Germany", "Netherlands", "Norway"].map((value) => ({ value })),
    },
  };
  const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, { items: [country] });
  await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${created.id}/links`);
  await page.goto(`/code/${created.id}?link=${link.secret}`);
  await question(page, "Country?");
  // Typing opens it with the filter
  await page.keyboard.type("neth");
  await expect(page.getByPlaceholder("Type to filter…")).toHaveValue("neth");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Escape");
  // The arrows open it, then browse it
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option")).toHaveCount(4);
  await expect(page.getByPlaceholder("Type to filter…")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await answers(request, created.id))[0]?.value.values?.[0]?.value).toBe("Germany");
});

test("a slider (auto from 7 values): Left / Right from the middle, End, Shift + Enter continues", async ({
  page,
  request,
}) => {
  const created = await api<StudyResponse>(request, "POST", "/study", { name: "Slider keys" });
  const score = {
    type: "question",
    name: "score",
    variable: { type: "numeric", question: "Score?", min: 1, max: 10 },
  };
  const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, { items: [score] });
  await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/study/${created.id}/links`);
  await page.goto(`/code/${created.id}?link=${link.secret}`);
  await question(page, "Score?");
  const slider = page.getByRole("slider", { name: "Value" });
  await expect(slider).toBeVisible();
  // Not answered yet: Shift + Enter does nothing
  await page.keyboard.press("Shift+Enter");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  // From the middle (5): Right twice is 7, Left once 6
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveValue("6");
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("10");
  // Also with the slider focused (clicked), the keys step once
  await slider.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveValue("9");
  await page.keyboard.press("Shift+Enter");
  await expect.poll(async () => (await answers(request, created.id))[0]?.value.values?.[0]?.value).toBe(9);
});
