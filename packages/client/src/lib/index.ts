// @annotinder/client library entry point.
//
// This is what a host application imports when using annotinder-client as a
// component library (design plan §7), e.g.:
//   import { JobRunner } from "@annotinder/client";
//   import "@annotinder/client/style.css";
//
// Phases 4-5 will add the full ported annotation UI, codebook editor, and
// job management screens on top of the core plumbing exported here.
export const ANNOTINDER_CLIENT_VERSION = "0.1.0";

export * from "./api/httpJobServer";
export * from "./codebook/tree";
export * from "./codebook/conditions";
export * from "./codebook/renderTemplate";
export * from "./jobManager/JobManager";
export * from "./jobManager/useJobManager";
export * from "./components/JobRunner";
export * from "./components/Question";
export * from "./components/UnitFields";
export * from "./components/SelectableText";
export * from "./context/SpanAnnotationContext";
export * from "./components/answerFields";
