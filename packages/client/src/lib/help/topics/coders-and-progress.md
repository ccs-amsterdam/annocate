---
title: Following progress
section: Coders
order: 3
summary: Overview and Results › Coders - whether the study is live, how many coders started, answers per day and how far each loop and coder got.
---

**Overview** shows the study as a whole; **Results › Coders** shows every
coder. Both refresh while open. For full data, download the
[results](results.md).

## The Overview page

### Status

| Shows            | Meaning                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| **Not deployed** | coders can't start yet                                                     |
| **Live**         | coders can work                                                            |
| **Paused**       | nothing new starts; coders save what is open and continue after **Resume** |
| **Live version** | the version coders get; click to open it                                   |
| **Draft**        | changes not deployed yet                                                   |

**Pause** and **Resume** are on the **Deploy** page, with deploying.

### Numbers

| Tile                 | Number                                | Below it                                  |
| -------------------- | ------------------------------------- | ----------------------------------------- |
| **Units**            | units in the study                    | coder, condition and part sets            |
| **Coders started**   | coders who answered a question        | all who opened a link; active in 24 hours |
| **Finished codings** | units finished, per coder             | all answers, and the last one             |
| **Active links**     | links not revoked, retired or used up | all links                                 |

### Answers per day

Answers per day (UTC) for the last 30 days; point at a bar for answers and
coders.

### Progress

Per loop and share (a coder, a link's set, a condition, or _all units_): **complete**
units out of all, and coders given units.

- **Shared queue**: complete means coded (or agreed on) enough. A full bar
  means done.
- **Otherwise**: every coder who got the unit finished it. A coder who
  stopped keeps the bar from filling, so check **Coders** too.

## The Coders view

| Column            | Shows                                        |
| ----------------- | -------------------------------------------- |
| **Coder**         | the coder id, or a number                    |
| **Link**          | the link's label                             |
| **Started**       | first opened the link                        |
| **Last active**   | last answer                                  |
| **Answers**       | all answers, skipped ones included           |
| **Finished in …** | per loop, units with every question answered |

Give loops a label to make this readable. **Ended**: _Complete_ or
_Screened out_ at an [end item](end-items.md), or _Quit_.

## Deleting a coder's data

Coders may withdraw, and laws such as the GDPR can give them a right to
deletion.

### When a coder asks

Coders can **ask**: **Quit and ask to delete my answers** (door icon) or
**Ask to delete my answers** on the last screen. The request shows at the
top of **Coders**:

- **Delete now**: deletes the coder and their answers;
- **Delete later**: hides the request (e.g. while you find the data in
  your own copies); the row stays marked "deletion requested".

It is a request, not automatic, because you may have downloaded the data,
and paid coders could otherwise take back paid work. Check your consent
text and institution's rules. A coder who writes to you can only be found
by coder id or sign-in email.

### Deleting a coder yourself

The bin icon in a row, or **Delete a coder's data…** to find coders by
coder id or email (one per line). This deletes for good the session and
all their answers (also reset ones). Your own downloads aren't affected:
**Deleted coders** below the table (and `deleted_coders.csv`) lists what
was deleted, so you can delete copies too. Their units are handed out
again where needed.

## What counts as finished

A unit is **finished** when every question of its loop in the live version
is answered or skipped. Adding a question makes finished units unfinished
(see [Changing a design while coding runs](changing-a-live-design.md)).

## Previews don't count

Previews aren't stored, aren't shown here and don't use up queue units.
Test sessions through a real link do count: leave them out of your
analysis.
