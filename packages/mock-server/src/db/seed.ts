import type { DatabaseSync } from "node:sqlite";
import { CodebookItemsSchema } from "@annotinder/contracts";

/** Seeds a freshly-created (schema-migrated, empty) db with one demo job. */
export function seed(db: DatabaseSync): void {
  const created = new Date().toISOString();
  db.prepare("INSERT INTO jobs (name, archived, created) VALUES (?, 0, ?)").run("Demo job", created);
  const jobId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;

  db.prepare("INSERT INTO units (jobId, externalId, data) VALUES (?, ?, ?)").run(
    jobId,
    "unit-1",
    JSON.stringify({
      headline: "Prime Minister pledges new climate funding after tense parliamentary debate",
      text: "Prime Minister Mark Rutte announced a new multibillion-euro climate transition fund following heated debate in Parliament. Environmental groups praised the commitment to renewable energy targets, while industry leaders warned that rising electricity costs could hurt Dutch manufacturing companies. Citizens expressed skepticism about whether energy bills would drop before the upcoming winter election.",
    }),
  );
  db.prepare("INSERT INTO units (jobId, externalId, data) VALUES (?, ?, ?)").run(
    jobId,
    "unit-2",
    JSON.stringify({
      headline: "European Central Bank warns government on inflation and housing shortages",
      text: "European Central Bank President Christine Lagarde urged European finance ministers to rein in public spending to tame stubborn inflation. Meanwhile, local city councils across the country reported severe housing shortages, prompting tenants unions to organize protests demanding rent caps. Business associations argued that bureaucratic delays and strict nitrogen regulations are blocking new residential construction.",
    }),
  );
  db.prepare("INSERT INTO units (jobId, externalId, data) VALUES (?, ?, ?)").run(
    jobId,
    "unit-3",
    JSON.stringify({
      headline: "Tech companies face scrutiny over artificial intelligence in healthcare",
      text: "Health Minister Ernst Kuipers convened medical specialists and software executives to discuss safeguards for artificial intelligence in hospitals. Patient rights advocates raised concerns over patient data privacy and diagnostic errors, while pharmaceutical researchers demonstrated that machine learning algorithms significantly accelerated clinical trials for rare diseases.",
    }),
  );

  const unit1 = (db.prepare("SELECT id FROM units WHERE jobId = ? AND externalId = ?").get(jobId, "unit-1") as {
    id: number;
  }).id;
  const unit2 = (db.prepare("SELECT id FROM units WHERE jobId = ? AND externalId = ?").get(jobId, "unit-2") as {
    id: number;
  }).id;
  const unit3 = (db.prepare("SELECT id FROM units WHERE jobId = ? AND externalId = ?").get(jobId, "unit-3") as {
    id: number;
  }).id;

  db.prepare("INSERT INTO unitsets (jobId, name, unitIds) VALUES (?, ?, ?)").run(
    jobId,
    "main",
    JSON.stringify([unit1, unit2, unit3]),
  );

  const items = CodebookItemsSchema.parse([
    {
      type: "user_variable",
      name: "consent",
      variable: { type: "confirm", question: "Do you consent to participate?" },
    },
    {
      type: "unit_loop",
      name: "main_loop",
      unitset: "main",
      layout: {
        template: "# {{$unit.headline}}\n\n{{disclaimer}}\n\n::tokenize[$unit.text]",
        constants: { disclaimer: "_Demo unit -- label actors and issues mentioned in the text._" },
      },
      children: [
        {
          type: "unit_variable",
          name: "sentiment",
          variable: {
            type: "select_code",
            question: "What is the overall tone of this headline?",
            codes: [
              { code: "positive", color: "#4caf50" },
              { code: "neutral", color: "#9e9e9e" },
              { code: "negative", color: "#f44336" },
            ],
          },
        },
        {
          type: "unit_variable",
          name: "actors_and_issues",
          variable: {
            type: "span",
            question: "Label actors and issues mentioned in the text.",
            column: "text",
            codes: [
              { code: "politician", color: "#2563eb" },
              { code: "institution", color: "#7c3aed" },
              { code: "citizen", color: "#0891b2" },
              { code: "company", color: "#059669" },
              { code: "economy", color: "#d97706" },
              { code: "climate", color: "#16a34a" },
              { code: "healthcare", color: "#dc2626" },
              { code: "technology", color: "#ea580c" },
            ],
          },
        },
        {
          type: "unit_variable",
          name: "actor_relations",
          variable: {
            type: "relation",
            question: "Relate any actors or issues to each other, if relevant.",
            codes: [{ code: "affects", color: "#ff9800" }, { code: "debates", color: "#6366f1" }],
            from: { variable: "actors_and_issues" },
            to: { variable: "actors_and_issues" },
          },
        },
      ],
    },
  ]);

  db.prepare("INSERT INTO codebooks (jobId, name, items, created, immutable) VALUES (?, ?, ?, ?, 0)").run(
    jobId,
    "Demo codebook",
    JSON.stringify(items),
    created,
  );

  db.prepare("INSERT INTO invites (jobId, label, access, secret) VALUES (?, ?, ?, ?)").run(
    jobId,
    "Demo invite",
    "user_decides",
    "demo-secret",
  );
}
