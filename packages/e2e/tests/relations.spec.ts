import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { answers, api, list, question } from "./helpers";

// Relations between spans: click where one starts, then where it goes; the
// rules decide which spans can be clicked and which relation types fit.

const TEXT = "Mayor Anna de Wit met the board of the Harbour Company on Monday.";

async function study(request: Parameters<typeof api>[0]) {
  const created = await api<{ id: number }>(request, "POST", "/study/from-recipe", {
    name: "Relations",
    units: [{ id: "u1", data: { text: TEXT } }],
    design: {
      items: [
        {
          type: "unit_loop",
          id: "loop_1",
          children: [
            { type: "layout", template: "$unit.text" },
            {
              type: "question",
              name: "actors",
              variable: {
                type: "span",
                question: "Mark the actors.",
                fields: ["text"],
                options: [
                  { value: "person", label: "Person" },
                  { value: "organisation", label: "Organisation" },
                ],
              },
            },
            {
              type: "question",
              name: "links",
              variable: {
                type: "relation",
                question: "How are they related?",
                options: [
                  { value: "meets", label: "Meets" },
                  { value: "employs", label: "Employs" },
                ],
                // Anyone meets anyone; organisations employ persons
                rules: [
                  { from: { variable: "actors" }, to: { variable: "actors" }, options: ["meets"] },
                  {
                    from: { variable: "actors", values: ["organisation"] },
                    to: { variable: "actors", values: ["person"] },
                    options: ["employs"],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    deploy: true,
  });
  const [link] = await list<{ secret: string }>(request, `/study/${created.id}/links`);
  return { id: created.id, link: `/code/${created.id}?link=${link.secret}` };
}

/** Drags over a phrase in the selectable text, then labels it. */
async function markSpan(page: Page, phrase: string, label: string) {
  const box = await page
    .locator("[data-keys-own]")
    .first()
    .evaluate((el, phrase) => {
      const target = (el.textContent ?? "").indexOf(phrase);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n as Text;
        if (target < seen + text.length) {
          const range = document.createRange();
          range.setStart(text, target - seen);
          range.setEnd(text, target - seen + phrase.length);
          const r = range.getBoundingClientRect();
          return { ax: r.left + 2, bx: r.right - 2, y: r.top + r.height / 2 };
        }
        seen += text.length;
      }
      return null;
    }, phrase);
  await page.mouse.move(box!.ax, box!.y);
  await page.mouse.down();
  await page.mouse.move(box!.bx, box!.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: label, exact: true }).first().click();
}

test("relations: click the start, then a valid destination; the type menu when several fit; arrows show them", async ({
  page,
  request,
}) => {
  const { id, link } = await study(request);
  await page.goto(link);
  await question(page, "Mark the actors.");
  await page.waitForTimeout(600);
  await markSpan(page, "Anna de Wit", "Person");
  await markSpan(page, "Harbour Company", "Organisation");
  await page.getByRole("button", { name: "Done (2)" }).click();

  await question(page, "How are they related?");
  const anna = page.getByRole("button", { name: /Person: "Anna de Wit"/ });
  const harbour = page.getByRole("button", { name: /Organisation: "Harbour Company"/ });
  await expect(page.getByText("Click a span where a relation starts")).toBeVisible();

  // Anna -> Harbour: only "meets" fits, so it is made at once
  await anna.click();
  await expect(anna).toHaveAttribute("aria-pressed", "true");
  // Anna itself can't be a destination of its own relation
  await expect(anna).toBeEnabled();
  await harbour.click();
  await expect(page.getByRole("list", { name: "Relations" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.locator("[data-relation-arrow]")).toHaveCount(1);

  // Harbour -> Anna: "meets" and "employs" fit: the menu, chosen with a key
  await harbour.click();
  await anna.click();
  const types = page.getByRole("group", { name: "Relation type" });
  await expect(types.getByRole("button", { name: /Employs/ })).toBeVisible();
  await page.keyboard.press("2");
  await expect(page.getByRole("list", { name: "Relations" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.locator("[data-relation-arrow]")).toHaveCount(2);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/relations.png` });

  // Escape drops a started relation
  await anna.click();
  await page.keyboard.press("Escape");
  await expect(anna).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Done (2)" }).click();
  await expect
    .poll(async () => (await answers(request, id)).find((a) => a.variable === "links")?.value.relations?.length)
    .toBe(2);
  const saved = (await answers(request, id)).find((a) => a.variable === "links")!.value.relations!;
  expect(saved.map((r) => r.value).sort()).toEqual(["employs", "meets"]);
});

test("the editor shows a relation question's rules: from, to, and the types each allows", async ({ page, request }) => {
  const { id } = await study(request);
  await page.goto(`/research/studies/${id}/design`);
  await page.getByText("links", { exact: true }).first().click();
  await expect(page.getByText("Which relations coders can make")).toBeVisible();
  // Two rules, each with From and To
  await expect(page.getByLabel("From")).toHaveCount(2);
  await expect(page.getByLabel("From").first()).toHaveValue("actors");
  // The second rule: organisation -> person, employs only
  await expect(page.getByRole("button", { name: "Organisation", pressed: true })).toHaveCount(1);
  await page.getByRole("button", { name: /Rule/ }).click();
  await expect(page.getByLabel("From")).toHaveCount(3);
  if (process.env.E2E_SHOTS)
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/relation-rules.png`, fullPage: true });
});
