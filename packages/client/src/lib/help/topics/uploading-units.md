---
title: Uploading units
section: Units and distribution
order: 1
summary: Upload the material to code from a CSV file - ids, fields and their types, and replacing units.
---

**Units** are what coders code: articles, posts, survey answers, image
links. Upload them as a CSV file on **Units**. Each row is a
unit; the columns you choose become **fields**, shown in a design as
`$unit.headline`. Uploaded units are drafts until you deploy.

## Preparing the file

- first row: column names;
- separated by commas (not semicolons);
- values with commas, quotes or line breaks between double quotes
  (spreadsheets, R and Python do this);
- saved as UTF-8.

One column holds a **unique id** per unit (an article number, a tweet id):
it identifies units in the results and on re-upload.

```text
id,headline,source,text
a001,Storm hits the coast,Daily Planet,"Heavy rain and wind caused flooding in several towns on Tuesday."
a002,Minister resigns,Morning Post,"The minister of finance stepped down after weeks of criticism."
```

> Upload only what coders may see plus what you need to recognize units.
> Coders only receive fields the design uses (see
> [What coders get](#what-coders-get)).

## Uploading step by step

1. **Upload CSV** → **Choose a CSV file** (or drop it).
2. Check the id column: its **Type** is **unit id** (AnnoTinder picks
   `id`, `externalid`, `external_id` or the first column). Shown as
   `$unit.id`.
3. Under **Columns to upload**, give each column you want a name under
   **Upload as field**, or click **Use column names** (`Publication date`
   becomes `publication_date`).
4. Check the preview and click **Upload … units**.

Field names: letters, digits and `_`, not starting with a digit, at most
64 characters.

### Types

| Type      | Values                | Example                       |
| --------- | --------------------- | ----------------------------- |
| `text`    | anything              | headlines, texts, image links |
| `number`  | numbers (`.` decimal) | `128`, `-3.5`                 |
| `boolean` | `true` or `false`     | whether a post was deleted    |
| `list`    | a list per unit       | `EU; NATO`, `["EU", "NATO"]`  |

The type is suggested from the values. Values that don't fit block the
upload (_3 values aren't numbers ('n/a', '3,5')_). Use `number` to
calculate or compare; ids with leading zeros (`007`) should be `text`.

A `list` is for things that differ per unit, such as the topics or
people a question offers for this unit
([options from data](nominal-and-ordinal.md#options-from-data)). A cell
is words with `;` between them, or a JSON list: of words, or of options
with a label and optionally a value and colour
(`[{"label": "EU", "value": "eu", "color": "blue"}]`). JSON lists are
recognized by themselves; choose `list` for a column of words with `;`.

### Role columns

Columns named `coder_set`, `condition_set`, `part_set` or `test_set` are
those [columns with a role](sets.md), not fields: who codes each unit
(`anna`, `anna;bob`, `anna#3`), each condition's or part's units, and the
test units (`overlap`, `practice`, `gold`). Their **Type** is **column with
a role**; any column can be made one. Right answers for practice and gold
units go in `answer_<question>` (and feedback in `feedback_<question>`),
see [Overlap, gold and practice units](special-units.md). See
[Role columns in your CSV](sets.md#role-columns-in-your-csv).

## Uploading more units later

All units share the study's fields. A column named like an existing field
keeps its type; new columns become new fields (empty for earlier units).

The fields are listed at the top of **Units**; **Details** shows how the
design uses each (_shown_, _sent, not shown_, _server only_, _not used_;
the test set is used by every unit loop, the coder, condition and part
sets when the design selects units by them).
Unused fields can be removed; a field the design uses but no upload
brought can be declared there.

## Replacing units

Uploading ids that exist asks you to tick **Replace the … units that
already exist**: for fixing a typo. **Coded** units need a second tick,
**Also replace the … coded units**:

- after deploying, coders get the new content;
- earlier answers stay linked to the version their coder saw (both are in
  the [results](results.md));
- spans made on the old text may no longer fit.

Avoid this in a running study, and report it if you do.

## Looking at and deleting units

Click a unit's id to see all its fields. The bin icon deletes a unit;
coded units can't be deleted (a lock shows).

## What coders get

Only the fields the design uses (layout, texts, conditions). Metadata such
as dates or weights stays on the server.

Next: [coder, condition and part sets](sets.md), [handing out units](unit-distribution.md),
[layout templates](layout-templates.md). Scripts can upload too: see
[Scripts and the researcher API](researcher-api.md).
