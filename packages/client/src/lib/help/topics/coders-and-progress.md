---
title: Following progress
section: Coders
order: 3
summary: The Overview and Coders tabs - whether the study is live, how many coders started, answers per day and how far each loop and coder got.
---

While coders work, two tabs tell you how it goes. The **Overview** tab shows
the study as a whole: is it live, how much has been coded, and how far each
unit loop is. The **Coders** tab shows every coder: when they started, when
they were last active and how many units they finished. Both refresh
by themselves while open (the Overview every 30 seconds, the Coders tab
every 10); for the full data, download the results.

## The Overview tab

### Status

| Shows            | Meaning                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Not deployed** | No design version is live yet: coders can't start                                                                                                                                                                                                 |
| **Live**         | Coders can work, since the date shown                                                                                                                                                                                                             |
| **Paused**       | Nothing new starts: no new sessions and no new units. Coders save what they have open (also units loaded ahead), then see that the study is paused, and continue where they were once you resume. **Pause** and **Resume** are next to the status |
| **Live version** | The design version coders get, with its note. Click it to open it in the design editor                                                                                                                                                            |
| **Draft**        | Your changes that aren't deployed yet, if any                                                                                                                                                                                                     |

Uploading or replacing units and changing sets only change the drafts.
Once you deploy them (or a design version), or reset answers, coders get
the changes with the next units they load (units already loaded ahead stay
as they were).

### Numbers

| Tile                 | Big number                                                                 | Below it                                                                    |
| -------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Units**            | Units in the study                                                         | The number of set columns                                                   |
| **Coders started**   | Coders who answered at least one question (random conditions don't count)  | All coders who opened a link, and how many were active in the last 24 hours |
| **Finished codings** | Units finished, counted per coder: a unit two coders finished counts twice | All answers given, and when the last one was                                |
| **Active links**     | Links that are not revoked, retired or used up                             | All links                                                                   |

Click a tile to go to the tab with the details.

### Answers per day

A bar per day for the last 30 days: how many answers coders gave that day
(in UTC). Point at a bar to see the number of answers and of coders. Use it
to see whether coding keeps pace, and when a batch of panel coders
came in.

### Progress

Per unit loop, and per share within it (a coder, a condition, or _all
units_), a bar with the number of
**complete** units out of all units, and the number of coders who were
given units from it. What _complete_ means depends on how the loop hands
out units (see [Handing out units](unit-distribution.md)):

- **Crowd coding** (a shared queue): the unit was coded by enough coders (or
  enough agreed), so it goes to no one else. The bar reaching the end means
  the study is done.
- **Otherwise** (every coder codes all their units): every coder who got
  these units finished the unit. A coder who stopped halfway
  keeps the bar from filling up, so read it together with the Coders tab.

A share appears here once the first coder was given units from it; a
loop over all units of the study shows _all units_. Progress is counted for
the live design version.

## The Coders tab

Every coder who opened a link, most recently active first:

| Column              | Shows                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Coder**           | The coder id (their name in the coders' column, a panel's id, or a sign-in email), or a number if they have none                   |
| **Link**            | The label of the link they came in with                                                                                            |
| **Started**         | When they first opened the link                                                                                                    |
| **Last active**     | When they last gave an answer                                                                                                      |
| **Answers**         | All their answers: one per question (per unit, in loops), including questions outside unit loops and questions a condition skipped |
| **Finished in ...** | Per unit loop: the units for which they answered every question of the loop                                                        |

A unit loop is called by its label, or _Unit loop 1_, _Unit loop 2_, ...
if it has none: give loops a label to make this table easier to read.

**Ended** says how a session ended: _Complete_ or
_Screened out_ at an [end item](end-items.md) (hover it to see which), or
_Quit_ when the coder stopped for good; `coders.csv` in the results has the
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
coders (an online panel), an automatic deletion would let someone
finish a task, get paid, and take their work back. Check your study's
consent text and your institution's rules: research data can be exempt from
deletion in some cases.

Anonymous coders can't prove who they are. A request comes from the
session itself, so it needs no proof. A coder who writes to you instead
can only be found if they give their coder id, or the email they
signed in with (where the invitation requires sign-in).

### Deleting a coder yourself

Click the bin icon in a coder's row, or **Delete a coder's data…** to find
coders by coder id or email (one per line; a coder id that
started on two devices has two sessions, and both are found). After
confirming, AnnoTinder deletes for good:

- the coder's session (its coder id, answers outside loops and
  random conditions);
- all their answers in unit loops, also answers a researcher reset earlier.

Copies you downloaded before are not affected: delete those yourself. To
make that possible, each deletion is logged: **Deleted coders**, under the
table, lists the session number, the coder id, when they asked, when
and by whom it was deleted, and how many answers. The download has the same
list, `deleted_coders.csv`. Units
the coder coded are handed out again where the distribution needs more
codings (for instance in a shared queue). The unit versions they saw stay,
because they hold your units' content, not the coder's.

## What counts as finished

A unit is **finished** for a coder when every question of its loop in the
live design version has an answer, or was skipped by a condition. This matters
when you change a live design: adding a question to a loop makes units
that coders had finished unfinished again until they answer it (see
[Changing a design while coding runs](changing-a-live-design.md)).

## Previews don't count

When you try the study in **Preview**, you are a coder too, but nothing you
do is stored: previews don't appear on these tabs or in the results, and
they don't take units from shared queues. To test the real thing, use a real
link, and leave those test sessions out of your analysis.

## More detail

For anything these tabs don't show, download the results (see
[Downloading results](results.md)): `coders.csv` has a row per coder
session (`session_id`) with their coder id (`coder`), link, start and last activity, how their
session ended, units finished per loop, and their answers outside loops;
`annotations.csv` has every answer.
