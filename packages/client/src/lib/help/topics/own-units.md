---
title: Giving each coder their own units
section: Units and distribution
order: 0.5
summary: The most common setup - a link per coder, each with their own units, and some overlap for reliability - in four steps.
---

A few coders, each coding their own part, with some units everyone codes
for reliability.

## In four steps

1. **Coder unit assignments** (above the item tree) → **Specific coders**.
2. **The coder set**: the units' `coder_set` column names the coder(s) of
   each unit (`anna`, `bob`). From your CSV (a column named `coder_set`,
   see [Uploading units](uploading-units.md)), or **Create coder set…**:
   names (default), email addresses or a number of coders (`coder_1`,
   ...), and **Coders per unit** (**Divide the units** with a number, or
   **Everyone codes everything**). The units are shuffled and divided.
   **Test units**: the current ones (from `test_set`) are kept; switch on
   **Redistribute test units** to draw a number of overlap (and practice
   or gold) units anew.
3. Choose **A link per coder** and **Deploy**.
4. **Links** lists a link per coder: send each coder theirs.

The loops then give each coder their own units; nothing to set on the
loop. In the design the coder is `$session.coder`.

## How coders get in

How coders get in is available once there is a coder set.

- **A link per coder**: deploying makes them; send each coder theirs.
- **One link: coders pick their name from the coder set**. Choose whether
  a name stays on the first device that picks it, or any device continues
  it (a team sharing devices). Anyone with the link can pick any name.
- **One link: coders sign in with the email address in the coder set**:
  all coders must be email addresses; coders sign in on any device,
  others can't code, and you see their address.

With a link each, coders can still sign in to keep their work across
devices, but you don't see their address.

## Overlap

| Unit                       | Coded by     |
| -------------------------- | ------------ |
| `coder_set` is `anna;bob`  | Anna and Bob |
| `test_set` is `overlap`   | every coder  |

Overlap units are spread throughout each coder's units by default (see
[Overlap](overlap.md)).

## More coders later

Add values to the coder set (**Update coder set…**, on **Units**, or by
uploading) and deploy: new coders get links, and **Keep the units coders
already have** keeps the units coders already saw with them. A removed
coder's link is retired.

## When this isn't what you need

- Every coder codes **all** units: **One link**.
- Coders come and go, each unit needs e.g. two codings: **One link**, with
  the loop's units divided ([crowd coding](shared-queues.md)).
- Units per experimental **condition**:
  [Experimental conditions](experimental-conditions.md) (with one link).
