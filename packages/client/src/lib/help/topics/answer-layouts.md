---
title: How answers are laid out
section: Question types
order: 10
summary: The Layout setting - what Auto chooses for each answer type, the other layouts, and fixed or responsive layouts for a study.
---

Categories, ordered options, numbers and scales have a **Layout**: a row,
a grid, a dropdown, a slider. **Auto** is usually right.

## One layout for every device

By default every coder sees the same form, on any device: how options are
shown affects answers, so phone and laptop coders should answer the same
question. Layouts are designed for small phones (about 360 pixels wide),
with the answers in at most half the screen. See
[The same form on every device](design-fixed-layouts.md).

## Fixed or responsive

Set this for the whole study under **Display** (above the item tree):

- **Fixed** (default): Auto follows the options only; every coder sees the
  same form. The numpad keys aren't available.
- **Responsive**: Auto also follows the screen and the coder's keys: up to
  five buttons in a row or three columns on wide screens, three columns
  for numpad users (**7 8 9** at the top), buttons instead of a dropdown
  for coders who type to filter.

Layouts you chose yourself stay as they are. Use responsive for annotation
work where the layout doesn't matter for the answers; keep fixed for
surveys and experiments. Each coder's display is recorded with their
session (see [Downloading results](results.md)).

**Display** also sets **Light or dark**: the coder chooses, or always
light or dark.

## What Auto chooses

The **Layout** list shows Auto's choice, e.g. _Auto (Grid, 2 columns)_.

| Type            | Auto chooses                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Categories      | **Row** for up to three short options; else a **Grid** of 2 columns (up to 12 short labels) or 1 column (up to 6); else **Dropdown with filter** |
| Ordered options | **Row** for up to three, a 1-column **Grid** for up to six, else **Compact**                          |
| Number          | **Number input** without minimum or maximum; **Buttons** for up to 11 numbers; else **Slider**       |
| Scale           | **Compact**                                                                                          |

Swipe, confirm, mark text and relations have no layout setting.

## The layouts

| Layout                      | For                  | Shows                                                        |
| --------------------------- | -------------------- | ------------------------------------------------------------ |
| **Row (one row)**           | categories, ordered  | options side by side, equally wide                           |
| **Grid (columns)**          | categories, ordered  | buttons in 1 to 4 **Columns**                                |
| **Flex (buttons wrap)**     | categories           | buttons as wide as their label, wrapping                     |
| **Compact**                 | ordered, scale       | small buttons with values; the chosen one shows its label    |
| **Dropdown with filter**    | categories, ordered  | a list; coders type to filter                                |
| **Buttons (one per value)** | number               | a button per number                                          |
| **Slider**                  | number               | a slider and **Continue**                                    |
| **Number input**            | number               | a box and **Continue**                                       |
| **Grid (columns)**          | scale                | a table: items as rows, options as columns                   |

More per type: [categories](nominal-and-ordinal.md#how-the-options-are-laid-out),
[numbers](numeric.md#layouts), [scales](scale.md#compact-or-grid).

## When to choose a layout yourself

- a long, familiar list (countries, parties): **Dropdown with filter**;
- a short scale you want in one row despite long labels: **Row**;
- many short labels (party abbreviations): **Flex**;
- the same layout across a series of questions;
- buttons or a slider for comparability with an earlier study.

A dropdown hides the options, and coders favour those near the top: for
anything but long lists, buttons are better.

## The warning

A layout you chose that doesn't fit a small phone gets a warning under
**Layout** (_These options don't fit side by side on a small phone_, _This
grid doesn't fit half a small phone screen_, _Too many options for one row
of the compact layout_). It doesn't block saving; labels wrap rather than
being cut off, but coders may have to scroll. Check the preview, and try
fewer columns, shorter labels or **Auto**.
