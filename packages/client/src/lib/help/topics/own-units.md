---
title: Giving each coder their own units
section: Units and distribution
order: 0.5
summary: The most common setup - a link per coder, each with their own units, and some overlap for reliability - in four steps.
---

A few coders, each coding their own part, with some units everyone codes
for reliability.

## In four steps

1. **Coder invitations** (above the item tree) → **Specific coders**.
2. **Column with the coders**: a set column of your units naming a coder
   per unit (`anna`, `bob`). From your CSV (type **set**, see
   [Uploading units](uploading-units.md)), or **Make the column…**: a
   number of coders (`coder_1`, ...), names or email addresses, **Coders
   per unit**, an **Overlap** for every coder, and the **Column name**.
   The units are shuffled and divided.
3. Choose **A link per coder** and **Deploy**.
4. **Deploy › Links** lists a link per coder: send each coder theirs.

The loops then give each coder their own units; nothing to set on the
loop. In the design the coder is `$session.coder`.

## How coders get in

- **A link per coder**: deploying makes them; send each coder theirs.
- **One link: coders pick their name from the column**. Choose whether a
  name stays on the first device that picks it, or any device continues
  it (a team sharing devices). Anyone with the link can pick any name.
- **One link: coders sign in with the email address in the column**: all
  values must be email addresses; coders sign in on any device, others
  can't code, and you see their address.

With a link each, coders can still sign in to keep their work across
devices, but you don't see their address.

## Overlap

| Cell        | Coded by     |
| ----------- | ------------ |
| `anna;bob`  | Anna and Bob |
| `_overlap`  | every coder  |

`_overlap` units are spread through each coder's units by default (see
[Overlap](overlap.md)).

## More coders later

Add values to the column (on **Units**, or by uploading) and deploy: new
coders get links, existing units stay with their coders. A removed
coder's link is retired.

## When this isn't what you need

- Every coder codes **all** units: **Crowd**, one link.
- Coders come and go, each unit needs e.g. two codings:
  [crowd coding](shared-queues.md).
- Units per experimental **condition**:
  [Experimental conditions](experimental-conditions.md).
