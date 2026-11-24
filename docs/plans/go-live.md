# Going live

The owner's checklists for the two servers, the questions that are still
open, and the code changes they lead to.

- **Part A: this week.** The lab's server, as an invite-only pilot.
- **Part B: this month.** The public server at annotinder.com.
- **Part C: open questions**, each with what it is about and where to
  read more.
- **Part D: proposed code items** (P-01 to P-14), for the release plan.

The how-to for almost every line is in [`../hosting.md`](../hosting.md);
the legal drafts are in [`../legal/`](../legal/README.md). A box you can't
tick is not a reason to stop: write down why, and who decides.

## A. This week: the lab pilot (invite-only)

The pilot is for the lab and people it invites by name. It runs on a
university VM, with Caddy, without Cloudflare.

**Before you start**

- [ ] **A hostname and DNS.** A name under the university's or the lab's
  domain, and someone who can add the record
  ([hosting, step 1](../hosting.md#1-dns)).
- [ ] **A VM.** Ubuntu 24.04, 2 cores, 4 GB, 40 GB disk is enough for a
  pilot ([sizing](../hosting.md#a-server-on-one-vm-step-by-step)). Ask IT
  at the same time: are there daily snapshots, and does the VM restart
  elsewhere when its host fails ([Staying up](../hosting.md#staying-up))?
- [ ] **A quick word with the privacy officer**: "we start a pilot of a
  research tool on a university VM, invite-only, with these people". Ask
  whether it must be registered, and send them
  [`../legal/README.md`](../legal/README.md). You don't need their final
  review to start a pilot inside the university, but they should know.

**Setting up** (hosting, steps 1 to 9)

- [ ] VM set up: firewall, Docker, Caddy, the `sal` account (step 2).
- [ ] The login client in the lab's Keycloak (step 4).
- [ ] `.env` filled in, with two generated secrets (step 5). The secrets
  are also in the password manager.
- [ ] **First admins**: two people, not one, in `ANNOTINDER_ADMINS`. Each
  has a verified address and a second factor at the login provider
  (steps 5 and 9).
- [ ] Built and started; the smoke test passes, also with an API key
  (steps 6 to 9).
- [ ] One whole study done by hand: create, deploy, code in a private
  window, download, archive (step 9).
- [ ] The checks of `release-checklist.md` §1 that the tests don't cover:
  login with the real provider, email coders, moving a study.

**Registration: invite-only**

- [ ] In *Server admin › Registration*: open registration **off**,
  researcher domains **empty**. Decide whether people may send a request
  to become a researcher (handy) or not.
- [ ] Invite each pilot researcher by email address in *Server admin ›
  Users*. **AnnoTinder sends no email**: tell them yourself that they are
  invited and where to log in. An invitation expires after 3 months.
- [ ] Check the default plan's limits (studies, units, coders, answers)
  in *Server admin*.

**Before real data comes in**

- [ ] **Backups.** The daily dump is written (`dump written` in the
  log). The VM is in the nightly backup, or restic copies the dumps
  off-site ([Backups](../hosting.md#backups)). Check with IT whether
  backups of this data may leave the university.
- [ ] **One restore test, on another machine**, with the date and who
  did it written down here: `[DATE, NAME, HOW LONG IT TOOK]`
  ([The restore test](../hosting.md#the-restore-test)).
- [ ] **Monitoring.** An uptime check on `/api/health` from outside, the
  disk warning, and the backup check ([Monitoring](../hosting.md#monitoring)).
- [ ] **A reboot test**: reboot the VM, run the smoke test.
- [ ] **A short privacy note for the pilot**, sent to the pilot
  researchers or put where they can find it: who runs the server, that it
  is a pilot, what is stored, who to contact. Take it from
  [`../legal/privacy-statement.md`](../legal/privacy-statement.md) §2, §4,
  §5 and §8.
- [ ] **Tell pilot researchers what a pilot means**: keep your own
  downloads; the server may be reset before the first release
  (migrations are only stable from the release tag on:
  [hosting, step 11](../hosting.md#11-updating)); no sensitive data yet,
  unless the privacy officer agreed.
- [ ] **Who to call.** Two people can log in to the VM. Both know where
  the secrets and the restic password are. A contact address for users,
  and one for security reports.
- [ ] Read `../security.md` once more before inviting anyone outside the
  team.

## B. This month: the public server

Everything of part A, on a second server, plus the following. The order
matters: the first block takes the longest and blocks the rest.

**1. Decisions and approvals (start now)**

- [ ] **Who operates it, legally** (C1).
- [ ] **Cloudflare accepted or not** by the privacy officer (C2).
- [ ] **Where it is hosted**: university VM, EU hosting provider, or
  both (C3).
- [ ] **The legal texts reviewed and approved**: privacy statement, terms
  of use ([`../legal/`](../legal/README.md)). Every `[PLACEHOLDER]` filled
  in.
- [ ] **A data processing agreement on offer**, from the university's
  template or model
  ([outline](../legal/data-processing-agreement-outline.md)), and the
  operator's own agreements with each supplier.
- [ ] **The licence checked** with the university: copyright holder line,
  open-source policy ([licence](../legal/README.md#the-licence-mit-and-what-to-check)).
- [ ] **Registration policy** for the public (C5), and the default limits.
- [ ] **Retention**: how long unused accounts and studies stay, how far
  backups go back (C7). Put the numbers in the privacy statement.

**2. The server**

- [ ] A VM of 4 cores, 8 GB, 80 GB, with the provider's snapshots on
  ([the recommendation](../hosting.md#the-recommendation-in-short)).
- [ ] Set up as in part A. One app process, Postgres on the same VM.
- [ ] **A login provider for the public** (C4), with its own registration
  protected against bots, and working email (the provider sends the
  verification and password mails).
- [ ] Hourly dumps, off-site copies at **another** provider, and a
  restore test on another machine
  ([Backups](../hosting.md#backups)): `[DATE, NAME]`.
- [ ] Monitoring as in part A, plus the daily smoke test with an API key.

**3. The domain and Cloudflare**

- [ ] List the domain's current DNS records, mail records above all.
- [ ] Is DNSSEC on at the registrar? If so, turn it off a day before the
  switch ([Bringing the domain to Cloudflare](../hosting.md#1-bringing-the-domain-to-cloudflare)).
- [ ] Add the domain to Cloudflare (Free), copy the records, switch the
  nameservers at the registrar, turn DNSSEC on again.
- [ ] The `.nl` domain and `www` redirect to the one public address.
- [ ] TLS mode **Full (strict)**, with an origin certificate in Caddy;
  Always Use HTTPS.
- [ ] The VM's firewall accepts ports 80 and 443 from Cloudflare only.
- [ ] **The visitor's real address reaches the app**: the Caddy
  configuration of
  [hosting](../hosting.md#4-the-visitors-real-address), and its test. Do
  not open the server before this test passes (or P-02 is built).
- [ ] A cache rule that bypasses the cache for `/api/`.
- [ ] Rocket Loader, Email Obfuscation, automatic Web Analytics, Bot
  Fight Mode: off ([settings](../hosting.md#6-settings-to-turn-off)).
- [ ] One rate limiting rule on `/api/auth/`.
- [ ] Tested through Cloudflare: the smoke test with an API key; coding
  in a private window; an upload near 100 MB; the results download and a
  study export of a large study (the 100-second limit:
  [Limits of the proxy](../hosting.md#7-limits-of-the-proxy)); an R or
  Python client call.

**4. What the public sees**

- [ ] The privacy statement and the terms are published and linked from
  the welcome page (until P-01 exists: on a page you host elsewhere, with
  the link sent to every new researcher).
- [ ] Who runs the server, where it is hosted, and the contact addresses
  are stated there. Nothing says "hosted in the EU" unless every part
  (VM, database, backups, proxy) is.
- [ ] Mailboxes that are read: contact, privacy, security.
- [ ] A one-page incident note: who decides, who tells the researchers,
  the university's procedure for data breaches (C8).
- [ ] `robots.txt` is served (`https://<host>/robots.txt`).

**5. Code items that should be in before opening to the public**

P-01 (server info page), P-02 (real address behind Cloudflare), P-03
(deleting accounts), P-04 (typing the name to delete a study), P-06
(health check with the database) and P-12 (accepting the terms). The
others can follow. See part D.

## C. Open questions

**C1. Who operates the public server?**
The university, a department, a foundation, or the owner personally? It
decides who signs agreements, who is liable, and whose name is in every
legal text. A private person is a bad answer for a service that holds
other institutions' research data. Ask the legal office first.
→ [`../legal/README.md`](../legal/README.md#what-the-owner-must-decide-or-get-checked), decision 1.

**C2. Is Cloudflare acceptable for research data?**
Cloudflare protects the server against attacks, for free, and that is
hard to get otherwise. But it can read all traffic and is a US company.
The law allows it with the right agreements; the university's policy may
not. If not: an EU proxy company, or no proxy and the hosting provider's
own protection. The lab's server is not affected (no Cloudflare).
→ [hosting, "Cloudflare in front"](../hosting.md#cloudflare-in-front);
[`../legal/README.md`](../legal/README.md), decision 3.

**C3. Where does the public server run?**
A university VM (free, on premises, but meant for the university's own
work: may it serve the whole world?) or an EU hosting provider (about
€15 to €30 a month, a data processing agreement with the provider, and
someone has to pay the bill for years). A mix makes sense as "runs at
one, spare and backups at the other", not as two halves of one system.
→ [hosting, "One VM, several processes or several VMs?"](../hosting.md#one-vm-several-processes-or-several-vms),
[costs](../hosting.md#what-the-public-server-costs).

**C4. Which login provider for the public server?**
Researchers log in at an outside provider, and the server depends on it:
when it is down, no researcher can log in. The lab's Keycloak (`idp`
realm, where anyone can make an account) is the obvious choice. Then the
lab also runs a public account system: registration that bots will find,
password resets by email, a helpdesk for lost second factors. The
alternative for Dutch universities is SURFconext (no accounts to manage,
but it leaves out researchers elsewhere). Both can't be on at once,
except during a move.
→ [hosting, "Login provider"](../hosting.md#login-provider); `../security.md` §1.

**C5. Who may create studies on the public server?**
The app offers: only invited people; everyone with an address at listed
domains (universities); everyone after an admin approves their request;
or everyone. Open to everyone means strangers can host content and
public links on your domain. A sensible start: listed university domains
get in directly, everyone else sends a request that an admin approves.
That needs an admin who looks at requests every few days.
→ `../accounts.md` §2 and §3.

**C6. Does the app send email?**
No. There is no mail code at all. Consequences: invitations and approved
requests are not announced (tell people yourself); the login provider
sends its own mails and needs a working mail server; and announcements
(downtime, changed terms, an incident) are sent by hand to the addresses
of the accounts. Fine for the start. If automatic mail is wanted later,
it is a feature to plan, with a mail provider as one more supplier.

**C7. How long is data kept?**
The app deletes nothing by itself: a study stays until its researcher
deletes it, an account until someone removes it. For a public server
that grows forever, and the law expects a limit. Decide: after how long
without use is a study or account removed (after a warning), and how far
back do backups go (which is how long deleted data survives)? Until P-11
exists, anything promised here is done by hand.
→ [`../legal/privacy-statement.md`](../legal/privacy-statement.md) §7.

**C8. What happens when something goes wrong?**
A data breach must be reported fast: to the researchers whose studies
are affected, and by the controller to the authority within 72 hours.
The university has a procedure and a team for this. Find out who that
is, write it on one page with the two people who can reach the server,
and publish a security contact address.
→ [`../legal/data-processing-agreement-outline.md`](../legal/data-processing-agreement-outline.md).

**C9. Deleting accounts and studies.**
A researcher can delete a study (after a fresh login with a second
factor), and coders' data. A researcher can't delete their own account,
and an admin can only block one, not remove it. Until P-03 exists, a
request to delete an account means work in the database by whoever runs
the server. Decide what happens to the studies of someone who leaves:
they must be deleted or given to another owner first.
→ `../accounts.md` §4; `../coder-identity.md` §8.

**C10. How much downtime and data loss is acceptable?**
With one VM and daily dumps: a few hours offline now and then, and in
the rare worst case a day of answers lost. Hourly dumps make that an
hour. A second machine makes it seconds and half an hour, at twice the
cost and more to look after. Pick a level on purpose and tell
researchers what it is.
→ [hosting, "Staying up"](../hosting.md#staying-up),
["Dumps or continuous archiving?"](../hosting.md#dumps-or-continuous-archiving).

**C11. Which licence?**
MIT is in the repository and is the developers' recommendation. The
university may own the copyright and have a say.
→ [`../legal/README.md`](../legal/README.md#the-licence-mit-and-what-to-check).

**C12. Sensitive data on the public server?**
The simplest rule is "no: use your own institution's server for that".
It keeps the public server's risk and paperwork small.
→ [`../legal/terms-of-use.md`](../legal/terms-of-use.md) §5.

**C13. No cookie banner: confirmed?**
The app sets only cookies it needs to work, and uses no tracking, so the
developers' reading is that no banner is needed, only the cookie section
in the privacy statement. Ask the privacy officer to confirm. It changes
if analytics or outside widgets are ever added, or if Cloudflare features
that set extra cookies are switched on.
→ [`../legal/privacy-statement.md`](../legal/privacy-statement.md) §5 and
reviewer note 2.

## D. Proposed code items

For the release plan. "Before public" means: should be built before the
public server opens. None is needed for the lab pilot.

| Id | What | Why | When |
| --- | --- | --- | --- |
| **P-01** | **Server info page.** A public page (`/about`, linked from the welcome page, the footer of coder pages, and the account menu) that shows who runs this server, where it is hosted, the contact, privacy and security addresses, and the privacy statement and terms (as links or as text). Filled in by the server's admin in *Server admin* (stored in `server_settings`), served by a public `GET /api/server-info`. A hardening warning in *Server admin* while it is empty. The same data can fill `/.well-known/security.txt`. No default text about hosting location | Every server is run by someone else, so the software can't state it. Researchers need it for their data management plan, coders to know who holds their data. The help topic "Privacy and where data lives" already points to it | Before public |
| **P-02** | **The real client address behind Cloudflare.** A setting (for example `ANNOTINDER_TRUST_PROXY=cloudflare`, or a header name) that makes the rate limiter read `CF-Connecting-IP`, and a startup log line that says where addresses come from. Today it reads the last `X-Forwarded-For` entry, which behind Cloudflare is a Cloudflare server (`server/src/shared/rateLimit.ts`) | Without it, rate limits lump all visitors of one Cloudflare location together. There is a workaround in the Caddy configuration ([hosting](../hosting.md#4-the-visitors-real-address)), untested | Before public (or the workaround, tested) |
| **P-03** | **Deleting a researcher account.** By the user (account menu, with a fresh second factor) and by an admin. Refused while the user owns studies: delete or hand them over first. Removes identities, sessions, API keys, roles and the security log; decide what stays in the admin log. Today admins can only block a user, and `DELETE /admin/users/:id` only removes unclaimed invitations | The right to erasure; the privacy statement promises it | Before public |
| **P-04** | **Deleting a study: type its name.** The server already asks for a fresh second factor (`DELETE /study/:id`). The client's dialog is a plain "Are you sure?"; add typing the study's name, and say how many coders and answers go | Deleting is permanent and takes coders' data with it | Before public |
| **P-05** | **Turnstile on starting a coder session**, as a study or link option ("check that coders are human"): the widget in the client, `challenges.cloudflare.com` in the Content Security Policy only when configured, a check on the server (`siteverify`) with keys from settings, and a line in the privacy statement. Not on login or registration: those are at the login provider | Open links can be filled by scripts | Later |
| **P-06** | **A health check that includes the database**: `GET /api/health?db=1` (or `/api/ready`) runs `select 1` and answers 503 when it fails. Keep the plain one for the container's own check | The uptime check and a load balancer stay green today when Postgres is down | Before public |
| **P-07** | **Pages and search engines.** The server sends `X-Robots-Tag: noindex` for every page except `/` (coder links hold a secret; `robots.txt` only asks crawlers not to visit). A social preview image (`og:image`, 1200×630) and `og:url`, which need the server's public address, so the server fills them into `index.html` | `index.html` is one file for all pages, so it can't carry `noindex` without hiding the welcome page | Later |
| **P-08** | **Previews in the database** (marked as preview data, deleted when they expire), instead of in one process's memory | The only thing that stops several app servers from working without session affinity; previews also end at every restart | With a second app server |
| **P-09** | **`compose.yml` for an external database**: `DATABASE_URL` from `.env` when set, the `db` and `db-backup` services optional (a compose profile), TLS to the database documented and tested. Optionally a `BACKUP_INTERVAL` for hourly dumps in `db-backup.sh` | A managed Postgres, and dumps more often than daily, now need hand edits | With a managed database |
| **P-10** | **Upload size behind a proxy.** A setting for the largest upload that the client shows and checks before sending, or uploads split into parts by the client | Cloudflare's Free and Pro plans refuse bodies over 100 MB; the server accepts 256 MB. Today a large upload fails with Cloudflare's error page | Before public (the setting), later (splitting) |
| **P-11** | **Retention tooling.** In *Server admin*: when each account and study was last used, a filter for "not used for N months", and deleting from there. Removing expired rows (login sessions, transfer links) on a schedule if that doesn't happen yet. Later: warnings by email | The app deletes nothing by itself; the privacy statement must state a period | Soon after public |
| **P-12** | **Accepting the terms.** At the first login as a researcher, and again when the terms' version changes: show the terms and the data processing terms, and record who accepted which version and when | A standard data processing agreement as part of the terms only works if acceptance is recorded | Before public |
| **P-13** | **Slow actions behind a proxy.** Measure the results download, study export and import, and deploy on a large study through Cloudflare. Whatever doesn't start answering within 100 seconds must stream its answer or run in the background | Cloudflare cuts off answers that take longer to start (error 524) | Before public (measuring) |
| **P-14** | **Licence metadata.** `"license": "MIT"` in every `package.json`, a line on contributions in the README, and a check of the dependencies' licences in the release checklist | `LICENSE` was added; the packages don't say it yet | With the release |

**Web basics done in this change** (no code item needed):
`packages/client/public/robots.txt` (the welcome page may be visited;
`/code`, `/research` and `/api/` not), and in `packages/client/index.html`
a description, theme colours and neutral social tags. No web app manifest:
AnnoTinder is not installed as an app, and a manifest would add nothing
for coders who arrive by a link.
