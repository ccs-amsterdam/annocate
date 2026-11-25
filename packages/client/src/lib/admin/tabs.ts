/** The study's pages. Preview is opened with the Preview Study button, not from the study's navigation. */
export type TabId =
  "Overview" | "Design" | "Units" | "Coders" | "Deploy" | "Links" | "Results" | "Settings" | "Preview";

/** Each page's name in the URL (`/research/studies/<id>/<slug>`). */
export const TAB_SLUGS: Record<TabId, string> = {
  Overview: "overview",
  Design: "design",
  Units: "units",
  Coders: "coders",
  Deploy: "deploy",
  Links: "links",
  Results: "results",
  Settings: "settings",
  Preview: "preview",
};
