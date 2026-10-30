---
title: Uploading units
section: Units and distribution
order: 1
summary: Upload the material to code from a CSV file - ids, fields and their types, and replacing units.
---

**Units** are the material coders code: news articles, tweets, survey
answers, image links. You upload them as a CSV file on the **Units** tab of a
job. Each row becomes a unit, and the columns you choose become its
**fields**, which a codebook shows with `$unit.<field>`, for example
`$unit.headline`.

A small file is enough to start: you can upload more units at any time, and
add new columns later. Loops over all units of the job hand out new units
right away, also while coding runs, without publishing the codebook again.

## Preparing the file

AnnoTinder reads a CSV file:

- the first row holds the column names;
- the values are separated by commas (not semicolons, as some spreadsheet
  programs in Europe use);
- a value that contains commas, quotes or line breaks is put between double
  quotes, with quotes inside it doubled (`"He said ""no"""`). Spreadsheet
  programs and R or Python do this for you when they save a CSV;
- the file is saved as UTF-8, so accents, emoji and other scripts come out
  right.

One column must hold a **unique id** for every unit: your own id, such as an
article number or a tweet id. It is how you recognize units in the results,
and how AnnoTinder knows that a unit you upload again is the same unit.

```text
id,headline,source,text
a001,Storm hits the coast,Daily Planet,"Heavy rain and wind caused flooding in several towns on Tuesday."
a002,Minister resigns,Morning Post,"The minister of finance stepped down after weeks of criticism."
```

> Only upload what coders may see, plus what you need to recognize the
> units. Coders only ever receive the fields the codebook shows (see
> [What coders get](#what-coders-get)), but keeping personal data out of the
> job altogether is safest.

## Uploading step by step

1. Open the **Units** tab and click **Upload CSV**.
2. Click **Choose a CSV file**, or drop the file on the box.
3. Check which column has each unit's id: its **Type** is **unit id**
   (highlighted). AnnoTinder picks a column named `id`, `externalid` or
   `external_id` if there is one, and otherwise the first column; set
   another column's type to **unit id** to change it. The id isn't uploaded
   as a field: a layout shows it as `$unit.id`.
4. Under **Columns to upload**, choose which columns to upload, and as which
   field (see below).
5. Check the preview of the first rows, then click **Upload … units**.

Large files are uploaded in batches; the button shows how far it is.

## Columns and fields

The table under **Columns to upload** has a row per column of your file,
with a few example values. A column is uploaded when it has a name under
**Upload as field**; columns left empty (*not uploaded*) are ignored.

- Click **Use column names** to upload every column (except the id column)
  under its own name. Names are made valid: lower case, other characters
  become `_`, so `Publication date` becomes `publication_date`.
- Click **Clear** to start over and choose columns one by one.
- You can type another name for any column, for example `text` for a column
  called `body_text_clean`.

Field names may contain letters, digits and `_`, and may not start with a
digit (at most 64 characters). That way a codebook can use them as
`$unit.name`. A check mark shows that a column is fine; otherwise the
problem is shown next to it.

### Types

Every field has a **Type**:

| Type | Values | Example |
| --- | --- | --- |
| `text` | anything | headlines, texts, image links |
| `number` | numbers, with a decimal point | `128`, `-3.5`, `1e6` |
| `boolean` | `true` or `false` | whether a post was deleted |

AnnoTinder suggests the type from the values: `number` if every filled-in
value is a number, `boolean` if every one is `true` or `false`, else `text`.
You can change it. Values that don't fit the type are listed (for example
*3 values aren't numbers ('n/a', '3,5')*) and block the upload until you fix
the file or choose `text`.

Numbers matter when a codebook calculates with a field or compares it (for
example *show this question only when `likes` is over 100*). Ids or codes
with leading zeros, such as `007`, should be `text`: as a number they would
become `7`.

An empty cell is an empty value. In a codebook, an empty field shows
nothing.

### Sets columns

A column can also say which [sets](unitsets.md) each unit is in. Give it the
type **sets**: it isn't uploaded as a field, but makes a set group named
after the column. Each cell names the unit's sets, such as `s1`, `s1;s2` or
`s1#3` (third in `s1`), and `_overlap` for the group's overlap. Uploading
such a column replaces the group's sets. See
[A sets column in your CSV](unitsets.md#a-sets-column-in-your-csv).

## Uploading more units later

All units of a job have the same fields. The first upload sets them; later
uploads add to them:

- A column named like an existing field is uploaded as that field and keeps
  its type (*existing field*).
- New columns become new fields. Units uploaded before have no value for
  them.
- If no column is uploaded as an existing field, AnnoTinder warns you: the
  new units get empty values there.

You can see the job's fields, with an icon for their type, at the top of the
**Units** tab.

## Replacing units

If the file has ids that the job already has, AnnoTinder asks before it
replaces them: tick **Replace the … units that already exist (same id)**.
Use this to fix a typo or a broken text.

Replacing a unit that coders already answered about (a **coded** unit) needs
a second tick, **Also replace the … coded units**, because it changes what
later coders see:

- Coders from then on get the new content.
- Earlier answers stay linked to the version their coder saw. Both versions
  are in the [results](results.md), so you can tell which answers are about
  which text.
- Span annotations (selected text) were made on the old text, and may no
  longer fit the new one.

Avoid replacing coded units in a running study unless you must, and note it
in your report.

## Looking at a unit

Click a unit's id in the table to see all its fields in full, and whether
it was coded.

## Deleting units

Click the bin icon in a unit's row to delete it. Coded units can't be deleted
(they show a lock instead), because their answers would lose the unit they
are about. Replace them instead, if needed.

## What coders get

Coders only receive the fields the codebook uses: the fields named in the
loop's layout, in question texts, in conditions and so on. Other columns,
such as metadata you need for analysis (a source, a date, a sample weight),
stay on the server. If you later change the codebook to show another field,
coders get that field too from then on.

## Next steps

- Make [sets](unitsets.md) if different coders should get different
  units.
- Decide how units are [handed out](unit-distribution.md).
- Show the fields in a [layout template](layout-templates.md).
- Scripts can upload units too: see
  [Scripts and the researcher API](researcher-api.md).
