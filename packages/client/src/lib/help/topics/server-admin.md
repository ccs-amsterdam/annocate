---
title: Server admin
section: Getting started
order: 7
summary: For the people who run an AnnoTinder server - roles, registration, plans and limits, blocking users and suspending jobs.
---

Admins manage who can do what on the server. They open **Server admin** on
the jobs page. The first admins are named in the server's configuration
(`ANNOTINDER_ADMINS`); they can make others admin.

Admins don't see job data: the server admin pages show what jobs hold
(units, coders, answers), not their codebooks, units or answers. To work
in a job, an admin needs a role in it like anyone else. Every change an
admin makes is kept in the **Log**.

## Users

The list shows every account, most recently logged in first. Per user:

- **Role**: user, researcher or admin (see [Accounts and limits](accounts.md)).
- **Plan**: their own plan; else their email domain's, else the default.
- **Limits**: overrides for this user only, on top of their plan: a number,
  or *none* for no limit.
- **Block**: logs them out, and stops their logins and API keys until
  unblocked. Their jobs stay.

**Add a user** to make someone a researcher (or admin) before they first
log in.

## Who becomes a researcher

Under **Registration**:

- **Anyone who logs in**: for a public server.
- **Email domains**: users with an address at one of these domains become
  researchers when they log in. `uni.nl` is that domain only; `*.uni.nl`
  also its subdomains (`fsw.uni.nl`). A domain can also give a plan, for
  instance a university's larger one. The login provider must verify email
  addresses, as AnnoTinder requires anyway.
- **Requests**: users ask on the jobs page; you approve or deny them under
  **Requests**.
- **Invite links**: under **Invites**, a link for one person, valid for a
  number of days, optionally with a plan. Whoever logs in with it becomes a
  researcher.

A login only ever raises a role. If you lower someone's role, it stays
lowered (unless the rules make them a researcher again, e.g. their domain).

## Plans and limits

A plan is a set of limits: jobs a researcher owns, units per job, units in
all their jobs, coders per job, answers per job. An empty limit is no
limit. One plan is the **default** (under **Registration**). The largest
unit and answer hold for everyone.

## Jobs

**Suspend** a job that is misused: coders are refused, and its researchers
can't change it, but they can still read and download its data, delete
coders' data and delete the job. **Resume** undoes it. The **owner** is
whose limits a job counts against; click it to move the job to another
researcher.

## Second factor

Set `ANNOTINDER_2FA=annotinder` to require a **passkey** for managing jobs
and the server (recommended, certainly for servers with sensitive data):
researchers add one at their first login and confirm every login with it.
Coding never requires it. A researcher who lost their passkey uses a
recovery code; without codes, **Reset passkeys** on the **Users** tab
removes them, after you checked who they are another way than by email.
`ANNOTINDER_2FA=oidc` relies on the login provider's second factor instead.
