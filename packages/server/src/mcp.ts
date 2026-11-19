import { Hono, type Context } from "hono";
import {
  DesignWriteSchema,
  EMPTY_SESSION,
  RELEASE,
  designItems,
  designJsonSchema,
  sessionItem,
  undeclaredFields,
  validateDesignItems,
  type McpScope,
} from "@annotinder/contracts";
import { one, type Sql } from "./db.js";
import type { Env, Server } from "./context.js";
import { MAY_EDIT_SQL, baseUrl, grantForAccessToken, mcpResource, oauthScopes, resourceMetadataUrl, type GrantRow } from "./oauth.js";
import {
  designVersionItems,
  designVersionPublic,
  designVersionSession,
  designVersionUnits,
  itemsValid,
  type DesignVersionRow,
} from "./shared/designVersions.js";
import { draftUnits, getUnitFields, unitCount } from "./shared/units.js";
import { loadGuide } from "./mcpGuide.js";

// The MCP endpoint (docs/api/mcp.md): AI assistants read and edit one
// study's design, as the researcher who connected them allowed (oauth.ts).
// Streamable HTTP, without streams: every request is one JSON-RPC message
// and gets one JSON answer; no sessions (the token says who and what).
//
// What an assistant can do is deliberately narrow: read the design, check
// it, and save it as a draft. It never deploys: a researcher looks at the
// draft in the editor and deploys it (the draft-until-deployed model,
// docs/plans/design.md §5). Every request checks again that the
// researcher may still edit the study.

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

const INSTRUCTIONS = `This server gives you one AnnoTinder study's design: what coders do (the questions, how units are shown and handed out), its session (links and URL parameters), its public info (the title coders see) and its declared unit fields.

How to work:
1. Read the design with get_design, and the unit fields with get_units_summary.
2. Read the JSON Schema (resource annotinder://schema/design) and the help topics (annotinder://help/...) before changing what you don't know; the glossary explains the terms.
3. Change the design JSON, check it with validate_design, then save it with save_design_draft (pass the revision get_design gave you).
4. Saving makes or updates a draft. Coders keep getting the deployed version until the researcher deploys the draft in AnnoTinder: tell them to review it there (Editor, and Deploy).

Keep question names stable once coders answered them (answers are stored by name).`;

type Json = Record<string, unknown>;

/** A JSON-RPC answer. */
const result = (id: unknown, value: unknown) => ({ jsonrpc: "2.0", id, result: value });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** A tool's result: the value as JSON text, and as structured content. */
const toolResult = (value: unknown, isError = false) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  ...(typeof value === "object" && value !== null && !Array.isArray(value) ? { structuredContent: value } : {}),
  ...(isError ? { isError: true } : {}),
});

const DESIGN_INPUT = {
  type: "object",
  description: "A whole design: { public, session, units, items } (resource annotinder://schema/design).",
  properties: {
    public: { type: ["object", "null"], description: "What coders see about the study: { title }" },
    session: { type: "object", description: "Link and URL parameters, participant id, sample size per link" },
    units: { type: "object", description: "The declared unit fields: { fields: [{ name, type, description? }] }" },
    items: { type: "array", description: "The questions, unit loops, conditions and end items, in order" },
  },
  required: ["items"],
};

const TOOLS = [
  {
    name: "get_design",
    title: "Get the design",
    description: "The study's current design (its draft, or the deployed version if there is no draft), with its version number, status and revision. Pass `version` for an older version.",
    inputSchema: { type: "object", properties: { version: { type: "integer", minimum: 1, description: "A version number (v1, v2, ...), as list_design_versions shows" } } },
    annotations: { readOnlyHint: true },
    scope: "design:read",
  },
  {
    name: "list_design_versions",
    title: "List design versions",
    description: "All versions of the design: number, status (draft, live, history), note, when saved, and whether it passes validation.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    scope: "design:read",
  },
  {
    name: "validate_design",
    title: "Validate a design",
    description: "Checks a design the way AnnoTinder does before deploying: problems per item (errors block deploying; warnings don't), and unit fields the design uses but doesn't declare. Without `design`: the current draft.",
    inputSchema: { type: "object", properties: { design: DESIGN_INPUT } },
    annotations: { readOnlyHint: true },
    scope: "design:read",
  },
  {
    name: "save_design_draft",
    title: "Save the design as a draft",
    description:
      "Saves a whole design as the study's draft: updates the draft if there is one (pass its `revision` from get_design; if someone saved it since, you get a conflict and must read it again), or starts a new draft. Never deploys: the researcher reviews and deploys the draft in AnnoTinder. Drafts may be saved with validation problems.",
    inputSchema: {
      type: "object",
      properties: {
        design: DESIGN_INPUT,
        note: { type: "string", maxLength: 1000, description: "What changed, e.g. 'Added a sentiment question'" },
        revision: { type: "integer", minimum: 1, description: "The draft's revision from get_design (required when a draft exists)" },
      },
      required: ["design"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    scope: "design:edit",
  },
  {
    name: "get_units_summary",
    title: "Summarize the units",
    description: "The study's units: the declared fields (name, type, description), how many units there are, and a few examples.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    scope: "design:read",
  },
  {
    name: "diff_draft_vs_live",
    title: "Compare the draft with the live version",
    description: "What the draft changes compared with the deployed (live) version: items added, removed and changed (by name), and changes to the session, public info and unit fields.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    scope: "design:read",
  },
] as const;

const PROMPTS = [
  {
    name: "edit_codebook",
    title: "Edit this study's codebook",
    description: "Start editing the design: read it, make the change, validate, save a draft for the researcher to review.",
    arguments: [{ name: "goal", description: "What to change, e.g. 'add a question about the article's tone'", required: true }],
  },
];

/** A whole design as an assistant reads and writes it. */
const designOf = (row: DesignVersionRow) => ({
  public: designVersionPublic(row),
  session: designVersionSession(row),
  units: designVersionUnits(row),
  items: Array.isArray(row.items) ? row.items : [],
});

/** A validation path for people: the Study entry is `study`, items are counted from 0. */
function issuePath(path: (string | number)[]): string {
  const [first, ...rest] = path;
  let out = first === 0 ? "study" : typeof first === "number" ? `items[${first - 1}]` : String(first ?? "");
  for (const p of rest) out += typeof p === "number" ? `[${p}]` : `.${p}`;
  return out;
}

/** Validation as an assistant needs it. */
function validate(design: { public?: unknown; session?: unknown; units?: { fields?: { name: string }[] }; items: unknown[] }) {
  const all = designItems({ items: design.items, session: (design.session as never) ?? EMPTY_SESSION, public: (design.public as never) ?? null });
  const issues = validateDesignItems(all).map((i) => ({ path: issuePath(i.path), message: i.message, ...(i.warning ? { warning: true } : {}) }));
  const undeclared = undeclaredFields(all, design.units?.fields ?? []);
  const errors = issues.filter((i) => !i.warning).length;
  return {
    valid: errors === 0 && undeclared.length === 0 && design.items.length > 0,
    errors,
    warnings: issues.length - errors,
    issues,
    undeclaredFields: undeclared,
    ...(design.items.length === 0 ? { note: "The design has no items yet: it needs at least one question to be deployed." } : {}),
  };
}

/** Items by identity (name, else type and position), without their children, for comparing two versions. */
function itemsByKey(items: unknown[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (list: unknown, path: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((raw, i) => {
      const item = (raw ?? {}) as Json;
      const at = `${path}${i}`;
      const key = typeof item.name === "string" ? item.name : `${String(item.type)}${typeof item.label === "string" ? ` "${item.label}"` : ""} at ${at}`;
      const { children, ...rest } = item;
      out.set(key, JSON.stringify(rest));
      walk(children, `${at}.`);
    });
  };
  walk(items, "");
  return out;
}

interface Connection {
  grant: GrantRow;
  scopes: McpScope[];
  email: string;
  clientName: string;
}

/** The study's versions in order, with the deployed one. */
async function versions(sql: Sql, studyId: number) {
  const rows = await sql.query<DesignVersionRow>("SELECT * FROM design_versions WHERE study_id = $1 ORDER BY id", [studyId]);
  const live = await one<{ design_version_id: number }>(sql, "SELECT design_version_id FROM deployments WHERE study_id = $1", [studyId]);
  const liveId = live?.design_version_id ?? null;
  const latest = rows.at(-1) ?? null;
  const status = (row: DesignVersionRow) => (row.id === liveId ? "live" : row === latest && !row.immutable ? "draft" : "history");
  return { rows, liveId, latest, status, number: (row: DesignVersionRow) => rows.indexOf(row) + 1 };
}

async function callTool(server: Server, conn: Connection, name: string, args: Json) {
  const { db } = server;
  const studyId = conn.grant.study_id;
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return toolResult(`Unknown tool: ${name}`, true);
  if (!conn.scopes.includes(tool.scope)) return toolResult(`This connection doesn't allow ${tool.scope}`, true);

  switch (tool.name) {
    case "get_design": {
      const v = await versions(db, studyId);
      const wanted = typeof args.version === "number" ? v.rows[args.version - 1] : v.latest;
      if (!wanted) return toolResult(v.rows.length ? `No version ${String(args.version)}` : "The study has no design yet: save_design_draft starts one.", !v.rows.length ? false : true);
      return toolResult({
        version: v.number(wanted),
        status: v.status(wanted),
        revision: wanted.revision,
        note: wanted.note,
        updated: wanted.updated,
        ...(v.status(wanted) === "draft" ? {} : { hint: "Saving makes a new draft from this." }),
        design: designOf(wanted),
      });
    }
    case "list_design_versions": {
      const v = await versions(db, studyId);
      return toolResult({
        versions: v.rows.map((row) => ({
          version: v.number(row),
          status: v.status(row),
          note: row.note,
          created: row.created,
          updated: row.updated,
          updatedBy: row.updated_by,
          valid: itemsValid(designVersionItems(row)),
        })),
      });
    }
    case "validate_design": {
      if (args.design !== undefined) {
        const parsed = DesignWriteSchema.safeParse(args.design);
        if (!parsed.success) return toolResult({ valid: false, shapeErrors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
        return toolResult(validate({ ...parsed.data, items: parsed.data.items }));
      }
      const v = await versions(db, studyId);
      if (!v.latest) return toolResult("The study has no design yet.");
      return toolResult({ version: v.number(v.latest), status: v.status(v.latest), ...validate(designOf(v.latest)) });
    }
    case "save_design_draft": {
      const parsed = DesignWriteSchema.safeParse({ ...(args.design as Json), note: args.note, revision: args.revision });
      if (!parsed.success) return toolResult({ saved: false, errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, true);
      if (sessionItem(parsed.data.items)) return toolResult("The session and public info go in `session` and `public`, not among the items.", true);
      const suspended = await one(db, "SELECT 1 FROM studies WHERE id = $1 AND suspended_at IS NOT NULL", [studyId]);
      if (suspended) return toolResult("A server admin suspended this study: it can't be changed.", true);
      const by = `${conn.email} (via ${conn.clientName})`.slice(0, 300);
      const v = await versions(db, studyId);
      const draft = v.latest && !v.latest.immutable ? v.latest : null;
      let row: DesignVersionRow | undefined;
      if (draft) {
        if (parsed.data.revision === undefined)
          return toolResult(`There is a draft (v${v.number(draft)}, revision ${draft.revision}): pass its revision, so you don't overwrite someone's edits.`, true);
        row = await one<DesignVersionRow>(
          db,
          `UPDATE design_versions SET note = $1, items = $2, units = COALESCE($6::jsonb, units), session = COALESCE($7::jsonb, session),
             public = CASE WHEN $8 THEN $9::jsonb ELSE public END, updated = now(), updated_by = $3, revision = revision + 1
           WHERE study_id = $4 AND id = $5 AND NOT immutable AND revision = $10 RETURNING *`,
          [
            parsed.data.note ?? draft.note,
            JSON.stringify(parsed.data.items),
            by,
            studyId,
            draft.id,
            parsed.data.units ? JSON.stringify(parsed.data.units) : null,
            parsed.data.session ? JSON.stringify(parsed.data.session) : null,
            parsed.data.public !== undefined,
            parsed.data.public ? JSON.stringify(parsed.data.public) : null,
            parsed.data.revision,
          ],
        );
        if (!row) {
          const now = await one<DesignVersionRow>(db, "SELECT * FROM design_versions WHERE id = $1", [draft.id]);
          return toolResult(
            now?.immutable
              ? "The draft was deployed meanwhile: read the design again (saving then starts a new draft)."
              : `Someone saved the draft since (${now?.updated_by ?? "unknown"}, now revision ${now?.revision}): read it again with get_design and redo your change on it.`,
            true,
          );
        }
      } else {
        const units = parsed.data.units ?? { fields: await getUnitFields(db, studyId) };
        row = await one<DesignVersionRow>(
          db,
          "INSERT INTO design_versions (study_id, note, items, units, session, public, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
          [
            studyId,
            parsed.data.note ?? null,
            JSON.stringify(parsed.data.items),
            JSON.stringify(units),
            JSON.stringify(parsed.data.session ?? (v.latest ? designVersionSession(v.latest) : EMPTY_SESSION)),
            parsed.data.public === undefined ? (v.latest?.public ? JSON.stringify(v.latest.public) : null) : parsed.data.public ? JSON.stringify(parsed.data.public) : null,
            by,
          ],
        );
      }
      const check = validate(designOf(row!));
      return toolResult({
        saved: true,
        version: v.rows.length + (draft ? 0 : 1),
        status: "draft",
        revision: row!.revision,
        valid: check.valid,
        errors: check.errors,
        warnings: check.warnings,
        ...(check.valid ? {} : { issues: check.issues.slice(0, 30), undeclaredFields: check.undeclaredFields }),
        next: "The researcher reviews the draft in AnnoTinder (Editor) and deploys it there; coders keep the live version until then.",
      });
    }
    case "get_units_summary": {
      const fields = await getUnitFields(db, studyId);
      const sample = await draftUnits(db, "u.study_id = $1", [studyId], "LIMIT 5");
      const short = (v: unknown) => (typeof v === "string" && v.length > 500 ? `${v.slice(0, 500)}…` : v);
      return toolResult({
        fields,
        count: await unitCount(db, studyId),
        examples: sample.map((u) => ({ id: u.external_id, data: Object.fromEntries(Object.entries(u.data ?? {}).map(([k, val]) => [k, short(val)])) })),
      });
    }
    case "diff_draft_vs_live": {
      const v = await versions(db, studyId);
      const live = v.rows.find((r) => r.id === v.liveId) ?? null;
      const draft = v.latest && v.latest.id !== v.liveId && !v.latest.immutable ? v.latest : null;
      if (!draft) return toolResult({ draft: null, note: live ? "There is no draft: the live version is the latest." : "Nothing is deployed yet." });
      if (!live) return toolResult({ draft: v.number(draft), live: null, note: "Nothing is deployed yet: the whole draft is new." });
      const a = designOf(live);
      const b = designOf(draft);
      const before = itemsByKey(a.items);
      const after = itemsByKey(b.items);
      return toolResult({
        draft: v.number(draft),
        live: v.number(live),
        items: {
          added: [...after.keys()].filter((k) => !before.has(k)),
          removed: [...before.keys()].filter((k) => !after.has(k)),
          changed: [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k)),
        },
        sessionChanged: JSON.stringify(a.session) !== JSON.stringify(b.session),
        publicChanged: JSON.stringify(a.public) !== JSON.stringify(b.public),
        unitFieldsChanged: JSON.stringify(a.units) !== JSON.stringify(b.units),
      });
    }
  }
}

function resources(server: Server) {
  return [
    {
      uri: "annotinder://schema/design",
      name: "design-schema",
      title: "Design JSON Schema",
      description: "The JSON Schema of a whole design: { public, session, units, items }. Validation (validate_design) remains what decides.",
      mimeType: "application/schema+json",
      text: () => JSON.stringify(designJsonSchema(), null, 2),
    },
    ...loadGuide(server.guideDir).map((doc) => ({
      uri: doc.uri,
      name: doc.name,
      title: doc.title,
      description: doc.description,
      mimeType: "text/markdown",
      text: () => doc.text,
    })),
  ];
}

/** Who is calling: the access token's connection, if it is valid and the researcher may still edit the study. */
async function connect(server: Server, c: Context): Promise<Connection | { status: 401 | 403; error: string; description: string }> {
  const token = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "")?.[1]?.trim();
  if (!token) return { status: 401, error: "invalid_request", description: "Connect first: an access token is required" };
  const grant = await grantForAccessToken(server.db, token);
  if (!grant) return { status: 401, error: "invalid_token", description: "The access token is invalid, expired or revoked" };
  if (grant.resource !== mcpResource(baseUrl(server, c))) return { status: 401, error: "invalid_token", description: "The token is for another resource" };
  const user = await one<{ email: string; may_edit: boolean; blocked: boolean }>(
    server.db,
    `SELECT email, ${MAY_EDIT_SQL("$1::int", "id", "$3")} AS may_edit, blocked_at IS NOT NULL AS blocked FROM users WHERE id = $2`,
    [grant.study_id, grant.user_id, server.devMode],
  );
  if (!user || user.blocked || !user.may_edit)
    return { status: 403, error: "insufficient_scope", description: "The researcher who connected this assistant can no longer edit the study" };
  const client = await one<{ name: string }>(server.db, "SELECT name FROM oauth_clients WHERE client_id = $1", [grant.client_id]);
  return { grant, scopes: oauthScopes(grant.scope), email: user.email, clientName: client?.name ?? grant.client_id };
}

export function mcp(server: Server): Hono<Env> {
  const app = new Hono<Env>();

  app.post("/mcp", async (c) => {
    const conn = await connect(server, c);
    if (!("grant" in conn)) {
      c.header(
        "www-authenticate",
        `Bearer resource_metadata="${resourceMetadataUrl(baseUrl(server, c))}", error="${conn.error}", error_description="${conn.description}"`,
      );
      return c.json({ error: conn.error, error_description: conn.description }, conn.status);
    }
    let message: Json;
    try {
      message = (await c.req.json()) as Json;
    } catch {
      return c.json(rpcError(null, -32700, "Parse error"), 400);
    }
    if (Array.isArray(message) || typeof message !== "object" || message === null || message.jsonrpc !== "2.0")
      return c.json(rpcError(null, -32600, "Expected one JSON-RPC 2.0 message"), 400);
    const { id, method } = message;
    const params = (message.params ?? {}) as Json;
    // Notifications and responses: nothing to answer
    if (id === undefined || typeof method !== "string") return c.body(null, 202);

    switch (method) {
      case "initialize": {
        const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        const study = await one<{ name: string }>(server.db, "SELECT name FROM studies WHERE id = $1", [conn.grant.study_id]);
        return c.json(
          result(id, {
            protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
            capabilities: { tools: {}, resources: {}, prompts: {} },
            serverInfo: { name: "annotinder", title: "AnnoTinder", version: RELEASE },
            instructions: `${INSTRUCTIONS}\n\nThis connection is for the study "${study?.name ?? conn.grant.study_id}", with: ${conn.scopes.join(", ")}.`,
          }),
        );
      }
      case "ping":
        return c.json(result(id, {}));
      case "tools/list":
        return c.json(
          result(id, {
            tools: TOOLS.filter((t) => conn.scopes.includes(t.scope)).map((t) => ({
              name: t.name,
              title: t.title,
              description: t.description,
              inputSchema: t.inputSchema,
              annotations: t.annotations,
            })),
          }),
        );
      case "tools/call": {
        const name = typeof params.name === "string" ? params.name : "";
        const args = (params.arguments ?? {}) as Json;
        return c.json(result(id, await callTool(server, conn, name, args)));
      }
      case "resources/list":
        return c.json(
          result(id, {
            resources: resources(server).map((r) => ({ uri: r.uri, name: r.name, title: r.title, description: r.description, mimeType: r.mimeType })),
          }),
        );
      case "resources/read": {
        const found = resources(server).find((r) => r.uri === params.uri);
        if (!found) return c.json(rpcError(id, -32002, `Resource not found: ${String(params.uri)}`));
        return c.json(result(id, { contents: [{ uri: found.uri, mimeType: found.mimeType, text: found.text() }] }));
      }
      case "resources/templates/list":
        return c.json(result(id, { resourceTemplates: [] }));
      case "prompts/list":
        return c.json(result(id, { prompts: PROMPTS }));
      case "prompts/get": {
        if (params.name !== "edit_codebook") return c.json(rpcError(id, -32602, `Unknown prompt: ${String(params.name)}`));
        const goal = typeof (params.arguments as Json | undefined)?.goal === "string" ? String((params.arguments as Json).goal) : "";
        return c.json(
          result(id, {
            description: PROMPTS[0].description,
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `I want to change my AnnoTinder study's codebook: ${goal}\n\nRead the design (get_design) and the unit fields (get_units_summary) first, and the help topics you need. Make the change in the design JSON, check it with validate_design, and save it with save_design_draft. Then tell me what you changed, so I can review the draft in AnnoTinder before I deploy it.`,
                },
              },
            ],
          }),
        );
      }
      default:
        return c.json(rpcError(id, -32601, `Method not found: ${method}`));
    }
  });

  // No server-to-client stream and no sessions: every request stands on its own
  app.get("/mcp", (c) => c.json({ error: "This server answers POST requests only" }, 405));
  app.delete("/mcp", (c) => c.json({ error: "No sessions to end" }, 405));

  return app;
}
