---
title: Referring to answers and unit data
section: Editor
order: 3
summary: Use a unit's data ($unit), earlier answers ($var) and session values ($session) in texts, layouts, conditions and redirect links.
---

A **reference** is replaced with a value while the coder works: a field of
the unit on screen, an earlier answer, or a value of the session.

| Write              | Gives                                         |
| ------------------ | --------------------------------------------- |
| `$unit.headline`   | the field `headline` of the unit on screen    |
| `$var.topic.label` | the coder's answer to the question `topic`    |
| `$session.coder`   | a value of the coder's session                |

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

Switch the answers above the example to see the text change (`-`: not
answered).

## Unit data: $unit

`$unit.<field>` gives a field of the current unit, as uploaded (a number
field is a number). It only works inside a [unit loop](unit-loops.md). An
unknown field gets a warning (you may upload units later).

## Answers: $var

`$var.<question>.<property>`:

| Question                                                         | Properties                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| Categories (one answer), ordered, number, swipe, experiment       | `.value`, `.label`                                      |
| Categories with multiple answers                                 | `.values`, `.labels`                                    |
| Mark text (span)                                                 | `.values`, `.labels`, `.texts`                          |
| Relation                                                         | `.values`, `.labels`                                    |
| Scale                                                            | `.values`, `.items.<item>.value`, `.items.<item>.label` |
| Confirm                                                          | only `.answered`                                        |

Every question has `.answered`: false if not answered or skipped by a
[condition](conditions.md). Using a property a question doesn't have is an
error that lists the ones it has.

### Values and labels

- `.value` / `.values`: what is stored (`human_interest`, `3`). Use them
  in conditions and redirect links.
- `.label` / `.labels`: what the coder saw (_Human interest_). Use them in
  texts coders read.

For a number, `.label` is its break-point label if any, else the number.
For spans, `.texts` gives the selected text.

### Unanswered and lists

Unanswered gives an empty value (`null` in a script) or an empty list,
shown as nothing. Lists are shown joined with commas; for another way use a
[script](scripts.md#lists): `{{ $var.topics.labels.join(" and ") }}`.

A [scale](scale.md) item: `$var.trust.items.media.value`.

## The session: $session

| Reference         | Gives                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `$session.coder`  | the coder id: from the coders' column, the URL, or a sign-in email        |
| `$session.source` | the link's `?source=`                                                     |
| `$session.<name>` | a URL parameter of the design, e.g. a wave                                |

See [URL parameters](session-parameters.md).

## Where references work

| Where                           | `$unit`   | `$var` | `$session` | `{{ }}` |
| ------------------------------- | --------- | ------ | ---------- | ------- |
| A loop's layout items           | yes       | yes    | yes        | yes     |
| Question and instruction texts  | in a loop | yes    | yes        | yes     |
| Conditions (blocks, `::: if`)   | in a loop | yes    | yes        | yes     |
| A unit loop's condition         | no        | yes    | yes        | yes     |
| End item messages               | in a loop | yes    | yes        | yes     |
| End item redirect links         | no        | yes    | yes        | no      |

In redirect links values are URL-encoded. Inside `{{ }}` references are
JavaScript values (see [Scripts](scripts.md)).

## Which answers you can use

Only answers given by then:

- questions **before** this point (not the question itself, not those
  inside the condition);
- questions **outside loops**: everywhere after them, also in loops;
- questions **in a loop**: only in that loop, for the same unit;
- in a **layout item**, its loop's questions only inside a `::: from`
  block (see [Showing parts conditionally](template-blocks.md)).

## Names are written out

References name things literally (`$var.topic.label`, never computed), so
the editor can check them when you save. A final full stop isn't part of
the name. To write a literal `$unit.headline`, type `\$unit.headline`.

## When a reference is wrong

| Message (shortened)                                  | Fix                                                     |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `'topc' is not a question`                           | a typo, or renamed or deleted                           |
| `'topic' is asked after this point`                  | move the question earlier                               |
| `'sentiment' is answered in this loop; use it inside ::: from topics` | use it in a `::: from` block         |
| `a question can't refer to itself`                   | refer to it from a later question                       |
| `'tone' is a question of another unit loop`          | loop answers stay in their loop                         |
| `$unit.text can only be used inside a unit loop`     | there is no unit outside a loop                         |
| `which has no .value; use .values, ...`              | use a property this question has                        |
| `$var.topic needs a property`                        | add `.value`, `.label`, ...                             |
| `$var.topic.is(...) can only be used inside {{ }}`   | helpers work in scripts and conditions                  |
| `$unit.headlne is not a unit field` (warning)        | a typo, or the units lack this column                   |

In a layout, type `$` for a list of what you can use here.
