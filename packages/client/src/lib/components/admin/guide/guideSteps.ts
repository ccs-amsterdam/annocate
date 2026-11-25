import type { CoderKind } from "@annotinder/contracts";
import type { TabId } from "../../../admin/tabs";

// The guide (docs/client.md §7, "Guide"): a section per page, each a few
// steps, in one flow. A step says one thing, shows it on the sample study
// (drawn with the real page, read only) and can point at the real button on
// the researcher's own page ("Show me": an element with that `data-guide`
// attribute).

/** What a step shows of the sample study. */
export type GuideSample =
  | {
      page: "design";
      /** The item selected, by name (`session`: who codes). */
      select?: string;
      /** The whole editor, or only its tree or its form. */
      view?: "full" | "tree" | "form";
      /** Who codes in the sample (default: a crowd). */
      coders?: CoderKind;
    }
  | { page: "units" };

interface GuideStep {
  id: string;
  title: string;
  /** A few short sentences. */
  text: string[];
  sample?: GuideSample;
  /** The real thing on the researcher's page: the page it is on, and its `data-guide` name. */
  showMe?: { page: TabId; target: string; label: string };
}

interface GuideSection {
  /** The page the section is about: the guide opens on it there. */
  page: TabId;
  title: string;
  steps: GuideStep[];
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    page: "Design",
    title: "The study designer",
    steps: [
      {
        id: "designer",
        title: "The study designer",
        text: [
          "The design is what coders see, from top to bottom: here two questions about the coder, then a unit loop that shows each headline with its questions.",
          "Left the tree, in the middle the form of the selected item, right a preview of it. Work on a wide screen to see the preview beside the form.",
        ],
        sample: { page: "design", select: "topic" },
      },
      {
        id: "modes",
        title: "Two modes: expert or crowd coding",
        text: [
          "The first choice for a study is who codes: you make it when you create the study. It decides how coders get in and how units are handed out.",
          "You can change it in the study's Settings until the first deploy. How those coders get in is at the top of the tree: Who codes.",
        ],
        sample: { page: "design", view: "tree" },
        showMe: { page: "Design", target: "who-codes", label: "Who codes: how the study's coders get in" },
      },
      {
        id: "coders",
        title: "Expert coders",
        text: [
          "For content analysis with trained coders. Each coder has their own units: the units' coder set (the coder_set column) says whose they are.",
          "Coders get a link each, pick their name from one link, or sign in. Their session stays open: they come back to their job, and you can add and redistribute units at any time.",
        ],
        sample: { page: "design", select: "session", view: "form", coders: "expert" },
        showMe: { page: "Design", target: "who-codes", label: "Who codes: how expert coders get in" },
      },
      {
        id: "crowd",
        title: "Crowd (one link)",
        text: [
          "For many one-time coders: annotation at scale, or an experiment. Everyone starts from one link, which a panel company can hand out.",
          "Optionally take a coder id from the link, or set a maximum. Whether coders divide the units or each code all is set on each unit loop.",
        ],
        sample: { page: "design", select: "session", view: "form" },
        showMe: { page: "Design", target: "who-codes", label: "Who codes: a crowd's link" },
      },
      {
        id: "coder-questions",
        title: "Questions about the coder",
        text: [
          "Questions outside a unit loop are asked once: before the units (age, news use) or after them.",
          "Add one with Add item, choose Question, and pick its answer type. The preview shows it as coders will.",
        ],
        sample: { page: "design", select: "news_use" },
        showMe: { page: "Design", target: "add-item", label: "Add item: a question, a unit loop and more" },
      },
      {
        id: "unit-loop",
        title: "The annotation task",
        text: [
          "A unit loop goes through the units, one at a time. Its layout says how a unit looks; the questions after it are asked about each unit.",
          "Select the loop itself to choose which units it gives each coder.",
        ],
        sample: { page: "design", select: "topic" },
        showMe: { page: "Design", target: "add-item", label: "Add item: choose Unit loop" },
      },
      {
        id: "branch",
        title: "Questions only sometimes",
        text: [
          "A branch asks its questions only when its condition holds: here the actor, only for headlines about politics.",
          "Conditions can use earlier answers, the unit's fields, and the session.",
        ],
        sample: { page: "design", select: "actor", view: "tree" },
      },
    ],
  },
  {
    page: "Units",
    title: "Units",
    steps: [
      {
        id: "units",
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
    page: "Preview",
    title: "Trying it",
    steps: [
      {
        id: "preview",
        title: "Preview as a coder",
        text: ["Preview runs the saved design with your units, as a coder sees it. Nothing you answer there is kept."],
        showMe: { page: "Design", target: "preview", label: "Preview: try the study as a coder" },
      },
    ],
  },
  {
    page: "Deploy",
    title: "Deploying",
    steps: [
      {
        id: "deploy",
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
    page: "Links",
    title: "Links",
    steps: [
      {
        id: "links",
        title: "How coders start",
        text: [
          "Coders start from a link: one per coder, or one for the crowd. Copy it here and send it, or give it to a panel company.",
        ],
        showMe: { page: "Links", target: "tab-Links", label: "Links: copy them here" },
      },
    ],
  },
  {
    page: "Results",
    title: "Results",
    steps: [
      {
        id: "results",
        title: "Answers and agreement",
        text: [
          "Results shows the answers so far, each coder's progress and the agreement between coders, and downloads everything as CSV or Excel.",
        ],
        showMe: { page: "Results", target: "tab-Results", label: "Results: answers, coders and downloads" },
      },
    ],
  },
];

/** The section a page's guide opens on (the overview and settings: the designer). */
export function sectionIndexOf(page: TabId): number {
  const at = GUIDE_SECTIONS.findIndex((s) => s.page === page);
  return at >= 0 ? at : 0;
}

/** Every step in order, with its section: Next and Back go through these. */
export const GUIDE_FLOW = GUIDE_SECTIONS.flatMap((section, s) => section.steps.map((step, i) => ({ s, i, step })));
