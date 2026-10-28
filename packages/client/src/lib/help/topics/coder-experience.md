---
title: What coders see
section: Getting started
order: 4
summary: The coding screen, moving back and forward, saving and resuming, continuing on another device, keyboard shortcuts, phones, and light or dark mode.
---

Coders (or participants) open the link of an invitation and start right
away: there is no account and no login. This page describes what they see
and can do, so you can write instructions for them and know what to expect.
The quickest way to see it for yourself is the **Preview** tab (see
[Preview, save and publish](previewing-and-publishing.md#previewing)).

## The coding screen

The screen has a bar at the top and the task below it.

**For a question in a unit loop**, the screen is split in two:

- The **unit** at the top, shown with the loop's layout (see
  [Layout templates](layout-templates.md)). It scrolls on its own, so a
  long article doesn't push the question off the screen. If the question
  has a **Focus on**, the unit scrolls to that part and highlights it
  briefly when the question comes up, and may dim the rest.
- The **question** docked at the bottom: the question text, the
  instruction under it in smaller grey text, and the answer buttons. It
  takes as much room as it needs, up to half the screen. Coders can drag
  its top edge to make it larger or smaller; **Auto** (or a double click
  on the edge) fits it to the question again.

**A question outside a loop** (consent, background questions, an
instruction screen) is shown on its own, as a card in the middle of the
screen.

How the answers look depends on the answer type and its layout; see
[Choosing a question type](question-types.md) and
[How answers are laid out](answer-layouts.md). A question with one answer
moves on as soon as the coder clicks an option. Questions with several
answers, sliders, number inputs and scales have a **Continue** button.

## The top bar

From left to right:

| Element | What it does |
| --- | --- |
| Menu (three lines) | Opens the **Navigation** list: all steps of the job, with a tick for the ones done |
| Position, e.g. `2` or `4.1` | Where the coder is: the 2nd step, or the 1st question of the loop that is the 4th step |
| **<** and **>** | Go back and forward |
| Monitor-and-phone icon | **Continue on another device** (below) |
| Gear | **Settings**: light or dark, and keyboard shortcut badges |

In the **Navigation** list, steps outside loops are listed by the first
line of their question text, and a loop by its label (or *Unit loop*),
with its questions under it and a selector **Unit 12 / 40** to jump to a
unit. Give your loops a clear label and start each question with a short
first line: that is what coders see here.

## Going back and forward

Coders can go back to any earlier question and unit, see their answers, and
change them. Going forward is possible up to where they have been: they
can't skip ahead to units or questions they haven't reached.

When a coder changes an answer in an earlier unit, the change is saved when
they go on through that unit's last question. Changing an answer can also
change which questions come next, if a [condition](conditions.md) depends
on it; a question that a condition now hides is stored as skipped.

## Saving and resuming

Answers are saved on the server as the coder goes:

- an answer to a question **outside a loop** as soon as it is given;
- the answers to a **unit** together, when the coder answers its last
  question.

Coders can close the page whenever they like. When they open the link
again, in the same browser, they continue where they left off, also the
next day or weeks later: questions they answered are skipped, and in a loop
they get the next unit. Earlier units stay reachable with **<**, and the
position shows how far they are (*Unit 31 / 100*).

If they close the page halfway through a unit, the answers to that unit
were not saved yet. They get the same unit again and answer it from the
start. (In a shared queue a unit is held for a coder for 15 minutes; after
that it may go to someone else. See
[Shared queues](shared-queues.md).)

A session belongs to the browser it was started in. Another browser, a
private window, or cleared browser data means a new session, unless the
coder moves it (below). With a participant id in the link, AnnoTinder
notices and says **You already started on another device**, with the
choice to continue on the original device or **Start a new session**. A
new session starts empty: it doesn't include the earlier answers.

## Continuing on another device

On the device where they started, coders click the monitor-and-phone icon
in the top bar (**Continue on another device**). It shows a QR code and a link.
Scanning or opening it on the other device continues the same session
there. The link works once, for 15 minutes; after that, coders make a new
one. Both devices can then continue the session.

The link gives access to the session, so coders shouldn't share it.

## Keyboard shortcuts

On a computer, coders can answer most questions without the mouse:

| Keys | Where | What they do |
| --- | --- | --- |
| **1** to **9** | options shown as buttons | pick that option (the badges on the buttons show the numbers) |
| **1** to **9**, **Enter** | scales | answer the first item that has no answer yet; Enter continues |
| **←** **→** **↑** | swipe questions | swipe left, right or up |
| **1** to **9**, **Esc** | span questions, after selecting text | give the selection that label, or cancel it |
| **Backspace** / **Delete** | span questions, after clicking in the text | remove the last span |

In **Settings**, **Shortcuts** hides the number badges for coders who find
them distracting; the keys keep working.

## Phones

AnnoTinder is made for small phone screens: the question stays docked at
the bottom within thumb reach, buttons are large enough to tap, and the
unit scrolls above it. Swipe questions can be answered by swiping the unit
itself. A question's layout is the same on every device, so coders on
phones and on computers answer the same form (see
[The same form on every device](design-fixed-layouts.md)).

Check long units and many options on a phone-sized screen before you
publish: the **Mobile** preview has the sizes of common phones.

## Light or dark

Under **Settings**, **Appearance**, coders choose **Light** or **Dark**.
Until they choose, AnnoTinder follows their device's setting. The choice is
kept in their browser. If your units only look right in one of the two
(e.g. styled material), set the loop's **Colours**; see
[Light or dark](colours-and-styles.md#light-or-dark).

## Instructions

Each question can have an **instruction**: shown under the question text,
in smaller grey text, every time the question comes up. Use it for the
short reminder that coders need while answering ("Code the main topic
only, not topics mentioned in passing").

For longer instructions, put a **Confirm** question before the loop, with
the instructions as its text: coders read them and click **I confirm**.
The text can be as long as you need, with headings and lists. See
[Confirm](confirm.md). Coders can always go back to it from the
**Navigation** menu.

## Stopping

The door icon at the top right offers three ways out:

- **Stop for now** explains how to continue later: open the same link on the
  same device and browser, or first use **Continue on another device**.
  Nothing is lost: answers are saved as the coder goes.
- **Quit this job** ends the session for good, after a confirmation. The
  answers so far are kept.
- **Quit and ask to delete my answers** ends the session and asks you, the
  researcher, to delete the coder's answers. The coder confirms by typing a
  word. You decide on the request on the **Coders** tab (see
  [Deleting a coder's data](coders-and-progress.md#deleting-a-coders-data)).

## The end

When coders finish the last item, they see **Job Complete!** with a thank
you. The last screen also has **Ask to delete my answers**, for coders who
want to withdraw after finishing. An [end item](end-items.md) can end the session earlier, with your own
message and, for online panels, a redirect back to the panel after a few
seconds. A coder who opens the link again later sees the same ending.
