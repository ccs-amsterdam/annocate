---
title: Privacy and where data lives
section: Design notes
order: 7
summary: What AnnoTinder stores about coders, where it runs, how sessions work without accounts, and what coders' browsers receive.
---

For your data management plan, ethics application and coder information:
AnnoTinder stores what the study needs and little more, coders need no
account, and nothing is shared outside the study.

## What is stored

On the AnnoTinder server you use:

| What                | Includes                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **Units**           | your upload, and each unit as coders saw it                                                    |
| **Design versions** | every saved and deployed version                                                               |
| **Links**           | label, the values it carries (a coder or set), uses                                            |
| **Coders**          | per session: link, coder id, answers outside loops, URL parameters the design reads, units given, start, how it ended |
| **Devices and display** | kind of device, browser, operating system; keys for answers, screen width, theme          |
| **Answers**         | per unit and question, with times, design version and unit version                             |
| **Response times**  | per question, measured in the browser; per unit, when the server handed it out. Always recorded: mention it to coders if it matters |

Not stored: coders' names, email addresses (unless they
[sign in](links.md#login) where required), IP addresses, other device
details, or URL parameters the design doesn't declare. The web server in
front may keep access logs; ask whoever runs it.

A browser has one random device id (a cookie), but per study only a code
derived from it is stored, so the data can't link one device across
studies. Units and answers are not encrypted in the browser.

## Hosted or self-hosted

annotinder.com is hosted in the EU; you can also run the same software on
your institution's server, to keep sensitive data in-house.

## Coder ids are labels

A coder id (a name, a panel id) is stored with the session and shown on
**Coders** and in the download. It is a label, not a password: it never
unlocks earlier answers. Panel ids are pseudonymous personal data: remove
them from published data.

## Sessions live in the coder's browser

The cookie lets the same browser continue its session for up to about a
year; even a copy of the database can't take over sessions.

- **Other devices**: via **Continue on another device** (a one-time link,
  15 minutes).
- **Cleared cookies or private windows** lose the session (answers so far
  stay on the server).
- **Shared computers**: give each coder a coder id, or use private
  windows.

Where the invitation requires sign-in, the email address is stored and
visible to you: say so in your consent text.

## What coders' browsers receive

- **The whole codebook**, including questions and values for other
  groups: put nothing secret in it.
- **The unit fields the design uses**, also those only used in
  conditions. Other fields are never sent.
- **Only their own units**, a few at a time.

Conditions run in the browser, so a skilled coder could read
another group's texts. Which units a coder gets is decided on the server.

> If some coders must never see some material, use a separate study.

## What researchers see

Everyone with access to the study sees its units, design, coders and
answers. Previews are not stored.

## Removing data

- **Delete Study** (**Settings**) deletes everything.
- **Deleting a coder's data** (**Coders**) deletes one coder, by coder id
  or email; coders can ask for it (see
  [Deleting a coder's data](coders-and-progress.md#deleting-a-coders-data)).

Download first, and delete studies you no longer need.
