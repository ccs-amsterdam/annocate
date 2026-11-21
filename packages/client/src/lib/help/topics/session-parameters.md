---
title: URL parameters
section: Coders
order: 2
summary: Values a link carries in its URL - a distribution channel, a wave, a panel's ids - available in the design as $session values.
---

A **URL parameter** is a value added to a study's link by whoever shares
it: `?wave=2`, `?school=north`, or the ids an online panel fills in. The
design uses it as `$session.<name>`, in conditions, texts and an end item's
return link.

In the editor, **URL parameters** (above the item tree) lists them. Next to
it, **Coder invitations** says who codes and how they get in (see
[Links](links.md#coder-invitations)). Both are part of the study's entry,
not items in the tree.

The values are read when the session starts and stored with it, so coders
can come back without them, and they appear in the results (`coders.csv`,
as `session.<name>`).

## Adding a parameter

Click **+ URL parameter** and set:

| Setting           | What it is                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| **Name**          | The name in the design: `$session.<name>`                                   |
| **In the URL as** | The key in the link, e.g. `STUDY_ID` (default: the name)                    |
| **Values**        | **Any value**, **From a list** (one per line) or **Matching a pattern**     |
| **Default**       | Used when the link has none. Without a default the parameter is required    |
| **Description**   | For you and your colleagues: what the parameter is for                      |

Any value is up to 256 characters. A **pattern** is a regular expression
the whole value must match, such as `[0-9]{6}` or `a|b|c`.

## Required parameters

A parameter without a default is **required**: a link without it, or with
a value that isn't in the list or doesn't match the pattern, doesn't start.
The coder sees an error instead of the study. Under **Deploy › Links**, the
copied links end in placeholders for the required parameters
(`?wave=<wave>`): replace them with a value, or let a panel fill them in.

## A link per value

For a parameter with a list of values, **Deploy › Links** can list a link
per value (**A link per value of a URL parameter**), for instance one per
school to send around. Nothing new is made: these are the study's links
with the value filled in.

## Built-in values

| Value                  | What it is                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `$session.source`      | The `?source=` of any link, if given: where a coder came from (a newsletter, a QR code). Never required         |
| `$session.coder`       | Who the coder is: with specific coders their value in the coders' column (see [Giving each coder their own units](own-units.md)); with a crowd the coder id from its URL parameter, or the email address of coders who must sign in (see [Links](links.md#coder-ids)) |

These names can't be used for your own parameters.

## Public title

At the top of the item tree, in place: the **title shown to coders**, what
coders see as the study's name, on their list of studies and in the coding
screen's menu and browser tab. The study's own name stays private, so it can
say what the study is about. Without one, coders see "Untitled study".

## Experiments

URL parameters aren't for experimental conditions: a value someone types
into a link isn't random. Draw conditions with a computed item instead
(see [Experimental conditions](experimental-conditions.md)). A URL
parameter can still steer the design, for instance a `language` parameter
in show-if rules.
