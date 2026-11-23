---
title: Choosing a question type
section: Question types
order: 1
summary: All answer types at a glance, what each one measures, and when to use it.
---

A new question asks you to **choose an answer type**. It decides how
coders answer and what is stored, and so your measurement level.

## All types

| Answer type                                   | Coders...                           | Stored as                 | Use for                                   |
| --------------------------------------------- | ----------------------------------- | ------------------------- | ----------------------------------------- |
| [Categories](nominal-and-ordinal.md) (nominal) | pick one option, or several         | text, e.g. `economy`      | topics, actors, genres, yes/no            |
| [Ordered options](nominal-and-ordinal.md) (ordinal) | pick one of ordered options    | numbers 1, 2, 3, ...      | tone, intensity, agreement                |
| [Number](numeric.md)                          | give a number                       | a number                  | counts, age, a 0-100 thermometer          |
| [Scale](scale.md)                             | rate several items on one set of options | a number per item     | a Likert battery                          |
| [Swipe](swipe.md)                             | swipe the unit left, right (or up)  | text                      | fast yes/no judgements on phones          |
| [Confirm](confirm.md)                         | click one button                    | that it was clicked       | instructions, "I have read the text"      |
| [Mark text](span.md) (loops only)             | select words and label them         | the text and its position | entities, quotes, frames                  |
| [Relations](relation.md) (loops only)         | link two marked passages            | pairs with a label        | who criticizes whom                       |

An [experiment](random-condition.md) is not a question but an item of
its own (outside unit loops): its condition is drawn, never asked.

Questions from **Guided setup** start **to specify**: you can save, but
not preview or deploy, until each has a type.

## Measurement levels

| Level          | Types                                | Statistics                                    |
| -------------- | ------------------------------------ | --------------------------------------------- |
| Nominal        | Categories, Swipe, Mark text, Relations | frequencies, crosstabs, alpha (nominal)    |
| Ordinal        | Ordered options, Scale               | medians, rank correlations, alpha (ordinal)   |
| Interval/ratio | Number                               | means, regression, alpha (interval)           |

- Categories without an order are nominal: values are text, so nobody
  averages topic codes.
- Ordinal when the order matters but distances don't.
- Number when the number itself means something.
- A scale instead of several ordinal questions with the same options.

Every option has a stored **value** and a shown **label**: labels can
change, values shouldn't (see [Values and labels](design-values-and-labels.md)).

## Choosing between similar types

- **Categories or swipe?** Swipe: two or three options, one gesture, fastest
  on phones. Categories: any number of options.
- **Ordered options or number?** A labelled 1-5 is ordinal; long ranges
  (0-10, 0-100) with a few labels are numbers.
- **Ordered options or scale?** A scale puts several aspects on one
  screen; separate questions give each full attention.
- **Confirm or categories?** Confirm can't be refused. For consent, use
  categories (_I agree_ / _I do not agree_) and an
  [end item](end-items.md).

## Changing the type later

Between categories and ordered options the options are kept (see
[Switching between nominal and ordinal](nominal-and-ordinal.md#switching-between-nominal-and-ordinal));
otherwise the settings start over. Once coding started, see
[Changing a design while coding runs](changing-a-live-design.md).
