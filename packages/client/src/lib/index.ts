// @annotinder/client library entry point.
//
// This is what a host application imports when using annotinder-client as a
// component library (design plan §7), e.g.:
//   import { AnnotinderVersion } from "@annotinder/client";
//   import "@annotinder/client/style.css";
//
// Phases 3-5 will populate this with the real exports: JobManager, the
// JobServer/HttpJobServer transport, the annotation interface components,
// and the codebook/job management UI.
export const ANNOTINDER_CLIENT_VERSION = "0.0.0";
