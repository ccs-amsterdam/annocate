# Going live

The owner's checklists for the two servers, the questions that are still
open, and the code changes they lead to.

- **Part A: this week.** The lab's server, as an invite-only pilot.
- **Part B: this month.** The public server at annotinder.com.
- **Part C: open questions**, each with what it is about and where to
  read more.
- **Part D: code items**: how they map onto the release plan, and the ones
  that are new here.

The how-to for almost every line is in [`../hosting.md`](../hosting.md);
the legal drafts are in [`../legal/`](../legal/README.md). A box you can't
tick is not a reason to stop: write down why, and who decides.

The facts in this file were checked against the code at commit `9b26c2a`
(November 2026). Where the release plan changes one of them, the item is
named.

**Built since** (checked at `4f7b3f3`), and marked so below: P-A1 (typing a
study's name to delete it), P-A2 (deleting an account), B7-04 (the server
refuses to start without its secret and public address), B7-05 (the request
log), P-02 (the real address behind Cloudflare), P-06 (`/api/ready`), the
removal half of P-15 (results files go with the data) and P-17 (the session
cookie is renewed). B1-23 too: the deletion log and the study export leave
coders' email addresses out. And at `4b408b6`: B2-04 (a login joins a coder
session only when asked), B1-22 (at most 5 sessions per coder id per study;
new sessions counted per address where they are made) and P-16 (a missing
asset file answers 404).

## A. This week: the lab pilot (invite-only)

The pilot is for the lab and people it invites by name. It runs on a
university VM, with Caddy, without Cloudflare.

**Before you start**

- [ ] **A hostname and DNS.** A name under the university's or the lab's
  domain, and someone who can add the record
  ([hosting, step 1](../hosting.md#1-dns)).
- [ ] **A VM.** Ubuntu 24.04, 2 cores, 4 GB, 40 GB disk is enough for a
  pilot ([the recommendation](../hosting.md#the-recommendation-in-short)).
  Ask IT at the same time: are there daily snapshots, where are they kept,
  and does the VM restart elsewhere when its hardware fails
  ([Staying up](../hosting.md#staying-up))?
- [ ] **A quick word with the privacy officer**: "we start a pilot of a
  research tool on a university VM, invite-only, with these people". Ask
  whether it must be registered, and send them
  [`../legal/README.md`](../legal/README.md). You don't need their final
  review to start a pilot inside the university, but they should know.

**Setting up** (hosting, steps 1 to 9)

- [ ] VM set up: firewall, Docker, Caddy, the `sal` account (step 2).
- [ ] The login client in the lab's Keycloak (step 4).
- [ ] `.env` filled in, with two generated secrets (step 5). The three
  secrets (those two and the login client's) are also in the password
  manager. The startup log shows the right public address. (The server no
  longer starts without `ANNOTINDER_SECRET` and `ANNOTINDER_PUBLIC_URL`.)
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

- [ ] In *Server admin › Registration*: "anyone who logs in" **off**, no
  email domains. Decide whether people may send a request to become a
  researcher (handy) or not.
- [ ] Invite each pilot researcher by email address in *Server admin ›
  Users*. **AnnoTinder sends no email**: tell them yourself that they are
  invited and where to log in. An invitation is good for 3 months.
- [ ] Check the default plan in *Server admin › Plans*. It starts at 20
  studies, 50,000 units per study, 200,000 units in total, 5,000 coders and
  2,000,000 answers per study. The release plan (D21) suggests a smaller
  default for accounts you did not invite (5 studies, 20,000 units, 200,000
  answers) and a larger plan for the people you did.

**Before real data comes in**

- [ ] **Backups.** The daily dump is written (`dump written` in the
  log). The VM is in the nightly backup, or restic copies the dumps to
  another place ([Backups](../hosting.md#backups)). Check with IT whether
  backups of this data may leave the university.
- [ ] **One restore test, on another machine**, with the date and who
  did it written down here: `[DATE, NAME, HOW LONG IT TOOK]`
  ([The restore test](../hosting.md#the-restore-test)).
- [ ] **Monitoring.** An uptime check on `/api/health` from outside, a
  second check that reaches the database (the health check does not), the
  disk warning, and the backup check
  ([Monitoring](../hosting.md#monitoring)).
- [ ] **A reboot test**: reboot the VM, run the smoke test.
- [ ] **A short privacy note for the pilot**, sent to the pilot
  researchers or put where they can find it: who runs the server, where it
  is, that it is a pilot, what is stored, who to contact. Take it from
  [`../legal/privacy-statement.md`](../legal/privacy-statement.md) §2, §4,
  §5 and §8. The app has no page for this yet (release plan, P-A3).
- [ ] **Tell pilot researchers what a pilot means**: keep your own
  downloads; the server will be started again with an empty database at
  the first release (a database from before the release tag can't be
  updated, and study export files from before it can't be imported:
  [hosting, step 11](../hosting.md#11-updating)); deleting a study asks
  for a fresh login and typing the study's name, and can't be undone; no
  sensitive data yet, unless the privacy officer agreed.
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
  ([the recommendation](../hosting.md#the-recommendation-in-short)). If the
  pilot's VM is reused: a new public address
  ([why](../hosting.md#3-only-cloudflare-may-reach-the-server)).
- [ ] Set up as in part A. One app process, Postgres on the same VM.
- [ ] **A login provider for the public** (C4), with its own registration
  protected against bots, and working email (the provider sends the
  verification and password mails).
- [ ] Hourly dumps, copies at **another** provider, and a restore test on
  another machine ([Backups](../hosting.md#backups)): `[DATE, NAME]`.
- [ ] Monitoring as in part A, plus the daily smoke test with an API key.

**3. The domain and Cloudflare** (only after C2 is answered with yes)

- [ ] List the domain's current DNS records, mail records above all.
- [ ] Is DNSSEC on at the registrar? If so, turn it off a day or two before
  the switch
  ([Bringing the domain to Cloudflare](../hosting.md#1-bringing-the-domain-to-cloudflare)).
- [ ] Add the domain to Cloudflare (Free), copy the records, switch the
  nameservers at the registrar, turn DNSSEC on again.
- [ ] The `.nl` domain and `www` redirect to the one public address.
- [ ] TLS mode **Full (strict)**, with an origin certificate in Caddy;
  Always Use HTTPS.
- [ ] The VM's firewall accepts port 443 from Cloudflare only.
- [ ] **The visitor's real address reaches the app**:
  `ANNOTINDER_TRUST_PROXY=cloudflare` in `.env` (P-02, built), and the test
  of [hosting](../hosting.md#4-the-visitors-real-address). Do not open the
  server before this test passes.
- [ ] A cache rule that bypasses the cache for `/api/`.
- [ ] Rocket Loader, Web Analytics, Email Obfuscation, Bot Fight Mode: off
  ([settings](../hosting.md#6-settings-to-turn-off)).
- [ ] One rate limiting rule on `/api/auth/`.
- [ ] Tested through Cloudflare: the smoke test with an API key; coding
  in a private window; an upload near 100 MB; the results download and a
  study export of the largest study you have (the limit of about 100
  seconds: [Limits of the proxy](../hosting.md#7-limits-of-the-proxy)); an
  R or Python client call.

**4. What the public sees**

- [ ] The privacy statement and the terms are published, and who runs the
  server, where each part of it is hosted (VM, database, backups, proxy)
  and the contact addresses are stated: on the server's own information
  page (release plan, P-A3). Until that page exists: on a page you host
  elsewhere, with the link sent to every new researcher.
- [ ] Nothing, anywhere, says "hosted in the EU" as a general fact. With
  the Cloudflare proxy on the Free plan it would not be true
  ([Cloudflare in front](../hosting.md#cloudflare-in-front)).
- [ ] Mailboxes that are read: contact, privacy, security.
- [ ] A one-page incident note: who decides, who tells the researchers,
  the university's procedure for data breaches (C8).
- [ ] `robots.txt` is served (`https://<host>/robots.txt`).

**5. Code that should be in before opening to the public**

Still open. From the release plan: P-A3 (server information page). From
part D below: P-12 (accepting the terms). The others can follow.

Built since the list was made (`972692e`, `d6d0eb9`, `4b408b6`): B2-04 (a
login joins a coder session only where the study requires sign-in or the
coder chose it, so email addresses of coders are stored only where the docs
say: `../coder-identity.md` §5) and P-16 (a missing asset file answers 404).

Built: P-A1 (typing the name to delete a study), P-A2 (deleting an
account), B1-23 (no coder email addresses in the deletion log or the study
export), B7-04 (the server refuses to start without its secret and public
address), B7-05 (request logging without link secrets), P-02 (the real
address behind Cloudflare; its test on the real server is in part B), P-06
(`/api/ready`, a health check with the database) and the part of P-15 that
removes results files with the data.

## C. Open questions

**C1. Who operates the public server?**
The university, a department, a foundation, or the owner personally? It
decides who signs agreements, who is liable, and whose name is in every
legal text. A private person is a bad answer for a service that holds
other institutions' research data. Ask the legal office first.
→ [`../legal/README.md`](../legal/README.md#what-the-owner-must-decide-or-get-checked), decision 1.

**C2. Is Cloudflare acceptable for research data?**
Cloudflare protects the server against attacks, for free, and that is
hard to get otherwise. But it can read all traffic, is a US company, and
on the Free plan serves a visitor from its nearest data centre, anywhere.
The law allows it with the right agreements; the university's policy may
not. If not: an EU proxy company, or no proxy and the hosting provider's
own protection. The lab's server is not affected (no Cloudflare).
→ [hosting, "Cloudflare in front"](../hosting.md#cloudflare-in-front);
[`../legal/README.md`](../legal/README.md), decision 3.

**C3. Where does the public server run?**
A university VM (free, on premises, but meant for the university's own
work: may it serve the whole world?) or an EU hosting provider (roughly
€15 to €50 a month, a data processing agreement with the provider, and
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
The app deletes almost nothing by itself: a study stays until its
researcher deletes it, an account until someone removes it from the
database, and the security log and the admin log stay too. (It does clear
rate limit counters after ten minutes, links to continue on another device
after 15, and the records of expired login sessions whenever someone logs
in.) For a public
server that grows forever, and the law expects a limit. Decide: after how
long without use is a study or account removed (after a warning), how
long are logs kept, and how far back do backups go (which is how long
deleted data survives)? Until P-11 exists, anything promised here is done
by hand.
→ [`../legal/privacy-statement.md`](../legal/privacy-statement.md) §7.

**C8. What happens when something goes wrong?**
A data breach must be reported fast: to the researchers whose studies
are affected, and by the controller to the authority within 72 hours.
The university has a procedure and a team for this. Find out who that
is, write it on one page with the two people who can reach the server,
and publish a security contact address.
→ [`../legal/data-processing-agreement-outline.md`](../legal/data-processing-agreement-outline.md).

**C9. Deleting accounts and studies.**
A study's ADMIN can delete it, and coders' data. The server asks for a
fresh login with a second factor, and the app for the study's name, typed
(P-A1, built). A user can delete their own account from the account menu,
and an admin a registered user's, both by typing the email address (P-A2,
built). What happens to the studies is decided in the code: the studies
only that user has a role in are deleted with the account; the account
can't be deleted while the user owns a study others have a role in, is a
study's only ADMIN, or is the server's only admin (an admin can move a
study to another owner first). Still to decide: whether that is the rule
the owner wants for someone who leaves the university, and who handles a
request by mail from someone who can't log in any more (an admin can now
do it in the app).
→ `../accounts.md` §5; `../coder-identity.md` §8.

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
The app sets three cookies, all needed to work (the device id, the login
session, and one that lives for the minutes of a login), keeps
preferences and unsaved work in the browser's local storage, and loads
nothing from other sites. So the developers' reading is that no banner is
needed, only the cookie section in the privacy statement. Ask the privacy
officer to confirm (release plan, P-A4). It changes if analytics or
outside widgets are ever added, or if Cloudflare features that set extra
cookies are switched on.
→ [`../legal/privacy-statement.md`](../legal/privacy-statement.md) §5 and
reviewer notes 1 and 2.

## D. Code items

### What the release plan already has

An earlier version of this file numbered its own proposals P-01 to P-14.
The owner's items in the release plan (P-A1 to P-A5) and its B7 items
cover some of them; those numbers are no longer used.

| Was | Now | State at `9b26c2a` |
| --- | --- | --- |
| P-01 server info page | **P-A3** | Not built. No page, no settings, no endpoint. The help topic "Privacy and where data lives" tells researchers to ask whoever runs their server; change it to point at the page when it exists. Worth adding to P-A3: a hardening warning in *Server admin* while the page is empty, and the same contact in `/.well-known/security.txt` |
| P-03 deleting a researcher account | **P-A2** | **Built** (`65d6387`, `4f7b3f3`). `GET /me/deletion` and `DELETE /me` with `{ confirm: <email> }` and a fresh login; **Delete account** in the account menu. An admin deletes a registered user the same way (`DELETE /admin/users/:id`; the admin log keeps the address and the studies that went). Studies only the user has a role in go with the account; it is refused (409) while they own a study others have a role in, are a study's only ADMIN, or are the server's only admin: `../accounts.md` §5 |
| P-04 typing the name to delete a study | **P-A1** | **Built** (`65d6387`, `4f7b3f3`). `DELETE /study/:studyId` needs the study's ADMIN, a fresh second factor and `{ confirm: <the study's name> }`; one dialog, from the studies page and from a study's settings, says what goes and asks to type the name. It does not say how many coders and answers go |
| Web basics (robots.txt, page metadata) | **P-A4** | Done: `packages/client/public/robots.txt` (the welcome page may be visited; `/code`, `/research` and `/api/` not) and, in `packages/client/index.html`, a description, theme colours and neutral social tags. No web app manifest: AnnoTinder is not installed as an app. Open in P-A4: the privacy officer's confirmation that no cookie banner is needed (C13) |
| The hosting guide, the legal drafts, this file | **P-A5** | Done as drafts: `../hosting.md`, `../legal/`, `LICENSE` (MIT). The Redis question is answered in [hosting](../hosting.md#does-it-need-redis-or-another-key-value-store): Postgres only. Open: everything marked untested in the guide, and the owner's and the university's review of the legal texts |
| P-14 licence metadata | **B7-06** | `LICENSE` exists. Open: `"license": "MIT"` in the `package.json` files (none has it), `SECURITY.md`, a line on contributions in the README, a check of the dependencies' licences |
| Backups off the machine, restore drill, monitoring, Cloudflare limits in the guide | **B7-07** | Written in `../hosting.md`. Open: the restore drill itself (B7-09), and hourly dumps in `scripts/db-backup.sh` (now a crontab line in the guide; see P-09) |

### New here

"Before public" means: should be built before the public server opens.
None is needed for the lab pilot.

| Id | What | Why | When |
| --- | --- | --- | --- |
| **P-02** | **The real client address behind Cloudflare.** **Built** (`9dbc1be`): `ANNOTINDER_TRUST_PROXY=none \| proxy \| cloudflare` (`server/src/shared/clientAddress.ts`). With `cloudflare` the rate limiter reads `CF-Connecting-IP`, but only for requests the proxy got from one of Cloudflare's addresses (the list is in that file); the start-up log says where addresses come from. The earlier value `1` is refused. Open: the test on the real server ([hosting](../hosting.md#4-the-visitors-real-address)), and keeping the list of Cloudflare's ranges up to date | Without it, rate limits lump all visitors of one Cloudflare address together | Built; test before public |
| **P-05** | **Turnstile on starting a coder session**, as a study or link option ("check that coders are human"): the widget in the client, `challenges.cloudflare.com` in the Content Security Policy only when configured, a check on the server (`siteverify`) with keys from settings, and a line in the privacy statement. Not on login or registration: those are at the login provider. Compare with the caps on open links of the release plan (D16, B1-22), which need no outside service | Open links can be filled by scripts | Later |
| **P-06** | **A health check that includes the database.** **Built** (`9dbc1be`): `GET /api/ready` runs `select 1` and answers 503 with `"database": false` when it fails or takes more than 3 seconds. `/api/health` stays as it was, for the container's own check. Point the uptime check and a load balancer at `/api/ready` ([hosting](../hosting.md#monitoring)) | The uptime check and a load balancer stay green when Postgres is down | Built |
| **P-07** | **Pages and search engines.** The server sends `X-Robots-Tag: noindex` for every page except `/` (coder links hold a secret; `robots.txt` only asks crawlers not to visit). A social preview image (`og:image`, 1200×630) and `og:url`, which need the server's public address, so the server fills them into `index.html` | `index.html` is one file for all pages, so it can't carry `noindex` without hiding the welcome page | Later |
| **P-08** | **Previews in the database** (marked as preview data, deleted when they expire), instead of in one process's memory (`runtime/preview.ts`) | One of the two things that stop several app servers from working without session affinity; previews also end at every restart | With a second app server |
| **P-09** | **`compose.yml` for an external database**: `DATABASE_URL` from `.env` when set, the `db` and `db-backup` services optional (a compose profile), TLS to the database documented and tested. And a `BACKUP_INTERVAL` for hourly dumps in `db-backup.sh` (it writes one file per day now) | A managed Postgres, and dumps more often than daily, now need hand edits | With a managed database; the interval before public |
| **P-10** | **Upload size behind a proxy.** A setting for the largest upload that the client shows and checks before sending, or uploads split into parts by the client | Cloudflare's Free and Pro plans refuse requests over 100 MB; the server accepts 256 MB on `/api/study/*`. Today a larger upload fails with Cloudflare's error page | Before public (the setting), later (splitting) |
| **P-11** | **Retention tooling.** In *Server admin*: when each account and study was last used, a filter for "not used for N months", and deleting from there. A scheduled clean-up of what nothing removes today: `security_log` and `admin_log` older than a set period, shadow users whose invitation expired. (Expired rows in `sessions` are removed at every login since `4b408b6`; a schedule would also remove them on a server where nobody logs in.) Later: warnings by email. (The release plan defers "cleanup jobs for logs" to after the release; this is that, with the admin's view added) | The app deletes almost nothing by itself; the privacy statement must state a period | Soon after public |
| **P-12** | **Accepting the terms.** At the first login as a researcher, and again when the terms' version changes: show the terms and the data processing terms, and record who accepted which version and when | A standard data processing agreement as part of the terms only works if acceptance is recorded | Before public |
| **P-13** | **Slow actions behind a proxy.** Measure, on a large study through Cloudflare: making the results download (`POST …/results/export` answers when the whole zip is written), the study export (built in memory before the first byte is sent), the study import, and a deploy. Whatever doesn't start answering within about 100 seconds must stream its answer or run in the background | Cloudflare cuts off answers that take longer to start (error 524) | Before public (measuring) |
| **P-15** | **Results files follow the data.** The results download of a study is kept as a file (`ANNOTINDER_FILES_DIR`, `shared/resultsExport.ts`) until the next download replaces it. **The removal is built** (`7e7c9d4`, `65d6387`): the file goes when the study is deleted (also with its owner's account), when a coder's data is deleted and when answers are reset, and a download link handed out before stops working. Open: a shared store (S3, `exports-and-files.md`) for several app servers, where a download link made on one server now fails on another | The privacy statement says deleting is immediate | The removal: built; the store: with a second app server |
| **P-16** | **A missing file under `/assets/` answers 404.** **Built** (`4b408b6`): `GET /assets/<a name that isn't there>` answers 404 "Not found" without a `cache-control` header, instead of the app's page with the one-year header (`serveClient` in `app.ts`; a test in `app.test.ts`) | A proxy that caches kept that wrong answer for a year under the script's name, which bit after going back to an older version | Built |
| **P-17** | **The session cookie follows the session.** **Built** (`65d6387`): the server extends a login session at use (14 days, sliding, at most once an hour) and sends the cookie again when it does (`researcher/auth.ts`, `setSessionCookie`), so a browser stays logged in until 14 days without use, as `coder-identity.md` §7 says | The docs, the privacy statement and the behaviour should say the same | Built |
