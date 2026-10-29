---
title: Privacy and where data lives
section: Design notes
order: 7
summary: What AnnoTinder stores about coders, where it runs, how sessions work without accounts, and what coders' browsers receive.
---

Annotation studies often involve personal data: participants' answers in a
survey experiment, panel ids, sometimes sensitive material in the units
themselves. This page describes what AnnoTinder stores and sends where, so
you can write your data management plan, your ethics application and your
participant information accurately.

In short: AnnoTinder stores what the study needs and little more. Coders
don't need an account, and nothing is shared outside the job.

## What is stored

Everything of a job is stored on the AnnoTinder server you use:

| What | Includes |
| --- | --- |
| **Units** | The data you uploaded, and each unit as coders saw it (see [Keeping track of what coders saw](design-what-coders-saw.md)) |
| **Codebooks** | Every saved and published version |
| **Invitations** | Their settings: label, participant id, preset values, units, uses |
| **Coders** | Per session: the invitation used, the participant id (if any), the answers to questions outside unit loops, assigned groups, which units they were given, when they started, and how the session ended |
| **Devices** | Per device a coder used: the kind of device (phone, tablet, desktop), browser and operating system, and on which device each answer was given |
| **Answers** | Per unit and question: the answer, when it was first given and last changed, and the codebook and unit version |
| **Response times** | Per question: how long it was on screen until the first answer and in total, how long the page was hidden meanwhile, and how often the answer changed (measured in the coder's browser); per unit, when the server handed it out. Always recorded: mention it in your participant information if it matters for your study |

What AnnoTinder itself does **not** store about coders: their name, their
email address (unless the invitation has them [log in](invitations.md#login)), their IP address, details of their device beyond its kind, browser and operating system, or
URL parameters other than the ones the codebook asks for (an
[assigned variable](auto.md) that reads a URL parameter, and the participant
id if the invitation takes it from the URL). The web server in front of
AnnoTinder may keep ordinary access logs; ask whoever runs it.

A browser keeps one random device id (a cookie) for all jobs, but
AnnoTinder stores only a code derived from it per job. So the stored data
can't tell that one device took part in two jobs: an anonymous job stays
anonymous, also next to a job where the same person gave their name or
participant id.

The server sees units and answers as they are, like any web application that
stores them: they are not encrypted in the browser.

## Hosted or self-hosted

You can use AnnoTinder at annotinder.com, hosted for you in the EU, or run it
on your own or your institution's server. Both are the same software.

- **Hosted** is the easiest start, and fits most content analysis and crowd
  coding.
- **Self-hosted** keeps all data within your institution: for sensitive
  material, for data you may not transfer, or when your institution requires
  it. It needs someone who can run a web application with a database.

## Participant ids are labels

A **participant id** links a coder's answers to another record: a panel's
participant id, a code from a lab schedule. It is stored with the coder, and
shown on the **Coders** tab and in the download.

A participant id is a *label*, not a password. Anyone who has a link with
that id in it could open it. So AnnoTinder never lets a participant id unlock
earlier answers: opening a participant's link on a new device does not show
the answers given on the first device. Instead, the coder is told they already
started elsewhere, and can either continue there or start a new session. (A
person holding the link only learns that the id was used before.)

Panel ids are pseudonymous personal data: you, or the panel, can link them
to a person. Treat the download accordingly, and remove the ids from data
you publish.

## Sessions live in the coder's browser

Coders don't create accounts. When a coder opens an invitation, the server
starts a **session** for them. The browser keeps one random device id (a
cookie); for this job the server stores only a code derived from it. So the
same browser continues the same session later, for up to about a year (as
long as browsers keep cookies), and even a copy of the database doesn't let
anyone take over sessions.

What this means for your study:

- **Work stays on the device it was done on.** To continue on another device,
  a coder opens **Continue on another device** on the first one: it shows a
  link and QR code that work once, for 15 minutes.
- **Clearing cookies or a private window loses the session.** The answers
  given so far are stored on the server, but the coder can't continue them;
  opening the link again starts a new session.
- **Shared computers.** Without a participant id, the next person who opens
  the same link on the same browser continues the previous person's session.
  In a lab, give every participant their own participant id (sessions are
  kept apart per participant id), or use a private window per participant.

With an invitation that has coders log in, their email address is stored
with their session, so their answers can be linked to them: say so in your
consent text.

## What coders' browsers receive

To run the study, a coder's browser gets:

- **The whole codebook**, including all questions, conditions and option
  values, also of other coder groups. Anyone who knows where to look
  could read it. Don't put anything in the codebook that participants must
  not see, such as the hypothesis in a condition's label.
- **The unit fields the codebook uses**, also fields used only in a condition
  or shown only later in the unit. Fields the codebook doesn't use are never
  sent.
- **Only the units they are given**, a few at a time (the next ones are
  loaded ahead). A coder can go back to units they coded, but can't browse
  the job's units.

Conditions, including which group of a loop a coder belongs to, are worked
out in the coder's browser. The server checks that the units a coder asks
for are ones the codebook could give *someone*. A technically skilled coder
could therefore get the units of another group of the same loop. Routing on
answers is meant to organise honest coders, not to keep material secret.
Random and balanced group assignment, and values set by invitation, are
decided on the server: coders can't change their own group.

> If some coders must never see some material, put it in a separate job
> with its own invitations.

## What researchers see

Everyone with access to the job sees its units, codebook, coders and answers.
The **Coders** tab lists each session with its participant id (or a
number), invitation, start time and progress. The download contains the same
information as the tables above. See [Downloading results](results.md).

**Preview** sessions are not stored: your test answers disappear when the
preview ends.

## Removing data

- **Delete Job** (in the job's settings on the **Overview** tab) deletes the
  job with everything in it: units, codebooks, invitations, coders and
  answers.
- **Deleting a coder's data** (on the **Coders** tab) deletes one coder,
  found by participant id or email, with all their answers. Coders can ask
  for it themselves, from the coding screen; you decide on such requests
  (see [Deleting a coder's data](coders-and-progress.md#deleting-a-coders-data)).

Download the results before deleting a job, and delete jobs you no longer
need: data that isn't stored can't leak.
