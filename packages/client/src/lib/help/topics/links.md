---
title: Links
section: Coders
order: 1
summary: The links coders open to start - made from the design, with who may use them, participant ids and a maximum number of uses.
---

Coders start a study by opening a **link**. You find the links under
**Deploy** › **Links**. One link can be shared with many coders (in an email
to your student assistants, or on a crowd-coding platform), or each coder
or group can get their own.

Links are made by **deploying the design**: you don't create them by
hand. A design without coders, conditions assigned by link or link parameters
makes one link. Otherwise deploying makes a link per value, or per
combination of values: a link per coder, per experimental condition, per
class. See [The session](session-parameters.md).
That way the design describes which links exist and what each one means,
and the values a link carries are `$session` values in the design.

Coders can only start once a design version is deployed (see
[Preview, save and deploy](previewing-and-publishing.md)).

## When links change

Links follow the deployed design and the study's deployed sets:

- deploying a design with other coders, conditions or link parameters
  makes the links it needs, and **retires** links it no longer makes;
- a new coder (or a new value of a condition with **All values in the
  column**) gets a link when it is deployed, and the link of a removed one
  is retired;
- a link that comes back into the design (the same values) is the same link
  again, with the same address.

A retired link is never deleted: coders and their answers keep referring to
the link they came in with. Opening it shows *"This link is no longer
active"*; coders who already started with it keep working.

Deploying a design that makes more than 500 links asks you to confirm;
at most 2000 links are possible. List the combinations you need in the
session parameters instead of every combination.

## Who may use a link

The pencil icon in a link's row (**Who may use this link**) sets:

| Setting | What it does |
| --- | --- |
| **Label** | For you: it appears in the Coders tab and the results |
| **Max uses** | Stop accepting new coders after this many |
| **Fixed participant id** | Everyone who uses this link gets this participant id (a personal link) |

Whether coders sign in is set for the whole study (see [Login](#login)).

**New link** (the key icon) gives the link a new address: the old one stops
working, for instance when it was shared too widely. Coders who started
keep working.

## Participant ids

A **participant id** is a label for a coder: a student number, an id from
your participant pool, or the id an online panel gives each participant. It
is shown in the **Coder** column of the Coders tab and in the
`participant_id` column of the results, so you can link AnnoTinder's data to
other data you have on the same people.

- **No participant id**: coders are anonymous; the Coders tab shows a number.
- **Fixed participant id**: everyone who uses the link gets the id you set
  on it. Use it for personal links.
- **Participant id from a URL parameter**: set in the design's session parameters (above the item tree)
  (see [Session parameters](session-parameters.md)). The id is taken from the
  link itself, from the parameter you name (`participant`, or a panel's own
  such as `PROLIFIC_PID`). The copied links end in
  `PROLIFIC_PID=<participant id>`: replace the placeholder with each coder's
  id, or let a panel fill it in (see
  [Online panels and crowd coding](online-panels.md)). The id is required: a
  link without it doesn't start. A **pattern** (a regular expression, e.g.
  `[0-9]{6}`) makes the id fit a format.

In the design the participant id is `$session.participant`, for instance
in an end item's return link.

A participant id is only a label, **never a key**: anyone who has the link
could type it in. So a participant id never gives access to earlier work.
If someone opens a link with a participant id that already has a session on
another device (or browser), they see *"You already started on another
device"*, and how to continue there, or move the session here with
**Continue on another device** (or by logging in, where the link allows
it). Only if they confirm that they can't get back to the earlier session
(a lost device, cleared browser data) can they start a new session here,
without the earlier answers. That should be rare; when it happens often,
check whether a personal link was shared with several people.

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

## Max uses

**Max uses** limits how many coders can start with a link. Once that many
have started, the status becomes *used up* and new coders get the message
that the link has been used up. Coders who already started can still
continue. A participant who starts a new session on another device (see
above) doesn't count as a new use.

Use it to cap a crowd-coding batch, or to make sure a personal link is used
only once (max uses 1).

## The list of links

| Column | Shows |
| --- | --- |
| **Label** | The label (made from the link's values; you can change it) |
| **Values** | The link parameter values the link carries |
| **Link** | **Copy link** copies the link, with placeholders for URL parameters it needs |
| **Access** | Who may use it: anyone, a login, email addresses, a fixed participant id |
| **Uses** | How many coders started with it (and the maximum) |
| **Status** | *open*, *used up*, *revoked* or *retired* |
| **Created** | When it was made |

**Revoke** stops new sessions with the link, also new sessions of a
participant id that already has one. Coders who already started keep
working. Retired links are listed separately, below the active ones.

## Login

Coders sign in the same way as researchers (the login your server offers;
it isn't available on servers without one). Signing in links their email
address to their session, once. They code as anyone does; the email is used
again only when they continue on another device: signing in there
continues the same session.

Whether coders sign in is a setting of the study: you choose it when you
first deploy, and can change it in the study's **Settings**.

- **Off**: anonymous links; nobody signs in.
- **Optional**: coders start right away, and can sign in any time from
  **Continue on another device** (the screen icon), which links their
  session so far.
- **Required**: coders sign in before they start.
- **Coders who are email addresses** (units divided over coders by
  email): there is one link, and sign-in is always required. Each coder
  gets the units of the address they signed in with; other addresses see
  *"This email address has no access to this study"*. See
  [Giving each coder their own units](own-units.md).

The coder's email address is stored with their session: it appears in the
Coders tab and the results (`email`), and you can delete a coder's data by
email. A participant id can come with a login too; it is then only a label
next to the account.

With sign-in **Off**, a login is ignored: someone who happens to be
logged in (such as you, trying your own link) starts an anonymous session.
