# Results export and file storage (plan)

## Goals

- The server does as little as possible: it streams query results into a
  file, in batches, never holding the whole export in memory.
- Clients shape the data (wide tables, labels, CSV, spreadsheet-safe
  cells): the browser, R and Python. Then one stored export serves every
  client and every setting.
- Exports are files with a download link, so they can move to S3 later
  without changing the API. Multimedia will use the same storage.

## The raw export

`POST /study/:studyId/results/export` → `{ url, expires, created, counts }`. The
server writes the export (or reuses the last one if the study hasn't
changed) and returns a short-lived link to it.

A zip of JSON-lines files, one per table, rows in the API's shapes:

| File | A row per | Shape |
| --- | --- | --- |
| `answers.jsonl` | answer, also reset ones (`retiredAt`) | `AnnotationRow` |
| `units.jsonl` | unit version coders saw | `UnitVersion` |
| `coders.jsonl` | coder session | `CoderProgress` |
| `design_versions.jsonl` | design version answers were given under, and the live one | `DesignVersion` |
| `deployments.jsonl` | deployed version | `DeploymentVersion` |
| `sets.jsonl` | set column | `SetGroupResponse` |
| `devices.jsonl` | device | `Device` |
| `deletions.jsonl` | deleted session | `CoderDeletion` |
| `manifest.json` | | format, study, when, release, row count per file |

- Answers and units, the large tables, are read with a database cursor in
  batches of a few thousand rows and written into the zip as they come.
  The small tables (one row per coder, design version, device) come from
  the existing functions.
- One read-only snapshot for all files, so they match each other.
- `manifest.json` is written last: a file without it, or with other counts,
  is incomplete.
- Span answers keep their `text` (also derivable from the unit version):
  convenient for reading answers and comparing spans.

## Caching

An export is stored per study under a stamp of what it holds: the latest
answer change, the number of answers, the latest unit version, design
version, deployment and deletion. Asking again with the same stamp returns
the stored file; a new stamp writes a new one and removes the old.

## File storage

A small interface: `put` a stream under a key, `read` it, `remove` it, and
a download `url` for it.

- **Disk** (now): files in `ANNOTINDER_FILES_DIR` (default: a temp folder;
  the files are a cache). The URL is a signed link to the server,
  `/api/files/<token>`, valid an hour; the token names the file and its
  expiry, signed with the server's secret.
- **S3** (later): the same stream into an S3 upload, a presigned URL. For
  self-hosting, Garage in `compose.yml` (lightweight, basic S3 with presigned
  URLs); or any hosted S3. Tests use the disk backend; an extra test job can
  run against a real S3 container.

## Clients

- The browser asks for the export, downloads it, and builds the results zip
  from it as it does now (CSV tables, labels). It can also save the raw
  export as is.
- R and Python read the JSON lines (`jsonlite::stream_in`,
  `pandas.read_json(lines=True)`) and reshape them themselves; a small
  helper package can do that later.
- The paged answers API stays, for scripts that fetch what is new.
