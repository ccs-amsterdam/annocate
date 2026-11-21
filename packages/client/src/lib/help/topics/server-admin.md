---
title: Server admin
section: Getting started
order: 7
summary: For the people who run an AnnoTinder server - roles, registration, plans and limits, blocking users and suspending studies.
---

Admins open **Server admin** on the studies page. The first admins are set
in the server's configuration (`ANNOTINDER_ADMINS`); they can make others
admin. Admins see what studies hold (counts), not their designs, units or
answers; to work in a study they need a role in it. Every admin change is
kept in the **Log**.

## Users

Per account, most recent login first:

- **Role**: user, researcher or admin (see [Accounts and limits](accounts.md)).
- **Plan**: their own, else their email domain's, else the default.
- **Limits**: overrides for this user (a number, or _none_).
- **Block**: logs them out and stops their logins and API keys; their
  studies stay.
- Marks: _invited_, _invitation expired_, _no 2FA_, _email not verified_,
  _not linked_ (moving login provider), _roles off_.

**Invite** an email address to give a role at the first login (within 3
months); **Withdraw** an unused invitation.

**Roles off**: roles are turned off for an invitation used after 3 months,
and for someone back after more than a year without a second factor. Click
the mark to restore them if it's still the same person.

## Who becomes a researcher

Under **Registration**:

- **Anyone who logs in** (a public server);
- **Email domains**: verified addresses at a domain (`uni.nl`; `*.uni.nl`
  includes subdomains), optionally with a plan;
- **Requests**: approve or deny under **Requests**;
- **Invitations**: under **Users**, optionally with a plan.

Lowering a role removes what you gave; the registration rules may still
make them a researcher.

## Plans and limits

A plan sets: studies owned, units per study, units in total, coders per
study, answers per study (empty: no limit). One plan is the **default**.
The largest unit and answer hold for everyone.

## Studies

**Suspend** a misused study: coders are refused and researchers can't
change it, but can still read, download and delete. **Resume** undoes it.
Click the **owner** to move a study to another researcher's limits.

## Second factor

Admin access needs a login with the provider's second factor
(`OIDC_MFA_CLAIM`), unless `AUTH_INSECURE_DISABLE_2FA` is set; without it
an admin works as a researcher. Researchers see an orange shield linking
to `OIDC_ACCOUNT_URL`. Coding never needs it. Lost second factors go to
the login provider's helpdesk.

Sensitive actions (API keys, deleting answers, coders' data or a study,
admin roles) need a recent login with the second factor; API keys can
never do them.

## Warnings

The top of the page lists what weakens security:

- **2FA not required** or **email verification not required**
  (`AUTH_INSECURE_DISABLE_2FA`, `AUTH_INSECURE_DISABLE_EMAIL_VERIFICATION`);
- **Roles for unverified email addresses**: check those people;
- admins logging in **without the second factor signal**: check the
  provider and `OIDC_MFA_CLAIM`;
- a **move to another login provider** (`OIDC_PREVIOUS_*`): users not yet
  linked, and when to remove the old settings.
