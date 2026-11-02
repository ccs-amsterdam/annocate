import { expect, test } from "./fixtures";
import type { JobResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// Everything is a draft until deployed (docs/plans/design.md §5): units and
// sets too. Coders get the deployed snapshot.

test("new units are drafts until deployed: the bar, the dialog, and then coders get them", async ({ page, request, browser }) => {
  const job = await api<JobResponse>(request, "POST", "/job", { name: "Draft units" });
  await api(request, "POST", `/job/${job.id}/units`, { units: [{ externalId: "a1", data: { text: "First text" } }] });
  const codebook = await api<{ id: number }>(request, "POST", `/job/${job.id}/design`, {
    items: [
      {
        type: "unit_loop",
        units: [{ mode: "all" }],
        layout: { template: "$unit.text" },
        children: [{ type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] } }],
      },
    ],
  });
  await api(request, "PUT", `/job/${job.id}/deployment`, { designVersionId: codebook.id });
  await api(request, "POST", `/job/${job.id}/units`, { units: [{ externalId: "a2", data: { text: "Second text" } }] });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/job/${job.id}/links`);

  // A coder gets only the deployed unit
  const coder = await (await browser.newContext()).newPage();
  await coder.goto(`/?deployment=${job.id}&invite=${link.secret}`);
  await expect(coder.getByText("First text")).toBeVisible();
  await coder.getByRole("button", { name: "1 politics" }).click();
  await expect(coder.getByText(/completed|Thank you/i).first()).toBeVisible();

  // The researcher sees what isn't deployed, and deploys the units
  await page.goto("/");
  await page.getByText("Draft units").click();
  await expect(page.getByText(/Not deployed yet:.*1 added/)).toBeVisible();
  await page.getByRole("button", { name: "Deploy…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Units and sets: 1 added")).toBeVisible();
  await dialog.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(page.getByText(/Not deployed yet/)).toBeHidden();
  const versions = await api<{ version: number; changes: unknown }[]>(request, "GET", `/job/${job.id}/deployment/versions`);
  expect(versions[0]).toMatchObject({ version: 2, changes: { codebook: false, units: { added: 1 } } });

  // A new coder gets both
  const second = await (await browser.newContext()).newPage();
  await second.goto(`/?deployment=${job.id}&invite=${link.secret}`);
  await expect(second.getByText("First text")).toBeVisible();
  await second.getByRole("button", { name: "1 politics" }).click();
  await expect(second.getByText("Second text")).toBeVisible();
});

test("the design's unit fields: how the codebook uses each, removing an unused one", async ({ page, request }) => {
  const job = await api<JobResponse>(request, "POST", "/job", { name: "Field use" });
  await api(request, "POST", `/job/${job.id}/units`, { units: [{ externalId: "a1", data: { text: "Hello", year: 2020, note: "x" } }] });
  const [draft] = await api<{ id: number }[]>(request, "GET", `/job/${job.id}/design`);
  const { units } = await api<{ units: unknown }>(request, "GET", `/job/${job.id}/design/${draft.id}`);
  await api(request, "PUT", `/job/${job.id}/design/${draft.id}`, {
    units,
    items: [
      {
        type: "unit_loop",
        units: [{ mode: "all" }],
        layout: { template: "$unit.text" },
        children: [
          { type: "condition", condition: { script: "$unit.year > 2000" }, children: [
            { type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options: [{ value: "a" }, { value: "b" }] } },
          ] },
        ],
      },
    ],
  });

  await page.goto("/");
  await page.getByText("Field use").click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByRole("button", { name: "Details" }).click();
  const row = (name: string) => page.locator("tr", { has: page.locator("td.font-mono", { hasText: new RegExp(`^${name}$`) }) });
  await expect(row("text")).toContainText("shown");
  await expect(row("year")).toContainText("sent, not shown");
  await expect(row("note")).toContainText("not used");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Remove field note" }).click();
  await expect(row("note")).toHaveCount(0);
  expect((await api<{ name: string }[]>(request, "GET", `/job/${job.id}/units/fields`)).map((f) => f.name)).toEqual(["text", "year"]);
});

test("the codebook as a document: what coders see", async ({ page, request }) => {
  const job = await api<JobResponse>(request, "POST", "/job", { name: "Codebook export" });
  await api(request, "POST", `/job/${job.id}/design`, {
    items: [{ type: "question", name: "age", variable: { type: "numeric", question: "How old are you?", min: 18 } }],
  });
  await page.goto("/");
  await page.getByText("Codebook export").click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("codebook.md");
  const text = await new Promise<string>((resolve, reject) => {
    void file.createReadStream().then((stream) => {
      let out = "";
      stream.on("data", (c) => (out += String(c)));
      stream.on("end", () => resolve(out));
      stream.on("error", reject);
    });
  });
  expect(text).toContain("## age: How old are you?");
});

test("panel return links are settings of the run, filled in for coders", async ({ page, request }) => {
  const job = await api<JobResponse>(request, "POST", "/job", { name: "Panel run" });
  await api(request, "POST", `/job/${job.id}/design`, {
    items: [
      { type: "question", name: "ok", variable: { type: "confirm", question: "Ready?" } },
      { type: "end", name: "done", outcome: "complete", redirectSetting: "panel_done" },
    ],
  });
  await page.goto("/");
  await page.getByText("Panel run").click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("URL for panel_done").fill("https://panel.example/done");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect.poll(async () => (await api<JobResponse>(request, "GET", `/job/${job.id}`)).redirectUrls).toEqual({ panel_done: "https://panel.example/done" });
});

test("a link per value of a URL parameter, built in the browser", async ({ page, request }) => {
  const job = await api<JobResponse>(request, "POST", "/job", { name: "Schools" });
  const codebook = await api<{ id: number }>(request, "POST", `/job/${job.id}/design`, {
    session: { params: [{ name: "school", kind: "url", values: { list: [{ value: "north" }, { value: "south" }] } }] },
    items: [{ type: "question", name: "ok", variable: { type: "confirm", question: "Ready?" } }],
  });
  await api(request, "PUT", `/job/${job.id}/deployment`, { designVersionId: codebook.id });
  await page.goto("/");
  await page.getByText("Schools").click();
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await page.getByRole("button", { name: "Links", exact: true }).click();
  await page.getByRole("button", { name: "school", exact: true }).click();
  await expect(page.getByRole("cell", { name: /school=north/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /school=south/ })).toBeVisible();
});
