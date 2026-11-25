import type { AccountDeletion } from "@annotinder/contracts";
import { ResearcherApiError } from "../api/httpResearcherApi";

// Deleting a study or an account can't be undone: the person deleting it types
// what goes (the study's name, the account's email address), and the server
// checks it again (contracts `ConfirmDeletionSchema`).

/** Whether what was typed is the study's name (spaces around it don't count). */
export const studyNameConfirmed = (typed: string, name: string): boolean => typed.trim() === name;

/** Whether what was typed is the account's email address (spaces around it and capitals don't count). */
export const emailConfirmed = (typed: string, email: string): boolean =>
  typed.trim().toLowerCase() === email.toLowerCase();

/** Whose account is deleted: one's own, or (by a server admin) another user's. */
export type Whose = "own" | "user";

export interface DeletionPlan {
  /** Nothing keeps the account: it can be deleted once confirmed. */
  allowed: boolean;
  /** The names of the studies deleted with the account. */
  studies: string[];
  /** What keeps the account from being deleted, each with what to do about it. */
  blockers: string[];
}

const BLOCKERS: Record<Whose, Record<AccountDeletion["blocking"][number]["reason"] | "lastAdmin", string>> = {
  own: {
    shared:
      "you own it and other users have a role in it. Give it another owner (ask a server admin), or remove the other users first.",
    last_admin: "you are its only ADMIN. Give another user the ADMIN role first.",
    lastAdmin: "You are this server's only admin, and a server needs one. Make another user admin first.",
  },
  user: {
    shared:
      "they own it and other users have a role in it. Give it another owner, or have the other users removed first.",
    last_admin: "they are its only ADMIN. Another user must get the ADMIN role first.",
    lastAdmin: "This is the server's only admin, and a server needs one. Make another user admin first.",
  },
};

/** What the dialog shows of an account's deletion: the studies that go with it, and what keeps it. */
export function deletionPlan(deletion: AccountDeletion, whose: Whose): DeletionPlan {
  const texts = BLOCKERS[whose];
  const blockers = [
    ...(deletion.lastAdmin ? [texts.lastAdmin] : []),
    ...deletion.blocking.map((study) => `Study "${study.name}": ${texts[study.reason]}`),
  ];
  return { allowed: blockers.length === 0, studies: deletion.studies.map((study) => study.name), blockers };
}

/**
 * The message to show for a failed deletion; null when the server asked for
 * a step-up login, which the API client already offered (`HttpResearcherApi`).
 */
export function deletionError(error: unknown): string | null {
  if (!(error instanceof ResearcherApiError)) return error instanceof Error ? error.message : String(error);
  return error.code === "step_up_required" ? null : error.reason;
}
