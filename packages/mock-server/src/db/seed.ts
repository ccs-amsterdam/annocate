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
    JSON.stringify({ headline: "First demo headline", text: "Lorem ipsum dolor sit amet." }),
  );
  db.prepare("INSERT INTO units (jobId, externalId, data) VALUES (?, ?, ?)").run(
    jobId,
    "unit-2",
    JSON.stringify({ headline: "Second demo headline", text: "Consectetur adipiscing elit." }),
  );
  const unit1 = (db.prepare("SELECT id FROM units WHERE jobId = ? AND externalId = ?").get(jobId, "unit-1") as {
    id: number;
  }).id;
  const unit2 = (db.prepare("SELECT id FROM units WHERE jobId = ? AND externalId = ?").get(jobId, "unit-2") as {
    id: number;
  }).id;

  db.prepare('INSERT INTO unitsets (jobId, name, unitIds, "order") VALUES (?, ?, ?, ?)').run(
    jobId,
    "main",
    JSON.stringify([unit1, unit2]),
    "fixed",
  );

  const items = CodebookItemsSchema.parse([
    {
      type: "user_variable",
      position: "1",
      name: "consent",
      variable: { type: "confirm", question: "Do you consent to participate?" },
    },
    {
      type: "unit_loop",
      position: "2",
      name: "main_loop",
      unitset: "main",
      layout: { template: "# {{headline}}\n\n::field[text]" },
    },
    {
      type: "unit_variable",
      position: "2.1",
      name: "sentiment",
      variable: {
        type: "select_code",
        question: "What is the sentiment of this headline?",
        codes: [
          { code: "positive", color: "#4caf50" },
          { code: "neutral", color: "#9e9e9e" },
          { code: "negative", color: "#f44336" },
        ],
      },
    },
    {
      type: "unit_variable",
      position: "2.2",
      name: "actors",
      variable: {
        type: "span",
        question: "Select any actors mentioned in the text.",
        column: "text",
        codes: [{ code: "actor", color: "#2196f3" }],
      },
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
