import { expect, test } from "./fixtures";
import type { CodebookResponse, DeploymentResponse } from "@annotinder/contracts";
import { answers, api, coders, fromExample, question } from "./helpers";

// A coder's session over time: quitting, another device, pausing, and a
// new codebook version while they code.

const SWIPE_QUESTION = "Is this headline good news or bad news?";

test("a coder quits and asks for their answers to be deleted; the researcher sees the request", async ({ page, request }) => {
  const { job, link } = await fromExample(request, "swipe-sentiment");
  const examples = (await coders(request, job.id)).map((c) => c.id);
  await page.goto(link);
  await question(page, SWIPE_QUESTION);
  await page.keyboard.press("ArrowLeft");
  // The next unit asks the same question: wait for the answer to be saved
  const own = async () => (await answers(request, job.id)).filter((a) => !examples.includes(a.coderId) && a.unitId !== null);
  await expect.poll(async () => (await own()).length).toBe(1);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: /Quit and ask to delete my answers/ }).click();
  await page.getByRole("textbox").fill("delete");
  await page.getByRole("button", { name: "Quit and ask to delete" }).click();
  await expect(page.getByText(/asked|deleted|request/i).first()).toBeVisible();

  const mine = (await coders(request, job.id)).filter((c) => !examples.includes(c.id));
  expect(mine).toHaveLength(1);
  expect(mine[0].ended?.outcome).toBe("quit");
  expect(mine[0].deletionRequest).toBeTruthy();
  // The answer given before quitting was saved
  expect((await answers(request, job.id)).filter((a) => a.coderId === mine[0].id && a.unitId !== null)).toHaveLength(1);
});

test("a coder continues on another device with the transfer link", async ({ page, request, browser }) => {
  const { job, link } = await fromExample(request, "swipe-sentiment");
  const examples = (await coders(request, job.id)).map((c) => c.id);
  await page.goto(link);
  await question(page, SWIPE_QUESTION);
  await page.keyboard.press("ArrowRight");
  await question(page, SWIPE_QUESTION);
  await page.getByRole("button", { name: "Continue on another device" }).click();
  const transferLink = await page.locator("input[readonly]").inputValue();
  expect(transferLink).toContain("transfer=");
  expect(transferLink).not.toContain("invite=");

  const phone = await (await browser.newContext()).newPage();
  await phone.goto(transferLink);
  await question(phone, SWIPE_QUESTION);
  await phone.keyboard.press("ArrowRight");
  await question(phone, SWIPE_QUESTION);
  await expect.poll(async () => (await coders(request, job.id)).filter((c) => !examples.includes(c.id)).length).toBe(1);
  await expect
    .poll(async () => (await answers(request, job.id)).filter((a) => !examples.includes(a.coderId) && a.unitId !== null).length)
    .toBe(2);
});

test("pausing: a working coder saves what they have and sees the study is paused; new coders can't start; resume", async ({ page, request, browser }) => {
  const { job, link } = await fromExample(request, "survey-annotations");
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await page.getByRole("button", { name: /18 to 29/ }).click();
  await page.getByRole("button", { name: /Quite/ }).first().click();
  await question(page, "What is this headline about?");

  const deployment = await api<DeploymentResponse>(request, "GET", `/job/${job.id}/deployment`);
  const pause = (active: boolean) => api(request, "PUT", `/job/${job.id}/deployment`, { codebookId: deployment.codebookId, active });
  await pause(false);

  // Code the units already loaded (a batch of 5), then the paused message
  for (let i = 0; i < 5; i++) {
    await question(page, "What is this headline about?");
    await page.getByRole("button", { name: /Politics/ }).click();
    await question(page, "How relevant is this news to you personally?");
    await page.getByRole("button", { name: /A little/ }).click();
  }
  await expect(page.getByText("This study is paused")).toBeVisible();

  const newcomer = await (await browser.newContext()).newPage();
  await newcomer.goto(link);
  await expect(newcomer.getByText("This study is paused")).toBeVisible();

  await pause(true);
  await page.getByRole("button", { name: "Check again" }).click();
  await question(page, "What is this headline about?");
});

test("a new codebook version while coding: the coder continues on the new version", async ({ page, request }) => {
  const { job, link } = await fromExample(request, "survey-annotations");
  await page.goto(link);
  await page.getByRole("button", { name: "I confirm", exact: true }).click();
  await page.getByRole("button", { name: /18 to 29/ }).click();
  await page.getByRole("button", { name: /Quite/ }).first().click();
  await question(page, "What is this headline about?");
  await page.getByRole("button", { name: /Economy/ }).click();
  await question(page, "How relevant is this news to you personally?");

  // The researcher rewords a question and publishes
  const deployment = await api<DeploymentResponse>(request, "GET", `/job/${job.id}/deployment`);
  const codebook = await api<CodebookResponse>(request, "GET", `/job/${job.id}/codebook/${deployment.codebookId}`);
  const items = JSON.parse(JSON.stringify(codebook.items).replace("How relevant is this news to you personally?", "How relevant is this news for you?"));
  const next = await api<CodebookResponse>(request, "POST", `/job/${job.id}/codebook`, { note: "v2", items });
  await api(request, "PUT", `/job/${job.id}/deployment`, { codebookId: next.id, active: true });

  await page.getByRole("button", { name: /Quite/ }).click();
  // Its save was refused (old version): the session loads the new version,
  // back on the same unit at its last question, with the answer kept
  await question(page, "How relevant is this news for you?");
  await expect(page.getByRole("button", { name: /Quite/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Quite/ }).click();
  await question(page, "What is this headline about?");
  await expect.poll(async () => (await answers(request, job.id)).filter((a) => a.variable === "relevance" && a.codebookId === next.id).length).toBe(1);
});
