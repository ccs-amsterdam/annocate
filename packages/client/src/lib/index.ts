// @annotinder/client library entry point.
//
// This is what a host application imports when using annotinder-client as a
// component library (docs/client.md §1), e.g.:
//   import { JobRunner } from "@annotinder/client";
//   import "@annotinder/client/style.css";
//
// The CSS import below (Tailwind, the theme variables and fonts, see
// ../index.css) is what makes "@annotinder/client/style.css" a real file
// after `vite build --config vite.lib.config.ts`: Vite extracts CSS
// imported from the entry point into one stylesheet.
import "../index.css";

export const ANNOTINDER_CLIENT_VERSION = "0.1.0";

export * from "./api/httpCoderApi";
export * from "./codebook/tree";
export * from "./codebook/expression";
export * from "./codebook/conditions";
export * from "./codebook/dependencies";
export * from "./codebook/expressionCache";
export * from "./codebook/renderTemplate";
export * from "./jobManager/JobManager";
export * from "./jobManager/useJobManager";
export * from "./components/JobRunner";
export * from "./components/Question";
export * from "./components/UnitFields";
export * from "./components/TemplateMarkdown";
export * from "./components/SelectableText";
export * from "./components/ShortcutBadge";
export * from "./context/SpanAnnotationContext";
export * from "./context/CoderSettingsContext";
export * from "./components/answerFields";

// Phase 5: job/codebook management UI (docs/client.md §7).
export * from "./api/httpResearcherApi";
export * from "./admin/queries";
export * from "./codebook/codebookEdit";
export * from "./admin/csv";
export * from "./components/admin/AdminApp";
export * from "./components/admin/account/ResearcherGate";
export * from "./components/admin/account/AccountMenu";
export * from "./components/admin/JobSettings";
export * from "./components/admin/CodebookManager";
export * from "./components/admin/CodebookEditor";
export * from "./components/admin/units/UnitsPage";
export * from "./components/admin/CodersPanel";
export * from "./components/admin/InvitationsPanel";
export * from "./components/admin/overview/JobOverview";
