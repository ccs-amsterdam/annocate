import { expect, test } from "./fixtures";
import type { JobResponse } from "@annotinder/contracts";
import { api } from "./helpers";

// Everything is a draft until deployed (docs/plans/design.md §5): units and
// sets too. Coders get the deployed snapshot.

test("new units are drafts until deployed: the bar, the dialog, and then coders get them", async ({ page, request, browser }) => {
  const job = await api<JobResponse>(request, "POST", "/job", { name: "Draft units" });
  await api(request, "POST", `/job/${job.id}/units`, { units: [{ externalId: "a1", data: { text: "First text" } }] });
  const codebook = await api<{ id: number }>(request, "POST", `/job/${job.id}/codebook`, {
    items: [
      {
        type: "unit_loop",
        units: [{ mode: "all" }],
        layout: { template: "$unit.text" },
        children: [{ type: "question", name: "topic", variable: { type: "nominal", question: "Topic?", options: [{ value: "politics" }, { value: "other" }] } }],
      },
    ],
  });
  await api(request, "PUT", `/job/${job.id}/deployment`, { codebookId: codebook.id });
  await api(request, "POST", `/job/${job.id}/units`, { units: [{ externalId: "a2", data: { text: "Second text" } }] });
  const [link] = await api<{ secret: string }[]>(request, "GET", `/job/${job.id}/invites`);

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
