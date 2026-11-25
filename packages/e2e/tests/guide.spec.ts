import { expect, test } from "./fixtures";
import type { StudyResponse } from "@annotinder/contracts";
import { DEV_HEADERS, addCoders, api, createStudy, list } from "./helpers";

// The guide (docs/client.md §7, "Guide"), and who codes: chosen in the
// design's Who codes, recorded and fixed by the study's first deploy.

const QUESTION = { type: "question", name: "q", variable: { type: "confirm", question: "?" } };

test("who codes is chosen in the design; a crowd's first deploy deletes leftover expert coders and fixes it", async ({
  page,
  request,
}) => {
  await page.goto("/research");
  await page.getByRole("button", { name: /Create new study/ }).click();
  await page.getByRole("menuitem", { name: /Empty study/ }).click();
  // Making a study doesn't ask who codes
  await expect(page.getByRole("radio")).toHaveCount(0);
  await createStudy(page, "Who codes study");
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  const study = (await list<StudyResponse>(request, "/study")).find((s) => s.name === "Who codes study")!;
  expect(study.coderKind).toBeNull();
  await addCoders(request, study.id, ["anna", "bob", "carl"]);
  await api(request, "POST", `/study/${study.id}/units`, { units: [{ externalId: "u1", data: { text: "A text" } }] });

  // A new design has no invitation: two cards to choose from, and the choice can be changed
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page.getByText("who codes? Choose first")).toBeVisible();
  await page.getByRole("button", { name: /^Who codes/ }).click();
  await page.getByRole("radio", { name: /^Expert coders/ }).click();
  await expect(page.getByText("expert coders, a link each").first()).toBeVisible();
  await page.getByRole("radio", { name: /^Crowd/ }).click();
  await expect(page.getByText("crowd, one link").first()).toBeVisible();
  // A crowd while the study has expert coders: said, with the way to delete them
  const unused = page.getByRole("status").filter({ hasText: "3 expert coders aren't used by this design" });
  await expect(unused).toBeVisible();
  await expect(unused.getByRole("button", { name: "Delete them" })).toBeVisible();

  // The Coders page follows the draft design (here a crowd's, saved through the API), and says the same
  const design = await api<{ id: number }>(request, "POST", `/study/${study.id}/design`, { items: [QUESTION] });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.goto(`/research/studies/${study.id}/coders`);
  await expect(unused).toBeVisible();
  expect((await api<StudyResponse>(request, "GET", `/study/${study.id}`)).coderKind).toBeNull();

  // The first deploy says beforehand that it deletes them, records the kind, and fixes it
  await page.goto(`/research/studies/${study.id}/deploy`);
  await expect(page.getByText(/3 expert coders aren't used and will be deleted/)).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Deploy", exact: true }).click();
  await expect
    .poll(async () => (await api<StudyResponse>(request, "GET", `/study/${study.id}`)).coderKind)
    .toBe("crowd");
  expect(await list(request, `/study/${study.id}/coders`)).toEqual([]);
  expect(
    (await api<{ designVersionId: number }>(request, "GET", `/study/${study.id}/deployment`)).designVersionId,
  ).toBe(design.id);
  await page.goto(`/research/studies/${study.id}/design`);
  await page.getByRole("button", { name: /^Who codes/ }).click();
  await expect(page.getByText(/Fixed since the first deploy/)).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Expert coders/ })).toHaveCount(0);
});

test("deploying needs who codes; after the first deploy a design for the other kind can't be deployed", async ({
  request,
}) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "A crowd's study" });
  /** Saves a design as it is given (the `api` helper would choose a crowd), and tries to deploy it. */
  const deployed = async (session: object) => {
    const res = await request.fetch(`/api/study/${study.id}/design`, {
      method: "POST",
      headers: DEV_HEADERS,
      data: JSON.stringify({ session, items: [QUESTION] }),
    });
    const version = (await res.json()) as { id: number; valid: boolean };
    const deploy = await request.fetch(`/api/study/${study.id}/deployment`, {
      method: "PUT",
      headers: DEV_HEADERS,
      data: JSON.stringify({ designVersionId: version.id }),
    });
    return { valid: version.valid, status: deploy.status(), text: await deploy.text() };
  };
  const unchosen = await deployed({});
  expect(unchosen).toMatchObject({ valid: true, status: 400 });
  expect(unchosen.text).toContain("Choose who codes first");

  expect((await deployed({ invite: { mode: "crowd" } })).status).toBe(200);
  expect((await api<StudyResponse>(request, "GET", `/study/${study.id}`)).coderKind).toBe("crowd");
  const other = await deployed({ invite: { mode: "coders", link: "per_coder" } });
  expect(other).toMatchObject({ valid: false, status: 400 });
  expect(other.text).toContain("This study has a crowd since its first deploy, but the design invites expert coders");
});

test("the guide opens on the page's section, where it was; Show me points at the real button", async ({
  page,
  request,
}) => {
  const study = await api<StudyResponse>(request, "POST", "/study", { name: "Guided study" });
  // A design with expert coders: the Coders page has the buttons to add them
  await api(request, "POST", `/study/${study.id}/design`, {
    session: { invite: { mode: "coders", link: "per_coder" } },
    items: [QUESTION],
  });
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
  await expect(page.getByRole("status").filter({ hasText: "Who codes: expert coders or a crowd" })).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  // Opened again on this page: where it was
  await page.getByRole("button", { name: "Guide" }).click();
  await expect(guide.getByRole("heading", { name: /Two modes/ })).toBeVisible();

  // The Coders page has its own section: its Show me points at that page's buttons
  await guide
    .getByRole("navigation", { name: "Guide" })
    .getByRole("button", { name: /Making a coder set/ })
    .click();
  await expect(guide.getByRole("heading", { name: "Making a coder set" })).toBeVisible();
  await guide.getByRole("button", { name: "Show me" }).click();
  await expect(page).toHaveURL(/\/coders$/);
  await expect(
    page.getByRole("status").filter({ hasText: /^Make coder set: Select coders, Manage coders(?!:)/ }),
  ).toBeVisible();
});
