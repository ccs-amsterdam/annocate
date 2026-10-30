import { expect, test } from "@playwright/test";
import type { CodebookResponse, JobResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// The codebook editor, step by step as "Your first job" (help) describes it.

test("writing a codebook in the editor, as the help describes it, and saving it", async ({ page, request }) => {
  const job = await api<JobResponse>(request, "POST", "/job", { name: "Editor test" });
  await api(request, "POST", `/job/${job.id}/units`, {
    units: [{ externalId: "a1", data: { headline: "Storm hits the coast", text: "Heavy rain." } }],
  });
  await page.goto("/");
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
  await page.getByLabel("Who codes which units").selectOption({ label: "All units" });
  await expect(page.getByText("to specify")).toHaveCount(0);

  // The first question, inside the loop: the row's "+", then where, then what
  await page.getByRole("button", { name: "Add an item below" }).first().click();
  await page.getByRole("button", { name: "Inside News articles" }).click();
  await page.getByRole("button", { name: /^Question/ }).first().click();
  await page.getByPlaceholder("e.g. sentiment, age").fill("topic");
  // A new question has no answer type yet
  await page.locator("select").filter({ hasText: "Choose an answer type" }).selectOption({ label: "Nominal (categories)" });
  await page.getByPlaceholder(/The question coders see/).fill("What is this article mainly about?");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => (await api<CodebookResponse[]>(request, "GET", `/job/${job.id}/codebook`)).length, { timeout: 10_000 })
    .toBe(1);
  const [saved] = await api<{ id: number }[]>(request, "GET", `/job/${job.id}/codebook`);
  const { items } = await api<CodebookResponse>(request, "GET", `/job/${job.id}/codebook/${saved.id}`);
  expect(items).toMatchObject([
    { type: "unit_loop", label: "News articles", units: [{ mode: "all", unitset: "__all__" }], children: [{ name: "topic", variable: { type: "nominal", question: "What is this article mainly about?" } }] },
  ]);
});
