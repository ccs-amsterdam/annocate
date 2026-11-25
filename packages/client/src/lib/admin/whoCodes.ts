import {
  inviteKind,
  type CoderKind,
  type CoderResponse,
  type DesignVersion,
  type StudyResponse,
} from "@annotinder/contracts";

// Who codes in a study (docs/architecture.md §6.1): the design's invitation
// chooses expert coders or a crowd, and the study's first deploy records the
// kind and fixes it.

/** Who codes in a study now: the kind of coders (null: not chosen yet), and whether the first deploy fixed it. */
export interface WhoCodes {
  kind: CoderKind | null;
  locked: boolean;
}

/**
 * Who codes in a study: the kind its first deploy fixed, and before that
 * the kind its draft (latest) design invites.
 */
export function whoCodes(
  study: Pick<StudyResponse, "coderKind">,
  draft: Pick<DesignVersion, "session"> | null | undefined,
): WhoCodes {
  if (study.coderKind !== null) return { kind: study.coderKind, locked: true };
  const invite = draft?.session.invite;
  return { kind: invite ? inviteKind(invite) : null, locked: false };
}

/** The expert coders a design doesn't use: all of them, unless it invites expert coders. */
export function unusedExperts(coders: readonly CoderResponse[], kind: CoderKind | null): CoderResponse[] {
  return kind === "expert" ? [] : coders.filter((c) => c.kind === "expert");
}

const expertCoders = (n: number) => `${n} expert coder${n === 1 ? "" : "s"}`;

/** What to say about expert coders a design doesn't use; null without any. */
export function unusedExpertsText(experts: readonly CoderResponse[]): string | null {
  if (experts.length === 0) return null;
  const one = experts.length === 1;
  const addresses = experts.some((c) => c.email !== null)
    ? ` (with ${one ? "an email address" : "email addresses"})`
    : "";
  return `${expertCoders(experts.length)}${addresses} ${one ? "isn't" : "aren't"} used by this design`;
}

/** What a crowd's first deploy says beforehand about the expert coders it deletes; null without any. */
export function deployDeletesText(experts: readonly CoderResponse[]): string | null {
  if (experts.length === 0) return null;
  return `${expertCoders(experts.length)} ${experts.length === 1 ? "isn't" : "aren't"} used and will be deleted`;
}
