---
title: Scripts
section: Editor
order: 5
summary: Small JavaScript expressions in {{ }} and in conditions, for when a plain value or the rules editor isn't enough.
---

Most designs need no scripts. A **script** is for the rest: a
calculation, a shortened text, a choice between two sentences, a condition
that mixes _and_ and _or_. It is one **JavaScript expression**, like a
spreadsheet formula. In a template, write it between double braces:

```example
unit:
  likes: 128
  shares: 17
---
This post was liked $unit.likes times and shared $unit.shares times:
{{ $unit.likes + $unit.shares }} reactions in total.
```

## Where scripts work

- `{{ }}` in a loop's layout items, question and instruction texts, and end item
  messages;
- a block's or loop's condition in **Script** mode (see
  [Conditions](conditions.md#script-mode));
- a `::: if` block (see [Showing parts conditionally](template-blocks.md)).

Not in redirect links.

## What a script can use

- `$unit`: the unit's fields (in a loop);
- `$var`: answers, as elsewhere (`$var.topic.value`, see
  [Referring to answers and unit data](references.md)); unanswered is
  `null` or `[]`;
- `$session`: session values (see [URL parameters](session-parameters.md));
- the [helper methods](conditions.md#helper-methods):
  `$var.age.gte(18)`.

Names are written out (`$var.topic.value`, not `$var["topic"]`) so the
editor can check them.

## Examples

### Text

```example
unit:
  headline: storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday. Residents were evacuated as water levels kept rising.
---
## {{ $unit.headline.toUpperCase() }}

{{ $unit.text.slice(0, 60) }} ...

*{{ $unit.text.split(" ").length }} words*
```

Useful: `.toUpperCase()`, `.toLowerCase()`, `.slice(0, 200)`, `.length`,
`.split(" ")`, `.replace("old", "new")`, `.includes("word")`, `.trim()`.

### Numbers

```example
unit:
  likes: 128
  shares: 17
  followers: 5400
---
Reactions per 100 followers: {{ (100 * ($unit.likes + $unit.shares) / $unit.followers).toFixed(1) }}

Rounded: {{ Math.round($unit.likes / 10) * 10 }} likes
```

### Choosing between two texts

`condition ? "this" : "that"`; chain for more cases:

```example
unit:
  likes: 128
answers:
  age: 34 | 15 | -
---
This is {{ $unit.likes >= 100 ? "a popular" : "an ordinary" }} post.

{{ !$var.age.answered ? "You didn't give your age." : $var.age.gte(18) ? "You are 18 or older." : "You are under 18." }}
```

For longer texts, a `::: if` block reads better.

### Lists

Lists are shown with commas; `.join()` uses something else:

```example
unit:
  tags: storm;flooding;weather
---
Tags: {{ $unit.tags.split(";") }}

Hashtags: {{ $unit.tags.split(";").map((tag) => "#" + tag).join(" ") }}

Number of tags: {{ $unit.tags.split(";").length }}
```

With answers: `{{ $var.topics.labels.join(" and ") }}`.

### Conditions

```text
$var.consent.answered && ($var.age.lt(18) || $var.country.is("other"))
$unit.text.length > 2000 && !$var.skim.is("yes")
```

## How results are shown

Text as text (see
[Text is shown as text](layout-templates.md#text-is-shown-as-text)); add a
suffix such as `{{ ... }}::markdown` for markdown, images or HTML. Numbers
and true/false as written, lists with commas, `null` as nothing.

## Limits

- Scripts run in a sandbox in the coder's browser: no internet, no page
  access, no memory between runs; at most 100 ms and 1 MB.
- A failing script shows nothing, or counts as _false_ in a condition.
- One expression: no `let`, `if` or `for` (use `? :`, `.map()`,
  `.filter()`). No `}}` inside.
- Scripts only rerun when a value they use changes: don't use
  `Math.random()`; use an [experiment](random-condition.md).

In **Script** mode syntax errors show as you type. In `{{ }}` only the `$`
names are checked, so try the result in the preview.
