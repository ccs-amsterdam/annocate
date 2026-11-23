import { expect, test } from "./fixtures";
import type { StudyResponse } from "@annotinder/contracts";
import { answers, api, coders, fromExample, question } from "./helpers";

// The app's pages have URLs (docs/client.md §1): a reload stays where it
// was, and leaving the editor with unsaved edits asks first.

test("the welcome page leads to the researcher and coder sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AnnoTinder" })).toBeVisible();
  await page.getByRole("link", { name: /I'm a coder/ }).click();
  await expect(page).toHaveURL(/\/code$/);
  await expect(page.getByText("Start from a link")).toBeVisible();
  await page.getByRole("link", { name: "AnnoTinder home" }).click();
  await page.getByRole("link", { name: /I'm a researcher/ }).click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByRole("button", { name: /Create new study/ })).toBeVisible();
});

test("a study's pages are URLs: a reload stays; leaving unsaved edits asks first", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Routed study" });
  await page.goto("/research");
  await page.getByText("Routed study").click();
  await expect(page).toHaveURL(new RegExp(`/research/studies/${study.id}/overview$`));
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/research/studies/${study.id}/design$`));
  await page.reload();
  await expect(page.getByRole("button", { name: /Add item/ })).toBeVisible();

  // An unsaved edit: going elsewhere (another page, the browser's back button) asks first
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: /^Question\b/ }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unsaved Changes" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/design$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Unsaved Changes" })).toBeVisible();
  await page.getByRole("button", { name: "Discard changes" }).click();
  // Back where the researcher came from
  await expect(page).toHaveURL(new RegExp(`/research/studies/${study.id}/overview$`));
});

test("the coder home lists the studies this browser takes part in, to continue them", async ({ page, request }) => {
  const { study, link } = await fromExample(request, "swipe-sentiment");
  const examples = (await coders(request, study.id)).map((c) => c.id);
  await page.goto("/code");
  await expect(page.getByText("Start from a link")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your studies" })).toHaveCount(0);

  // Code a unit through the link, then go home: the study is there
  await page.goto(link);
  await question(page, "Is this headline good news or bad news?");
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(
      async () =>
        (await answers(request, study.id)).filter((a) => !examples.includes(a.sessionId) && a.unitId !== null).length,
    )
    .toBe(1);
  await page.goto("/code");
  // Shown by the design's public title, never the study's (private) name
  const card = page.getByRole("link", { name: /Good news, bad news/ });
  await expect(page.getByText(study.name)).toHaveCount(0);
  await expect(card).toContainText("1 unit done");
  // Continue: the same session, without the link
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/code/${study.id}$`));
  await question(page, "Is this headline good news or bad news?");
});

test("on a phone the editor shows one pane at a time: the tree, then an item with a way back", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { study } = await fromExample(request, "simple-survey");
  await page.goto(`/research/studies/${study.id}/design`);
  const tree = page.getByText(/^Items \(\d+\)$/);
  await expect(tree).toBeVisible();
  // The title above the tree; the session settings open their form, full width, without the tree
  await expect(page.getByLabel("Title shown to coders", { exact: true })).toHaveValue("A short survey");
  await page.getByRole("button", { name: /^URL parameters/ }).click();
  await expect(page.getByRole("button", { name: /URL parameter$/ })).toBeVisible();
  await expect(tree).toBeHidden();
  await page.getByRole("button", { name: "Back to the items" }).click();
  await expect(tree).toBeVisible();
});

test("the headers hide when scrolling down a long page, and come back when scrolling up anywhere", async ({
  page,
  request,
}) => {
  const study = await api<{ id: number }>(request, "POST", "/study", { name: "Long units list" });
  await api(request, "POST", `/study/${study.id}/units`, {
    units: Array.from({ length: 80 }, (_, i) => ({ externalId: `u${i}`, data: { text: `text ${i}` } })),
  });
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto(`/research/studies/${study.id}/units`);
  await expect(page.getByText("text 0", { exact: true })).toBeVisible();
  const hidden = page.locator("[data-collapsed]");
  await page.mouse.move(600, 500);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
  await expect(hidden).toHaveCount(2);
  // Up, over a part of the page that doesn't scroll
  await page.mouse.move(5, 650);
  await page.mouse.wheel(0, -120);
  await expect(hidden).toHaveCount(0);
});
