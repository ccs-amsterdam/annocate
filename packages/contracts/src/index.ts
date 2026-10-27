// @annotinder/contracts
//
// The shared, framework-agnostic API contract between an annotinder-client
// frontend and any compliant server backend (CONTRACTS.md). Everything
// here is zod schemas + inferred types + pure helper functions -- no server
// or client runtime dependencies.

export * from "./common.js";

export * from "./codebook/options.js";
export * from "./codebook/variableTypes.js";
export * from "./codebook/references.js";
export * from "./codebook/templateBlocks.js";
export * from "./codebook/snippets.js";
export * from "./codebook/condition.js";
export * from "./codebook/layout.js";
export * from "./codebook/answerLayout.js";
export * from "./codebook/migrate.js";
export * from "./codebook/unitLoop.js";
export * from "./codebook/item.js";
export * from "./codebook/shownFields.js";
export * from "./codebook/validation.js";
export * from "./codebook/answers.js";
export * from "./codebook/codebook.js";
export * from "./codebook/jsonSchema.js";

export * from "./unit.js";
export * from "./unitFields.js";
export * from "./unitset.js";
export * from "./job.js";
export * from "./coder.js";
export * from "./variableValue.js";
export * from "./session.js";
export * from "./deployment.js";
export * from "./overview.js";
export * from "./account.js";
export * from "./annotations.js";

export * from "./endpoints/index.js";

export const CONTRACTS_VERSION = "0.1.0";
