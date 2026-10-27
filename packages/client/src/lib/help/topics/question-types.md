---
title: Choosing a question type
section: Question types
order: 1
summary: All answer types at a glance, what each one measures, and when to use it.
---

Every question has an **answer type**: what kind of answer coders give, and
so what ends up in your data. You pick it under **Answer Type** in the
question's form in the codebook editor. This page compares the types; each
has its own page with the details.

The type you choose is also a decision about **measurement level**: whether
answers are categories without an order, ordered categories, or numbers.
That decides which analyses make sense later, so choose it deliberately,
just as you would for a survey item.

## All types

| Answer type (in the editor) | Coders... | Stored as | Use it for |
| --- | --- | --- | --- |
| **Nominal (categories)** | pick one option, or several | text values, e.g. `economy` | topics, actors, genres, yes/no |
| **Ordinal (ordered options)** | pick one of ordered options | numbers 1, 2, 3, ... | tone (negative to positive), intensity, agreement |
| **Numeric (interval/ratio)** | give a number, with buttons, a slider or a box | a number | counts, age, a 0-100 feeling thermometer |
| **Scale (items on the same options)** | rate several items on the same options | a number per item | a Likert battery, rating one text on several aspects |
| **Swipe** | swipe the card left, right (or up) | text values | fast yes/no judgements, crowd coding on phones |
| **Confirm** | click one button | only that it was clicked | instructions, consent, "I have read the text" |
| **Auto (assigned, not asked)** | nothing: never shown | text values | experimental groups, routing coders to units |
| **Span (select text)** | select words in the text and label them | the selected text and its position | named entities, quotes, arguments, frames in a sentence |
| **Relation (link spans)** | link two selected spans with a label | pairs of spans with a label | who criticizes whom, claim and evidence |

See [Categories: nominal and ordinal](nominal-and-ordinal.md),
[Numbers](numeric.md), [Scales](scale.md), [Swipe](swipe.md),
[Confirm](confirm.md), [Assigned variables](auto.md),
[Selecting text (spans)](span.md) and [Relations](relation.md).

## Where each type can go

Questions outside a unit loop are asked once per coder; questions inside a
loop are asked for every unit (see [Questions](questions.md)). Most types
work in both places, with three exceptions:

- **Auto** only works outside a loop: it is assigned once per coder.
- **Span** and **Relation** only work inside a loop: they need a unit's text
  to select in.

The **Answer Type** list only shows the types that fit where the question
is, and the editor won't let you move a question to a place its type
doesn't fit.

## Measurement levels

| Level | Answer types | Values | Typical statistics |
| --- | --- | --- | --- |
| Nominal | Nominal, Swipe, Auto, Span, Relation | text | frequencies, crosstabs, Krippendorff's alpha (nominal) |
| Ordinal | Ordinal, Scale | numbers rising in the order of the options | medians, rank correlations, alpha (ordinal) |
| Interval/ratio | Numeric | any number in a range | means, regression, alpha (interval) |

A few rules of thumb:

- **Categories without an order are nominal**, even when they are coded as
  numbers elsewhere. A nominal value is text (`economy`, not `3`), so
  nobody can accidentally average topic codes.
- **Use ordinal when the order matters but the distances don't**, as with
  "negative, neutral, positive" or "not at all, somewhat, very".
- **Use numeric when the number itself means something**: a count, a
  percentage, a thermometer.
- **Use a scale when you'd otherwise write several ordinal questions with
  the same options**, one after the other.

Every option has a **value** (stored and exported) and a **label** (what
coders see). You can improve labels at any time; changing values changes
what your data means. See
[Values and labels](design-values-and-labels.md).

## Choosing between similar types

**Nominal or swipe?** Both store a category. A swipe question takes two or
three options and is answered with one gesture, so it is the fastest way to
code many units, especially on a phone. A nominal question can have any
number of options and shows them as buttons or a list. Use swipe for quick
binary judgements, nominal for everything else.

**Ordinal or numeric?** A 1-5 rating can be either. Ordinal gives every
point a label ("Strongly disagree" ... "Strongly agree"); numeric is for
longer ranges (0-10, 0-100), where only some points get a label.

**Ordinal or scale?** A scale is several ordinal questions on one screen,
with the same options. Use it when coders rate several aspects at once; use
separate questions when each aspect deserves the coder's full attention.

**Confirm or nominal?** A confirm question has one button, so it can't be
refused. For consent that a participant can refuse, use a nominal question
("I agree" / "I do not agree") followed by a condition with an
[end item](end-items.md).

## Changing the type later

You can change **Answer Type** at any time. Between nominal and ordinal the
options are kept (see
[Switching between nominal and ordinal](nominal-and-ordinal.md#switching-between-nominal-and-ordinal));
to any other type, the question and instruction texts are kept but the rest
starts over from that type's defaults.

Once coding has started, changing a question's type changes what its
answers mean. See
[Changing a codebook while coding runs](changing-a-live-codebook.md).
