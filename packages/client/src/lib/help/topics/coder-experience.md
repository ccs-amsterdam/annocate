---
title: What coders see
section: Getting started
order: 4
summary: The coding screen, moving back and forward, saving and resuming, continuing on another device, keyboard shortcuts, phones, and light or dark mode.
---

Coders open a link and start right away, without an account (unless the
invitation asks them to [sign in](links.md#login)). To see it yourself,
use **Preview** (see
[Preview, save and deploy](previewing-and-publishing.md#previewing)).

## The coding screen

**A question in a unit loop** splits the screen:

- the **unit** at the top, shown with the layout before the question (see
  [Layout items](layout-templates.md#layout-items)), scrolling on its
  own. With **Focus on**, it scrolls to and highlights that part;
- the **question** docked at the bottom, up to half the screen. Coders
  can drag its edge; **Auto** (or a double click) fits it again. A
  **?** button opens the question's [instructions](questions.md#instructions).

A loop question with no layout before it shows only the question.

On a large screen this is a card in the middle; on phones it fills the
screen, with the question within thumb reach.

**A question outside a loop** is a card in the middle of the screen.

A question with one answer moves on when the coder clicks an option;
several answers, sliders, numbers and scales have **Continue**. See
[Choosing a question type](question-types.md) and
[How answers are laid out](answer-layouts.md).

## The top bar

| Element                | Does                                                          |
| ---------------------- | ------------------------------------------------------------- |
| Menu (three lines)     | the questions and loops reached; click one to go there        |
| `3`                    | the 3rd question                                              |
| Stack icon and `4 · 2` | unit 4, its 2nd question (`4` with one question); the loop's menu |
| **<** and **>**        | back and forward                                              |
| Monitor-and-phone icon | **Continue on another device**                                |
| Keyboard               | **Keyboard shortcuts**: the shortcuts, shortcut style, badges |
| Gear                   | **Settings**: light or dark                                   |

The loop's menu shows **Unit 12 of 40**, with buttons for the first,
previous, next and furthest unit, and a number pad to go to a unit.
Coders can go to any unit up to the furthest they reached; the menu also
lists the unit's questions they got to. When the number of units is known,
a line along the bottom of the bar shows how far the coder is.

Give loops a clear label and start each question with a short first line:
that is what the menu shows.

## Going back and forward

Coders can go back to any earlier question or unit and change their
answers, and forward up to where they have been. A change in an earlier
unit is saved when they go through that unit's last question. If a
[condition](conditions.md) now hides a question, it is stored as skipped.

An answer outside the loops that a loop depends on (e.g. a role shown with
every unit) can't be changed once the coder coded a unit in that loop.

## Saving and resuming

- An answer **outside a loop** is saved as soon as it is given.
- A **unit**'s answers are saved together, after its last question.

Saving runs in the background, and without a connection answers wait in
the page until it is back.

Coders can close the page any time. Opening the link again **in the same
browser** continues where they left off. A unit left halfway is asked
again from the start. (In a [shared queue](shared-queues.md), loaded units
are held for a coder for 15 minutes.)

Another browser, a private window or cleared data means a new session,
unless the coder moves it (below). When AnnoTinder knows who the coder is
(a link of their own, a coder id, a picked name), it says **You already
started on another device** and offers to continue there or **Start a new
session** (empty).

## Continuing on another device

- **Annotate** (`/code`) lists the studies started in this browser (by
  their public title), to continue without the link.
- **Continue on another device** (top bar) shows a QR code and a link that
  moves the session; it works once, for 15 minutes. Coders shouldn't share
  it.
- Coders who [signed in](links.md#login) just sign in on the other
  device.

## Keyboard shortcuts

| Keys                    | Do                                                       |
| ----------------------- | -------------------------------------------------------- |
| **←** **→** **↑** **↓** | move between answer buttons                              |
| **Space** / **Enter**   | choose the focused button                                |
| **Shift + Enter**       | continue, once answered (not while typing in a text box) |
| **Shift + ←** / **→**   | previous or next question (back focuses its answer)      |
| **0** / **.**           | the special options: not applicable, don't know          |
| **?**                   | open the question's instructions                         |

Swipe questions use the arrows to swipe (the shortcut style's keys work
too). In span questions the arrows move over the words (**↑** **↓**: a
line); **Space** starts a selection, the arrows extend it, and **Space**
again ends it. The labels then have focus: the arrows move between them,
**Space** or the label's key chooses one, **Esc** cancels. **Enter** on a
labelled word opens its spans, **Backspace** removes the last span, and
**Shift + Enter** is **Done**.

The keyboard icon in the top bar lists these shortcuts, and coders choose
their **Shortcut style** there (remembered in their browser):

| Shortcut style     | Choose an option with                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Numbers**        | **1** to **9**, in order (the default)                                                  |
| **Numpad**         | numbers mapped to the numpad layout; only in responsive studies                         |
| **Type to filter** | typing the answer until it's the only match, then **Enter**; **Esc** clears             |
| **Fast type**      | typing, chosen as soon as one answer matches (**he**, **hi**, **b** for hello, hi, bye) |

Where a style can't work, numbers are used (fast type: a label that is the
start of another; numpad: at most three rows and columns, and only with
responsive layouts, see [Display](answer-layouts.md#fixed-or-responsive)).
Badges on the buttons show the keys; **Show shortcut badges** hides them.
On touch devices they are hidden from the start.

## Phones

AnnoTinder is made for small phones: the question stays at the bottom,
buttons are large, and swipe questions can be swiped. Check long units and
many options with the **Mobile** preview before you deploy. See
[The same form on every device](design-fixed-layouts.md).

## Light or dark

Coders choose under **Settings** → **Appearance**; until then their
device's setting is used. If your units only look right in one (images,
coloured material), set **Display** → **Light or dark** to always light or
dark. See [Light or dark](colours-and-styles.md#light-or-dark).

## Stopping

The door icon at the top right:

- **Stop for now** explains how to continue later. Nothing is lost.
- **Quit this study** ends the session; answers are kept.
- **Quit and ask to delete my answers** ends it and asks you to delete
  them (see [Deleting a coder's data](coders-and-progress.md#deleting-a-coders-data)).

## The end

After the last item coders see **Study Complete!**, with **Ask to delete
my answers**. An [end item](end-items.md) can end earlier, with your
message and an optional redirect to a panel.

### Finished sessions are closed

Opening the link after the end shows only the end screen: answers can't be
seen or changed, so data doesn't change afterwards. For a while after
finishing (a day, unless you set another time), **Go back to my answers**
lets a coder fix a mistake. To keep sessions open, choose **Keep their
session open** under **When coders finish** in the study's **Settings**. The
first deploy asks: coders with their own link keep their session open by
default, coders from one link get a day.

### When you add units later

Coders whose units you add or move pick them up on their next visit, once
you deploy the units. They are told once ("2 new units were added for you.";
you set the message when you deploy), and a finished session opens again for
them, unless it has closed.
