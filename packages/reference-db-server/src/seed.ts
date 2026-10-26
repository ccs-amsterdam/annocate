import type { DatabaseSync } from "node:sqlite";
import { CodebookItemsSchema } from "@annotinder/contracts";
import { putDeployment } from "./shared/deployments.js";
import { setUnitFields } from "./shared/units.js";

/** Seeds a freshly-created (empty) db with one demo job. */
export function seed(db: DatabaseSync): void {
  const created = new Date().toISOString();
  db.prepare("INSERT INTO jobs (name, archived, created) VALUES (?, 0, ?)").run("Demo job", created);
  const jobId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;

  const units = [
    {
      headline: "Coding news by swiping: AnnoTinder turns content analysis into a card game",
      text: "Researchers at the VU Societal Analytics Lab released AnnoTinder, an app that lets coders label texts by swiping cards left, right or up. Lead developer Lena Bakker said the swipe interface makes simple yes-or-no questions fast enough to code thousands of headlines on a phone.",
    },
    {
      headline: "Experiments inside codebooks: AnnoTinder adds conditions and random groups",
      text: "A new version of AnnoTinder lets researchers build experiments directly into a codebook. An auto question randomly assigns each coder to a control or experiment group, and conditions show or hide questions depending on earlier answers. Communication scholar Maria Jansen of the Northbridge Media Institute called the feature a cheap way to test how instructions affect coding quality.",
    },
    {
      headline: "Spans, agreement and data quality: inside AnnoTinder's annotation tools",
      text: "Beyond swiping, AnnoTinder supports span annotation, where coders select words in a text and give them a label. The team says the job server can hand the same unit to several coders until they agree, which helps researchers measure intercoder reliability. Data journalist",
    },
  ];
  units.forEach((data, i) =>
    db.prepare("INSERT INTO units (jobId, externalId, data) VALUES (?, ?, ?)").run(jobId, `unit-${i + 1}`, JSON.stringify(data)),
  );

  setUnitFields(db, jobId, [
    { name: "headline", type: "text" },
    { name: "text", type: "text" },
  ]);
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
      type: "question",
      name: "consent",
      variable: {
        type: "confirm",
        question:
          "Welcome! This demo is a short tour of AnnoTinder. You'll answer a few questions about yourself, and then code three short news items about AnnoTinder itself. Ready to start?",
        instruction:
          "A codebook is a list of questions. Some are about you (like this one), others are asked for every unit in a unit loop. Each question in this demo shows a different question type or feature.",
      },
    },
    {
      type: "question",
      name: "group",
      variable: {
        type: "auto",
        source: "random",
        options: [{ code: "control" }, { code: "experiment" }],
      },
    },
    {
      type: "question",
      name: "experience",
      variable: {
        type: "select_code",
        vertical: true,
        question: "How much experience do you have with manual content analysis?",
        instruction:
          "This is a select_code question with vertical buttons. Your answer changes what comes next: beginners get a tip above each unit, experts get an extra question.",
        codes: [
          { code: "new", color: "#22c55e" },
          { code: "some", color: "#3b82f6" },
          { code: "expert", color: "#a855f7" },
        ],
      },
    },
    {
      type: "question",
      name: "role",
      variable: {
        type: "search_code",
        question: "What best describes your role?",
        instruction: "A search_code question: type to filter the options. Useful when there are many codes.",
        codes: [
          { code: "student" },
          { code: "PhD candidate" },
          { code: "researcher" },
          { code: "lecturer" },
          { code: "journalist" },
          { code: "data scientist" },
          { code: "developer" },
          { code: "policy maker" },
          { code: "fact checker" },
          { code: "other" },
        ],
      },
    },
    {
      type: "condition",
      name: "experiment_only",
      condition: { rules: [{ ref: "$var.group.code", op: "is", value: "experiment" }] },
      children: [
        {
          type: "question",
          name: "experiment_check",
          variable: {
            type: "select_code",
            question:
              "You were randomly assigned to the experiment group, so only you (and others in this group) see this question. Did you know codebooks can contain experiments?",
            instruction:
              "An auto question assigned you to a group at random. A condition item then shows this question only to the experiment group.",
            codes: [{ code: "yes" }, { code: "no" }],
          },
        },
      ],
    },
    {
      type: "question",
      name: "interest",
      variable: {
        type: "scale",
        question: "How interested are you in news about these topics?",
        instruction:
          "A scale question can have several items that share the same scale. If you rate technology 4 or higher, you'll get an extra question in the units.",
        items: [
          { name: "politics", label: "Politics" },
          { name: "technology", label: "Technology" },
          { name: "science", label: "Science" },
        ],
        codes: [
          { code: "not at all", value: 1 },
          { code: "a little", value: 2 },
          { code: "somewhat", value: 3 },
          { code: "quite", value: 4 },
          { code: "very", value: 5 },
        ],
      },
    },
    {
      type: "unit_loop",
      name: "main_loop",
      units: [{ sources: [{ unitset: "main" }] }],
      layout: {
        template:
          "{{ $var.group.code === 'experiment' ? $const.experiment_banner : $const.control_banner }}::markdown\n\n" +
          "{{ $var.experience.code === 'new' ? $const.beginner_tip : '' }}::markdown\n\n" +
          "# $unit.headline\n\n$unit.text::tokenize",
        constants: {
          control_banner:
            "> **Control group.** This banner comes from the unit layout. It depends on the group you were randomly assigned to.",
          experiment_banner:
            "> **Experiment group.** This banner comes from the unit layout. Coders in the control group see a different one.",
          beginner_tip:
            "**Tip for beginners:** you see this because you said you are new to content analysis. Read the whole text before answering; you can always go back to a previous question.",
        },
      },
      children: [
        {
          type: "question",
          name: "is_news",
          variable: {
            type: "annotinder",
            question: "Is this a news article?",
            instruction:
              "An annotinder question: swipe the card left, right or up, or use the arrow keys. It's the fastest way to answer simple questions.",
            codes: [
              { code: "No", color: "#ef4444" },
              { code: "Yes", color: "#22c55e" },
              { code: "Not sure", color: "#9ca3af" },
            ],
          },
        },
        {
          type: "question",
          name: "sentiment",
          variable: {
            type: "select_code",
            question: "What is the overall tone of this article?",
            instruction:
              "A select_code question: pick one code. Codes can have their own colours. Texts can use earlier answers: you said you are a **$var.role.code**.",
            codes: [
              { code: "positive", color: "#4caf50" },
              { code: "neutral", color: "#9e9e9e" },
              { code: "negative", color: "#f44336" },
            ],
          },
        },
        {
          type: "question",
          name: "topics",
          variable: {
            type: "select_code",
            multiple: true,
            question: "Which topics does this article discuss? Select all that apply.",
            instruction: "With multiple: true, a select_code question lets you pick several codes.",
            codes: [
              { code: "usability" },
              { code: "methodology" },
              { code: "experiments" },
              { code: "data quality" },
              { code: "journalism" },
            ],
          },
        },
        {
          type: "question",
          name: "actors_and_issues",
          variable: {
            type: "span",
            question: "Label the people, organisations, features and products in the text.",
            instruction:
              "A span question: select words in the text and give them a label. You can label as many spans as you like.",
            column: "text",
            codes: [
              { code: "person", color: "#2563eb" },
              { code: "organisation", color: "#7c3aed" },
              { code: "feature", color: "#ea580c" },
              { code: "product", color: "#059669" },
            ],
          },
        },
        {
          type: "condition",
          name: "experts_only",
          condition: { rules: [{ ref: "$var.experience.code", op: "is", value: "expert" }] },
          children: [
            {
              type: "question",
              name: "framing",
              variable: {
                type: "search_code",
                question: "Which frame best describes this article?",
                instruction:
                  "You see this question because you said you are an expert. A condition inside the unit loop can use your earlier answers.",
                codes: [
                  { code: "innovation" },
                  { code: "efficiency" },
                  { code: "scientific progress" },
                  { code: "risk" },
                  { code: "conflict" },
                  { code: "human interest" },
                  { code: "economic consequences" },
                ],
              },
            },
          ],
        },
        {
          type: "condition",
          name: "tech_fans",
          condition: { script: "$var.interest.technology.value >= 4" },
          children: [
            {
              type: "question",
              name: "usefulness",
              variable: {
                type: "scale",
                question: "How useful would the feature in this article be for your own work?",
                instruction:
                  "You see this because you are interested in technology. A scale question without items asks for a single rating.",
                codes: [
                  { code: "not useful", value: 1 },
                  { code: "slightly useful", value: 2 },
                  { code: "useful", value: 3 },
                  { code: "very useful", value: 4 },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      type: "question",
      name: "wrap_up",
      variable: {
        type: "confirm",
        question:
          "That's it! You've seen swipe questions, single and multiple choice, searchable lists, scales, span annotation, a random experiment, and conditions that change the questions and the layout. Thanks for taking the tour.",
      },
    },
  ]);

  db.prepare("INSERT INTO codebooks (jobId, note, items, created, immutable) VALUES (?, ?, ?, ?, 0)").run(
    jobId,
    "Demo: a tour of AnnoTinder's question types and features",
    JSON.stringify(items),
    created,
  );

  const codebookId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
  putDeployment(db, jobId, { codebookId, active: true });

  db.prepare("INSERT INTO invites (jobId, label, auth, secret, created) VALUES (?, ?, ?, ?, ?)").run(
    jobId,
    "Demo invite",
    "none",
    "demo-secret",
    created,
  );
}
