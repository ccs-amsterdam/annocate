---
title: Server admin
section: Getting started
order: 7
summary: For the people who run an AnnoTinder server - roles, registration, plans and limits, blocking users and suspending studies.
---

Admins manage who can do what on the server. They open **Server admin** on
the studies page. The first admins are named in the server's configuration
(`ANNOTINDER_ADMINS`); they can make others admin.

Admins don't see study data: the server admin pages show what studies hold
(units, coders, answers), not their designs, units or answers. To work
in a study, an admin needs a role in it like anyone else. Every change an
admin makes is kept in the **Log**.

## Users

The list shows every account, most recently logged in first. Per user:

- **Role**: user, researcher or admin (see [Accounts and limits](accounts.md)).
- **Plan**: their own plan; else their email domain's, else the default.
- **Limits**: overrides for this user only, on top of their plan: a number,
  or *none* for no limit.
- **Block**: logs them out, and stops their logins and API keys until
  unblocked. Their studies stay.

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
- **Requests**: users ask on the studies page; you approve or deny them under
  **Requests**.
- **Invite links**: under **Invites**, a link for one person, valid for a
  number of days, optionally with a plan. Whoever logs in with it becomes a
  researcher.

A login only ever raises a role. If you lower someone's role, it stays
lowered (unless the rules make them a researcher again, e.g. their domain).

## Plans and limits

A plan is a set of limits: studies a researcher owns, units per study, units in
all their studies, coders per study, answers per study. An empty limit is no
limit. One plan is the **default** (under **Registration**). The largest
unit and answer hold for everyone.

## Studies

**Suspend** a study that is misused: coders are refused, and its researchers
can't change it, but they can still read and download its data, delete
coders' data and delete the study. **Resume** undoes it. The **owner** is
whose limits a study counts against; click it to move the study to another
researcher.

## Second factor

Managing studies and the server always needs a login with the login
provider's second factor (which claim says so: `OIDC_MFA_CLAIM`). Coding
never requires it. A researcher who lost their second factor turns to the
login provider's helpdesk: AnnoTinder has none of its own.

Sensitive actions (API keys, deleting answers, coders' data or a study, and
giving or taking admin roles) ask for a recent second factor: you log in
again, then repeat the action. API keys can never do them.

## Warnings

The top of this page lists what makes the server less secure: logins from
the lab's **shared login provider** (then this server must not hold
sensitive data), or researchers logging in **without the second factor
signal** (check the provider's two-factor settings and `OIDC_MFA_CLAIM`).
