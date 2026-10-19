import type { Context } from "hono";
import { ResolveCoderRequestSchema } from "@annotinder/contracts";
import { toAnnotatorCoder, upsertValues, type Coder, type Store } from "../store.js";
import { parseBody } from "./parse.js";

/**
 * `POST /annotator/job/:jobId/coders/resolve` (docs/api/annotator.md#resolvecoder).
 * The coder for a coder key, created from an invite on first use
 * (docs/coder-identity.md).
 */
export const resolveCoder = (store: Store) => async (c: Context) => {
  const body = await parseBody(c, ResolveCoderRequestSchema);
  if (!body) return c.json({ error: "Invalid body" }, 400);
  const known = store.coders.find((coder) => coder.key === body.coderKey);
  if (known) return c.json(toAnnotatorCoder(store, known));

  const invite = store.invites.find((i) => i.secret === body.inviteSecret);
  if (!invite) return c.json({ error: "Unknown coder; a valid invite is needed" }, 401);
  if (invite.auth === "required") return c.json({ error: "This invite requires login", code: "auth_required" }, 401);

  // A participant id is a label, never a credential: a new key for a known
  // participant gets a *new* session, and only when asked for.
  const participantId = invite.participantId ?? (invite.participantFromUrl ? body.participantId : undefined);
  const knownParticipant = participantId !== undefined && store.coders.some((x) => x.participantId === participantId);
  if (knownParticipant && !body.newSession) {
    return c.json({ error: "This participant already has a session", code: "participant_has_session" }, 409);
  }
  // A new session of a known participant is the same person: it doesn't use up the invite.
  if (!knownParticipant) {
    if (invite.maxUses !== undefined && invite.uses >= invite.maxUses) return c.json({ error: "Invite used up" }, 401);
    invite.uses++;
  }

  const coder: Coder = { id: store.coders.length + 1, key: body.coderKey, participantId, assignments: {} };
  store.coders.push(coder);
  // The invite's presets become the coder's values for the codebook's `auto`
  // variables with source "invite".
  upsertValues(
    store,
    null,
    coder.id,
    Object.fromEntries(
      Object.entries(invite.variables).map(([name, code]) => [name, { done: true, skip: false, codes: [{ code }] }]),
    ),
  );
  return c.json(toAnnotatorCoder(store, coder));
};
