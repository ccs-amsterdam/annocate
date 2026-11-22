import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fromExample, question } from "./helpers";

// The coding screen checked by axe (WCAG 2.1 A and AA), in light and dark.

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1] ?? ""}`),
  }));
}

async function coder(browser: Browser, colorScheme: "light" | "dark"): Promise<Page> {
  return (await browser.newContext({ colorScheme })).newPage();
}

for (const scheme of ["light", "dark"] as const) {
  test(`a11y (${scheme}): swipe, spans and a survey`, async ({ request, browser }) => {
    const found: Record<string, unknown> = {};

    const swipe = await coder(browser, scheme);
    await swipe.goto((await fromExample(request, "swipe-sentiment")).link);
    await question(swipe, "Is this headline good news or bad news?");
    await swipe.waitForTimeout(600);
    found.swipe = await violations(swipe);
    await swipe.getByRole("button", { name: "Instruction" }).click();
    found.instruction = await violations(swipe);
    await swipe.keyboard.press("Escape");
    await swipe.getByRole("button", { name: "Coder Settings" }).click();
    found.settings = await violations(swipe);
    await swipe.keyboard.press("Escape");
    await swipe.getByRole("button", { name: "Keyboard shortcuts" }).click();
    found.keyboard = await violations(swipe);

    const spans = await coder(browser, scheme);
    await spans.goto((await fromExample(request, "actor-spans")).link);
    await question(spans, "Select every person and organisation mentioned in the text.");
    await spans.waitForTimeout(600);
    found.spans = await violations(spans);

    const survey = await coder(browser, scheme);
    await survey.goto((await fromExample(request, "simple-survey")).link);
    await survey.getByRole("button", { name: "I confirm", exact: true }).click();
    await survey.getByRole("spinbutton").fill("30");
    await survey.getByRole("button", { name: "Continue", exact: true }).click();
    await question(survey, "How often do you follow the news?");
    found.survey = await violations(survey);

    console.log(JSON.stringify({ scheme, found }, null, 1));
    expect(Object.values(found).flat()).toEqual([]);
  });
}
