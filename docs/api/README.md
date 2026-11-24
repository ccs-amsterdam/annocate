# The APIs

The server (`packages/server`) serves three APIs, all under `/api`: the paths
in these documents are relative to it (`GET /study` is
`https://annotinder.example.org/api/study`). Everything outside `/api` is the
web app.

| API | Called by | For | Contracts | Spec |
|---|---|---|---|---|
| **researcher API** (`/study/...`, `/me`, `/auth/...`) | the researcher UI (`ResearcherApi`), scripts (R, Python), other systems (AmCAT) | studies, designs, units, links, deploying, results | `researcherEndpoints` | [researcher.md](researcher.md) |
| **coder API** (`/d/<deploymentId>/...`) | the coding screen (`HttpCoderApi`, `StudyManager`) | the session, next units, saving answers | `coderEndpoints` | [coder.md](coder.md) |
| **admin API** (`/admin/...`) | the server admin page (`ServerApi`) | roles, registration, plans and limits, blocking, suspending studies | `adminEndpoints` | [admin.md](admin.md) |

The registries are in `packages/contracts/src/endpoints/`: one file per API,
each entry `{ method, path, request, response }` with zod schemas. Server side:
the researcher and admin APIs in `src/researcher/` (one file per path), the
coder API in `src/coder.ts` with the runtime in `src/runtime/`. Client side:
`api/httpResearcherApi.ts`, `api/httpCoderApi.ts`, `api/serverApi.ts`.

## Authentication

| API | How |
|---|---|
| researcher and admin API | The session cookie from logging in (same origin, with `x-annotinder: 1`), or a personal API key (`authorization: Bearer <key>`, also cross-origin: CORS is allowed). Development servers (`AUTH_DEV_MODE=1`, localhost only) also accept `x-dev-role` / `x-dev-email`. See [researcher.md](researcher.md). |
| coder API | A device cookie the server sets (httpOnly, same origin), a session started from a link secret. No CORS. See [coder.md](coder.md#sessions-and-headers). |

## Stability

`/api` is version 1 of the API. Within it:

- **Fields and enum values may be added.** A client ignores fields it doesn't
  know, and treats an enum value it doesn't know (an error `code`, a device
  `type`, a session's `outcome`, a warning's `code`, an agreement `metric`)
  as "something else", not as an error.
- **Nothing is removed or renamed, and no field changes its meaning.** A
  breaking change gets a new prefix (`/api/v2`), next to this one.
- **Errors** are `{ error: string, code?, issues? }` with a 4xx or 5xx status:
  `error` is for people, `code` for programs.
- **`PUT` replaces what is sent and keeps what is left out** (e.g.
  `PUT /study/:id` with only `name` keeps `archived`).

## Lists

The lists that can grow with a study are objects, not bare arrays, so they
can be read in pages: `{ <items>: [...], next? }`, e.g.
`GET /study/:studyId/units` → `{ units: [...] }`. These are the studies
(`studies`), a study's design versions (`versions`), units (`units`), links
(`links`), coders (`coders`) and devices (`devices`), and the admin API's
users (`users`).

- `limit` (query, optional): the most items to return, at most 10,000.
  Without it a list comes whole, up to 10,000 items (the admin's users: 200).
- `next` (response): present when items are left: the id of the last item
  returned.
- `after` (query, optional): the `next` of the page before; the list
  continues after that item. 400 if the item is no longer in the list:
  start again.

A script that wants everything reads until a response has no `next`:

```r
units <- list()
after <- NULL
repeat {
  page <- api(sprintf("study/%d/units", study)) |>
    req_url_query(after = after) |> req_perform() |> resp_body_json()
  units <- c(units, page$units)
  if (is.null(page$`next`)) break
  after <- page$`next`
}
```

## Deployment ids

A deployed study runs as a deployment identified by the study's **public
id** (`/d/k3v9x2m4q7ta/session`): 12 random characters (`a-z`, `0-9`), made
with the study and never changed (`StudyResponse.publicId`). Coder links
carry it too: `/code/<publicId>?link=<secret>`. The study's sequential `id`
is the researcher API's only: coders never see it, so a link doesn't tell
how many studies a server has, and studies can't be probed by counting. A
researcher preview is `<publicId>.preview`. An imported study gets a new
public id.

## Machine-readable spec

```sh
pnpm --filter @annotinder/contracts generate:json-schema
```

writes `packages/contracts/dist/json-schema/{researcher,coder}-api.json`: per
endpoint the method, path and JSON Schemas for request and response, for
clients not written in TypeScript.
