---
title: Links
section: Coders
order: 1
summary: The links coders open to start - made from the design's coder invitations, with who may use them, coder ids, sign-in and a maximum number of uses.
---

Coders start a study by opening a **link**. You find the links under
**Deploy** › **Links**. One link can be shared with many coders (in an email
to your student assistants, or on a crowd-coding platform), or each coder
can get their own.

Links are made by **deploying the design**: you don't create them by
hand. The design's **Coder invitations** say which links there are: one
link, or a link per coder. That way the design describes which links exist
and what each one means.

Coders can only start once a design version is deployed (see
[Preview, save and deploy](previewing-and-publishing.md)).

## Coder invitations

In the editor, **Coder invitations** (above the item tree) says who codes
and how they get in. Choose one of two:

| Invitation          | Who codes                                                     | Links                                                         |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| **Specific coders** | Coders you know, each with their own units (a set column)     | **A link per coder**, or **one link** where coders pick their name or sign in |
| **Crowd**           | Anyone with the link, e.g. from an online panel or newsletter | One link                                                      |

**Specific coders**: choose the **Column with the coders**, a set column of
the units whose values are the coders (or **Make the column…** to make one).
Each coder gets their own units and `$session.coder` is their value. With
**A link per coder**, deploying makes a link for every coder; send each coder
theirs. With **One link: coders pick their name from the column**, coders
choose their name when they open the link. By default **a name stays on the
first device that picks it**: others see it as taken, and the coder continues
on that device (or moves with "Continue on another device"). With **any
device that picks a name continues its session**, a team can take turns on
shared devices, or one coder can use several; anyone with the link can then
pick any name. Everyone with the link sees the names, so this is for a
team you trust. With **One link: coders sign in with the email address in the
column**, the column's values are email addresses and coders get the units of
the address they sign in with. See
[Giving each coder their own units](own-units.md).

**Crowd** (the default): one link for anyone, with optionally

- **Coder id from a URL parameter**, such as a panel's `PROLIFIC_PID`
  (see [Coder ids](#coder-ids));
- **Coders sign in**: opening the link asks coders to sign in, and you see
  their email address (see [Login](#login));
- **Coders at most**: the link starts at most this many sessions, your
  sample size;
- **Share the units among coders**: a shared queue instead of every coder
  coding all units (see [Shared queues](shared-queues.md)).

The coders' own units and the shared queue are about units, so they only
matter once the design has a unit loop. Without one, the editor keeps the
settings but warns that they aren't used yet, and the links still follow
the invitation: specific coders without units is fine, for instance a
survey of experts you know, each with their own link.

## When links change

Links follow the deployed design and the study's deployed sets:

- deploying a design with another invitation makes the links it needs, and
  **retires** links it no longer makes;
- with a link per coder, a new coder in the column gets a link when the
  sets are deployed, and the link of a coder who is gone is retired;
- a link that comes back (the same coder) is the same link again, with the
  same address.

A retired link is never deleted: coders and their answers keep referring to
the link they came in with. Opening it shows _"This link is no longer
active"_; coders who already started with it keep working.

Deploying a design that makes more than 500 links asks you to confirm;
at most 2000 links are possible.

## Who may use a link

The pencil icon in a link's row (**Who may use this link**) sets:

| Setting            | What it does                                                     |
| ------------------ | ---------------------------------------------------------------- |
| **Label**          | For you: it appears in the Coders tab and the results            |
| **Max uses**       | Stop accepting new coders after this many                        |
| **Fixed coder id** | Everyone who uses this link gets this coder id (a personal link) |

Whether coders must sign in is part of the coder invitation (see
[Login](#login)).

**New link** (the key icon) gives the link a new address: the old one stops
working, for instance when it was shared too widely. Coders who started
keep working.

## Coder ids

A **coder id** says who the coder is: a name, a student number, an id from
your own pool of people, or the id an online panel gives each of its
participants. It is shown in the **Coder** column of the Coders tab and in
the `coder` column of the results, so you can link AnnoTinder's data to
other data you have on the same people.

- **Specific coders**: the coder id is the coder's value in the coders'
  column (by their own link, the name they picked, or the email address
  they signed in with).
- **No coder id**: in a crowd, coders are anonymous; the Coders tab shows a
  number.
- **Fixed coder id**: everyone who uses the link gets the id you set
  on it. Use it for personal links.
- **Coder id from a URL parameter**: set in a crowd invitation (see
  [Coder invitations](#coder-invitations)): the **URL parameter**, an
  optional **Pattern** and **Required**. The id is taken from the link
  itself, from the parameter you name (such as a panel's `PROLIFIC_PID`).
  The copied links end in `PROLIFIC_PID=<coder id>`: replace the
  placeholder with each coder's id, or let a panel fill it in (see
  [Online panels and crowd coding](online-panels.md)). When it is
  required (the default), a link without it doesn't start; when it isn't, a
  link without it starts a session without a coder id. A **pattern** (a
  regular expression, e.g. `[0-9]{6}`) makes the id fit a format.
- **Crowd with sign-in**: without an id from the URL, the coder id is the
  coder's email address; no other ids needed.

In the design the coder id is `$session.coder`, for instance in an end
item's return link.

A coder id is only a label, **never a key**: anyone who has the link
could type it in. So a coder id never gives access to earlier work.
If someone opens a link with a coder id that already has a session on
another device (or browser), which includes a coder's own link per coder,
they see _"You already started on another
device"_, and how to continue there, or move the session here with
**Continue on another device** (or by signing in). Only if they confirm that they can't get back to the earlier session
(a lost device, cleared browser data) can they start a new session here,
without the earlier answers. That should be rare; when it happens often,
check whether a personal link was shared with several people.

Two sessions with the same coder id are allowed, and kept apart: in
the results they are two sessions (two `session_id`s) with the same
`coder`. The coder id stays the same in both, so an end
item's return link to a panel carries it either way. Deal with duplicates
in your analysis, for instance by keeping each coder's first or most
complete session.

## Coming back to a session

Coders who signed in continue on any device by signing in there. Otherwise
a coder's work stays in the browser where they started (in a
cookie). Opening the link again on the same device and browser continues
where they left off, whatever link they use. To continue on another device,
coders open **Continue on another device** on the first device and open the
link or QR code it shows on the second (see
[What coders see](coder-experience.md)).

> On a **shared computer**, such as in a lab, a second person who opens the
> same link without a coder id continues the first person's session.
> Give each person their own coder id in the link (their sessions are then
> kept apart), or have them use a private browser window.

## Max uses

**Max uses** limits how many coders can start with a link. Once that many
have started, the status becomes _used up_ and new coders get the message
that the link has been used up. Coders who already started can still
continue. A coder who starts a new session on another device (see
above) doesn't count as a new use.

Use it to cap a crowd-coding batch, or to make sure a personal link is used
only once (max uses 1). A crowd invitation's **Coders at most** sets the
same limit for its link in the design; a link's own max uses overrides it.

## The list of links

| Column      | Shows                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| **Label**   | The label (the coder, or "Open link"; you can change it)                     |
| **For**     | The coder the link is for, with a link per coder                             |
| **Link**    | **Copy link** copies the link, with placeholders for URL parameters it needs |
| **Access**  | Who may use it: anyone, or a fixed coder id                                  |
| **Uses**    | How many coders started with it (and the maximum)                            |
| **Status**  | _open_, _used up_, _revoked_ or _retired_                                    |
| **Created** | When it was made                                                             |

**Revoke** stops new sessions with the link, also new sessions of a
coder id that already has one. Coders who already started keep
working. It stays revoked when you deploy again; **Reopen** (the arrow on a
revoked link) lets new coders in again. Retired links are listed
separately, below the active ones.

## Login

Coders sign in the same way as researchers (the login your server offers;
it isn't available on servers without one). Signing in links their email
address to their session, once. They code as anyone does; the email is used
again when they continue on another device: signing in there continues the
same session.

Coders can **always** sign in, from **Continue on another device** (the
screen icon), to keep their session across devices. Whether they **must**
sign in, and whether you see their address, is part of the coder
invitation:

- **Specific coders, one link**: coders sign in with the email address in
  the coders' column and get its units; other addresses see _"This email
  address has no access to this study"_. See
  [Giving each coder their own units](own-units.md).
- **Crowd with Coders sign in**: coders sign in before they start, and
  their email address identifies them.
- **Otherwise**: signing in is up to the coder, for their own convenience.
  You don't see their address.

Where sign-in is required, the coder's email address is stored with their
session: it appears in the Coders tab and the results (`email`), and you can
delete a coder's data by email. Elsewhere coders who sign in stay as
anonymous to you as those who don't.
