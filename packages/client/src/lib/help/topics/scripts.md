---
title: Scripts
section: Codebook
order: 5
summary: Small JavaScript expressions in {{ }} and in conditions, for when a plain value or the rules editor isn't enough.
---

Most codebooks never need a script. Values such as `$unit.headline` and
`$var.topic.label` fill in texts, and the rules editor makes most
conditions. A **script** is for the rest: a calculation, a shortened text, a
choice between two sentences, a condition that mixes *and* and *or*.

A script is one **JavaScript expression**: a formula, like one in a
spreadsheet cell, that gives a value. In a template you write it between
double braces, and its result is shown in its place:

```example
unit:
  likes: 128
  shares: 17
---
This post was liked $unit.likes times and shared $unit.shares times:
{{ $unit.likes + $unit.shares }} reactions in total.
```

If you know a little JavaScript (or R, or Excel formulas), you will
recognise most of what follows. If not, the examples below cover the common
cases; copy and adapt them.

## Where scripts work

- In templates, as `{{ ... }}`: a loop's layout, question and instruction
  texts, and end item messages.
- As the condition of a condition item or a coder group, in **Script** mode
  (see [Conditions](conditions.md#script-mode)).
- As the condition of a `::: if` block in a template (see
  [Showing parts conditionally](template-blocks.md)).

Scripts can't be used in unitset names or redirect links: those take plain
`$var` references only.

## What a script can use

A script sees two names, and nothing else:

- `$unit`: the current unit's fields (inside a unit loop). Numbers are
  numbers, text is text.
- `$var`: the answers, with the same properties as elsewhere:
  `$var.topic.value`, `$var.topics.labels`, `$var.age.answered` (see
  [Referring to answers and unit data](references.md)). An unanswered
  question is `null` (lists: an empty list `[]`).

The [helper methods](conditions.md#helper-methods) work in scripts too:
`$var.age.gte(18)`, `$var.topics.has("sports")`.

As everywhere, names are written out: `$var.topic.value`, not
`$var["topic"]`. That way the editor can check that every question and
property you use exists and is asked before the script runs.

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

Useful text methods: `.toUpperCase()`, `.toLowerCase()`, `.slice(0, 200)`
(the first 200 characters), `.length` (the number of characters),
`.split(" ")` (cut into a list of words), `.replace("old", "new")`,
`.includes("word")` (true or false), `.trim()` (remove spaces around it).

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

`+ - * /` calculate, `Math.round()`, `Math.min()` and `Math.max()` round
and compare, `.toFixed(1)` shows one decimal.

### Choosing between two texts

`condition ? "this" : "that"` gives `"this"` if the condition holds and
`"that"` if not. Chain them for more than two cases:

```example
unit:
  likes: 128
answers:
  age: 34 | 15 | -
---
This is {{ $unit.likes >= 100 ? "a popular" : "an ordinary" }} post.

{{ !$var.age.answered ? "You didn't give your age." : $var.age.gte(18) ? "You are 18 or older." : "You are under 18." }}
```

For larger pieces of text that depend on an answer, a `::: if` block is
easier to read than a script (see
[Showing parts conditionally](template-blocks.md)).

### Lists

A question with several answers gives a list (`$var.topics.labels`), and
so does `.split()`. A list shown as it is gets commas between its items;
`.join()` puts something else between them:

```example
unit:
  tags: storm;flooding;weather
---
Tags: {{ $unit.tags.split(";") }}

Hashtags: {{ $unit.tags.split(";").map((tag) => "#" + tag).join(" ") }}

Number of tags: {{ $unit.tags.split(";").length }}
```

With answers: `{{ $var.topics.labels.join(" and ") }}`, or
`{{ $var.topics.values.includes("sports") }}` (though
`$var.topics.has("sports")` says the same and is checked better).

### Conditions

A condition script gives true or false. Two that the rules editor can't
make:

```text
$var.consent.answered && ($var.age.lt(18) || $var.country.is("other"))
$unit.text.length > 2000 && !$var.skim.is("yes")
```

## How results are shown

- Text is shown as text, exactly as it is (see
  [Text is shown as text](layout-templates.md#text-is-shown-as-text)). To
  show a result as markdown, an image or HTML, put a suffix *after* the
  closing braces: `{{ ... }}::markdown`.
- Numbers are shown as numbers, `true` and `false` as those words.
- Lists are joined with commas.
- `null` (an unanswered question) shows nothing.

## Limits

Scripts run in a closed-off sandbox in the coder's browser:

- They only see `$unit` and `$var`. They can't load anything from the
  internet, read or change the page, or remember anything between runs.
- A script may run for at most 100 milliseconds and use at most 1 MB of
  memory. That is plenty for anything a codebook needs.
- A script that fails (an error, a mistake in its writing, a timeout) shows
  nothing in a template, and counts as *false* as a condition. Coders don't
  see an error.
- A script is one expression: no `let`, `if` or `for` statements. Use
  `? :` instead of `if`, and `.map()` or `.filter()` instead of `for`.
- A script inside `{{ }}` can't contain `}}`.
- A script is only run again when a value it uses changes. Don't use it for
  randomness (`Math.random()`): to assign coders to groups at random, use an
  [assigned variable](auto.md).

## Checking a script

In a condition's **Script** mode, a syntax error (such as a missing bracket)
is shown as you type. Inside `{{ }}` in a template, the editor checks the
references but not the JavaScript, so check the result in the live preview
or in **Preview** before you publish. A script that shows nothing where you
expected a value usually has a mistake in it, or uses a question that isn't
answered yet.
