import { randomInt } from "node:crypto";
import { PUBLIC_STUDY_ID_LENGTH } from "@annotinder/contracts";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A study's public id (contracts `PublicStudyIdSchema`): what coder links
 * and the coder API name the study by, instead of its sequential id (which
 * would let anyone count and probe studies). Random: 12 characters of
 * a-z and 0-9, about 62 bits.
 */
export function newPublicId(): string {
  let id = "";
  for (let i = 0; i < PUBLIC_STUDY_ID_LENGTH; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return id;
}

/** The development demo study's public id (seed.ts): a development server's coder home links to it. */
export const DEMO_PUBLIC_ID = "demostudy001";
