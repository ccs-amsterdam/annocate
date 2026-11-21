---
title: Giving each coder their own units
section: Units and distribution
order: 0.5
summary: The most common setup - a link per coder, each with their own units, and some overlap for reliability - in four steps.
---

You have a sample and a few coders, and each coder should code their own
part, with some units that everyone codes so you can measure reliability.

## In four steps

1. **Invite specific coders.** In the editor, open **Coder invitations**
   above the item tree and choose **Specific coders**.
2. **Say who codes what.** Choose the **Column with the coders**: a set
   column of your units with a coder in each row (`anna`, `bob`, `carla`).
   Your CSV can have one (upload it with the column type **set**, see
   [Uploading units](uploading-units.md)). No column yet? **Make the
   column…** opens a dialog: give a **number of coders** (`coder_1`,
   `coder_2`, ...), their **names** or their **email addresses**, the
   **coders per unit**, an **overlap** every coder codes (a percentage or a
   number of units) and the **column name**. The units are shuffled and
   divided. The form then shows how many coders it found.
3. **Deploy.** With **A link per coder**, every coder gets their own link.
4. **Send the links.** **Deploy › Links** lists them, labelled with the
   coder: send Anna the `anna` link, and so on.

A unit loop then gives every coder their own units. You don't set anything
on the loop for this. In the design the coder is `$session.coder`.

## Overlap

Units that several coders should code:

| Cell in the `coder` column | Who codes the unit |
| -------------------------- | ------------------ |
| `anna;bob`                 | Anna and Bob       |
| `_overlap`                 | every coder        |

Units in `_overlap` are placed among each coder's own units: spread through
them by default (see [Overlap](overlap.md)). **Make the column…** can set
the overlap aside for you, as a percentage or a number of units.

## Coders who sign in

Write email addresses instead of names (`anna@uni.nl`) and choose **One
link: coders sign in with the email address in the column**. There is then
one link for everyone, and coders sign in: each gets the units of the
address they signed in with, on any device. Others can't code. All values
must be email addresses. You see each coder's address in the Coders tab and
the results.

With a link per coder, coders can still sign in to keep their work across
devices, but you don't see their address.

## More coders later

Add rows or values to the column (on the **Units** tab, or by uploading
again) and deploy: new coders get their links, and the units coders
already have stay theirs. The link of a coder you removed is retired.

## When this isn't what you need

- Every coder codes **all** units: invite a **Crowd** with one link instead.
- Coders come and go, and each unit needs, say, two codings: use
  [crowd coding](shared-queues.md) instead.
- Different units for different **conditions** of an experiment: see
  [Experimental conditions](experimental-conditions.md).
