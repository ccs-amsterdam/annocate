/** The study's pages. Preview is opened with the Preview Study button, not from the tabs. */
export type TabId = "Overview" | "Design" | "Units" | "Links" | "Coders" | "Results" | "Settings" | "Preview";

/** Each page's name in the URL (`/research/studies/<id>/<slug>`). */
export const TAB_SLUGS: Record<TabId, string> = {
  Overview: "overview",
  Design: "design",
  Units: "units",
  Links: "links",
  Coders: "coders",
  Results: "results",
  Settings: "settings",
  Preview: "preview",
};
