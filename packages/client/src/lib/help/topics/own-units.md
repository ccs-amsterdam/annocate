---
title: Giving each coder their own units
section: Units and distribution
order: 0.5
summary: The most common setup - a link per coder, each with their own units, and some overlap for reliability - in four steps.
---

You have a sample and a few coders, and each coder should code their own
part, with some units that everyone codes so you can measure reliability.

## In four steps

1. **Say in your units who codes what.** Add a column to your CSV, say
   `coder`, with a coder's name in each row (`anna`, `bob`, `carla`). Upload
   it with the column type **set** (see [Uploading units](uploading-units.md)).
   No column yet? On the **Units** tab, **Fill a set column** splits your
   units over the names you type (see [Set columns](sets.md)).
2. **Tell the design.** In the editor, open **Session** above the item tree
   and tick **Units are divided over coders**, with `coder` as the column.
   The form shows what it found: _"3 coders: names, so a link per coder"_.
3. **Deploy.** Every coder gets their own link.
4. **Send the links.** **Deploy › Links** lists them, labelled with the
   coder: send Anna the `anna` link, and so on.

A unit loop then gives every session the units of its coder. You don't
set anything on the loop for this.

## Overlap

Units that several coders should code:

| Cell in the `coder` column | Who codes the unit |
| -------------------------- | ------------------ |
| `anna;bob`                 | Anna and Bob       |
| `_overlap`                 | every coder        |

Units in `_overlap` are placed among each coder's own units: spread through
them by default (see [Overlap](overlap.md)). **Fill a set column** can set
the overlap aside for you, as a percentage.

## Coders who sign in

Write email addresses instead of names (`anna@uni.nl`). There is then one
link for everyone, and coders sign in: each gets the units of the address
they signed in with, on any device. Others can't code. All values must be
email addresses, or none: a mix can't be deployed.

## More coders later

Add rows or values to the column (on the **Units** tab, or by uploading
again) and deploy: new coders get their links, and the units coders
already have stay theirs.

## When this isn't what you need

- Every coder codes **all** units: don't divide (leave **Units are divided
  over coders** off).
- Coders come and go, and each unit needs, say, two codings: use
  [crowd coding](shared-queues.md) instead.
- Different units for different **conditions** of an experiment: see
  [Experimental conditions](experimental-conditions.md).
