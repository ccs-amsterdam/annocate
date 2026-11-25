---
title: Giving each coder their own units
section: Units and distribution
order: 0.5
summary: The most common setup - a link per coder, each with their own units, and some overlap for reliability - in five steps.
---

A few coders, each coding their own part, with some units everyone codes
for reliability.

## In five steps

1. **A study with expert coders**: choose **Expert coders** when you
   create the study (or under **Settings**, until its first deploy).
2. **Your coders**: on **Coders**, **Add coders**: a coder id per line
   (`anna`, `bob`), optionally with their email address (see
   [The Coders page](coders-and-progress.md#the-coders-page)).
3. **The coder set**: the units' `coder_set` column names the coder(s) of
   each unit, by their coder id. From your CSV (a column named
   `coder_set`, see [Uploading units](uploading-units.md)), or **Make
   coder set** (on **Coders**; **Create coder set…** in **Who codes** and
   on **Units** is the same dialog). Under **Select coders**, tick who
   gets units (the coders of the current coder set are ticked; without
   one, all of them), and choose **Coders per unit** (**Divide the units**
   with a number, or **Everyone codes everything**). The units are
   shuffled and divided. **Test units**: the current ones (from
   `test_set`) are kept; switch on **Redistribute test units** to draw a
   number of overlap (and practice or gold) units anew. **Manage coders**,
   the dialog's other tab, adds coders without leaving it; it is where the
   dialog opens while you have none.
4. Choose **A link per coder** and **Deploy**.
5. **Links** lists a link per coder, and so does each coder's row on
   **Coders**: send each coder theirs.

The coder set names **your coders only**: a coder set (or an upload) with
a name that isn't one of them is refused, and says which. Add the coder
first, with the same spelling.

The loops then give each coder their own units; nothing to set on the
loop. In the design the coder is `$session.coder`.

## How coders get in

How coders get in is available once there is a coder set.

- **A link per coder**: deploying makes them; send each coder theirs.
- **One link: coders pick their coder id from the coder set**. Choose
  whether a name stays on the first device that picks it, or any device
  continues it (a team sharing devices). Anyone with the link sees the
  coder ids and can pick any: don't use email addresses as ids here
  (deploying warns if they look like addresses).
- **One link: coders sign in with their email address**: every coder with
  units needs an email address (on **Coders**; deploying says who has
  none). Coders sign in on any device and get their own units; other
  addresses can't code. In your results they are their **coder id**, not
  their address. If a coder's address changes, change it on **Coders**:
  they continue where they were.

With a link each, coders can still sign in to keep their work across
devices, but you don't see their address.

## Overlap

| Unit                      | Coded by     |
| ------------------------- | ------------ |
| `coder_set` is `anna;bob` | Anna and Bob |
| `test_set` is `overlap`   | every coder  |

Overlap units are spread throughout each coder's units by default (see
[Overlap](overlap.md)).

## More coders later

**Add coders**, then give them units (**Make coder set**, ticking them
too, or by uploading) and deploy: new coders get links, and **Keep the
units coders already coded** keeps coded units with their coders. A coder
who is no longer in the coder set has their link retired.

## A coder leaves

- To hand their open work to the others: the hand icon in their row on
  **Coders** moves the units they haven't coded; then deploy.
- To remove them and their data: the bin in their row (see
  [Deleting a coder](coders-and-progress.md#deleting-a-coder)). Their
  units then have no coder until you divide them again.

## When this isn't what you need

- Every coder codes **all** units: **Crowd (one link)**.
- Coders come and go, each unit needs e.g. two codings: **Crowd (one link)**, with
  the loop's units divided ([crowd coding](shared-queues.md)).
- Units per experimental **condition**:
  [Experimental conditions](experimental-conditions.md) (with one link).
