import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { ResolveCoderRequestSchema, type ResolveCoderRequest } from "@annotinder/contracts";
import { transaction } from "../db.js";
import type { Env, Server } from "../context.js";
import { toAnnotatorCoder, type CoderRow } from "../shared/coders.js";
import { parseBody } from "../shared/http.js";

/**
 * `POST /annotator/job/:jobId/coders/resolve` (docs/api/annotator.md#resolvecoder).
 * The coder for a coder key, created from an invite on first use
 * (docs/coder-identity.md).
 */
export function resolveCoder(server: Server): Hono<Env> {
  const app = new Hono<Env>();
  app.post("/", async (c) => {
    const body = await parseBody(c, ResolveCoderRequestSchema);
    if (!("data" in body)) return c.json({ error: body.error }, 400);
    const coder = transaction(server.db, () => findOrCreateCoder(server.db, c.get("jobId"), body.data));
    if ("error" in coder) return c.json({ error: coder.error, code: coder.code }, coder.status);
    return c.json(toAnnotatorCoder(coder));
  });
  return app;
}

interface InviteRow {
  id: number;
  jobId: number;
  auth: string;
  maxUses: number | null;
  uses: number;
  variables: string;
  participantId: string | null;
  participantFromUrl: number;
  revokedAt: string | null;
}

interface ResolveError {
  error: string;
  status: 401 | 409;
  code?: "participant_has_session" | "auth_required";
}

function findOrCreateCoder(db: DatabaseSync, jobId: number, request: ResolveCoderRequest): CoderRow | ResolveError {
  const known = db.prepare("SELECT * FROM coders WHERE coderKey = ?").get(request.coderKey) as unknown as CoderRow | undefined;
  if (known) {
    if (known.jobId !== jobId) return { error: "Coder key belongs to a different job", status: 401 };
    return known;
  }

  if (!request.inviteSecret) return { error: "Unknown coder; a valid invite is needed", status: 401 };
  const invite = db.prepare("SELECT * FROM invites WHERE secret = ?").get(request.inviteSecret) as unknown as InviteRow | undefined;
  if (!invite || invite.jobId !== jobId) return { error: "Invalid invite secret", status: 401 };
  if (invite.auth === "required") return { error: "This invite requires login", status: 401, code: "auth_required" };

  // A participant id is a label, never a credential: a new key for a known
  // participant gets a *new* session, and only when asked for.
  const participantId = invite.participantId ?? (invite.participantFromUrl ? request.participantId : undefined) ?? null;
  const knownParticipant =
    participantId !== null &&
    !!db.prepare("SELECT 1 FROM coders WHERE jobId = ? AND participantId = ?").get(jobId, participantId);
  if (knownParticipant && !request.newSession) {
    return { error: "This participant already has a session on another device", status: 409, code: "participant_has_session" };
  }
  // A new session of a known participant is the same person: it doesn't use up the invite.
  if (!knownParticipant) {
    if (invite.revokedAt !== null) return { error: "This invite has been revoked", status: 401 };
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) return { error: "This invite has been used up", status: 401 };
    db.prepare("UPDATE invites SET uses = uses + 1 WHERE id = ?").run(invite.id);
  }

  // The invite's presets become the coder's values for the codebook's `auto`
  // variables with source "invite".
  const presets = JSON.parse(invite.variables) as Record<string, string>;
  const variables = Object.fromEntries(
    Object.entries(presets).map(([name, code]) => [name, { done: true, skip: false, codes: [{ code }] }]),
  );
  db.prepare("INSERT INTO coders (jobId, coderKey, participantId, variables, inviteId, created) VALUES (?, ?, ?, ?, ?, ?)").run(
    jobId,
    request.coderKey,
    participantId,
    JSON.stringify(variables),
    invite.id,
    new Date().toISOString(),
  );
  return db.prepare("SELECT * FROM coders WHERE coderKey = ?").get(request.coderKey) as unknown as CoderRow;
}
