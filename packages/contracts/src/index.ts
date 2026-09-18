// @annotinder/contracts
//
// The shared, framework-agnostic API contract between an annotinder-client
// frontend and any compliant server backend (design plan §1/§3). Everything
// here is zod schemas + inferred types + pure helper functions -- no server
// or client runtime dependencies.

export * from "./common";

export * from "./codebook/position";
export * from "./codebook/codes";
export * from "./codebook/variableTypes";
export * from "./codebook/layout";
export * from "./codebook/item";
export * from "./codebook/validation";
export * from "./codebook/codebook";

export * from "./unit";
export * from "./unitset";
export * from "./job";
export * from "./coder";
export * from "./variableValue";
export * from "./session";

export * from "./endpoints";

export const CONTRACTS_VERSION = "0.1.0";
