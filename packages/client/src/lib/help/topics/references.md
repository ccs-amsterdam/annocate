---
title: Referring to answers and unit data
section: Codebook
order: 3
summary: Use a unit's data ($unit) and earlier answers ($var) in texts, layouts, conditions, unitset names and redirect links.
---

A **reference** is a name that AnnoTinder replaces with a value while the
coder works: a field of the unit on screen, or an answer the coder gave
earlier. With references, a question can quote the headline it is about,
a follow-up question can repeat the answer it follows up on, and a condition
can show a question only to coders who gave a certain answer.

There are two kinds, and they are written the same way everywhere in the
codebook:

| Write | What it refers to |
| --- | --- |
| `$unit.headline` | The field `headline` of the unit on screen: a column of the units you uploaded |
| `$var.topic.label` | The coder's answer to the question named `topic` |

```example
unit:
  headline: Storm hits the coast
answers:
  topic: politics | economy | -
  age: 34 | 15 | -
---
## $unit.headline

Topic you chose: $var.topic.label

Your age: $var.age.value

Topic answered: $var.topic.answered
```

Switch between the answers above the example to see how the text changes,
including when a question isn't answered (`-`).

## Unit data: $unit

`$unit.` followed by a field name gives that field of the current unit,
exactly as it is in your data. Units only exist inside a
[unit loop](unit-loops.md), so `$unit` only works there: in the loop's
layout, in the texts of its questions, in conditions inside the loop, and in
end items inside the loop.

Fields keep the type they were uploaded with: a number field is a number, so
`{{ $unit.likes > 100 }}` compares numbers (see [Scripts](scripts.md)). A
reference to a field that doesn't exist in the job's units gets a warning in
the editor (not an error, because you may upload the units later).

## Answers: $var

`$var.` followed by a question's name and a **property** gives (part of)
the answer to that question. Which properties a question has depends on
what kind of answer it holds:

| Question | Properties | Holds |
| --- | --- | --- |
| Nominal (one answer), ordinal, numeric, swipe, auto | `.value`, `.label` | One answer |
| Nominal with multiple answers | `.values`, `.labels` | A list of answers |
| Span | `.values`, `.labels`, `.texts` | A list: one per selected span |
| Relation | `.values`, `.labels` | A list: one per relation |
| Scale | `.values`, `.items.<item>.value`, `.items.<item>.label` | One answer per item |
| Confirm | only `.answered` | Nothing but whether it was clicked |

Every question also has `.answered`: `true` if the coder answered it,
`false` if not (yet), or if a [condition](conditions.md) skipped it.

Using a property a question doesn't have is an error, and the message says
which ones it has: `.value` on a question with multiple answers, for
example, or `.values` on a question with one.

### Values and labels

Every option of a question has a **value** (what is stored and exported,
such as `human_interest` or `3`) and a **label** (what the coder sees,
such as *Human interest* or *Agree*).

- `.value` and `.values` give the stored values. Use them in conditions and
  anywhere the result is compared or used by a program, such as a redirect
  link.
- `.label` and `.labels` give what the coder saw. Use them in texts that
  coders read: *"You said the article is about **$var.topic.label**"*.

For a numeric question, `.label` is the label of the number if you gave it
one (a break-point label such as *Very much*), and otherwise the number
itself. For span questions, `.texts` gives the selected text of each span,
and `.values` the option each span was labelled with.

### Unanswered and lists

A question that isn't answered has no value: `.value` and `.label` are
empty (`null` in a script), and `.values`, `.labels` and `.texts` are an
empty list. In a text, an empty value shows nothing.

A list shown in a text is joined with commas: three topics show as
`politics, economy, sports`. To show a list another way, use a
[script](scripts.md#lists), e.g. `{{ $var.topics.labels.join(" and ") }}`.

### Scale items

A [scale](scale.md) asks several items on the same options. Refer to one item
by its name: `$var.trust.items.media.value` is the value the coder gave for
the item `media` of the scale `trust`, and `.label` the option's label.
`$var.trust.values` is the list of the values of all answered items, in item
order.

## Where references work

| Where | `$unit` | `$var` | `{{ }}` |
| --- | --- | --- | --- |
| A loop's layout | Yes | Yes | Yes |
| Question and instruction texts | In a loop | Yes | Yes |
| Conditions (condition items, `::: if`) | In a loop | Yes | Yes (a condition is a script) |
| End item messages | In a loop | Yes | Yes |
| End item redirect links | No | Yes | No |
| Unitset names of a loop | No | Coder-level questions only | No |
| Coder group conditions of a loop | No | Coder-level questions only | Yes |

Unitset names with a reference, such as `part_$var.slot.value`, give
different coders different units: see
[Different units for different coders](coder-groups.md). In redirect links
the values are URL-encoded: see [Ending a session](end-items.md).

In texts and layouts, `$var` and `$unit` show their value as text. Inside
`{{ }}` they are ordinary JavaScript values: see [Scripts](scripts.md).

## Which answers you can use

A reference can only use answers the coder has given by the time it is
used:

- **Questions before this point.** A question's text can't use its own
  answer, and a condition can't use the questions inside it.
- **Coder-level questions** (outside any loop) can be used everywhere after
  them, also inside loops.
- **Questions inside a loop** can only be used inside that same loop, for
  the same unit. A question after the loop can't refer to them: there is an
  answer per unit.
- **In a loop's layout**, the loop's own questions can be used only inside
  a `::: from` block, which shows from a certain question on (see
  [Showing parts conditionally](template-blocks.md)).

## Names are written out

A reference always names its field and question literally:
`$var.topic.label`, never something computed such as `$var[name]`. That
way AnnoTinder can check every reference when you save, and tell you right
away when a question was renamed or deleted, instead of a coder finding out.

Only letters, digits and `_` are part of a name. So `$var.topic.label.` at
the end of a sentence is fine: the final full stop is not part of the
reference. To write a dollar sign followed by a name as ordinary text,
write `\$`: `\$unit.headline` shows `$unit.headline`.

## When a reference is wrong

The editor checks every reference when you edit the codebook, and lists
problems with the item they are in. Common messages:

| Message (shortened) | What to do |
| --- | --- |
| `'topc' is not a question` | A typo, or the question was renamed or deleted |
| `'topic' is asked after this point` | Move the question before the place that uses it |
| `a question can't refer to itself` | Refer to the answer from a later question instead |
| `'tone' is a question of another unit loop` | Loop answers can only be used in their own loop |
| `$unit.text can only be used inside a unit loop` | There is no unit outside a loop |
| `which has no .value; use .values, .labels or .answered` | Use a property this kind of question has |
| `$var.topic needs a property` | Add `.value`, `.label`, ... |
| `$var.topic.is(...) can only be used inside {{ }}` | Helper methods work in scripts and conditions, not as a plain value |
| `$unit.headlne is not a unit field` (warning) | A typo, or the units don't have this column |

In a loop's layout, the editor helps you write references: type `$` and it
lists the unit fields and questions you can use there. In a condition's
**Script** mode, **References and helpers you can use here** lists them
too.
