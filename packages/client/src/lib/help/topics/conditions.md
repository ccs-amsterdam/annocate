---
title: Conditions
section: Codebook
order: 4
summary: Show questions, loops or end items only when earlier answers (or the unit) say so.
---

A **condition** is an item in the codebook that holds other items, and shows
them only when its rule holds. *"Ask about the actors only if the article is
about politics"*, *"show the follow-up questions only to coders in the
experiment group"*, *"end the session if the participant doesn't consent"*:
each is a condition with the items it governs inside it.

```text
Topic                     nominal: politics, economy, sports, ...
Condition: if topic is "politics"
  ├ Actors                span: select the politicians mentioned
  └ Party                 nominal: ...
Tone                      asked for every unit
```

When the condition doesn't hold, the items inside are skipped and the coder
goes straight on to the next item after the condition.

## Adding a condition

1. In the codebook tree, add an item of the type **Condition** where the
   condition should go (see [The codebook editor](codebook-editor.md)).
2. Under **Show the items in this condition if**, set the rule (below).
3. Add the items it governs *inside* the condition, or move existing items
   into it.
4. Optionally give it a **Label (optional)**, such as *Politics only*. The
   tree shows the label instead of the rule.

A condition can hold anything that may stand at its place: questions, other
conditions, [end items](end-items.md), and at the top level also unit loops.
A new condition holds always (its rule is `true`) until you add a rule.

## The rules editor

Most conditions can be made by choosing from lists. With **Rules**
selected, each rule is a row: a question, an operator and a value.

- Click **+ Rule** to add a row; the bin icon removes one.
- With more than one row, choose **All rules must hold** (*and*) or **Any
  rule may hold** (*or*).
- Without any rows, the condition always holds.

You can choose from the questions answered before the condition (see
[Which answers you can use](references.md#which-answers-you-can-use)). The
values are the question's options, so a typo is impossible. If a question
changes later, for example an option is removed, the row turns red and says
what is wrong.

### Operators per question type

| Question | Operators |
| --- | --- |
| Nominal (one answer), swipe, auto | is, is not, is one of, is none of |
| Ordinal | the same, and >, ≥, <, ≤ an option |
| An item of a scale (shown as *scale › item*) | as ordinal |
| Numeric | =, ≠, >, ≥, <, ≤, between |
| Nominal with multiple answers | has, doesn't have, has any of, has none of, has all of, count ≥, count ≤ |
| Span, relation | has, doesn't have, count ≥, count ≤ |
| Confirm, a scale as a whole | only *is answered* and *is not answered* |

Every question also has **is answered** and **is not answered**.

> Rules that say "not" (*is not*, *is none of*, *doesn't have*, *≠*) also
> hold when the question isn't answered, for example because a condition
> skipped it. If that matters, add a rule *is answered* and choose **All
> rules must hold**.

Ordinal comparisons use the option values, which rise in the order of the
options: *tone > Neutral* holds for the options after *Neutral*.

## Script mode

Click **Script** to see or write the condition as a short script. The rules
editor writes scripts too: *topic is "politics"* is
`$var.topic.is("politics")`, and two rules with **All rules must hold** are
joined with `&&` (*and*); with **Any rule may hold**, with `||` (*or*).

```text
$var.topic.is("politics")
$var.age.gte(18) && $var.consent.answered
$var.topics.hasAny("politics", "economy") || $var.tone.lte(2)
!$var.group.is("control")
```

Write a script when the rules editor can't express what you need:

- a mix of *and* and *or*: `$var.consent.answered && ($var.age.lt(18) || $var.country.is("other"))`;
- a unit's data, inside a loop: `$unit.source === "blog"`;
- anything else JavaScript can do (see [Scripts](scripts.md)).

A script can be switched back to **Rules** if it is a list of rules joined
by all *and* or all *or*: helper methods and `.answered`, each possibly with
`!` (*not*) in front. Anything else stays a script; trying to switch shows
why.

Under the script, **References and helpers you can use here** lists every
reference and helper method that fits the questions before this point:
click one to add it. A syntax error is shown as you type.

## Helper methods

Conditions compare answers with **helper methods**, called on the question
(or on a scale item):

| Method | Works on | Holds when the answer ... |
| --- | --- | --- |
| `is(v)` | one answer: nominal, ordinal, swipe, auto, scale item | is `v` |
| `isAny(v1, v2, ...)` | the same | is one of them |
| `gt(n)`, `gte(n)` | ordinal, numeric, scale item | is greater than (or equal to) `n` |
| `lt(n)`, `lte(n)` | ordinal, numeric, scale item | is lower than (or equal to) `n` |
| `eq(n)` | numeric | equals `n` |
| `between(a, b)` | numeric | is from `a` up to and including `b` |
| `has(v)` | multiple answers, span, relation | includes `v` |
| `hasAny(v1, v2, ...)` | multiple answers | includes at least one of them |
| `hasAll(v1, v2, ...)` | multiple answers | includes all of them |
| `count()` | multiple answers, span, relation | gives the number of answers, e.g. `$var.topics.count() >= 2` |

A few things to know:

- Helpers compare **values**, never labels: `$var.topic.is("human_interest")`,
  not `is("Human interest")`. See
  [Values and labels](references.md#values-and-labels).
- Ordinal values are numbers: write `$var.tone.is(2)`, not `is("2")`, which
  never matches.
- Every helper is false while the question isn't answered (`count()` is 0).
- Scale items: `$var.trust.items.media.gte(4)`.

The editor checks the values you give helpers: a value that isn't an option
of the question, or a number outside a numeric question's range, is an
error. In scripts that do more than call helpers, only the references are
checked, not the values.

## Questions a condition skips

A question inside a condition that doesn't hold is not asked. For everything
after it, it counts as **unanswered**: `.answered` is false and helpers are
false, also if the coder answered it before going back and changing an
earlier answer.

- **Inside a unit loop**, a skipped question is stored as *skipped* with the
  unit's other answers, and is empty in the results. A unit is finished when
  every question of the loop is answered or skipped.
- **Outside a loop**, a skipped question is not asked, and is empty in the
  results. If the coder answered it before going back and changing an
  earlier answer so that it is now hidden, it is stored as skipped too.

Conditions are checked again whenever the coder moves on, so going back and
changing an answer can show or skip later questions.

## Inside and outside a loop

- A condition **outside** a loop is about the coder as a whole: it uses the
  coder-level answers before it. Use it for screening, consent and
  experimental groups, and to skip a whole unit loop.
- A condition **inside** a loop is checked for every unit, with the coder's
  coder-level answers, the answers to this unit's earlier questions, and the
  unit's data (`$unit`, in script mode).

The rules editor only lists questions; to use unit data, switch to
**Script**: `$unit.lang === "nl"` asks the questions inside only for Dutch
units.

## Conditions in a layout or text

To show part of a unit's layout, or of a question text, only in some cases,
you don't need a condition item: write a `::: if` block in the template.

```example
answers:
  group: experiment | control
---
::: if $var.group.is("experiment")
**Note:** this article was flagged by fact-checkers.
:::

Read the article and answer the questions below.
```

Above the `::: if` line, the editor shows the condition in words with an
**edit** link that opens the rules editor. See
[Showing parts conditionally](template-blocks.md).

Which units a coder gets can also depend on their answers: that is set in
the unit loop's **Coder groups** (see
[Different units for different coders](coder-groups.md)), with the same
rules editor.
