import { expect, test } from "./fixtures";
import type { StudyResponse } from "@annotinder/contracts";
import { DEV_HEADERS, api, createStudy, list } from "./helpers";

// The guide (docs/client.md §7, "Guide"), and who codes: chosen when a
// study is made, changed in its Settings until its first deploy.

test("who codes is chosen when a study is made; its Settings change it until the first deploy", async ({
  page,
  request,
}) => {
  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /Empty study/ }).click();
  // Not without the choice
  await page.getByPlaceholder(/Sentiment Analysis/).fill("Who codes study");
  await expect(page.getByRole("button", { name: "Create Study" })).toBeDisabled();
  await createStudy(page, "Who codes study", "Expert coders");
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  const study = (await list<StudyResponse>(request, "/study")).find((s) => s.name === "Who codes study")!;
  expect(study.coderKind).toBe("expert");

  // The editor starts the design for expert coders; the form doesn't offer the other kind
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page.getByText("expert coders, a link each").first()).toBeVisible();
  await page.getByRole("button", { name: /^Who codes/ }).click();
  await expect(page.getByRole("radio", { name: /Crowd/ })).toHaveCount(0);

  // Settings: a crowd instead, before anything is deployed
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: /^Crowd/ }).click();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Settings saved successfully.")).toBeVisible();
  expect((await api<StudyResponse>(request, "GET", `/study/${study.id}`)).coderKind).toBe("crowd");

  // Deployed: fixed, in Settings and for the server
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, {
    items: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }],
  });
  await api(request, "PUT", `/study/${study.id}/deployment`, { designVersionId: design.id });
  await page.reload();
  await expect(page.getByText(/Fixed since the study's first deploy/)).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Expert coders/ })).toBeDisabled();
  const refused = await request.fetch(`/api/study/${study.id}`, {
    method: "PUT",
    headers: DEV_HEADERS,
    data: JSON.stringify({ name: study.name, coderKind: "expert" }),
  });
  expect(refused.status()).toBe(409);
  expect(await refused.text()).toContain("coder_kind_locked");
});

test("a design that invites the other kind of coders can't be deployed", async ({ request }) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "A crowd's study" });
  const res = await request.fetch(`/api/study/${study.id}/design`, {
    method: "POST",
    headers: DEV_HEADERS,
    data: JSON.stringify({
      session: { invite: { mode: "coders", link: "per_coder" } },
      items: [{ type: "question", name: "q", variable: { type: "confirm", question: "?" } }],
    }),
  });
  const version = (await res.json()) as { id: number; valid: boolean };
  expect(version.valid).toBe(false);
  const deploy = await request.fetch(`/api/study/${study.id}/deployment`, {
    method: "PUT",
    headers: DEV_HEADERS,
    data: JSON.stringify({ designVersionId: version.id }),
  });
  expect(deploy.status()).toBe(400);
  expect(await deploy.text()).toContain("This study has a crowd, but the design invites expert coders");
});

test("the guide opens on the page's section, where it was; Show me points at the real button", async ({
  page,
  request,
}) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Guided study" });
  await page.goto(`/research/studies/${study.id}/units`);
  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog");
  await expect(guide.getByRole("heading", { name: "What coders code" })).toBeVisible();
  // The sample, drawn with the real page
  await expect(guide.getByRole("img", { name: "The sample study" })).toContainText("Parliament votes");
  await guide.getByRole("button", { name: "Show me" }).click();
  await expect(guide).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Upload a CSV" })).toBeVisible();
  await page.getByRole("button", { name: "Back to the guide" }).click();
  await expect(page.getByRole("heading", { name: "What coders code" })).toBeVisible();

  // Its menu goes to any step; Show me goes to the step's page
  await guide
    .getByRole("navigation", { name: "Guide" })
    .getByRole("button", { name: /Two modes/ })
    .click();
  await expect(guide.getByRole("heading", { name: /Two modes/ })).toBeVisible();
  await guide.getByRole("button", { name: "Show me" }).click();
  await expect(page).toHaveURL(/\/design$/);
  await expect(page.getByRole("status").filter({ hasText: "Who codes: how the study's coders get in" })).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  // Opened again on this page: where it was
  await page.getByRole("button", { name: "Guide" }).click();
  await expect(guide.getByRole("heading", { name: /Two modes/ })).toBeVisible();
});
