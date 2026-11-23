import type { Invite } from "@annotinder/contracts";

/** The invitation in a few words (the button above the tree, and the tree's Start row). */
export function inviteSummary(invite: Invite): string {
  if (invite.mode === "coders")
    return `specific coders, ${invite.link === "login" ? "signing in" : invite.link === "pick_name" ? "picking their name" : "a link each"}`;
  const parts = ["one link"];
  if (invite.coderParam) parts.push(`coder id from ?${invite.coderParam.param}`);
  if (invite.login) parts.push("signing in");
  return parts.join(", ");
}
