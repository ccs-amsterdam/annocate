import { createContext, useContext } from "react";
import type { CoderKind } from "@annotinder/contracts";

/**
 * The kind of coders the first deploy fixed in the study whose design is
 * edited (the study's `coderKind`): the design's invitation is for it. Null
 * before the first deploy (who codes is the design's choice), and outside a
 * design editor.
 */
export const CoderKindContext = createContext<CoderKind | null>(null);

export const useCoderKind = (): CoderKind | null => useContext(CoderKindContext);
