import type { StudyResponse } from "@annotinder/contracts";
import { expect, test } from "./fixtures";
import { api, list, question } from "./helpers";

// The browser's Back and Forward work like the coding screen's own: they go to
// the previous question and to the next answered one (docs/client.md §4).

const nominal = (name: string, text: string) => ({
  type: "question",
  name,
  variable: { type: "nominal", question: text, options: [{ value: "yes" }, { value: "no" }] },
});

async function study(request: Parameters<typeof api>[0]): Promise<string> {
  const created = await api<StudyResponse>(request, "POST", "/study", { name: "Browser history" });
  const items = [nominal("first", "First?"), nominal("second", "Second?"), nominal("third", "Third?")];
  const design = await api<{ id: number }>(request, "POST", `/study/${created.id}/design`, { items });
  await api(request, "PUT", `/study/${created.id}/deployment`, { designVersionId: design.id });
  const [link] = await list<{ secret: string }>(request, `/study/${created.id}/links`);
  return `/code/${created.publicId}?link=${link.secret}`;
}

test("the browser's Back and Forward go to the previous and the next answered question", async ({ page, request }) => {
  await page.goto(await study(request));
  await question(page, "First?");
  await page.getByRole("button", { name: "yes", exact: true }).click();
  await question(page, "Second?");
  await page.getByRole("button", { name: "no", exact: true }).click();
  await question(page, "Third?");

  await page.goBack();
  await question(page, "Second?");
  await expect(page.getByRole("button", { name: "no", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await question(page, "First?");
  await expect(page.getByRole("button", { name: "yes", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.goForward();
  await question(page, "Second?");
  await expect(page.getByRole("button", { name: "no", exact: true })).toHaveAttribute("aria-pressed", "true");

  // The screen's own Previous goes through the history too: Back from the first question then leaves the page
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await question(page, "First?");
  await page.goBack();
  await expect(page).toHaveURL("about:blank");
});
