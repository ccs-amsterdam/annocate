import { expect, test } from "./fixtures";
import type { DesignVersion, StudyResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// The codebook editor, step by step as "Your first study" (help) describes it.

test("writing a codebook in the editor, as the help describes it, and saving it", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Editor test" });
  await api(request, "POST", `/study/${study.id}/units`, {
    units: [{ externalId: "a1", data: { headline: "Storm hits the coast", text: "Heavy rain." } }],
  });
  await page.goto("/research");
  await page.getByText("Editor test").click();
  await page.getByRole("button", { name: "Design", exact: true }).click();

  // A unit loop
  // (Form labels aren't tied to their fields yet: placeholders find them.)
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: /^Unit Loop/ }).click();
  await page.getByPlaceholder("e.g. News items").fill("News articles");
  // A new loop's units are to specify: every coder codes every unit
  await expect(page.getByText("to specify")).toHaveCount(1);
  await page.getByRole("tab", { name: /Units/ }).click();
  await page.getByLabel("Who codes which units").selectOption({ label: "Everyone codes everything" });
  await expect(page.getByText("to specify")).toHaveCount(0);

  // The first question, inside the loop: the row's "+", then where, then what
  // (the first row is the Study entry, always there; the loop is the second)
  await page.getByRole("button", { name: "Add an item below" }).nth(1).click();
  await page.getByRole("button", { name: "Inside News articles" }).click();
  await page.getByRole("button", { name: /^Question/ }).first().click();
  await page.getByPlaceholder("e.g. sentiment, age").fill("topic");
  // A new question has no answer type yet
  await page.locator("select").filter({ hasText: "Choose an answer type" }).selectOption({ label: "Nominal (categories)" });
  await page.getByPlaceholder(/The question coders see/).fill("What is this article mainly about?");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await api<DesignVersion[]>(request, "GET", `/study/${study.id}/design`)).length, { timeout: 10_000 })
    .toBe(1);
  const [saved] = await api<{ id: number }[]>(request, "GET", `/study/${study.id}/design`);
  const { items } = await api<DesignVersion>(request, "GET", `/study/${study.id}/design/${saved.id}`);
  expect(items).toMatchObject([
    { type: "unit_loop", label: "News articles", units: [{ mode: "all" }], children: [{ name: "topic", variable: { type: "nominal", question: "What is this article mainly about?" } }] },
  ]);
});
