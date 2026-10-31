import { expect, test } from "@playwright/test";
import type { JobResponse, SetGroupResponse } from "@annotinder/contracts";
import { answers, api, question } from "./helpers";

// Sets and links (docs/plans/sets-and-session-parameters.md): a sets column
// in the CSV makes a group, a link parameter with the group's sets makes a
// link per set, and a coder gets their link's set, with the overlap.

test("a sets column makes a group; a link per set; a coder codes their link's set and the overlap", async ({ page, request, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Create new job/ }).click();
  await page.getByRole("menuitem", { name: /Empty job/ }).click();
  await page.getByPlaceholder(/Sentiment Analysis/).fill("Expert coders");
  await page.getByRole("button", { name: "Create Job" }).click();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  const job = (await api<JobResponse[]>(request, "GET", "/job")).find((j) => j.name === "Expert coders")!;

  // Units, with a sets column: its name is the group
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByRole("button", { name: /Upload CSV/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "articles.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,text,part\nu1,First text,s1\nu2,Second text,s2\nu3,Shared text,_overlap\n"),
  });
  await page.getByRole("button", { name: /Use column names/ }).click();
  await page.getByLabel("Type of part").selectOption("sets");
  await page.getByRole("button", { name: /Upload 3 units/ }).click();
  await expect(page.getByRole("button", { name: /^s2 1$/ })).toBeVisible();
  const [group] = await api<SetGroupResponse[]>(request, "GET", `/job/${job.id}/sets`);
  expect(group.name).toBe("part");
  expect(group.sets.map((s) => [s.name, s.unitIds.length])).toEqual([
    ["_overlap", 1],
    ["s1", 1],
    ["s2", 1],
  ]);

  // A codebook that gives each set its own link, with the overlap first
  const codebook = await api<{ id: number }>(request, "POST", `/job/${job.id}/codebook`, {
    items: [
      { type: "session", params: [{ name: "part", kind: "link", values: { sets: "part" } }] },
      {
        type: "unit_loop",
        units: [{ mode: "assign", group: "part", from: { session: "part" }, overlap: { placement: "first" } }],
        layout: { template: "$unit.text" },
        children: [{ type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] } }],
      },
    ],
  });
  await api(request, "PUT", `/job/${job.id}/deployment`, { codebookId: codebook.id });

  // The Invitations tab lists a link per set
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await page.getByRole("button", { name: "Invitations", exact: true }).click();
  await expect(page.getByRole("cell", { name: "part=s1" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "part=s2" })).toBeVisible();
  const links = await api<{ secret: string; params: Record<string, string> }[]>(request, "GET", `/job/${job.id}/invites`);
  const s2 = links.find((l) => l.params.part === "s2")!;

  // A coder with the s2 link: the overlap unit, then their own
  const coder = await (await browser.newContext()).newPage();
  await coder.goto(`/?deployment=${job.id}&invite=${s2.secret}`);
  for (const text of ["Shared text", "Second text"]) {
    await question(coder, "Topic?");
    await expect(coder.getByText(text)).toBeVisible();
    await coder.getByRole("button", { name: /politics/ }).click();
  }
  await expect(coder.getByText(/completed|Thank you/i).first()).toBeVisible();
  await expect.poll(async () => (await answers(request, job.id)).length).toBe(2);

  // More units, without the sets column: added to the existing sets on request
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByRole("button", { name: /Upload CSV/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "more.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,text\nu4,Fourth text\nu5,Fifth text\n"),
  });
  await page.getByLabel("New units in group part").selectOption("distribute");
  await page.getByRole("button", { name: /Upload 2 units/ }).click();
  await expect
    .poll(async () => (await api<SetGroupResponse[]>(request, "GET", `/job/${job.id}/sets`))[0].sets.map((s) => [s.name, s.unitIds.length]))
    .toEqual([
      ["_overlap", 1],
      ["s1", 2],
      ["s2", 2],
    ]);
});
