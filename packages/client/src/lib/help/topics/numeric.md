---
title: Numbers
section: Question types
order: 3
summary: Numeric questions - a range, steps, labels at break points, and buttons, a slider or a box.
---

A **Numeric (interval/ratio)** question asks for one number: how many
sources an article quotes, a coder's age, a 0-100 feeling thermometer, a
0-10 rating of how credible a message is. Use it when the number itself
means something and distances between numbers are meaningful.

For a handful of ordered categories that each need a label ("not at all",
"somewhat", "very"), an [ordinal question](nominal-and-ordinal.md) is
usually the better choice.

## Range and steps

| Setting | What it does |
| --- | --- |
| **Minimum** | The lowest number coders can give. Leave it empty for no lower limit |
| **Maximum** | The highest number. Leave it empty for no upper limit |
| **Steps** | Which numbers are allowed in between |

**Steps** has three presets and a custom setting:

| Steps | Allowed numbers (from a minimum of 0) |
| --- | --- |
| **Whole numbers** | 0, 1, 2, 3, ... (the default) |
| **One decimal** | 0, 0.1, 0.2, ... |
| **Two decimals** | 0, 0.01, 0.02, ... |
| **Custom** | Any step you type, e.g. 5 for 0, 5, 10, ... or 0.5 for halves |

Steps count from the minimum: with a minimum of 1 and steps of 2, coders
can give 1, 3, 5, and so on. The minimum must be below the maximum.

A new numeric question starts with a range of 0 to 10.

## Labels at break points

Under **Labels (optional)**, click **+ Add label** to put a word at a
number, for example:

| Number | Label |
| --- | --- |
| 0 | Very cold |
| 50 | Neutral |
| 100 | Very warm |

Coders see the labels under the buttons or the slider, each at its place
on the range. With a number box, they are shown as a hint under it
(*0: Very cold · 50: Neutral · 100: Very warm*). A label must lie within
the range.

Labels also show up in references: if a coder answers exactly 50,
`$var.thermo.label` is *Neutral*; for any other number it is the number
itself.

## Layouts

Under **Layout**, choose how coders give the number:

| Layout | Coders see | Needs |
| --- | --- | --- |
| **Buttons (one per value)** | a button for every allowed number; one click answers | a minimum and a maximum |
| **Slider** | a slider, and **Continue** | a minimum and a maximum |
| **Number input** | a box to type in, and **Continue** | nothing: works with an open range |

**Auto** chooses from the range:

- no minimum or no maximum: a **number input**;
- up to 11 allowed numbers (such as 0 to 10): **buttons**;
- more: a **slider**.

The **Layout** list shows what auto chose, e.g. *Auto (Buttons (one per
value))*.

### Buttons

One button per number, wrapping to the next line when they don't fit. A
click answers right away. With up to nine buttons, coders can also press
the number keys **1** to **9** (1 for the first button, and so on).

Buttons are the fastest layout and make every number equally easy to
pick, which is good for 0-10 ratings. For long ranges they become a wall of
buttons: use a slider or a box instead.

### Slider

The slider starts in the middle without a value: the number next to it
shows a dash until the coder moves it, and **Continue** stays disabled.
This way an untouched slider is never recorded as an answer.

Sliders suit long ranges where precision isn't the point, such as a
feeling thermometer. Be aware that coders tend to stay near where the
handle starts, and that fine positions are hard to hit on a phone.

### Number input

A box to type a number in, with **Continue** (or Enter). Numbers outside
the range or between steps are refused with a message such as *This is
above the maximum 120*. Use it for counts and other numbers with no
natural maximum, such as *How many sources are quoted?*, and for age.

## Using the answers

`$var.<question>.value` is the number. Conditions can compare it with
*equals*, *greater than*, *lower than*, *between* and so on, for example
`$var.age.lt(18)` to [end the session](end-items.md) for minors. See
[Conditions](conditions.md).

In the results the number is stored as is, in one column. Numeric
questions get no `_label` column, also when they have break-point labels.
