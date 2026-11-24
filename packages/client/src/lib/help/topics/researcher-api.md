---
title: Scripts and the researcher API
section: Results
order: 2
summary: Use AnnoTinder from R, Python or other scripts with an API key - upload units, make sets, list links, download answers.
---

Scripts can do what the researcher pages do, through the **researcher
API**: upload many units from R or Python (or every day), make sets from
your own data, list links, and download answers (or only what is new).
For an ordinary study you don't need it. This page assumes you have called
a web API before.

## API keys

1. Click your account (top right) → **API keys**.
2. Describe the key (_laptop R scripts_) and click **Create**.
3. Copy the key (`atk_...`); it is shown only once.

A key acts as you in every study you have a role in. Keep it out of shared
scripts (use an environment variable, e.g. in `.Renviron`) and **Revoke**
keys you no longer need.

## How requests work

The API is at your AnnoTinder address plus `/api`
(`https://annotinder.example.org/api/study`). Send the key in a header:

```text
Authorization: Bearer atk_...
```

JSON in and out. Errors: `401` (no valid key), `403` (role too low), `404`
(not found), `409` (not allowed now, e.g. an existing unit id). Most paths
start with the study's number; list studies to find it:

```text
curl -H "Authorization: Bearer $ANNOTINDER_KEY" https://annotinder.example.org/api/study
```

## What scripts can do

| Task                                  | Request                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| List or create studies                | `GET /study`, `POST /study` with `{ "name": ... }`                            |
| Upload units (max 200 per request)    | `POST /study/<id>/units`                                                      |
| List fields                           | `GET /study/<id>/units/fields`                                                |
| List, replace or delete role columns  | `GET /study/<id>/sets`; `PUT`, `DELETE /study/<id>/sets/<column>`             |
| Save a design version                 | `POST /study/<id>/design` with `{ "items": [...], "note": ... }`              |
| Deploy (makes the links)              | `PUT /study/<id>/deployment` with `{ "designVersionId": ..., "units": true }` |
| What deploying would change; versions | `GET /study/<id>/deployment/pending`, `.../deployment/versions`               |
| List links, change one                | `GET /study/<id>/links`; `PUT /study/<id>/links/<link id>`                    |
| Coders, with answers outside loops    | `GET /study/<id>/coders`                                                      |
| Answers, a page at a time             | `GET /study/<id>/annotations`                                                 |
| Units as coders saw them              | `GET /study/<id>/unit-versions`                                               |

Rights follow your study role: reading needs any role, changing (and
links, coders) a role that may edit, deploying admin. A design version is
the same JSON as the editor's JSON view.

## Uploading units

```json
{
  "units": [
    { "externalId": "a001", "data": { "headline": "Storm hits the coast", "likes": 128 } },
    { "externalId": "a002", "data": { "headline": "Minister resigns", "likes": null } }
  ]
}
```

The rules of [uploading a CSV](uploading-units.md) apply: the first upload
sets the fields and types; later uploads give every field a value (`null`
for empty). Existing ids need `"overwrite": true`, coded ones also
`"overwriteCoded": true`. Units and sets are drafts until deployed.

In R, with httr2:

```r
library(httr2)

server <- "https://annotinder.example.org/api"
study <- 12
api <- function(path) {
  request(server) |>
    req_url_path_append(path) |>
    req_auth_bearer_token(Sys.getenv("ANNOTINDER_KEY"))
}

articles <- readr::read_csv("articles.csv")
units <- lapply(seq_len(nrow(articles)), function(i) list(
  externalId = as.character(articles$id[i]),
  data = list(headline = articles$headline[i], text = articles$text[i])
))

# 200 units per request
for (batch in split(units, ceiling(seq_along(units) / 200))) {
  api(sprintf("study/%d/units", study)) |>
    req_body_json(list(units = unname(batch))) |>
    req_perform()
}
```

`PUT /study/<id>/sets/<column>` replaces a whole [role column](sets.md)
(`coder_set`, `condition_set`, `part_set` or `test_set`): each value is a
name with AnnoTinder's unit ids (`id` from
`GET /study/<id>/units`); `"ordered": true` keeps that order.

```r
uploaded <- api(sprintf("study/%d/units", study)) |> req_perform() |> resp_body_json()
ids <- sapply(uploaded, \(u) u$id)
api(sprintf("study/%d/sets/part_set", study)) |>
  req_method("PUT") |>
  req_body_json(list(sets = list(list(name = "pilot", unitIds = as.list(head(ids, 50)))))) |>
  req_perform()
```

## Downloading answers

`GET /study/<id>/annotations` gives a row per coder, question and unit
(`unitId` `null` outside loops; `assigned: true` for experiments),
up to `limit` (max 10000) per page. Pass `next` as `after` until it is
`null`:

```python
import os, requests

server, study = "https://annotinder.example.org/api", 12
headers = {"Authorization": f"Bearer {os.environ['ANNOTINDER_KEY']}"}

rows, after = [], None
while True:
    params = {"limit": 10000} | ({"after": after} if after is not None else {})
    page = requests.get(f"{server}/study/{study}/annotations", headers=headers, params=params).json()
    rows += page["annotations"]
    if page["next"] is None:
        break
    after = page["next"]
```

A row has `unitId`, `externalId`, `sessionId`, `coder`, `variable`,
`value` (a list of `values`, or `spans`, or `"skip": true`),
`designVersionId`, `unitVersionId`, `created` and `updated`.

- **Only what is new**: keep the last row's `id` and pass it as `after`
  next time. Changed answers keep their row (later `updated`): download
  everything to be sure of every change.
- **Reset answers**: `retired=true` includes them, with `retiredAt`.

> For most analyses the [results download](results.md) is easier: a column
> per question, with labels.
