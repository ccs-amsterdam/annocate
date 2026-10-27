---
title: The same form on every device
section: Design notes
order: 6
summary: Why a question looks the same on a phone and a laptop, why it is designed for the smallest phones, and what still differs between devices.
---

In AnnoTinder a question has one layout, and every coder gets it, on any
device. A question whose options are a row of buttons on a laptop is a row of
buttons on a phone. Many websites do the opposite: they rearrange themselves
for each screen size. For a measurement instrument that would be a problem.

## Why one layout for every device

Survey methodologists call it a **mode effect** when the way a question is
presented changes the answers. Answer formats are known to matter: options in
a dropdown are chosen differently from the same options as buttons (the
options visible without scrolling are picked more; Couper et al., 2004), a
long vertical list differs from a grid, and a slider differs from buttons.

If the layout changed with the screen, phone coders and laptop coders would
answer subtly different questions. In crowd coding and online experiments,
device use differs between groups of participants (age, country, panel), so
the difference would end up confounded with the very groups you compare.

So the layout is a property of the **question**, not of the device:

- **Auto** (the default) picks a layout once, from the question's options,
  and that layout is used everywhere. The editor's **Layout** select shows
  what Auto picks, for example *Auto (Grid, 2 columns)*.
- A layout you choose yourself is also used everywhere.

See [How answers are laid out](answer-layouts.md) for all layouts.

## Designed for the smallest phones

If one layout must work everywhere, it must work on the smallest screen. Auto
picks a layout that fits a small phone (about 360 pixels wide), using at most
half of its height for the answers, so the unit stays visible above them.
Larger screens show the same layout, centred.

| Question | What Auto picks |
| --- | --- |
| Nominal | A row for 2 or 3 short labels; else a grid of 2 columns, else 1 column, as long as it fits half the screen; else a dropdown |
| Ordinal | A row for 2 or 3 options; else 1 column (the order reads top to bottom) if it fits; else a compact row of buttons that show the values |
| Numeric | Buttons for up to 11 values; a slider for a larger range; a number field when there is no minimum or maximum |
| Scale | A compact row per item |
| Swipe | The unit is a card to swipe; buttons and arrow keys work too |

So a single question never needs scrolling. A scale with many items may;
then **Continue** scrolls to the first item without an answer, so none is
skipped unnoticed.

This is why short labels matter: the same six options may fit as two columns
of buttons with short labels, but only as a dropdown with long ones.

## Choosing a layout yourself

You can override Auto, for example to keep a 5-point scale in one row even if
Auto would use a column. If the layout you choose doesn't fit a small phone,
the editor warns you (*"These options don't fit side by side on a small
phone"*). The warning is advice: you may accept it if you know your coders
use larger screens.

Check what coders see in **Preview**, with the phone sizes, including
**Small (320×568)**.

## What still differs between devices

The answer layout is fixed, but some things can't be:

- **The unit's text wraps** to the screen. A phone shows fewer words per
  line and less of a long unit at once; coders scroll more.
- **Input**: phone coders tap and swipe, laptop coders click and may use the
  keyboard (number keys to pick an option, arrow keys to swipe).
- **Light or dark**: coders choose light or dark mode in their settings, or
  get their device's setting. See below.

AnnoTinder doesn't record which device a coder used. If it matters for your
analysis, ask: a short question at the start, or, with a panel that passes
it on, a [URL parameter](auto.md#url-parameter). If your material needs a large screen
(long articles, wide tables), say so in the recruitment text.

## Light or dark

The app follows each coder's choice of light or dark mode. Usually that is
fine: text is readable either way. For material that only looks right in
one, such as a mock news site, colour-coded text or images on a white
background, fix it in the loop's **Layout** tab under **Colours**:
**Always light** or **Always dark** instead of the default **Follow the
coder's light or dark mode**.

In experiments with stimulus material, fix the colours: then every
participant sees the stimulus the same way. The rest of the app (questions,
buttons) keeps following the coder. See
[Light or dark](colours-and-styles.md#light-or-dark).

## Trade-offs

- **Laptop coders get a narrow form.** Answer buttons are sized for a phone,
  and wide screens leave space unused. That is the price of comparability.
- **Long option lists become dropdowns.** A dropdown hides options until
  opened. For a question with many categories, consider splitting it in two
  steps (broad, then specific) rather than accepting a dropdown. See
  [Designing an annotation task](design-annotation-tasks.md).
- **The estimate is rough.** Auto estimates label widths from their number
  of characters. Very wide letters or a coder's enlarged system font can
  still make a row wrap. Preview on a real phone when it matters.

## Further reading

- Couper, M. P., Tourangeau, R., Conrad, F. G., & Crawford, S. D. (2004).
  What they see is what we get: Response options for web surveys. *Social
  Science Computer Review*, 22(1), 111-127.
