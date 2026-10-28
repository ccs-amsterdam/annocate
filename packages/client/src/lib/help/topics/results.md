---
title: Downloading results
section: Results
order: 1
summary: The results zip - annotations, coders, units and variables as CSV files - and how to read and join them in R or Python.
---

On the **Results** tab, click **Download zip** to download everything coders
answered so far, as CSV files in a zip. You can download as often as you
like, also while coding is still going on: each download has all answers up
to that moment.

The zip is named after the job and the date, such as
`news_tone_2026-10-27.zip`, and contains:

| File | A row per | What is in it |
| --- | --- | --- |
| `annotations.csv` | unit and coder | the answers to the questions in unit loops |
| `coders.csv` | coder | who they are, how far they got, and their answers outside unit loops |
| `units.csv` | unit version | the units as coders saw them |
| `variables.csv` | codebook version, question and option | the questions, their values and labels |
| `README.txt` | | what the columns mean |

The files are UTF-8, with a marker at the start so that spreadsheet programs
read accents correctly. Times are in UTC, written like
`2026-10-27T14:05:00.000Z`.

## annotations.csv

A row for every unit a coder coded, in the order they coded them.

| Column | Meaning |
| --- | --- |
| `unit_id` | Your id of the unit (the id column of your upload) |
| `unit_version_id` | The version of the unit the coder saw: see `units.csv` |
| `coder_id` | The coder: see `coders.csv` |
| `participant_id` | The coder's participant id, if they have one (e.g. from a panel) |
| `invitation` | The label of the invitation the coder came in with |
| `first_answer`, `last_change` | When the coder first answered about this unit, and last changed an answer |
| `codebook_id` | The codebook version the unit was first answered under (the `_label` columns use each answer's own version): see `variables.csv` |
| `device_id` | The device the unit was (last) answered on: see `devices.csv` |
| `unit_ms_client` | Milliseconds the unit's questions were on screen, as the coder's browser measured them: see `timings.csv` |
| `unit_ms_server` | Milliseconds from the server handing out the unit to its last answer |
| one column per question | The answers |

The question columns are in the order of the codebook, named after the
questions. A [scale](scale.md) has a column per item, named
`question.item`, such as `trust.police`.

### How answers are written

- **Values, not labels.** A column holds the stored value of the answer,
  such as `2` or `pos`, not the text the coder clicked on.
- **Label columns.** With **Add label columns** ticked (the default), every
  question with options gets a second column, `<question>_label`, with the
  label the coder saw: the label in the codebook version they answered
  under. Untick it for smaller files with values only; the labels are also in
  `variables.csv`.
- **Several answers** (a question with multiple answers) are joined with
  `; `, for example `economy; politics`.
- **Selected text** ([spans](span.md)) is written as `value: text`, for
  example `person: Angela Merkel`, several spans joined with `; `. A span
  with gaps has its parts joined with ` … `.
- **Relations** are written as `value: from → to`, with the texts of the two
  spans, for example `criticizes: Merkel → Commission`.
- **A confirm question** (a button) is `true` once clicked.
- **Empty** means no answer: the question was skipped because a condition
  hid it, or it wasn't in the codebook version the coder answered under (a
  question added later).
- **JSON columns.** A question whose answer doesn't fit one cell (spans,
  relations, several answers) gets a third column, `<question>_json`, with
  the whole answer as JSON: for spans their value, the field they are in,
  and per fragment its `offset` (the position of its first character in the
  field of the unit version in `units.csv`, counting from 0), `length` and
  `text`; for relations the ids of their spans (the `id` in the span
  question's JSON); for several answers a list of values. Read it with
  `jsonlite::fromJSON` in R or `json.loads` in Python.

Values are the reason codebooks have values *and* labels: you can improve a
label while coding runs, and the values stay comparable. See
[Values and labels](design-values-and-labels.md).

## coders.csv

A row per coder who started.

| Column | Meaning |
| --- | --- |
| `coder_id`, `participant_id`, `email`, `invitation` | Who the coder is (`email` for coders who [logged in](invitations.md#login)) |
| `started`, `last_active` | When they started, and when they last answered |
| `ended`, `ended_at` | `complete` or `screenout` if their session ended at an end item (see [Ending a session](end-items.md)), `quit` if the coder quit, and when |
| `deletion_requested` | When the coder asked for their answers to be deleted, if they did and you haven't deleted them yet (see [Deleting a coder's data](coders-and-progress.md#deleting-a-coders-data)) |
| `finished_<loop>` | How many units they finished in each unit loop, such as `finished_News items` |
| one column per question | Their answers outside unit loops, and their [assigned variables](auto.md) (experimental group, URL parameters) |

Answers outside unit loops (consent, background questions, a survey's
questions) are only here, not in `annotations.csv`.

## units.csv

The units as coders saw them, a row per **unit version**: `unit_version_id`,
`unit_id`, a `hash` of the content, `first_shown`, and a column per field.
Only units that were coded are included, and only the fields the codebook
showed (other columns of your upload stay out: you have them already).

A unit normally has one version. A unit that was replaced after it was
coded (see [Uploading units](uploading-units.md#replacing-units)) has a row
per version, and every answer points to the version its coder saw. Join on
`unit_version_id`, not `unit_id`, to know exactly which text an answer is
about. This matters for spans: their text positions refer to the version
they were made on.

## devices.csv

The devices coders used, a row per device: `device_id`, `coder_id`,
`device_type` (phone, tablet or desktop), `browser`, `os` and `first_used`.
A coder who continued on another device has a row for each. These are
coarse categories, as survey tools report them, not a fingerprint of the
device.

## timings.csv

How long coders took, a row per answer, in milliseconds, as the coder's
browser measured it:

| Column | Meaning |
| --- | --- |
| `unit_id` | The unit (empty for questions outside unit loops) |
| `coder_id`, `participant_id`, `variable` | The coder and the question |
| `first_ms` | Time on screen until the first answer |
| `total_ms` | Time on screen over all visits (going back adds to it) |
| `hidden_ms` | Time the page was hidden meanwhile: another tab, a minimized window (not in `total_ms`) |
| `edits` | How often the answer changed |
| `server_ms` | The server's own measure: for a unit, from handing it out to its last answer (the same for all its questions); outside units, the time since the coder's previous answer |
| `exceeds_server` | `true` if the browser claims more time than the server saw (for a unit: all its questions together) |

A browser can be tampered with; the server can't. So use `server_ms` to
check the browser's times: `exceeds_server` marks a manipulated (or
broken) browser. Answers that are too fast show in both. Times include
reading the unit, so compare within a job, not across very different
units.

## variables.csv

The codebook, as a table: a row per codebook version (`codebook_id`), question
and option, with the `loop` the question is in (empty for questions asked
once per coder), the `variable` name, its `type`, the `question` text, and
the option's `value` and `label`. Questions without options, such as numbers,
have one row with empty `value` and `label`.

Use it as a codebook appendix, or to label values in R, SPSS or Stata. Swipe
questions have the type `annotinder` here.

## Reading the files in R

With the readr and dplyr packages:

```r
library(readr)
library(dplyr)

unzip("news_tone_2026-10-27.zip", exdir = "results")

annotations <- read_csv("results/annotations.csv", col_types = cols(unit_id = "c"))
coders      <- read_csv("results/coders.csv")
units       <- read_csv("results/units.csv", col_types = cols(unit_id = "c"))

# Answers with the coder's background and the text they coded
d <- annotations |>
  left_join(select(coders, -participant_id, -invitation), by = "coder_id") |>
  left_join(select(units, -unit_id), by = "unit_version_id")

# Answers per coder
count(annotations, coder_id)
```

Reading `unit_id` as text (`"c"`) keeps ids such as `007` intact. The
joins drop columns that are in both files, so they don't appear twice.

## Reading the files in Python

With pandas:

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
     .merge(coders.drop(columns=["participant_id", "invitation"]), on="coder_id", how="left")
     .merge(units.drop(columns=["unit_id"]), on="unit_version_id", how="left"))
```

`encoding="utf-8-sig"` removes the marker at the start of the file.

## Joining the files

| To add | Join on |
| --- | --- |
| a coder's details and background answers to their annotations | `coder_id` |
| the unit as the coder saw it | `unit_version_id` |
| the device an answer was given on | `device_id` in `devices.csv` |
| response times to the answers | `unit_id`, `coder_id` and `variable` in `timings.csv` |
| the labels of a codebook version | `codebook_id` and `variable` (and `value`) in `variables.csv` |
| your own data (metadata not shown to coders) | `unit_id`, with the id column of your own file |

## More detail with scripts

The download has the answers as they are now. With **Include answers that
were reset** it also has `reset_answers.csv`: the answers a researcher reset
(see [Resetting answers](changing-a-live-codebook.md#resetting-answers)), a
row per answer with when it was given (`answered`) and reset (`reset_at`).

Scripts can get the same data from the API, also only what is new since
the last download. See [Scripts and the researcher API](researcher-api.md).
