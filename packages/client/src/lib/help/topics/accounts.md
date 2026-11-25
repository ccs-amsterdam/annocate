---
title: Accounts and limits
section: Getting started
order: 6
summary: Users, researchers and admins; how to become a researcher; the limits on what you can store.
---

Your role on the server (below) is separate from your role in a study
(see [Working together](working-together.md)).

| Role           | Can                                                                          |
| -------------- | ---------------------------------------------------------------------------- |
| **User**       | code, and work on studies where a researcher gave them a role                |
| **Researcher** | also create studies; they count against your limits                          |
| **Admin**      | also manage users, limits and registration ([Server admin](server-admin.md)) |

Coders need no account, unless the invitation asks them to
[sign in](links.md#login).

## Becoming a researcher

Depending on the server, you are a researcher as soon as you log in (a
public server, or your university's email domain), or when:

- an admin **invites** your email address (log in within 3 months); or
- you **ask** on the studies page and an admin approves.

## Limits

Your plan can limit the studies you own, units per study and in total,
coders per study and answers per study. The studies page shows your use.
When a limit is reached, adding more is refused (coders who started go
on); nothing is removed. Ask the server's admins for more. Every server
also limits the size of one unit and one answer.

## Two-factor authentication

Set up a second factor (authenticator app, passkey) at your login
provider. Without one, an orange shield by your account menu links to the
setup page; log in twice afterwards.

Some actions ask you to log in again (step-up): API keys, deleting
answers, coders' data, a study or your account, exporting a study, and
giving or taking admin roles. API keys can't do these.

## Deleting your account

Click your account (top right) → **Delete account**. It can't be undone.
The dialog first tells you what happens to your studies:

- **Studies in which only you have a role** are deleted with your account,
  with all their units, answers and results. The dialog lists them.
  [Download the results](results.md) or
  [export the study](results.md#backing-up-or-moving-a-study) first if you
  want to keep them.
- **Your roles in other people's studies** go; those studies stay.

Your logins, API keys and security log go too. To confirm, you type your
email address.

Your account **can't be deleted yet** while:

- you **own a study in which others have a role**: delete the study,
  remove the other users (see [Working together](working-together.md)), or
  ask a server admin to give it another owner;
- you are the **only ADMIN of someone else's study**: give another user
  the ADMIN role first;
- you are the **server's only admin**: make another user admin first.

The dialog says which studies are in the way. So a study others work in
never disappears with someone's account.

## Your account is your login

Your account follows your login, not your email address. When a server
moves to another login provider, log in once with the old one and
**link** the new login when asked.
