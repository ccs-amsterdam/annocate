import type { TabId } from "../../../admin/tabs";

// The guide (docs/client.md §7, "Guide"): topics per page, each a few steps.
// A step says one thing, shows it on the sample study (drawn with the real
// page, read only) and can point at the real button on the researcher's own
// page ("Show me": an element with that `data-guide` attribute).

/** What a step shows of the sample study. */
export type GuideSample =
  /** The design editor, with an item selected (by name; `session`: who codes). */
  | { page: "design"; select?: string }
  | { page: "units" };

export interface GuideStep {
  title: string;
  /** A few short sentences. */
  text: string[];
  sample?: GuideSample;
  /** The real thing on the researcher's page: the page it is on, and its `data-guide` name. */
  showMe?: { page: TabId; target: string; label: string };
  /** Named ways on (other topics), besides Next. */
  jumps?: { label: string; topic: string }[];
}

export interface GuideTopic {
  id: string;
  /** Where the guide button opens this topic. */
  page: TabId;
  title: string;
  steps: GuideStep[];
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: "design",
    page: "Design",
    title: "The design",
    steps: [
      {
        title: "What coders go through",
        text: [
          "The design is what coders see, from top to bottom: here two questions about the coder, then a unit loop that shows each headline with its questions.",
          "Left the tree, in the middle the form of the selected item, right a preview. Use a wide window to see all three side by side.",
        ],
        sample: { page: "design", select: "topic" },
        jumps: [
          { label: "Who codes", topic: "who-codes" },
          { label: "Questions about the coder", topic: "coder-questions" },
          { label: "The annotation task", topic: "unit-loop" },
        ],
      },
    ],
  },
  {
    id: "who-codes",
    page: "Design",
    title: "Who codes",
    steps: [
      {
        title: "Specific coders or a crowd",
        text: [
          "Choose this first: a design can't be deployed without it.",
          "Specific coders: content analysis with trained coders. Each has their own session and units, and you can add and redistribute units at any time.",
          "Crowd (one link): many one-time coders, for annotation at scale or an experiment. Everyone starts from one link, e.g. from a panel company.",
        ],
        sample: { page: "design", select: "session" },
        showMe: { page: "Design", target: "who-codes", label: "Who codes: open it to choose" },
      },
    ],
  },
  {
    id: "coder-questions",
    page: "Design",
    title: "Questions about the coder",
    steps: [
      {
        title: "Asked once per coder",
        text: [
          "Questions outside a unit loop are asked once: before the units (age, news use) or after them.",
          "Add one with Add, choose Question, and pick its answer type. The preview shows it as coders will.",
        ],
        sample: { page: "design", select: "news_use" },
        showMe: { page: "Design", target: "add-item", label: "Add: a question, a unit loop and more" },
      },
    ],
  },
  {
    id: "unit-loop",
    page: "Design",
    title: "The annotation task",
    steps: [
      {
        title: "A unit loop",
        text: [
          "A unit loop goes through the units, one at a time. Its layout says how a unit looks; the questions after it are asked about each unit.",
          "Select the loop itself to choose which units it gives each coder.",
        ],
        sample: { page: "design", select: "topic" },
        showMe: { page: "Design", target: "add-item", label: "Add: choose Unit loop" },
      },
      {
        title: "Questions only sometimes",
        text: [
          "A branch asks its questions only when its condition holds: here the actor, only for headlines about politics.",
          "Conditions can use earlier answers, the unit's fields, and the session.",
        ],
        sample: { page: "design", select: "actor" },
      },
    ],
  },
  {
    id: "units",
    page: "Units",
    title: "Units",
    steps: [
      {
        title: "What coders code",
        text: [
          "Upload a CSV: each row is a unit, its columns the fields a layout shows ($unit.headline).",
          "You can upload more later: coders get new units when you deploy them, and are told so.",
        ],
        sample: { page: "units" },
        showMe: { page: "Units", target: "upload-units", label: "Upload a CSV" },
      },
    ],
  },
  {
    id: "preview",
    page: "Preview",
    title: "Trying it",
    steps: [
      {
        title: "Preview as a coder",
        text: [
          "Preview runs the saved design with your units, as a coder sees it. Nothing you answer there is kept.",
        ],
        showMe: { page: "Design", target: "preview", label: "Preview: try the study as a coder" },
      },
    ],
  },
  {
    id: "deploy",
    page: "Deploy",
    title: "Deploying",
    steps: [
      {
        title: "Coders get what you deploy",
        text: [
          "Everything you edit is a draft until you deploy it: the design, the units, the coder sets.",
          "Deploying makes the links. Answers stay linked to the version they were given with.",
        ],
        showMe: { page: "Deploy", target: "tab-Deploy", label: "Deploy: review and deploy" },
      },
    ],
  },
  {
    id: "links",
    page: "Links",
    title: "Links",
    steps: [
      {
        title: "How coders start",
        text: [
          "Coders start from a link: one per coder, or one for the crowd. Copy it here and send it, or give it to a panel company.",
        ],
        showMe: { page: "Links", target: "tab-Links", label: "Links: copy them here" },
      },
    ],
  },
  {
    id: "results",
    page: "Results",
    title: "Results",
    steps: [
      {
        title: "Answers and agreement",
        text: [
          "Results shows the answers so far, each coder's progress and the agreement between coders, and downloads everything as CSV or Excel.",
        ],
        showMe: { page: "Results", target: "tab-Results", label: "Results: answers, coders and downloads" },
      },
    ],
  },
];

/** The topic the guide button opens on a page. */
export function topicForPage(page: TabId): string {
  return GUIDE_TOPICS.find((t) => t.page === page)?.id ?? GUIDE_TOPICS[0].id;
}

export function topicById(id: string): GuideTopic {
  return GUIDE_TOPICS.find((t) => t.id === id) ?? GUIDE_TOPICS[0];
}
