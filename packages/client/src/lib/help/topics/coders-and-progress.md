---
title: Coders and their progress
section: Coders
order: 3
summary: The Coders page and the Overview - your expert coders and their email addresses, who has which units and how far they got, and deleting a coder.
---

**Overview** shows the study as a whole; **Coders** shows every coder,
and below them every session. Both refresh while open. For full data,
download the [results](results.md).

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

## The Coders page

The page lists the coders of the kind your design asks for under **Who
codes**: your **expert coders**, or a **crowd's** coders. Before the
study's first deploy it follows the draft design; after it, the kind the
first deploy fixed. While the design hasn't chosen, the page says so.

Expert coders a design doesn't use are never out of sight: when the draft
invites a crowd (or hasn't chosen) and the study has expert coders, a
notice says _"3 expert coders (with email addresses) aren't used by this
design"_, with **Delete them**. The same notice is in the design's **Who
codes** when you switch it to a crowd. A first deploy as a crowd deletes
them, with their email addresses; the Deploy page says so before you
deploy.

### Expert coders

Expert coders are people you know, each with their own units. **You add
them**, before or after you upload units; nobody becomes one by opening a
link.

**Add coders** takes a list, one coder per line:

```
anna
bob, bob@uni.nl
carla; carla@uni.nl
```

- a **coder id** (`anna`), or a coder id and an **email address**, with a
  comma, a semicolon or a tab between them. A first line `coder,email` is
  skipped;
- **The coder id is the email address**: each line is an address, used as
  both;
- below the box you see what was read, with what is wrong per line (an
  id that already exists, something that isn't an email address). Nothing
  is saved until every line is right.

The **coder id** is what your results call the coder (the `coder` column)
and what the units' [coder set](sets.md) names. It is 1 to 64 characters,
without `;` or `#`, and **it never changes**: to rename a coder, delete
them and add them again. Ids that differ only in capitals are the same
coder. The **email address** is only needed where coders
[sign in](links.md#login); you can add, change or remove it any time (the
envelope icon).

> You enter these addresses before your coders ever log in. Tell them, and
> mention it in your information to coders.

Then **Make coder set** gives them units (see
[Giving each coder their own units](own-units.md)).

| Column                 | Shows                                                       |
| ---------------------- | ----------------------------------------------------------- |
| **Coder**              | the coder id                                                |
| **Email**              | the address they sign in with, if you gave one              |
| **Assigned (current)** | their units as deployed: what they have now                 |
| **Assigned (draft)**   | their units in the draft: what they get when you deploy     |
| **Done**               | units they answered (test units and earlier units included) |
| **Remaining**          | deployed units of theirs they haven't answered              |
| **Last active**        | their last answer                                           |

Click a column's name to sort by it (again: the other way round). The table
starts with who has the most left. A **≠** next to the draft's number
means the draft gives this coder other units than they have now: click it
to read _"The draft assigns different units; deploy to apply."_

Per coder:

- the envelope: their **email address**;
- the link icon (with **A link per coder**): **their link**, to copy and
  send. Opening it yourself starts their session in your browser;
- the hand icon: **move the units they haven't coded** to the other
  coders, those with the fewest left first. Units they coded stay theirs.
  It changes the draft: deploy the units to apply it;
- the bin: [delete the coder](#deleting-a-coder).

### Units without a coder

A notice says how many units **no coder has** (test units aside): among
the deployed units, for instance after you deleted a coder, and in the
draft. Nobody codes those. **Make coder set** → **Assign units without a
value, keep the rest** gives them to the coders you select; then deploy
the units. The same notice is on **Units** and **Deploy**.

### A crowd's coders

With **Crowd (one link)**, a coder appears here the first time someone
starts with a **coder id** (from a URL parameter such as a panel's
`PROLIFIC_PID`). You don't add them. The table shows the coder id, the units they answered and
when they were last active. Sessions without a coder id (an anonymous
link) have no coder: they are under **Sessions**.

A crowd's coder id that is the id of one of your expert coders (possible
only if expert coders were added to the study after it was deployed as a
crowd's) can't start: _"This coder id belongs to one of the study's
expert coders"_.

## Sessions

Below the coders, a row per **session**: one coder's run through the study
on a device. A coder who restarted on another device has two.

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
top of **Sessions**:

- **Delete now**: deletes the session and its answers;
- **Delete later**: hides the request (e.g. while you find the data in
  your own copies); the row stays marked "deletion requested".

It is a request, not automatic, because you may have downloaded the data,
and paid coders could otherwise take back paid work. Check your consent
text and institution's rules. A coder who writes to you can only be found
by coder id or sign-in email.

### Deleting a session yourself

Under **Sessions**: the bin icon in a row, or **Delete a coder's data…** to
find sessions by coder id or email (one per line). This deletes for good
the session and all its answers (also reset ones). Your own downloads
aren't affected: **Deleted coders** below the table (and
`deleted_coders.csv`) lists what was deleted (the session and the coder
id, never the units or an email address), so you can delete copies too.
Their units are handed out again where needed. An expert coder stays, with
their units; a crowd's coder goes with their last session.

### Deleting a coder

The bin icon in a coder's row deletes the **coder**, for good:

- every session of theirs and all their answers, as above;
- the coder, with their email address;
- **their units**: they leave the coder set, as deployed and in the draft.
  From that moment those units have no coder: the page says how many.
  Divide them again (**Make coder set**) and deploy the units;
- **their link** (with a link per coder), which is deleted.

You can add a coder with the same id again afterwards: a new coder,
without the earlier one's units or sessions, who gets a new link when you
deploy the units with them in the coder set.

## What counts as finished

A unit is **finished** when every question of its loop in the live version
is answered or skipped. Adding a question makes finished units unfinished
(see [Changing a design while coding runs](changing-a-live-design.md)).

## Previews don't count

Previews aren't stored, aren't shown here and don't use up queue units.
Test sessions through a real link do count: leave them out of your
analysis.
