---
title: Scripts and the researcher API
section: Results
order: 2
summary: Use AnnoTinder from R, Python or other scripts with an API key - upload units, make unitsets and invitations, download answers.
---

Everything you do on the researcher pages can also be done by a script,
through AnnoTinder's **researcher API**. That is useful when you want to:

- upload thousands of units straight from R or Python, or upload new units
  every day;
- make unitsets from your own data, such as one set per newspaper;
- create many invitations at once, for example one per participant;
- download the answers into your analysis without clicking **Download zip**,
  or fetch only what is new since your last download.

You don't need this for an ordinary study: the pages do the same. This topic
assumes you have written a script that calls a web API before.

## API keys

A script logs in with a personal **API key**:

1. Click your account (top right) and choose **API keys**.
2. Type what the key is for, such as *laptop R scripts*, and click
   **Create**.
3. Copy the key (it starts with `atk_`). It is shown only once.

A key acts as you, in every job you have a role in. Treat it like a
password: don't put it in a script you share or in a public repository.
Store it in an environment variable instead (in R, in your `.Renviron`
file), and click **Revoke** next to a key you no longer need, or that may
have leaked. The list shows when each key was last used.

## How requests work

The API lives at the same address as AnnoTinder itself: if you open
AnnoTinder at `https://annotinder.example.org`, a script asks for
`https://annotinder.example.org/job` to list your jobs. Every request sends
the key in a header:

```text
Authorization: Bearer atk_...
```

Requests and responses are JSON. Errors come back with a status code and
an `error` message: `401` (no valid key), `403` (you have no, or not enough,
role in this job), `404` (not found), `409` (not allowed now, such as a unit
id that already exists).

Most paths start with the job's number, `/job/<id>/...`. A script finds it
by listing the jobs:

```text
curl -H "Authorization: Bearer $ANNOTINDER_KEY" https://annotinder.example.org/job
```

```json
[{ "id": 12, "name": "News tone", "archived": false, "created": "2026-10-01T09:12:44.000Z" }]
```

## What scripts can do

| Task | Request |
| --- | --- |
| List your jobs, create a job | `GET /job`, `POST /job` with `{ "name": ... }` |
| Upload units (at most 200 per request) | `POST /job/<id>/units` |
| List the job's fields | `GET /job/<id>/units/fields` |
| List, create, replace or delete unitsets | `GET`, `POST /job/<id>/unitsets`; `PUT`, `DELETE /job/<id>/unitsets/<set id>` |
| Save a codebook version | `POST /job/<id>/codebook` with `{ "items": [...], "note": ... }` |
| Publish a codebook version | `PUT /job/<id>/deployment` with `{ "codebookId": ... }` |
| List or create invitations | `GET`, `POST /job/<id>/invites` |
| Coders, with their answers outside unit loops | `GET /job/<id>/coders` |
| Answers in unit loops, a page at a time | `GET /job/<id>/annotations` |
| Units as coders saw them, a page at a time | `GET /job/<id>/unit-versions` |

What you may do depends on your role in the job, as on the pages: reading
units, codebooks and answers needs any role; changing them, and seeing
invitations and coders, needs a role that may edit; publishing needs the
job's admin role.

A codebook is the same JSON as in the codebook editor's JSON view: write it
in the editor, copy it, and a script can save it to another job.

## Uploading units

`POST /job/<id>/units` takes up to 200 units per request:

```json
{
  "units": [
    { "externalId": "a001", "data": { "headline": "Storm hits the coast", "likes": 128 } },
    { "externalId": "a002", "data": { "headline": "Minister resigns", "likes": null } }
  ]
}
```

The rules are those of [uploading a CSV](uploading-units.md): the first
upload sets the job's fields and their types (text, number or true/false,
from the JSON values), later uploads must give every existing field a value
of its type (`null` for empty) and may add fields. An id that already exists
is refused, unless you add `"overwrite": true`; replacing a unit that was
coded also needs `"overwriteCoded": true` (see
[Replacing units](uploading-units.md#replacing-units)).

In R, with the httr2 package:

```r
library(httr2)

server <- "https://annotinder.example.org"
job <- 12
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
  api(sprintf("job/%d/units", job)) |>
    req_body_json(list(units = unname(batch))) |>
    req_perform()
}
```

A unitset is a name with a list of AnnoTinder's own unit ids (`id` in the
response to the upload, or from `GET /job/<id>/units`), in the order coders
should get them:

```r
uploaded <- api(sprintf("job/%d/units", job)) |> req_perform() |> resp_body_json()
ids <- sapply(uploaded, \(u) u$id)
api(sprintf("job/%d/unitsets", job)) |>
  req_body_json(list(name = "pilot", unitIds = as.list(head(ids, 50)))) |>
  req_perform()
```

## Downloading answers

`GET /job/<id>/annotations` gives the answers in unit loops, one row per
unit, coder and question, in the order they were written, a page at a time
(up to `limit` rows, at most 10000). Pass the page's `next` as `after` to get
the next page, until `next` is `null`:

```r
annotations <- list()
after <- NULL
repeat {
  page <- api(sprintf("job/%d/annotations", job)) |>
    req_url_query(after = after, limit = 10000) |>
    req_perform() |>
    resp_body_json()
  annotations <- c(annotations, page$annotations)
  if (is.null(page$`next`)) break
  after <- page$`next`
}

# One value per row: the answer's values joined with "; "
d <- data.frame(
  unit = sapply(annotations, \(a) a$externalId),
  coder = sapply(annotations, \(a) a$coderId),
  question = sapply(annotations, \(a) a$variable),
  value = sapply(annotations, \(a) paste(sapply(a$value$values, \(v) v$value), collapse = "; "))
)
```

The same in Python, with requests:

```python
import os, requests

server, job = "https://annotinder.example.org", 12
headers = {"Authorization": f"Bearer {os.environ['ANNOTINDER_KEY']}"}

rows, after = [], None
while True:
    params = {"limit": 10000} | ({"after": after} if after is not None else {})
    page = requests.get(f"{server}/job/{job}/annotations", headers=headers, params=params).json()
    rows += page["annotations"]
    if page["next"] is None:
        break
    after = page["next"]
```

Each row has the unit (`unitId`, and your `externalId`), the coder
(`coderId`, `participantId`), the question (`variable`), the answer
(`value`), the codebook version (`codebookId`), the unit version the coder
saw (`unitVersionId`), and when it was first written and last changed
(`created`, `updated`). An answer `value` has a list of `values` (each with
`value`, and `item` for a scale), or `spans` for selected text, and
`"skip": true` for a question a condition hid.

Two things the download on the **Results** tab doesn't have:

- **Only what is new.** Rows come in the order they were first written, and
  new rows always get a higher `id`. Keep the `id` of the last row you got,
  and pass it as `after` next time to get only the rows written since. An
  answer a coder changes later (by going back) keeps its row, with a later
  `updated`: to be sure you have every change, download everything again.
- **Answers that were reset.** With `retired=true`, the rows also include
  answers that no longer count because they were reset, with `retiredAt`:
  when that happened.

Answers outside unit loops come with the coders, from
`GET /job/<id>/coders`: each coder's `variables`, in the same form.

> For most analyses, the [results download](results.md) is easier: it turns
> these rows into tables with a column per question, and adds the labels.
