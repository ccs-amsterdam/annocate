// @annotinder/client library entry point.
//
// This is what a host application imports when using annotinder-client as a
// component library (design plan §7), e.g.:
//   import { JobRunner } from "@annotinder/client";
//   import "@annotinder/client/style.css";
//
// The CSS import below (Tailwind base/components/utilities + the ShadCN
// theme variables + fonts, see ../index.css) is what makes
// "@annotinder/client/style.css" a real, non-empty file after
// `vite build --config vite.lib.config.ts` -- Vite extracts any CSS
// imported (transitively) from the lib entry point into a single stylesheet
// alongside the JS bundle. It was NOT previously imported from this file
// (only from the standalone app's src/main.tsx), so consumers following the
// `import "@annotinder/client/style.css"` instructions above the JS import
// would have silently gotten a missing/empty file (design plan §7.1 gap,
// fixed 2026-09-18).
import "../index.css";

// Phases 4-5 will add the full ported annotation UI, codebook editor, and
// job management screens on top of the core plumbing exported here.
export const ANNOTINDER_CLIENT_VERSION = "0.1.0";

export * from "./api/httpJobServer";
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
export * from "./components/SelectableText";
export * from "./context/SpanAnnotationContext";
export * from "./components/answerFields";

// Phase 5: job/codebook management UI (design plan §5).
export * from "./api/httpAdminClient";
export * from "./admin/queries";
export * from "./codebook/codebookEdit";
export * from "./admin/csv";
export * from "./components/admin/AdminApp";
export * from "./components/admin/JobSettings";
export * from "./components/admin/CodebookManager";
export * from "./components/admin/CodebookEditor";
export * from "./components/admin/UnitsManager";
export * from "./components/admin/UnitsetsManager";
export * from "./components/admin/CodersPanel";
