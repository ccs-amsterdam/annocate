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
      /** Who codes in the sample's design (default: a crowd). */
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
    title: "Design",
    steps: [
      {
        id: "designer",
        title: "The design editor",
        text: [
          "An AnnoTinder study is almost entirely defined in a single design blueprint. The design editor helps you create and navigate this blueprint. It consists of three main parts",
          "- On the left you see the coder journey from start (top) to end (bottom). In the example coders start with survey questions (age, news use), and then code some headlines (topic, tone) with an optional question of political news (actor)",
          "- When you select an item in the tree, the second panel lets you edit its settings",
          "- On a wide screen, the third panel also shows a preview of the coder view. On smaller screens the 2nd and 3rd panels are combined, and you can select between them",
        ],
        sample: { page: "design", select: "topic" },
      },
      {
        id: "modes",
        title: "Two modes: expert or crowd coding",
        text: [
          "The first choice for a study is who codes: expert coders or a crowd. You make it in the design, at the top of the tree: Who codes. It decides how coders get in and how units are handed out.",
          "A new design shows the two as cards to choose from. You can change the choice until the study's first deploy, which fixes it.",
        ],
        sample: { page: "design", view: "tree" },
        showMe: { page: "Design", target: "who-codes", label: "Who codes: expert coders or a crowd" },
      },
      {
        id: "coders",
        title: "Expert coders",
        text: [
          "For content analysis with trained coders. You add them on the Coders page, each with a coder id and optionally an email address. The coder set (the units' coder_set column) selects which of them code which units.",
          "Coders get a link each, pick their name from one link, or sign in: signing in needs an email address for each coder. Their session stays open: they come back to their job, and you can add and redistribute units at any time.",
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
    page: "Coders",
    title: "Coders",
    steps: [
      {
        id: "add-coders",
        title: "Adding expert coders",
        text: [
          "Expert coders are added here, one per line: a coder id (a name, a number), and optionally the email address they sign in with.",
          "A crowd's coders aren't added: they appear here when they start with a coder id from their link.",
        ],
        showMe: { page: "Coders", target: "add-coders", label: "Add coders: an id each, optionally an email address" },
      },
      {
        id: "coder-set",
        title: "Making a coder set",
        text: [
          "The coder set says who codes which units. Make coder set has two tabs: Select coders, where you choose which coders get units and how the units are divided, and Manage coders, where you add coders.",
          "It is a draft until you deploy the units.",
        ],
        showMe: { page: "Coders", target: "make-coder-set", label: "Make coder set: Select coders, Manage coders" },
      },
      {
        id: "coders-table",
        title: "Following the coders",
        text: [
          "The table shows each coder's units: assigned now (as deployed) and in the draft, done, and remaining. A notice above it says how many units no coder has.",
          "Deleting a coder deletes their answers for good, and takes them out of the coder set: their units have no coder until you divide them again.",
        ],
        showMe: { page: "Coders", target: "coders-table", label: "Coders: units and progress per coder" },
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
          "Results shows the answers so far and the agreement between coders, and downloads everything as CSV or Excel.",
          "Each coder's progress is on the Coders page.",
        ],
        showMe: { page: "Results", target: "tab-Results", label: "Results: answers, agreement and downloads" },
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
