import { expect, test } from "./fixtures";
import type { StudyResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// The guide (docs/client.md §7, "Guide") and choosing who codes, which a
// design needs before it can be deployed.

test("a new design asks who codes first; it can't be deployed without", async ({ page, request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Who codes study" });
  await page.goto(`/research/studies/${study.id}/design`);
  await expect(page.getByRole("heading", { name: "Who codes?" })).toBeVisible();
  await expect(page.getByText("who codes? Choose first")).toBeVisible();
  await page.getByRole("radio", { name: /Crowd \(one link\)/ }).click();
  // Its form opens, with the choice made
  await expect(page.getByRole("radio", { name: /Crowd \(one link\)/ }).first()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("who codes? Choose first")).toHaveCount(0);

  // Saved without it, the server refuses to deploy it
  const other = await api<StudyResponse>(request, "POST", "/study", { name: "Unchosen" });
  const res = await request.fetch(`/api/study/${other.id}/design`, {
    method: "POST",
    headers: { "x-dev-role": "ADMIN", "x-dev-email": "dev@example.com", "content-type": "application/json" },
    data: JSON.stringify({ items: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }] }),
  });
  const version = (await res.json()) as { id: number };
  const deploy = await request.fetch(`/api/study/${other.id}/deployment`, {
    method: "PUT",
    headers: { "x-dev-role": "ADMIN", "x-dev-email": "dev@example.com", "content-type": "application/json" },
    data: JSON.stringify({ designVersionId: version.id }),
  });
  expect(deploy.status()).toBe(400);
  expect(await deploy.text()).toContain("Choose who codes");
});

test("the guide explains a page on the sample study, and Show me points at the real button", async ({
  page,
  request,
}) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Guided study" });
  await page.goto(`/research/studies/${study.id}/units`);
  await page.getByRole("button", { name: "Guide" }).click();
  await page.getByRole("menuitem", { name: /This page: Units/ }).click();
  const guide = page.getByRole("dialog");
  await expect(guide.getByRole("heading", { name: "What coders code" })).toBeVisible();
  // The sample, drawn with the real page
  await expect(guide.getByRole("img", { name: "The sample study" })).toContainText("Parliament votes");
  await guide.getByRole("button", { name: "Show me" }).click();
  await expect(guide).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Upload a CSV" })).toBeVisible();
  await page.getByRole("button", { name: "Back to the guide" }).click();
  await expect(page.getByRole("heading", { name: "What coders code" })).toBeVisible();

  // The full guide goes through every topic, with its own buttons
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Guide" }).click();
  await page
    .getByRole("menuitem", { name: /The full guide/ })
    .first()
    .click();
  await expect(page.getByText("The design (1 of 9)")).toBeVisible();
  await page
    .getByRole("button", { name: /Who codes/ })
    .last()
    .click();
  await expect(page.getByRole("heading", { name: "Specific coders or a crowd" })).toBeVisible();
  await page.getByRole("button", { name: "Show me" }).click();
  // Show me went to the Design page
  await expect(page).toHaveURL(/\/design$/);
  await expect(page.getByRole("status").filter({ hasText: "Who codes: open it to choose" })).toBeVisible();
});
