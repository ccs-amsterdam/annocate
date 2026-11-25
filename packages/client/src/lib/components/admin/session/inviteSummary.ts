import type { Invite } from "@annotinder/contracts";

/** Who codes in a few words (the button above the tree, and the tree's Start row). */
export function inviteSummary(invite: Invite): string {
  if (invite.mode === "coders")
    return `expert coders, ${invite.link === "login" ? "signing in" : invite.link === "pick_name" ? "picking their name" : "a link each"}`;
  const parts = ["crowd, one link"];
  if (invite.coderParam) parts.push(`coder id from ?${invite.coderParam.param}`);
  return parts.join(", ");
}
