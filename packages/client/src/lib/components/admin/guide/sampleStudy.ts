import {
  firstInvite,
  type DesignVersion,
  type SetGroupResponse,
  type StudyResponse,
  type TopLevelItem,
  type UnitField,
  type UnitResponse,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { SAMPLE_CODERS } from "./sampleData";

// The guide's sample study: a small job drawn with the real pages, read
// only, from memory. Two questions about the coder, then a unit loop: each
// headline with its layout and three questions, the third only for some
// (a branch). Its coders are expert coders: Anna, Bob and Carla
// (`sampleData.ts`).

const STUDY_ID = -1;
const DESIGN_ID = -1;

const items = [
  {
    type: "question",
    name: "age",
    variable: { type: "numeric", question: "How old are you?" },
  },
  {
    type: "question",
    name: "news_use",
    variable: {
      type: "ordinal",
      question: "How often do you follow the news?",
      options: [
        { value: 1, label: "Rarely" },
        { value: 2, label: "Weekly" },
        { value: 3, label: "Daily" },
      ],
    },
  },
  {
    type: "unit_loop",
    id: "loop_1",
    label: "Headlines",
    units: {},
    children: [
      { type: "layout", label: "Headline", template: "# $unit.headline\n\n$unit.lead" },
      {
        type: "question",
        name: "topic",
        variable: {
          type: "nominal",
          question: "What is this headline about?",
          options: [
            { value: "politics", label: "Politics" },
            { value: "economy", label: "Economy" },
            { value: "health", label: "Health" },
          ],
        },
      },
      {
        type: "question",
        name: "tone",
        variable: {
          type: "ordinal",
          question: "How positive is the headline?",
          options: [
            { value: 1, label: "Negative" },
            { value: 2, label: "Neutral" },
            { value: 3, label: "Positive" },
          ],
        },
      },
      {
        type: "branch",
        label: "Politics only",
        condition: { script: "$var.topic.is('politics')" },
        children: [
          {
            type: "question",
            name: "actor",
            variable: {
              type: "nominal",
              question: "Who is the main actor?",
              options: [
                { value: "government", label: "Government" },
                { value: "opposition", label: "Opposition" },
                { value: "citizens", label: "Citizens" },
              ],
            },
          },
        ],
      },
    ],
  },
] as unknown as TopLevelItem[];

const fields: UnitField[] = [
  { name: "headline", type: "text" },
  { name: "lead", type: "text" },
];

const units: UnitResponse[] = [
  {
    id: 1,
    externalId: "h1",
    coded: false,
    data: {
      headline: "Parliament votes to lower the voting age to sixteen",
      lead: "The proposal passed with a narrow majority after a long debate.",
    },
  },
  {
    id: 2,
    externalId: "h2",
    coded: false,
    data: {
      headline: "New malaria vaccine passes final trials",
      lead: "Researchers expect it to be available next year.",
    },
  },
  {
    id: 3,
    externalId: "h3",
    coded: false,
    data: { headline: "Bakery prices rise for the third month", lead: "Flour and energy costs keep climbing." },
  },
];

const now = new Date("2026-01-01T12:00:00Z");

/** The sample's design version, as the server would send it. */
export function sampleDesign(): DesignVersion {
  return {
    id: DESIGN_ID,
    studyId: STUDY_ID,
    formatVersion: 1,
    note: null,
    created: now,
    updated: now,
    updatedBy: null,
    revision: 1,
    immutable: false,
    valid: true,
    items,
    units: { fields },
    session: { invite: firstInvite("expert") },
    public: { title: "News headlines" },
  };
}

// Not deployed yet: who codes is the design's choice still
const sampleStudy: StudyResponse = {
  id: STUDY_ID,
  publicId: "samplestudy1",
  name: "Sample: news headlines",
  archived: false,
  coderKind: null,
  created: now,
  reopenMinutes: 1440,
  redirectUrls: {},
};

// Expert coders: whose units are whose
const groups: SetGroupResponse[] = [
  {
    name: "coder_set",
    sets: [
      { name: "anna", unitIds: [1, 2], ordered: false },
      { name: "bob", unitIds: [2, 3], ordered: false },
    ],
  },
];

/** What the sample's pages ask the API for; anything else gets nothing. */
const sampleAnswers: Partial<Record<keyof ResearcherApi, (...args: never[]) => unknown>> = {
  getStudy: () => sampleStudy,
  listStudies: () => [sampleStudy],
  getDeployment: () => null,
  getDesignVersion: () => sampleDesign(),
  listDesignVersions: () => [sampleDesign()],
  getUnitFields: () => fields,
  listUnits: () => units.map((u) => ({ id: u.id, externalId: u.externalId, hash: String(u.id), coded: false })),
  listUnitPage: (q: { offset?: number; limit?: number }) => ({
    total: units.length,
    units: units.slice(q?.offset ?? 0, (q?.offset ?? 0) + (q?.limit ?? units.length)),
  }),
  getUnit: (id: number) => units.find((u) => u.id === id) ?? null,
  listSetGroups: () => groups,
  listCoderUnits: () => ({ coders: [] }),
  listCoders: () => ({ coders: SAMPLE_CODERS, unassigned: { live: null, draft: 0 } }),
  getPendingChanges: () => ({ units: { added: 0, changed: 0, removed: 0, sets: false }, designVersionId: null }),
  listDeploymentVersions: () => [],
};

/**
 * A ResearcherApi for the sample: answers from memory, never writes. Its pages are drawn inert, so
 * nothing should write; a write that slips through is refused.
 */
export function sampleClient(): ResearcherApi {
  const api: ResearcherApi = new Proxy({} as ResearcherApi, {
    get(_, prop) {
      if (prop === "studyId") return STUDY_ID;
      if (prop === "forStudy") return () => api;
      if (prop === "then") return undefined;
      const answer = sampleAnswers[prop as keyof ResearcherApi];
      return async (...args: never[]) => {
        if (answer) return answer(...args);
        if (/^(get|list)/.test(String(prop))) return null;
        throw new Error("The sample study can't be changed");
      };
    },
  });
  return api;
}
