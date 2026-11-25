---
title: Links
section: Coders
order: 1
summary: The links coders open to start - made from the design's who codes, with coder ids, sign-in and a maximum number of coders per link.
---

Coders start by opening a **link**, listed under **Links**.
Deploying makes the links: you don't create them by hand. The design's
**Who codes** decides which links there are.

## Who codes

Open **Who codes** above the item tree and choose (a new design asks
first; it can't be deployed without a choice):

| Who codes            | For                                                                              | Links                                                   |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Expert coders**    | coders you know, each with their own units (content analysis, trained coders)    | a link per coder, or one link to pick a name or sign in |
| **Crowd (one link)** | anyone with the link (a panel, a newsletter; annotation at scale, an experiment) | one link                                                |

**Expert coders**: you add your coders on **Coders**, and the units'
**coder set** (`coder_set`) names the coder(s) of each unit; **Create
coder set…** makes one. Then how they get in:

- **A link per coder**: send each coder theirs (the **Links** page, or the
  link icon in their row on **Coders**);
- **One link: coders pick their coder id from the coder set**: a name stays
  on the first device that picks it, or (for a team sharing devices) any
  device continues it. Everyone with the link sees the coder ids;
- **One link: coders sign in with their email address**: the address you
  gave each coder on **Coders**.

See [Giving each coder their own units](own-units.md).

**Crowd (one link)**, optionally with:

- **Coder id from a URL parameter**, e.g. a panel's `PROLIFIC_PID` (see
  [Coder ids](#coder-ids));
- **Coders sign in**: you see their email address (see [Login](#login));
- **Max. nr of coders**: the sample size (see
  [Max. nr of coders](#max-nr-of-coders)).

Whether its units are divided among the coders is set per unit loop
(see [Shared queues](shared-queues.md)). Groups that should get other
links or units: an [experiment](experimental-conditions.md), optionally
with its condition from a URL parameter.

Unit settings only matter once the design has a unit loop; specific
coders without units is fine (e.g. a survey of experts, a link each).

## When links change

Deploying a different invitation makes the links it needs and **retires**
the rest. A new coder in the coder set gets a link when the units are
deployed; a removed coder's link is retired; a returning coder gets the
same link again. Deleting a coder (on **Coders**) **revokes** their link. Retired links show _"This link is no longer active"_;
coders who started keep working. More than 500 links asks to confirm; at
most 2000.

## Coder ids

A **coder id** says who the coder is, in the **Coder** column and the
`coder` column of the results, to link to your other data. In the design:
`$session.coder`.

| Invitation                            | Coder id                     |
| ------------------------------------- | ---------------------------- |
| Expert coders                         | the coder id you gave them   |
| One link                              | none (anonymous; a number)   |
| One link, coder id from URL parameter | the parameter's value        |
| One link with sign-in                 | their email address          |

Expert coders keep their coder id however they get in: also when they sign
in, they are `anna` in your results, not their address.

**Coder id from a URL parameter**: name the **URL parameter**, optionally
a **Pattern** (e.g. `[0-9]{6}`), and whether it is **Required** (default:
a link without it doesn't start). Copied links end in
`PROLIFIC_PID=<coder id>`: fill it in, or let a panel do so (see
[Online panels and crowd coding](online-panels.md)). The parameter can't
be called `link`, `transfer`, `login` or `source`: every study link uses
those itself.

A coder id is a label, **never a key**: anyone could type it. Opening a
link with an id that already has a session elsewhere shows _"You already
started on another device"_, with how to continue there. Only if they
can't get back can they start a new, empty session; the results then have
two `session_id`s with the same `coder`. Often? A personal link may have
been shared.

One coder id can have **at most 5 sessions** in a study. After that the
coder sees _"You can't start another session"_ and has to continue where
they started. If they really can't, delete one of their sessions (see
[Coders and progress](coders-and-progress.md)); a deleted session no
longer counts.

## Coming back to a session

Without sign-in, a session lives in the browser where it started: opening
the link there continues it. **Continue on another device** moves it (see
[What coders see](coder-experience.md)).

> On a **shared computer** (a lab), a second person opening the same link
> without a coder id continues the first person's session. Give each
> person a coder id, or use private windows.

## Max. nr of coders

One link's **Max. nr of coders** (in the design) is the most sessions it
starts; after that it is _used up_ for new coders, and started coders
continue. To change it, change the design and deploy again.

## The list of links

| Column     | Shows                                                    |
| ---------- | -------------------------------------------------------- |
| **Label**  | the link's coder, or "Open link"                         |
| **For**    | the coder, or everyone                                   |
| **Link**   | **Copy link**, with placeholders for required parameters |
| **Uses**   | coders started (and the maximum)                         |
| **Status** | _open_, _used up_, _revoked_ or _retired_                |

A link has no settings of its own: they come from the design. **Revoke**
stops new sessions (started coders keep working); **Reopen** undoes it.
**New link** (key icon) gives a new address, e.g. when it was shared too
widely; coders who started keep working.

## Login

Coders sign in with the server's login. They can **always** sign in
(**Continue on another device** → **Log in**) to keep a session with their
account and continue it on other devices. Whether they **must**, and
whether you see their address, depends on the invitation:

- **Expert coders, sign in**: their address must be the email address of
  a coder with units (others see _"This email address has no access to
  this study"_). You enter the addresses on **Coders**; deploying is
  refused while a coder with units has none;
- **One link with Coders sign in**: they sign in before starting;
- **otherwise**: optional, and you don't see their address.

Where sign-in is required, the address a coder signed in with is stored
(`email` in the results) and you can delete a coder's data by email.

Being logged in on the server is not the same as signing in to your
study. Where sign-in is optional, a coder's account is used only after
they chose **Log in** in your study. Someone who opens your link while
logged in for something else (another study, or you testing your own
link as a researcher) codes without an account: no address is stored, and
a second link in the same browser starts its own session.
