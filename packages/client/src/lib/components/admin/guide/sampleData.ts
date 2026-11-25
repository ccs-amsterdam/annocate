import type { CoderResponse, LinkResponse, QuestionAgreement, QuestionAnswers } from "@annotinder/contracts";

// What the guide's pictures of the Coders, Links and Results pages show
// (`SamplePages.tsx`): the sample study's coders with their units and links,
// and results as they could look once coders are further (made up: more
// answers than the sample's three units give).

const now = new Date("2026-01-01T12:00:00Z");

const coder = (id: number, name: string, units: Partial<CoderResponse>): CoderResponse => ({
  id,
  coder: name,
  kind: "expert",
  email: `${name}@uni.example`,
  created: now,
  assigned: 0,
  assignedDraft: 0,
  draftDiffers: false,
  done: 0,
  remaining: 0,
  sessions: 1,
  lastActive: now,
  ...units,
});

/** Anna is done, Bob has a unit left, and Carla is in the draft coder set only. */
export const SAMPLE_CODERS: CoderResponse[] = [
  coder(1, "anna", { assigned: 2, assignedDraft: 2, done: 2 }),
  coder(2, "bob", { assigned: 2, assignedDraft: 2, done: 1, remaining: 1 }),
  coder(3, "carla", { assignedDraft: 1, draftDiffers: true, sessions: 0, lastActive: null }),
];

const link = (id: number, name: string, uses: number): LinkResponse => ({
  id,
  studyId: -1,
  label: name,
  secret: `sample-${name}`,
  uses,
  created: now,
  revokedAt: null,
  retiredAt: null,
  params: { coder: name },
});

/** A link per coder of the deployed coder set. */
export const SAMPLE_LINKS: LinkResponse[] = [link(1, "anna", 1), link(2, "bob", 1)];

export const SAMPLE_ANSWERS: QuestionAnswers[] = [
  {
    question: "topic",
    item: null,
    loop: "loop_1",
    type: "nominal",
    answered: 40,
    skipped: 0,
    counts: [
      { value: "politics", count: 18 },
      { value: "economy", count: 13 },
      { value: "health", count: 9 },
    ],
  },
];

const agreement = (question: string, metric: "nominal" | "ordinal", alpha: number, percent: number) => ({
  question,
  item: null,
  option: null,
  loop: "loop_1",
  type: metric,
  metric,
  alpha,
  percent,
  units: 20,
  coders: [],
  pairs: [],
});

export const SAMPLE_AGREEMENT: QuestionAgreement[] = [
  agreement("topic", "nominal", 0.86, 0.9),
  agreement("tone", "ordinal", 0.71, 0.8),
];
