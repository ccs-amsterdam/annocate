---
title: How answers are laid out
section: Question types
order: 10
summary: The Layout setting - what Auto chooses for each answer type, the other layouts, and why a layout is the same on every device.
---

Categorical, numeric and scale questions have a **Layout** setting: how the
options or the number are shown to coders. Buttons in a row, a grid, a
dropdown, a slider. Most of the time **Auto** is the right choice; this page
explains what it does, and when to choose a layout yourself.

## One layout for every device

A question's layout is fixed: every coder sees the same form, on a phone,
a tablet or a large screen. It does not rearrange itself for small
screens.

That is deliberate. How answer options are shown affects the answers:
options in one row are read differently from a list, a dropdown hides the
options until it is opened, a slider invites answers near where it starts.
If phone users saw a list and desktop users a row, part of a difference
between them could come from the layout rather than from the coders (a
*mode effect*). See [The same form on every device](design-fixed-layouts.md).

So layouts are designed for the smallest common phones, about 360 pixels
wide, and the answer area should fit in about half of such a screen, so the
unit stays visible above it. On a larger screen the same form is shown,
centered.

## What Auto chooses

**Auto** chooses a layout from the question's options, once, for every
device. The **Layout** list shows its choice, such as *Auto (Grid, 2
columns)*, and it updates as you edit the options.

| Answer type | Auto chooses |
| --- | --- |
| **Nominal** | **Row** if there are at most three options and they fit side by side; else a **Grid** of 2 columns (up to twelve options, labels up to about 18 characters) or of 1 column (up to six options, labels up to about 40 characters); else a **Dropdown with filter** |
| **Ordinal** | **Row** for up to three options, a **Grid** of 1 column for up to six, **Compact** for more |
| **Numeric** | **Number input** without a minimum or maximum; **Buttons** for up to 11 numbers (0 to 10); a **Slider** for more |
| **Scale** | **Compact** |

**Swipe** questions are always swiped, and **Confirm**, **Span** and
**Relation** questions have their own fixed form; they have no layout
setting.

## The layouts

| Layout | For | Shows |
| --- | --- | --- |
| **Row (one row)** | nominal, ordinal | all options side by side, equally wide |
| **Grid (columns)** | nominal, ordinal | buttons in 1 to 4 columns: choose under **Columns** |
| **Flex (buttons wrap)** | nominal | buttons as wide as their label, filling each line and wrapping to the next |
| **Compact (values; the selected one shows its label)** | ordinal, scale | one row of small buttons showing the values; the first and last label above it; the chosen button grows and shows its label |
| **Dropdown with filter** | nominal, ordinal | one field that opens a list; coders can type to filter it |
| **Buttons (one per value)** | numeric | a button for every allowed number |
| **Slider** | numeric | a slider, and **Continue** |
| **Number input** | numeric | a box to type a number, and **Continue** |
| **Grid (columns)** | scale | a table with the items as rows and the options as columns |

The pages per type say more: [nominal and ordinal](nominal-and-ordinal.md#how-the-options-are-laid-out),
[numbers](numeric.md#layouts) and [scales](scale.md#compact-or-grid).

## When to choose a layout yourself

Some reasons to override Auto:

- **A long list that coders know well**, such as countries or political
  parties: **Dropdown with filter**, so coders type the first letters
  instead of scanning 30 buttons.
- **Options that should be read together**, such as a short ordinal scale
  you want shown as one row even though the labels are long.
- **Many short nominal labels**, such as party abbreviations: **Flex**
  packs them tightly.
- **The same layout across questions**: if one question of a series gets a
  grid and the next a row, coders have to re-orient. Choosing one layout
  for the whole series keeps the form calm.
- **A numeric question with buttons instead of a slider**, or the other
  way round, for comparability with an earlier study.

Keep in mind that a dropdown hides the options: coders can't see the
whole list at a glance, and tend to choose options near the top. For
anything but long lists, buttons are better.

## The warning

When you choose a layout yourself for a nominal or ordinal question, the
editor checks whether it fits on a small phone, and warns under the
**Layout** setting if it doesn't:

| Warning | Meaning |
| --- | --- |
| *These options don't fit side by side on a small phone* | **Row** with too many or too long options |
| *This grid doesn't fit half a small phone screen; coders would have to scroll* | **Grid** with too many rows, or labels too long for the columns |
| *This layout doesn't fit half a small phone screen; coders would have to scroll* | **Flex** with too many options |
| *Too many options for one row of the compact layout* | **Compact** with more than about twelve options |

A warning doesn't stop you from saving or publishing. Labels on buttons
wrap onto several lines rather than being cut off, so nothing becomes
unreadable; but coders on small phones may have to scroll to see all
options, and the unit above gets less room. Check the question in the
preview, and consider fewer columns, shorter labels, or **Auto**.
