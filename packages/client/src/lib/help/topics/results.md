---
title: Results
section: Results
order: 1
summary: Answers and agreement so far, and the results zip - annotations, coders, units and variables as CSV files - and how to read and join them in R or Python.
---

On **Results › Download**, choose **CSV** (the default: plain files for R,
Python or SPSS) or **Excel (.xlsx)** (one workbook, a sheet per table), and
click **Download**: everything answered so far, as a zip. Download as often
as you like, also while coding runs. **Download settings** (folded) has the
label columns, reset answers, and the raw export.

| File                  | A row per                        | Holds                                                   |
| --------------------- | -------------------------------- | ------------------------------------------------------- |
| `annotations.csv`     | unit and coder                   | answers to loop questions                               |
| `coders.csv`          | coder session                    | who, how far, and answers outside loops                 |
| `units.csv`           | unit version                     | the units as coders saw them                            |
| `variables.csv`       | design version, question, option | the codebook: values and labels                         |
| `designs/v<n>.json`   | design version                   | the whole design, with the AnnoTinder release it ran on |
| `devices.csv`         | device                           | kind, browser, operating system                         |
| `display_changes.csv` | display change                   | shortcut style, screen width, theme                     |
| `timings.csv`         | answer                           | time per question                                       |
| `deleted_coders.csv`  | deleted session                  | to delete them from earlier downloads too               |
| `README.txt`          |                                  | what the columns mean                                   |

Files are UTF-8; times are UTC (`2026-10-27T14:05:00.000Z`). As Excel, each
table is a sheet of the same name in `results.xlsx`; its text cells are
plain text, never run as formulas.

**Raw export** (under **Download settings**) saves the data as the server keeps
it, for scripts: a JSON-lines file per table and `manifest.json`. See the
[researcher API](researcher-api.md) for reading it in R or Python.

## Looking at the answers in the app

Before **Download**, four views of the answers so far (click **Refresh**
for the latest); Results opens on **Questions**:

- **Questions**: per question, how often each option was chosen; for
  numbers the range, median and mean.
- **Agreement**: per question in a unit loop, over units two or more coders
  answered: Krippendorff's alpha (1 is full agreement, 0 what chance gives;
  from 0.8 commonly taken as reliable) and the share of pairs of coders
  who agree.
  Click a question to see, **Per coder**, each coder's agreement with the
  others, with their mean Cohen's kappa (the average of their kappa with
  each other coder, weighed by the units they share), lowest first: who to
  look at; or **Kappa per pair**, a matrix of up to ten coders (hover a cell
  for the units the pair shares). Several answers: a row per option. Spans: a row per label, each word labelled or not.
- **Units**: the units two or more coders answered, the ones they disagree
  on most first. Open one to see it with the loop's first layout, with
  each coder's answers.
- **Coders**: every coder session, with progress, deletion requests,
  resetting and deleting (see [Coders and progress](coders-and-progress.md));
  then per coder their median seconds per unit (marked **fast** when far
  under the others), practice tries, and their mean kappa with the other
  coders over all questions, lowest first.

## annotations.csv

A row per unit a coder coded:

| Column                             | Meaning                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `unit_id`                          | your unit id                                                    |
| `unit_version_id`                  | the version the coder saw (see `units.csv`)                     |
| `session_id`, `coder`, `link`      | the session, coder id and link label                            |
| `first_answer`, `last_change`      | first answer and last change for this unit                      |
| `design_version`                   | the version first answered under                                |
| `device_id`                        | the device (see `devices.csv`)                                  |
| `unit_ms_client`, `unit_ms_server` | time on the unit, by the browser and by the server              |
| one column per question            | the answers (a [scale](scale.md): one per item, `trust.police`) |

### How answers are written

- **Values, not labels**: `2` or `pos`. With **Add label columns** (on by
  default) a `<question>.label` column has the label the coder saw.
- **Several answers**: joined with `; `.
- **Special answers** (don't know, not applicable): their code, or empty
  without one; a `<question>.special` column says which.
- **Spans**: `person: Angela Merkel`; parts of a gapped span joined with
  `…`.
- **Relations**: `criticizes: Merkel → Commission`.
- **Confirm**: `true`.
- **Empty**: skipped, or not in the coder's design version.
- **`<question>.json`** for spans, relations and several answers: the
  full answer, with span positions (`offset` from 0, `length`, `text`)
  and span ids. Read with `jsonlite::fromJSON` or `json.loads`.

See [Values and labels](design-values-and-labels.md).

## coders.csv

A row per session (`session_id`; a coder who restarted on another device
has two):

| Column                                                   | Meaning                                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `session_id`, `coder`, `email`, `link`                   | who (`email` only with required [sign-in](links.md#login))                                                                   |
| `started`, `last_active`                                 | start and last answer                                                                                                        |
| `ended`, `ended_at`                                      | `complete`, `screenout` ([end items](end-items.md)) or `quit`                                                                |
| `deletion_requested`                                     | when they asked for deletion (see [Deleting a coder's data](coders-and-progress.md#deleting-a-coders-data))                  |
| `display`                                                | keys, width (in [responsive](answer-layouts.md#fixed-or-responsive) studies) and theme, e.g. `numbers, narrow; numpad, wide` |
| `session.<name>`                                         | URL parameters and `source`                                                                                                  |
| `finished_<loop id>`                                     | units finished per loop, e.g. `finished_loop_1` (see `variables.csv` for the loops' labels)                                  |
| `overlap_finished`, `gold_finished`, `practice_finished` | test units finished (see [Overlap, gold and practice units](special-units.md))                                               |
| one column per question                                  | answers outside loops and [experiments](random-condition.md)                                                                 |

## units.csv

A row per **unit version** that was coded: `unit_version_id`, `unit_id`,
`hash`, `deployed`, every field, and each [role column](sets.md)
(`coder_set`, `condition_set`, `part_set`, `test_set`). A unit replaced after coding (see
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

| Column                                       | Meaning                                                    |
| -------------------------------------------- | ---------------------------------------------------------- |
| `unit_id`, `session_id`, `coder`, `variable` | which answer                                               |
| `first_ms`                                   | on screen until the first answer                           |
| `total_ms`                                   | on screen over all visits                                  |
| `hidden_ms`                                  | page hidden meanwhile (not in `total_ms`)                  |
| `edits`                                      | how often the answer changed                               |
| `practice_tries`                             | tries on a practice unit                                   |
| `server_ms`                                  | the server's own measure                                   |
| `exceeds_server`                             | `true` if the browser claims more time than the server saw |

Browsers can be tampered with, the server can't: `exceeds_server` flags
that.

## Column names

A question's name is its column, so a question can't be called like one of
the download's own columns (`coder`, `link`, `session_id`, `started`, …):
the design editor says so. Names are also unique without regard to capitals
(`Topic` and `topic` can't both be questions), since SPSS, Stata and
spreadsheets don't tell them apart. A question's extra columns are named
after it with a dot: `topic.label`, `topic.special`, `topic.comment`,
`topic.json`; a scale's items likewise (`media.emotional`,
`media.emotional.label`), so a scale item can't be called `label`,
`special`, `comment` or `json`. In R, read the files with
`check.names = FALSE` (or readr) to keep the dots as they are; in Stata and
SPSS the dots become underscores on import.

`README.txt` starts with `export_format: 1`: the version of these file and
column names.

## variables.csv

The codebook: per design version, question and option, the
`loop` and `loop_label` (the loop's id, e.g. `loop_1`, and its label; empty
outside loops), `variable`, `type`, `question`, `value`, `label` and `special`
(a special answer's kind: `not_applicable`, `dont_know`; its value is its
code, empty if it has none).
`loop` matches the coders'
`finished_<loop id>` columns.

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

| To add                               | Join on                                              |
| ------------------------------------ | ---------------------------------------------------- |
| coder details and background answers | `session_id`                                         |
| the unit as the coder saw it         | `unit_version_id`                                    |
| the device                           | `device_id`                                          |
| response times                       | `unit_id`, `session_id`, `variable` in `timings.csv` |
| labels of a design version           | `design_version`, `variable` (and `value`)           |
| your own data                        | `unit_id`                                            |

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
