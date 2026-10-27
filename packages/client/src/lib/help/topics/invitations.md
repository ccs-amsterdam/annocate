---
title: Invitations
section: Coders
order: 1
summary: The links coders open to start - with participant ids, preset variables, their own units and a maximum number of uses.
---

Coders start a job by opening an **invitation link**. You make these links
on the **Invitations** tab. One link can be shared with many coders (a link
in an email to your student assistants, or on a crowd-coding platform), or
you can make a personal link per coder.

An invitation can also carry information about the coders who use it: a
participant id, values for the codebook's
[assigned variables](auto.md) (such as an experimental group), and the
units they should code. That way the codebook itself never needs to know
who your coders are.

Coders can only start once a codebook version is published (see
[Preview, save and publish](previewing-and-publishing.md)).

## Creating an invitation

Under **Create invitation link**:

1. Give it a **Label**, such as *Student assistants* or *Prolific batch 1*.
   The label is for you: it appears in the Coders tab and the results.
2. Choose the other settings you need (below). All are optional.
3. Click **Create**. The invitation appears in the list below.
4. Click **Copy link** in its row and send the link to your coders.

| Setting | What it does |
| --- | --- |
| **No login** | Coders start without an account (the only option that works for now) |
| **No participant id** / **Fixed participant id** / **Participant id from URL** | Whether coders who use this link get a participant id, and where it comes from |
| **Preset variables** | Values for the codebook's assigned variables, e.g. `group=experts` |
| **Max uses** | Stop accepting new coders after this many |
| **Units** | The unitset its coders get in loops with *The invitation's units* |

## Participant ids

A **participant id** is a label for a coder: a student number, an id from
your participant pool, or the id an online panel gives each participant. It
is shown in the **Coder** column of the Coders tab and in the
`participant_id` column of the results, so you can link AnnoTinder's data to
other data you have on the same people.

- **No participant id**: coders are anonymous; the Coders tab shows a number.
- **Fixed participant id**: everyone who uses this link gets the id you type
  in. Use it for personal links, one per coder.
- **Participant id from URL**: the id is taken from the link itself. The
  copied link ends in `&participant=<id>`: replace `<id>` with each coder's
  id, or let a panel fill it in (see
  [Online panels and crowd coding](online-panels.md)). A coder who opens the
  link without an id starts without one.

A participant id is only a label, **never a key**: anyone who has the link
could type it in. So a participant id never gives access to earlier work.
If someone opens a link with a participant id that already has a session on
another device, they see *"You already started on another device"*: they
can continue on the original device, move their session with **Continue on
another device** there, or start a new session here (which doesn't include
their earlier answers). Both sessions then appear in the results with the
same participant id.

## Coming back to a session

Without login, a coder's work stays in the browser where they started (in a
cookie). Opening the link again on the same device and browser continues
where they left off, whatever link they use. To continue on another device,
coders open **Continue on another device** on the first device and open the
link or QR code it shows on the second (see
[What coders see](coder-experience.md)).

> On a **shared computer**, such as in a lab, a second person who opens the
> same link without a participant id continues the first person's session.
> Give each person their own participant id (their sessions are then kept
> apart), or have them use a private browser window.

## Preset variables

In **Preset variables**, write values for the codebook's
[assigned variables](auto.md) whose source is **Set by invitation**:
`group=experts`, or several separated by commas: `group=experts, slot=2`.
Everyone who uses the link gets these values when they start. Use the option
values of the assigned variable.

Typical uses:

- one link per group you know in advance (experts and students, two
  classes, two countries), so a condition or a
  [coder group](coder-groups.md) can treat them differently;
- one personal link per coder with `slot=1`, `slot=2`, ..., so each coder
  gets their own part of the units (`part_$var.slot.value`).

## Units per invitation

An invitation can carry its own units: choose a unitset under **Units**
when you create it, or later in its row in the list. Its coders get these
units in every unit loop whose units are set to **The invitation's units**
(see [Handing out units](unit-distribution.md)). In other loops the
invitation's units play no role.

- A coder gets the invitation's units when they reach the loop, and keeps
  them. Changing an invitation's units later only affects coders who reach
  the loop after the change.
- If the live codebook gives coders *the invitation's units* and an
  invitation has none, the Invitations tab warns you: its coders get no
  units in that loop.
- A unitset that an invitation uses can't be deleted.

### Divide units over coders

To give each of a known group of coders their own units, click **Divide
units over coders…**:

1. Under **Units**, choose all units or a unitset to divide.
2. Under **Coders, one per line**, type the coders' names (or ids).
3. Optionally set **Overlap units (everyone codes them)**: that many units
   are taken out first and given to every coder, for
   [intercoder reliability](overlap.md).
4. Click **Create 3 invitations** (the number is the number of coders).

AnnoTinder shuffles the units, splits them into equal parts, and makes a
unitset per coder (named after the coder) plus one named `overlap`, and a
personal invitation per coder: labelled with their name, with their name as
fixed participant id, and their unitset as its units. Then set the unit loop
to **The invitation's units**, with the overlap set as its overlap. Send
each coder their own link.

## Max uses

**Max uses** limits how many coders can start with a link. Once that many
have started, the status becomes *used up* and new coders get the message
that the invitation has been used up. Coders who already started can still
continue. A participant who starts a new session on another device (see
above) doesn't count as a new use.

Use it to cap a crowd-coding batch, or to make sure a personal link is used
only once (max uses 1).

## The list of invitations

| Column | Shows |
| --- | --- |
| **Label** | The label you gave it |
| **Link** | **Copy link** copies the link |
| **Participant id** | The fixed id, *from URL*, or – |
| **Presets** | The preset variables |
| **Units** | The invitation's unitset; you can change it here |
| **Uses** | How many coders started with it (and the maximum) |
| **Status** | *open*, *used up* or *revoked* |
| **Created** | When you made it |

### Revoking and deleting

- **Revoke** stops new coders from joining with the link. Coders who already
  started keep working, also when they come back later. A revoked link can't
  be copied anymore.
- An invitation that nobody used yet can be **deleted** (the bin icon).
  Once it was used it can only be revoked: coders and their answers keep
  referring to the invitation they came in with.

## Login

The options **Login optional** and **Login required** are not supported yet.
For now, all coders start without logging in, and their work stays on their
device unless they move it with **Continue on another device**.
