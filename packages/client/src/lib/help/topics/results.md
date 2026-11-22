---
title: Results
section: Results
order: 1
summary: Answers and agreement so far, and the results zip - annotations, coders, units and variables as CSV files - and how to read and join them in R or Python.
---

On **Results**, click **Download zip**: everything answered so far, as CSV
files. Download as often as you like, also while coding runs.

| File                  | A row per                    | Holds                                                      |
| --------------------- | ---------------------------- | ---------------------------------------------------------- |
| `annotations.csv`     | unit and coder               | answers to loop questions                                  |
| `coders.csv`          | coder session                | who, how far, and answers outside loops                    |
| `units.csv`           | unit version                 | the units as coders saw them                               |
| `variables.csv`       | design version, question, option | the codebook: values and labels                        |
| `designs/v<n>.json`   | design version               | the whole design, with the AnnoTinder release it ran on    |
| `devices.csv`         | device                       | kind, browser, operating system                            |
| `display_changes.csv` | display change               | keys for answers, screen width, theme                      |
| `timings.csv`         | answer                       | time per question                                          |
| `deleted_coders.csv`  | deleted session              | to delete them from earlier downloads too                  |
| `README.txt`          |                              | what the columns mean                                      |

Files are UTF-8 (with a marker for spreadsheets); times are UTC
(`2026-10-27T14:05:00.000Z`).

**Raw export** (under the zip's options) saves the data as the server keeps
it, for scripts: a JSON-lines file per table and `manifest.json`. See the
[researcher API](researcher-api.md) for reading it in R or Python.

## Looking at the answers in the app

Next to **Download**, four views of the answers so far (click **Refresh**
for the latest):

- **Questions**: per question, how often each option was chosen; for
  numbers the range, median and mean.
- **Agreement**: per question in a unit loop, over units two or more coders
  answered: Krippendorff's alpha (1 is full agreement, 0 what chance gives;
  from 0.8 commonly taken as reliable) and the share of coders who agree.
  Click a question to see each coder's agreement with the others, with
  Cohen's kappa, lowest first: who to look at. Several answers: a row per
  option. Spans: a row per label, each word labelled or not.
- **Units**: the units two or more coders answered, the ones they disagree
  on most first. Open one to see it as coders did, with each coder's answers.
- **Coders**: per coder their units, the median seconds per unit (marked
  **fast** when far under the others), practice tries, and their kappa with
  the other coders, lowest first.

## annotations.csv

A row per unit a coder coded:

| Column                        | Meaning                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `unit_id`                     | your unit id                                                            |
| `unit_version_id`             | the version the coder saw (see `units.csv`)                             |
| `session_id`, `coder`, `link` | the session, coder id and link label                                    |
| `first_answer`, `last_change` | first answer and last change for this unit                              |
| `design_version`              | the version first answered under                                        |
| `device_id`                   | the device (see `devices.csv`)                                          |
| `unit_ms_client`, `unit_ms_server` | time on the unit, by the browser and by the server                 |
| one column per question       | the answers (a [scale](scale.md): one per item, `trust.police`)         |

### How answers are written

- **Values, not labels**: `2` or `pos`. With **Add label columns** (on by
  default) a `<question>_label` column has the label the coder saw.
- **Several answers**: joined with `; `.
- **Spans**: `person: Angela Merkel`; parts of a gapped span joined with
  `…`.
- **Relations**: `criticizes: Merkel → Commission`.
- **Confirm**: `true`.
- **Empty**: skipped, or not in the coder's design version.
- **`<question>_json`** for spans, relations and several answers: the
  full answer, with span positions (`offset` from 0, `length`, `text`)
  and span ids. Read with `jsonlite::fromJSON` or `json.loads`.

See [Values and labels](design-values-and-labels.md).

## coders.csv

A row per session (`session_id`; a coder who restarted on another device
has two):

| Column                                       | Meaning                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `session_id`, `coder`, `email`, `link`       | who (`email` only with required [sign-in](links.md#login))         |
| `started`, `last_active`                     | start and last answer                                              |
| `ended`, `ended_at`                          | `complete`, `screenout` ([end items](end-items.md)) or `quit`      |
| `deletion_requested`                         | when they asked for deletion (see [Deleting a coder's data](coders-and-progress.md#deleting-a-coders-data)) |
| `display`                                    | keys, width (in [responsive](answer-layouts.md#fixed-or-responsive) studies) and theme, e.g. `numbers, narrow; numpad, wide` |
| `session.<name>`                             | URL parameters and `source`                                        |
| `finished_<loop>`                            | units finished per loop                                            |
| `overlap_finished`, `gold_finished`, `practice_finished` | special units finished (see [Overlap, gold and practice units](special-units.md)) |
| one column per question                      | answers outside loops and [random conditions](random-condition.md) |

## units.csv

A row per **unit version** that was coded: `unit_version_id`, `unit_id`,
`hash`, `deployed`, every field, and each [set column](sets.md) (or
`<name>_set`). A unit replaced after coding (see
[Uploading units](uploading-units.md#replacing-units)) has a row per
version: join on `unit_version_id` to know which text an answer is about.

## devices.csv and display_changes.csv

`devices.csv`: `device_id`, `session_id`, `device_type` (phone, tablet,
desktop), `browser`, `os`, `first_used`. Coarse categories, not a
fingerprint.

`display_changes.csv`: per change, `session_id`, `at`, `keys` (`numbers`,
`numpad`, `letters`, `filter`), `width` (`narrow`/`wide`, responsive
studies only) and `theme`. The display at an answer is the last row before
it.

## timings.csv

Per answer, in milliseconds:

| Column                            | Meaning                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `unit_id`, `session_id`, `coder`, `variable` | which answer                                    |
| `first_ms`                        | on screen until the first answer                           |
| `total_ms`                        | on screen over all visits                                  |
| `hidden_ms`                       | page hidden meanwhile (not in `total_ms`)                  |
| `edits`                           | how often the answer changed                               |
| `practice_tries`                  | tries on a practice unit                                   |
| `server_ms`                       | the server's own measure                                   |
| `exceeds_server`                  | `true` if the browser claims more time than the server saw |

Browsers can be tampered with, the server can't: `exceeds_server` flags
that.

## variables.csv

The codebook: per design version, question and option, the `loop`,
`variable`, `type`, `question`, `value`, `label` and `special`. Swipe has
the type `annotinder`.

## Reading the files in R

```r
library(readr)
library(dplyr)

unzip("news_tone_2026-10-27.zip", exdir = "results")

annotations <- read_csv("results/annotations.csv", col_types = cols(unit_id = "c"))
coders      <- read_csv("results/coders.csv")
units       <- read_csv("results/units.csv", col_types = cols(unit_id = "c"))

# Answers with the coder's background and the text they coded
d <- annotations |>
  left_join(select(coders, -coder, -link), by = "session_id") |>
  left_join(select(units, -unit_id), by = "unit_version_id")
```

Reading `unit_id` as text keeps ids such as `007` intact.

## Reading the files in Python

```python
import zipfile
import pandas as pd

with zipfile.ZipFile("news_tone_2026-10-27.zip") as z:
    z.extractall("results")

read = lambda name, **kw: pd.read_csv(f"results/{name}.csv", encoding="utf-8-sig", **kw)
annotations = read("annotations", dtype={"unit_id": str})
coders = read("coders")
units = read("units", dtype={"unit_id": str})

d = (annotations
     .merge(coders.drop(columns=["coder", "link"]), on="session_id", how="left")
     .merge(units.drop(columns=["unit_id"]), on="unit_version_id", how="left"))
```

## Joining the files

| To add                                 | Join on                                               |
| -------------------------------------- | ----------------------------------------------------- |
| coder details and background answers   | `session_id`                                          |
| the unit as the coder saw it           | `unit_version_id`                                     |
| the device                             | `device_id`                                           |
| response times                         | `unit_id`, `session_id`, `variable` in `timings.csv`  |
| labels of a design version             | `design_version`, `variable` (and `value`)            |
| your own data                          | `unit_id`                                             |

## Reset answers and scripts

**Include answers that were reset** adds `reset_answers.csv` (see
[Resetting answers](changing-a-live-design.md#resetting-answers)). Scripts
can get the same data, or only what is new: see
[Scripts and the researcher API](researcher-api.md).

## Backing up or moving a study

For a full copy (to restore or move servers), study admins use
**Settings** → **Export study**: units, design versions, links, coders and
answers in one file. **Create new study** → **From a file** makes a copy,
with or without coders and answers; it gets new links and session ids
(match by `coder`). Keep the file as safe as the study.
