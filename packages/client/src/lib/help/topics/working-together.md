---
title: Working together
section: Getting started
order: 5
summary: Give colleagues and student assistants access to a study, with a role that fits what they do.
---

A study can have several researchers: a principal investigator, colleagues,
student assistants who prepare units, a methodologist who only downloads
the results. Each has a **role** in the study.

## Who has access

On the study's **Settings** tab, **Who has access** lists the people of the study and
their roles. Only admins of the study see this list and can change it.

- **Add** someone with their email address and a role. If they have logged
  in before, the role is theirs at once; otherwise they are _invited_, and
  see the study once they log in with that address (verified by their login
  provider) within 3 months. An unused invitation _expires_.
- The role belongs to the person, not the address: if their address changes
  at their login provider, they keep their access.
- A role can be _turned off_ to protect the study, when an invitation
  expired or someone comes back after more than a year without a second
  factor. **Restore** turns it on again: only if you're sure the address is
  still theirs.
- Change a role with the select next to their name.
- Remove someone with the bin icon.
- Making someone an admin of the study, or taking it away, asks you to
  confirm it's you (step-up, see [Accounts and limits](accounts.md)).

A study always keeps at least one admin, so it can't lose its last one by
accident.

## Roles

| Role      | Can                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Read**  | See the study, its coders' progress, and download the results                                                                                      |
| **Write** | Also edit and save the design draft (and preview it), upload units, make sets and manage links                                                     |
| **Admin** | Also deploy the design, units and sets, pause the study, reset answers, delete coders' data, rename, export or delete the study, and manage who has access |

Give people the smallest role that lets them do their work. Coders are not
on this list: they never log in to the study's management, they come in through
a [link](links.md).

## Editing together

Everyone with **Write** works on the same design draft. AnnoTinder doesn't
show who else is editing right now: if two people save at once, the second
is asked whether to keep their own changes or load the other's (see
[Working with co-editors](design-editor.md#working-with-co-editors)).
Agree who edits when, and leave deploying to one person.

## Scripts

Scripts (R, Python) use an API key that acts as you, with your roles in your
studies. See [Scripts and the researcher API](researcher-api.md).
