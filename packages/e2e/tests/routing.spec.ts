import { expect, test } from "./fixtures";
import type { JobResponse } from "@annotinder/contracts";
import { answers, api, coders, fromExample, question } from "./helpers";

// The app's pages have URLs (docs/client.md §1): a reload stays where it
// was, and leaving the editor with unsaved edits asks first.

test("the welcome page leads to the researcher and annotator sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AnnoTinder" })).toBeVisible();
  await page.getByRole("link", { name: /I'm an annotator/ }).click();
  await expect(page).toHaveURL(/\/code$/);
  await expect(page.getByText("Start from a link")).toBeVisible();
  await page.getByRole("link", { name: "AnnoTinder home" }).click();
  await page.getByRole("link", { name: /I'm a researcher/ }).click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByRole("button", { name: /Create new job/ })).toBeVisible();
});

test("a job's tabs are URLs: a reload stays; leaving unsaved edits asks first", async ({ page, request }) => {
  const job = await api<JobResponse>(request, "POST", "/job", { name: "Routed job" });
  await page.goto("/research");
  await page.getByText("Routed job").click();
  await expect(page).toHaveURL(new RegExp(`/research/jobs/${job.id}/overview$`));
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/research/jobs/${job.id}/editor$`));
  await page.reload();
  await expect(page.getByRole("button", { name: /Add item/ })).toBeVisible();

  // An unsaved edit: going elsewhere (a tab, the browser's back button) asks first
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: /^Question/ }).first().click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unsaved Changes" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Unsaved Changes" })).toBeVisible();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/research/jobs/${job.id}/overview$`));
});

test("the annotator's home lists the studies this browser takes part in, to continue them", async ({ page, request }) => {
  const { job, link } = await fromExample(request, "swipe-sentiment");
  const examples = (await coders(request, job.id)).map((c) => c.id);
  await page.goto("/code");
  await expect(page.getByText("Start from a link")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your studies" })).toHaveCount(0);

  // Code a unit through the link, then go home: the study is there
  await page.goto(link);
  await question(page, "Is this headline good news or bad news?");
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await answers(request, job.id)).filter((a) => !examples.includes(a.coderId) && a.unitId !== null).length).toBe(1);
  await page.goto("/code");
  const card = page.getByRole("link", { name: new RegExp(job.name) });
  await expect(card).toContainText("1 unit done");
  // Continue: the same session, without the link
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/code/${job.id}$`));
  await question(page, "Is this headline good news or bad news?");
});
