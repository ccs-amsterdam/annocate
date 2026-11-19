# The MCP server: AI assistants editing a design

AnnoTinder is a remote [Model Context Protocol](https://modelcontextprotocol.io)
server. A researcher connects an AI assistant (Claude, ChatGPT, an IDE agent)
to **one study**; the assistant can then read that study's design, check it,
and save drafts of it. It never deploys: the researcher looks at the draft in
the editor and deploys it themselves.

```
assistant ──POST /api/mcp (Bearer amcp_a_…)──▶ server ──▶ the one study's design
    │
    └─ OAuth: /api/oauth/authorize ──▶ /research/connect (the researcher allows it)
```

## Connecting

In the assistant, add a custom connector (remote MCP server) with the URL

```
https://<your AnnoTinder server>/api/mcp
```

The assistant finds the login by itself (below). The researcher's browser
opens AnnoTinder's consent page (`/research/connect`): they log in as usual
(with a fresh second factor, as for other sensitive actions), pick the study
and allow it. Only studies where they have **WRITE** or **ADMIN** are offered.

Connections are listed, and disconnected, in the account menu: *Connected
assistants*. A connection also stops working as soon as its user loses
WRITE on the study, is blocked, or the study is suspended (saving only).

## What a connection may do

| Scope | Gives |
| --- | --- |
| `design:read` | `get_design`, `list_design_versions`, `validate_design`, `get_units_summary`, `diff_draft_vs_live`, the resources |
| `design:edit` | also `save_design_draft` |

A token works on `/api/mcp` for its own study only: never on the researcher
API (OAuth tokens start with `amcp_`, API keys with `atk_`), and never for
units, coders, answers, links or deploying.

### Tools

| Tool | Does |
| --- | --- |
| `get_design` | The design to edit: the draft if there is one, else the live one (or an older `version`), with its version number, status and `revision`. Items, session, public info, declared unit fields |
| `list_design_versions` | The versions: number, status (draft, live, history), note, when saved, and whether it passes validation |
| `validate_design` | Checks a design (without one: the draft) the way AnnoTinder does before deploying: problems per item (errors block deploying, warnings don't), and unit fields the design uses but doesn't declare |
| `save_design_draft` | Saves a whole design as the draft, with an optional `note`. If a draft exists, its `revision` from `get_design` is required, so an assistant can't overwrite edits it hasn't seen. Saved by `<email> (via <assistant name>)`. Drafts may have validation problems. Never deploys |
| `get_units_summary` | The units: the declared fields, how many units there are, and a few examples, to write questions that refer to them |
| `diff_draft_vs_live` | What the draft changes compared with the live design: items added, removed and changed (by name), and changes to the session, public info and unit fields |

### Resources and prompts

| URI | |
| --- | --- |
| `annotinder://schema/design` | The design's JSON Schema (also public: `GET /api/schema/design.json`) |
| `annotinder://help/<slug>` | The help topics about designing (Getting started, Editor, Question types, Unit layouts, Units and distribution, Design notes) |
| `annotinder://glossary` | The glossary |

Prompt `edit_codebook` (argument `goal`): read the design and the help,
change it, validate, save a draft, and tell the researcher to review and
deploy it.

## Protocol

MCP over Streamable HTTP, protocol versions `2025-11-25`, `2025-06-18` and
`2025-03-26` (the client's, if one of these, else the newest).

- `POST /api/mcp` with one JSON-RPC message; the answer is JSON
  (`application/json`), never a stream. Notifications get 202.
- No sessions (`Mcp-Session-Id`): every request carries its token, and the
  server keeps no state between them. `GET` and `DELETE` get 405.
- Without a valid token: 401 with `WWW-Authenticate: Bearer
  resource_metadata="…/.well-known/oauth-protected-resource/api/mcp"`. A token
  whose user can no longer edit the study: 403 `insufficient_scope`.
- CORS is allowed (browser-based clients); the token is the only credential.

## OAuth

AnnoTinder is its own authorization server, for public clients only
(OAuth 2.1: authorization code with PKCE `S256`; no client secrets).

| Endpoint | |
| --- | --- |
| `GET /.well-known/oauth-protected-resource[/api/mcp]` | RFC 9728: the resource (`<base>/api/mcp`), its authorization server and scopes |
| `GET /.well-known/oauth-authorization-server` (also `/openid-configuration`) | RFC 8414 metadata |
| `POST /api/oauth/register` | Dynamic client registration (RFC 7591): `client_name`, `redirect_uris`. Rate limited (10 per minute per address) |
| `GET /api/oauth/authorize` | Starts a login: `response_type=code`, `client_id`, `redirect_uri`, `code_challenge` (S256), `state`, `scope`, `resource` (optional, RFC 8707: must be the MCP URL). Sends the browser to `/research/connect` |
| `POST /api/oauth/token` | `authorization_code` (with `code_verifier`) and `refresh_token` |
| `POST /api/oauth/revoke` | RFC 7009: revokes the token's whole connection |

**Clients** are identified either by a URL (a client ID metadata document:
the server fetches it, from public addresses only, at most 64 KB, no
redirects, cached an hour), or by an id from registering. Redirect URIs must
match exactly, except that a loopback redirect (`http://127.0.0.1`,
`http://[::1]`, `http://localhost`) may use any port (RFC 8252).

**Tokens** are random, stored only as hashes, and bound to the user, the
client, the study, the scopes and the resource:

| | Lifetime |
| --- | --- |
| code | 5 minutes, once. Used twice: the connection is revoked |
| access token (`amcp_a_`) | 1 hour |
| refresh token (`amcp_r_`) | 30 days; replaced on every use. An old one used again: the connection is revoked |

Connecting and disconnecting are written to `security_log`
(`assistant_connected`, `assistant_disconnected`).

## Where it is implemented

- `packages/server/src/oauth.ts`: discovery, the OAuth endpoints, the
  consent page's API (`/api/oauth/requests/:id`, approve and deny) and
  connections (`/api/me/connections`).
- `packages/server/src/mcp.ts`: the MCP endpoint, tools, resources, prompt.
- `packages/server/src/mcpGuide.ts`: the help topics and glossary it serves
  (from `ANNOTINDER_GUIDE_DIR`, in the image `/app/guide`; else the checkout).
- `packages/client/src/pages/ConnectPage.tsx`: the consent page.
- Tables: `migrations/0006_oauth.sql`.
