---
title: The same form on every device
section: Design notes
order: 6
summary: Why a question looks the same on a phone and a laptop, why it is designed for the smallest phones, and what still differs between devices.
---

By default a question has one layout, used on every device. Many websites
rearrange themselves per screen; for a measurement instrument that is a
problem.

## Why one layout for every device

How a question is presented changes the answers (a **mode effect**):
options in a dropdown are chosen differently from buttons (Couper et al.,
2004), a vertical list differs from a grid, a slider from buttons. Device
use differs between groups of coders (age, country, panel), so a layout
that changed with the screen would confound the groups you compare.

So the layout belongs to the **question**: Auto picks one from the
options, and a layout you choose is also used everywhere. For annotation
work where this matters less, a study can use **responsive** layouts
instead (see [Fixed or responsive](answer-layouts.md#fixed-or-responsive)).

## Designed for the smallest phones

Auto picks a layout that fits a phone about 360 pixels wide, using at most
half its height, so the unit stays visible. Larger screens show the same
layout, centred. A single question never needs scrolling; on a long scale,
**Continue** scrolls to the first item without an answer.

Short labels matter: six options may fit as two columns with short labels,
but only as a dropdown with long ones.

Choosing a layout yourself that doesn't fit gives a warning; accept it if
you know your coders use larger screens. Check with the preview's phone
sizes, including **Small (320×568)**.

## What still differs between devices

- **The unit's text wraps** to the screen; phone coders scroll more.
- **Input**: tapping and swiping, or clicking and keys.
- **Light or dark**: the coder's choice, unless **Display** fixes it.

The results record each coder's devices and display (keys, width,
theme), see [Downloading results](results.md). If your material needs a
large screen, say so when recruiting.

## Light or dark

Text reads well either way. For material that only looks right in one (a
mock news site, colour-coded text, images on white), set **Display** →
**Light or dark** to **Always light** or **Always dark**, so every coder
sees the stimulus the same way. See
[Light or dark](colours-and-styles.md#light-or-dark).

## Trade-offs

- Laptop coders get a narrow form: the price of comparability.
- Long option lists become dropdowns; consider two steps (broad, then
  specific). See [Designing an annotation task](design-annotation-tasks.md).
- Auto estimates label widths from their characters; a large system font
  can still make a row wrap. Preview on a real phone when it matters.

## Further reading

- Couper, M. P., Tourangeau, R., Conrad, F. G., & Crawford, S. D. (2004).
  What they see is what we get: Response options for web surveys. _Social
  Science Computer Review_, 22(1), 111-127.
