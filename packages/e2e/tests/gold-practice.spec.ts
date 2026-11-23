import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { coders, fromExample, question } from "./helpers";

// The example with practice and gold units (server/examples/gold-practice.json):
// practice headlines give feedback when an answer is wrong, gold headlines are
// checked silently, and two wrong gold answers end the session at a screen-out.

interface ExampleUnit {
  id: string;
  data: { headline: string; answer_topic?: string; answer_clickbait?: string };
}
const example = JSON.parse(
  readFileSync(new URL("../../server/examples/gold-practice.json", import.meta.url), "utf8"),
) as { units: ExampleUnit[]; sets: { sets: { name: string; units: string[] }[] }[] };
const kind = (id: string) => example.sets[0].sets.find((s) => s.units.includes(id))?.name ?? "coding";
const byHeadline = new Map(example.units.map((u) => [u.data.headline, u]));

const TOPIC = "What is this headline mainly about?";
const LABELS: Record<string, string> = {
  politics: "Politics",
  economy: "Economy",
  crime: "Crime",
  sports: "Sports",
  culture: "Culture",
  other: "Other",
};

/**
 * The unit on screen (by its headline), once it differs from the previous
 * one. The topic's instruction opens by itself on practice units: closed
 * first (while open, the page behind it is hidden).
 */
async function currentUnit(page: Page, previous: string | null): Promise<ExampleUnit> {
  let found: ExampleUnit | undefined;
  await expect
    .poll(async () => {
      if (await page.getByRole("dialog").isVisible()) await page.keyboard.press("Escape");
      const headings = await page.getByRole("heading", { level: 1 }).allTextContents();
      found = headings.map((h) => byHeadline.get(h.trim())).find((u) => u !== undefined);
      return found && found.id !== previous ? found.id : null;
    })
    .not.toBeNull();
  return found!;
}

test("practice headlines give feedback until right; two wrong gold headlines screen the coder out", async ({
  page,
  request,
}) => {
  const { study, link } = await fromExample(request, "gold-practice");
  const examples = (await coders(request, study.id)).map((c) => c.id);
  await page.goto(link);
  await page.getByRole("button", { name: "Yes, start" }).click();

  // On practice units the topic's instruction opens by itself (again after feedback): closed first
  const answer = async (label: string) => {
    await page.waitForTimeout(250);
    if (await page.getByRole("dialog").isVisible()) await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("button", { name: label, exact: true }).click();
  };
  let previous: string | null = null;
  let practiced = 0;
  let goldWrong = 0;
  for (let step = 0; step < 25 && goldWrong < 2; step++) {
    await question(page, TOPIC);
    const unit = await currentUnit(page, previous);
    previous = unit.id;
    await expect(page.getByRole("dialog")).toBeHidden();
    const set = kind(unit.id);

    if (set === "practice") {
      // The practice headlines come first, marked as such
      await expect(page.getByText("Practice headline.")).toBeVisible();
      const right = unit.data.answer_topic!.split("|")[0];
      if (practiced === 0) {
        // A wrong answer: the unit's own feedback, and the coder answers again
        await answer(right === "other" ? "Politics" : "Other");
        await expect(page.getByText("Not quite")).toBeVisible();
        await expect(page.getByText("A decision of the city council is politics")).toBeVisible();
      }
      await answer(LABELS[right]);
      await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
      practiced++;
      // The clickbait question, answered right
      await question(page, "Is this headline clickbait?");
      await answer(unit.data.answer_clickbait === "yes" ? "Clickbait (swipe right)" : "No (swipe left)");
    } else {
      expect(practiced).toBe(4);
      await expect(page.getByText("Practice headline.")).toHaveCount(0);
      // Gold headlines look like the others: answered wrongly here
      const wrong = set === "gold" && unit.data.answer_topic !== "culture" ? "Culture" : "Other";
      await answer(set === "gold" ? wrong : "Other");
      await question(page, "Is this headline clickbait?");
      await answer("No (swipe left)");
      if (set === "gold") goldWrong++;
    }
  }
  expect(goldWrong).toBe(2);
  await expect(page.getByText("This is where the study ends for you.")).toBeVisible();

  // Screened out; the special units they finished are counted (Results › Coders)
  const mine = (await coders(request, study.id)).filter((c) => !examples.includes(c.id));
  expect(mine).toHaveLength(1);
  expect(mine[0].ended).toMatchObject({ item: "screened_out", outcome: "screenout" });
  expect(mine[0].special).toMatchObject({
    practice: { done: 4 },
    gold: { done: 2 },
  });
});

test("the example's layout marks practice headlines with $unit.test_set, a unit's own value", async ({
  page,
  request,
}) => {
  const { study } = await fromExample(request, "gold-practice");
  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: "The headline" }).click();
  // The editor knows it (as $unit.id): no warning once the unit fields are in
  await page.waitForLoadState("networkidle");
  const warnings = page.getByRole("button", { name: /\d+ warnings?/ });
  if ((await warnings.count()) > 0) await warnings.click();
  await expect(page.getByText(/is not a unit field/)).toHaveCount(0);
});
