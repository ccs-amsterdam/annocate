---
title: Links
section: Coders
order: 1
summary: The links coders open to start - made from the codebook, with who may use them, participant ids and a maximum number of uses.
---

Coders start a job by opening a **link**. You find the links on the
**Invitations** tab. One link can be shared with many coders (in an email
to your student assistants, or on a crowd-coding platform), or each coder
or group can get their own.

Links are made by **publishing the codebook**: you don't create them by
hand. A codebook without link parameters makes one link. A codebook whose
Session item has **link parameters** makes a link per value, or per
combination of values: a link per set of a group, per experimental
condition, per panel. See [Session parameters](session-parameters.md).
That way the codebook describes which links exist and what each one means,
and the values a link carries are `$session` values in the codebook.

Coders can only start once a codebook version is published (see
[Preview, save and publish](previewing-and-publishing.md)).

## When links change

Links follow the published codebook and the job's sets:

- publishing a codebook with other link parameters makes the links it
  needs, and **retires** links it no longer makes;
- a link parameter with the sets of a group gets a new link as soon as the
  group gets a new set, without publishing again; a removed set's link is
  retired;
- a link that comes back into the design (the same values) is the same link
  again, with the same address.

A retired link is never deleted: coders and their answers keep referring to
the link they came in with. Opening it shows *"This link is no longer
active"*; coders who already started with it keep working.

Publishing a codebook that makes more than 500 links asks you to confirm;
at most 2000 links are possible. List the combinations you need in the
Session item instead of every combination.

## Who may use a link

The pencil icon in a link's row sets who may use it:

| Setting | What it does |
| --- | --- |
| **Label** | For you: it appears in the Coders tab and the results |
| **No login** / **Login optional** / **Login required** | Whether coders can, or must, log in (see [Login](#login)) |
| **Only these email addresses** | With login: only coders who log in with one of these addresses (see [Login](#login)) |
| **Max uses** | Stop accepting new coders after this many |
| **Fixed participant id** | Everyone who uses this link gets this participant id (a personal link) |

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
- **Participant id from a URL parameter**: set in the codebook's Session item
  (see [Session parameters](session-parameters.md)). The id is taken from the
  link itself, from the parameter you name (`participant`, or a panel's own
  such as `PROLIFIC_PID`). The copied links end in
  `PROLIFIC_PID=<participant id>`: replace the placeholder with each coder's
  id, or let a panel fill it in (see
  [Online panels and crowd coding](online-panels.md)). The id is required: a
  link without it doesn't start. A **pattern** (a regular expression, e.g.
  `[0-9]{6}`) makes the id fit a format.

In the codebook the participant id is `$session.participant`, for instance
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
that the invitation has been used up. Coders who already started can still
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
- **Sets assigned by email**: a unit loop can give each coder the set named
  after their login email (see [Handing out units](unit-distribution.md)).
  Then only the email addresses that are set names of that group can code
  at all, with any link: coders log in, and other addresses see *"This email
  address has no access to this study"*.

The coder's email address is stored with their session: it appears in the
Coders tab and the results (`email`), and you can delete a coder's data by
email. A participant id can come with a login too; it is then only a label
next to the account.

A link **without login** ignores a login: someone who happens to be
logged in (such as you, trying your own link) starts an anonymous session.
