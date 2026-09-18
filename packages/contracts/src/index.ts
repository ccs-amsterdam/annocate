// @annotinder/contracts
//
// The shared, framework-agnostic API contract between an annotinder-client
// frontend and any compliant server backend (design plan §1/§3). Everything
// here is zod schemas + inferred types + pure helper functions -- no server
// or client runtime dependencies.

export * from "./common.js";

export * from "./codebook/position.js";
export * from "./codebook/codes.js";
export * from "./codebook/variableTypes.js";
export * from "./codebook/layout.js";
export * from "./codebook/item.js";
export * from "./codebook/validation.js";
export * from "./codebook/codebook.js";

export * from "./unit.js";
export * from "./unitset.js";
export * from "./job.js";
export * from "./coder.js";
export * from "./variableValue.js";
export * from "./session.js";

export * from "./endpoints/index.js";

export const CONTRACTS_VERSION = "0.1.0";
