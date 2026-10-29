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
| **No login** / **Login optional** / **Login required** | Whether coders can, or must, log in (see [Login](#login)) |
| **Only these email addresses** | With login: only coders who log in with one of these addresses (see [Login](#login)) |
| **No participant id** / **Fixed participant id** / **Participant id from a URL parameter** | Whether coders who use this link get a participant id, and where it comes from |
| **Required URL parameter** | Other values the link must carry, e.g. a panel's study id; the codebook reads them as `$session.<name>` (see [Online panels](online-panels.md#values-from-the-link)) |
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
- **Participant id from a URL parameter**: the id is taken from the link
  itself, from the parameter you name (`participant`, or a panel's own such
  as `PROLIFIC_PID`). The copied link ends in `participant=<participant id>`:
  replace the placeholder with each coder's id, or let a panel fill it in
  (see [Online panels and crowd coding](online-panels.md)). The id is
  required: a link without it doesn't start. A **pattern** (a regular
  expression, e.g. `[0-9]{6}` or `p1|p2|p3`) makes the id fit a format.

In the codebook the participant id is `$session.participant`, for instance
in an end item's return link.

A participant id is only a label, **never a key**: anyone who has the link
could type it in. So a participant id never gives access to earlier work.
If someone opens a link with a participant id that already has a session on
another device (or browser), they see *"This link was already used on
another device"*. If that was them, they continue on the original device,
or move their session with **Continue on another device** there. If they
can't, or it was someone else (a fixed participant id on a link that was
passed on), they can start a new session here, without the earlier answers.

Two sessions with the same participant id are allowed, and kept apart: in
the results they are two coders (two `coder_id`s) with the same
`participant_id`. The participant id stays the same in both, so an end
item's return link to a panel carries it either way. Deal with duplicates
in your analysis, for instance by keeping each participant's first or most
complete session.

## Coming back to a session

With login, coders continue on any device by logging in there. Without
login, a coder's work stays in the browser where they started (in a
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

You can also do this while coding runs, for coders who join later: new sets
and invitations work right away, without publishing the codebook again.

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
| **Participant id** | The fixed id, `?<parameter>` for an id from the link (plus other required URL parameters), or – |
| **Presets** | The preset variables |
| **Units** | The invitation's unitset; you can change it here |
| **Uses** | How many coders started with it (and the maximum) |
| **Status** | *open*, *used up* or *revoked* |
| **Created** | When you made it |

### Revoking and deleting

- **Revoke** stops new sessions with the link, also new sessions of a
  participant id that already has one. Coders who already started keep
  working, also when they come back later on the same device. A revoked link can't
  be copied anymore.
- An invitation that nobody used yet can be **deleted** (the bin icon).
  Once it was used it can only be revoked: coders and their answers keep
  referring to the invitation they came in with.

## Login

Coders log in the same way as researchers (the login your server offers;
it isn't available on servers without one). Logging in links their email
address to their session, once. They code as anyone does; the email is
used again only when they continue on another device: logging in there
continues the same session.

- **Login required**: coders log in before they start.
- **Login optional**: coders start right away, and can log in any time from
  **Continue on another device** (the screen icon), which links their
  session so far.
- **Only these email addresses**: only coders who log in with one of these
  addresses can use the link (others see that the invitation is for other
  people). A list makes login required.

The coder's email address is stored with their session: it appears in the
Coders tab and the results (`email`), and you can delete a coder's data by
email. A participant id can come with a login too; it is then only a label
next to the account.

An invitation **without login** ignores a login: someone who happens to be
logged in (such as you, trying your own link) starts an anonymous session.
