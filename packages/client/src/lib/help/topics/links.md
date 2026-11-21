---
title: Links
section: Coders
order: 1
summary: The links coders open to start - made from the design's coder invitations, with who may use them, coder ids, sign-in and a maximum number of uses.
---

Coders start by opening a **link**, listed under **Deploy › Links**.
Deploying makes the links: you don't create them by hand. The design's
**Coder invitations** decide which links there are.

## Coder invitations

Open **Coder invitations** above the item tree and choose:

| Invitation          | Who codes                                         | Links                                                     |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| **Specific coders** | coders you know, each with their own units        | a link per coder, or one link to pick a name or sign in   |
| **Crowd** (default) | anyone with the link (a panel, a newsletter)      | one link                                                  |

**Specific coders**: choose the **Column with the coders** (a set column
naming a coder per unit, or **Make the column…**). Then how they get in:

- **A link per coder**: send each coder theirs;
- **One link: coders pick their name from the column**: a name stays on
  the first device that picks it, or (for a team sharing devices) any
  device continues it. Everyone with the link sees the names;
- **One link: coders sign in with the email address in the column**.

See [Giving each coder their own units](own-units.md).

**Crowd**: one link, optionally with:

- **Coder id from a URL parameter**, e.g. a panel's `PROLIFIC_PID` (see
  [Coder ids](#coder-ids));
- **Coders sign in**: you see their email address (see [Login](#login));
- **Coders at most**: the sample size;
- **Share the units among coders**: a shared queue instead of everyone
  coding all units (see [Shared queues](shared-queues.md)).

Unit settings only matter once the design has a unit loop; specific
coders without units is fine (e.g. a survey of experts, a link each).

## When links change

Deploying a different invitation makes the links it needs and **retires**
the rest. A new coder in the column gets a link when the sets are
deployed; a removed coder's link is retired; a returning coder gets the
same link again. Retired links show _"This link is no longer active"_;
coders who started keep working. More than 500 links asks to confirm; at
most 2000.

## Who may use a link

The pencil icon (**Who may use this link**):

| Setting            | Does                                                |
| ------------------ | --------------------------------------------------- |
| **Label**          | for you; shown on Coders and in the results         |
| **Max uses**       | stop new coders after this many                     |
| **Fixed coder id** | everyone using this link gets this id               |

**New link** (key icon) gives a new address, e.g. when it was shared too
widely; coders who started keep working.

## Coder ids

A **coder id** says who the coder is, in the **Coder** column and the
`coder` column of the results, to link to your other data. In the design:
`$session.coder`.

| Invitation                        | Coder id                                  |
| --------------------------------- | ----------------------------------------- |
| Specific coders                   | their value in the coders' column         |
| Crowd                             | none (anonymous; a number)                |
| Crowd, coder id from URL parameter | the parameter's value                    |
| Crowd with sign-in                | their email address                       |
| A link with a fixed coder id      | that id                                   |

**Coder id from a URL parameter**: name the **URL parameter**, optionally
a **Pattern** (e.g. `[0-9]{6}`), and whether it is **Required** (default:
a link without it doesn't start). Copied links end in
`PROLIFIC_PID=<coder id>`: fill it in, or let a panel do so (see
[Online panels and crowd coding](online-panels.md)).

A coder id is a label, **never a key**: anyone could type it. Opening a
link with an id that already has a session elsewhere shows _"You already
started on another device"_, with how to continue there. Only if they
can't get back can they start a new, empty session; the results then have
two `session_id`s with the same `coder`. Often? A personal link may have
been shared.

## Coming back to a session

Without sign-in, a session lives in the browser where it started: opening
the link there continues it. **Continue on another device** moves it (see
[What coders see](coder-experience.md)).

> On a **shared computer** (a lab), a second person opening the same link
> without a coder id continues the first person's session. Give each
> person a coder id, or use private windows.

## Max uses

After **Max uses** starts, the link is _used up_ for new coders; started
coders continue. Use it to cap a batch, or 1 for a personal link. A
crowd's **Coders at most** sets this in the design; a link's own max uses
overrides it.

## The list of links

| Column      | Shows                                                    |
| ----------- | -------------------------------------------------------- |
| **Label**   | the label (the coder, or "Open link")                    |
| **For**     | the coder, with a link per coder                         |
| **Link**    | **Copy link**, with placeholders for required parameters |
| **Access**  | anyone, or a fixed coder id                              |
| **Uses**    | coders started (and the maximum)                         |
| **Status**  | _open_, _used up_, _revoked_ or _retired_                |

**Revoke** stops new sessions (started coders keep working); **Reopen**
undoes it.

## Login

Coders sign in with the server's login. They can **always** sign in (via
**Continue on another device**) to keep a session across devices.
Whether they **must**, and whether you see their address, depends on the
invitation:

- **Specific coders, sign in**: their address must be in the column
  (others see _"This email address has no access to this study"_);
- **Crowd with Coders sign in**: they sign in before starting;
- **otherwise**: optional, and you don't see their address.

Where sign-in is required, the address is stored (`email` in the
results) and you can delete a coder's data by email.
