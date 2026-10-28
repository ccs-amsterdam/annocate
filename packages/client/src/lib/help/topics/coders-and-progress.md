---
title: Following progress
section: Coders
order: 3
summary: The Overview and Coders tabs - whether the job is live, how many coders started, answers per day and how far each loop and coder got.
---

While coders work, two tabs tell you how it goes. The **Overview** tab shows
the job as a whole: is it live, how much has been coded, and how far each
unit loop is. The **Coders** tab shows every coder: when they started, when
they were last active and how many units they finished. Both are updated
whenever you open them; for the full data, download the results.

## The Overview tab

### Status

| Shows | Meaning |
| --- | --- |
| **Not published** | No codebook version is live yet: coders can't start |
| **Live** | Coders can work, since the date shown |
| **Paused** | Coders get no new units. Coders with a unit open can still finish it. **Pause** and **Resume** are next to the status |
| **Live version** | The codebook version coders get, with its note. Click it to open it in the codebook editor |
| **Draft** | Your unpublished changes, if any |

Changes reach coders right away: after you publish, upload or replace
units, change unitsets or reset answers, coders' next request uses them.
Under **Progress**, a line says since when the server holds the job and how
many coders' answers it keeps in memory.

### Numbers

| Tile | Big number | Below it |
| --- | --- | --- |
| **Units** | Units in the job | The number of unitsets |
| **Coders started** | Coders who answered at least one question in a unit loop | All coders who opened a link, and how many were active in the last 24 hours |
| **Finished codings** | Units finished, counted per coder: a unit two coders finished counts twice | All answers given, and when the last one was |
| **Open invitations** | Invitations that are not revoked or used up | All invitations |

Click a tile to go to the tab with the details.

### Answers per day

A bar per day for the last 30 days: how many answers coders gave that day
(in UTC). Point at a bar to see the number of answers and of coders. Use it
to see whether coding keeps pace, and when a batch of panel participants
came in.

### Progress

Per unit loop, and per unitset within it, a bar with the number of
**complete** units out of all units, and the number of coders who were
given units from it. What *complete* means depends on how the loop hands
out units (see [Handing out units](unit-distribution.md)):

- **Units shared among coders**: the unit was coded by enough coders (or
  enough agreed), so it goes to no one else. The bar reaching the end means
  the job is done.
- **All units**, **One set per coder** and **The invitation's units**: every
  coder who got this unitset finished the unit. A coder who stopped halfway
  keeps the bar from filling up, so read it together with the Coders tab.

A unitset appears here once the first coder was given units from it; a loop
over all units of the job shows *all units*. Progress is counted for
the live codebook version.

## The Coders tab

Every coder who opened an invitation link, most recently active first:

| Column | Shows |
| --- | --- |
| **Coder** | The participant id, or a number if they have none |
| **Invitation** | The label of the invitation they came in with |
| **Started** | When they first opened the link |
| **Last active** | When they last gave an answer in a unit loop |
| **Answers** | Their answers in unit loops: one per question per unit, including questions a condition skipped |
| **Finished in ...** | Per unit loop: the units for which they answered every question of the loop |

A unit loop is called by its label, or *Unit loop 1*, *Unit loop 2*, ...
if it has none: give loops a label to make this table easier to read.

Coders who only answered questions outside unit loops (for example
screened out after a few background questions) show no answers and no
last activity here. **Ended** says how a session ended: *Complete* or
*Screened out* at an [end item](end-items.md) (hover it to see which), or
*Quit* when the coder stopped for good; `coders.csv` in the results has the
same in its `ended` column.

## Deleting a coder's data

Participants may withdraw from a study, and data protection laws (such as
the GDPR) can give them the right to have their data deleted. AnnoTinder
supports this in two ways.

### When a coder asks

Coders can't delete their own answers, but they can **ask**. In the coding
screen, the door icon at the top has **Quit and ask to delete my answers**
(and the last screen has **Ask to delete my answers**). The coder confirms by
typing a word, and their session ends.

The request appears at the top of the **Coders** tab:

- **Delete now**: deletes the coder and their answers (see below).
- **Delete later**: stops showing the request at the top, for instance
  until you have found the data in your own copies. It stays marked
  "deletion requested" on the coder's row, and a line above the table
  counts the data still to delete.

It is a request, not an automatic deletion, on purpose. You may already have
downloaded the answers, so deleting them in AnnoTinder alone wouldn't honour
the request; you are the one who knows where the data went. And with paid
participants (an online panel), an automatic deletion would let someone
finish a task, get paid, and take their work back. Check your study's
consent text and your institution's rules: research data can be exempt from
deletion in some cases.

Anonymous coders can't prove who they are. A request comes from the
session itself, so it needs no proof. A coder who writes to you instead
can only be found if they give their participant id, or the email they
logged in with.

### Deleting a coder yourself

Click the bin icon in a coder's row, or **Delete a coder's data…** to find
coders by participant id or email (one per line; a participant id that
started on two devices has two sessions, and both are found). After
confirming, AnnoTinder deletes for good:

- the coder (their session, participant id, answers outside loops and group
  assignments);
- all their answers in unit loops, also answers a researcher reset earlier.

Copies you downloaded before are not affected: delete those yourself. To
make that possible, each deletion is logged: **Deleted coders**, under the
table, lists the coder id, participant id or email, when they asked, when
and by whom it was deleted, and how many answers. The download has the same
list, `deleted_coders.csv`. Units
the coder coded are handed out again where the distribution needs more
codings (for instance in a shared queue). The unit versions they saw stay,
because they hold your units' content, not the coder's.

## What counts as finished

A unit is **finished** for a coder when every question of its loop in the
live codebook has an answer, or was skipped by a condition. This matters
when you change a live codebook: adding a question to a loop makes units
that coders had finished unfinished again until they answer it (see
[Changing a codebook while coding runs](changing-a-live-codebook.md)).

## Previews don't count

When you try the job in **Preview**, you are a coder too, but nothing you
do is stored: previews don't appear on these tabs or in the results, and
they don't take units from shared queues. To test the real thing, use a real
invitation link, and leave those test sessions out of your analysis.

## More detail

For anything these tabs don't show, download the results (see
[Downloading results](results.md)): `coders.csv` has a row per coder with
their invitation, participant id, start and last activity, how their
session ended, units finished per loop, and their answers outside loops;
`annotations.csv` has every answer.
