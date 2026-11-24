# Privacy statement

> **DRAFT, not reviewed.** Written by the developers as a starting point.
> To be reviewed and changed by the owner and the university's privacy
> officer and legal office before it is published
> ([`README.md`](README.md)). Text in `[SQUARE BRACKETS]` must be filled in
> per server. Notes for the reviewer are at the end and are not part of
> the statement.

**This statement is for the AnnoTinder server at `[SERVER ADDRESS]`.**
Other AnnoTinder servers are run by other organisations and have their own
statement.

Version `[DATE]`.

## 1. In short

- AnnoTinder is a tool for research: researchers set up annotation tasks
  and surveys, and coders or participants answer them.
- If you **take part in a study**, the researcher who invited you decides
  what is collected and why, and should have told you. We store it for
  them. Ask the researcher first; you can also contact us.
- If you are a **researcher**, we keep an account for you with the email
  address from your login.
- We use **no advertising, no tracking and no analytics**. We set only
  the cookies the tool needs to work, so there is no cookie banner.
- We don't sell or share data. Some suppliers handle it for us (§6).

## 2. Who we are

This server is run by `[OPERATOR: LEGAL NAME, ADDRESS, REGISTRATION
NUMBER IF ANY]` ("we").

- General contact: `[CONTACT EMAIL]`
- Privacy questions and requests: `[PRIVACY EMAIL]`
- Data protection officer: `[NAME OR OFFICE, CONTACT; OR "none appointed"]`

## 3. Two kinds of data, two roles

**Study data.** Everything in a study (the material that is coded, who
took part, the answers) belongs to the research of the researcher who
made the study. The researcher, or their institution, is the *controller*:
they decide what is collected and why, they are responsible for informing
participants and for a lawful basis, and they are the first contact for
questions and requests about a study. We are their *processor*: we store
and handle the data only to provide the service, under the agreement in
`[LINK TO TERMS / DATA PROCESSING AGREEMENT]`.

**Accounts and running the server.** For researchers' accounts, security
and the technical operation of the server, we are the *controller*.

## 4. What we store, and why

### If you take part in a study (coders and participants)

You don't need an account. Per study, the server stores:

| What | Details |
| --- | --- |
| Your answers | Per question: the answer, when you first gave it and last changed it |
| Response times | Per question: how long it was on screen before you answered and in total, how long the page was hidden meanwhile, and how often you changed the answer. Per unit: when the server handed it to you |
| Your session | Which link you used, when you started, which units you were given, and how the session ended |
| Your device, roughly | The kind of device (phone, tablet, desktop), the browser and the operating system. Not the full "user agent" |
| How your screen looked | The style of keyboard shortcuts, whether the screen was narrow or wide, light or dark theme, and when these changed |
| A participant id | If the researcher's link carries one (for example the id a panel company gave you), or a name you picked from the study's list |
| Other link details | Only the ones the study is set up to keep (for example a condition, or a panel's session id) |
| Your email address | Only if you log in. Some studies require that; in others it is your own choice (to continue on another device). It is also stored if you were already logged in on this server when you opened the study's link. The researcher sees it in the results only where the study requires login `[SEE REVIEWER NOTE 8]` |
| A request to delete | If you quit and ask for your answers to be deleted (§8) |

If you log in, you also get an account like a researcher's (below), without
the right to create studies.

Not stored about you by AnnoTinder: your name, your IP address or your
location. Without a login, nothing stored links the studies you took part
in: your browser keeps one random id for all studies in a cookie, but the
server stores only a separate code per study derived from it. With a login,
your sessions in different studies carry the same email address.

**Purpose and legal basis:** these are decided by the researcher, for
their research. They should be in the information you got from the
researcher.

**Content from other websites.** A researcher can show images, audio or
video in a study that are loaded from another website. That website then
sees your IP address, as with any web page. The researcher is responsible
for what they include.

### If you are a researcher

| What | Details | Why | Legal basis |
| --- | --- | --- | --- |
| Your account | Your email address, an id from your login provider, whether the provider verified your address, whether your last login used a second factor, when you registered and last logged in, and your display and keyboard settings | To give you access and let colleagues add you to a study by email address | `[TO DECIDE, e.g. performing the agreement with you (the terms of use) / legitimate interest / public task]` |
| Roles and limits | Your role on the server and in studies, your plan and limits, a request to become a researcher if you made one | To decide what you may do | The same |
| An invitation | If a colleague or an admin gives your email address a role before you ever logged in: that address and the role, waiting for your first login | So that you get the role when you log in | The same |
| Login sessions and API keys | A random key per session or API key, stored only as a hash; for a session also the provider, when it authenticated you and whether with a second factor; for an API key its label and when it was made and last used | To keep you logged in; for R and Python clients | The same |
| Security log | Your logins: when, with which provider, with a second factor or not; logins you linked; exports of a whole study you made | To detect misuse of accounts | `[TO DECIDE, e.g. legitimate interest in a secure service]` |
| Admin log | Changes that the server's admins made to accounts and studies, with the admin's email address | Accountability | The same |
| Your studies | Everything you put in them: see "Study data" in §3 | To provide the service | Processing on your behalf |

You don't give us a password: you log in at `[LOGIN PROVIDER: NAME AND
OPERATOR]`, which has its own privacy statement: `[LINK]`.

**Email.** AnnoTinder itself sends no email. We may write to the address
of your account about the service: a security problem, planned downtime,
or a change of these terms. Not for anything else.

### Technical data

- **IP addresses.** The application doesn't store them, with one
  exception: to limit floods and guessing, it counts requests per address
  and per minute. These counters are deleted after about ten minutes.
- **Server logs.** The application itself writes no log of requests.
  `[DESCRIBE THE WEB SERVER IN FRONT: e.g. "It keeps no access logs" /
  "It keeps access logs with IP addresses for N days, for security"]`.
- **Our proxy and hosting suppliers** process IP addresses and traffic to
  deliver the pages and to stop attacks (§6).

## 5. Cookies and storage in your browser

We use only what the tool needs to do what you ask of it. Nothing here
follows you across websites or is used for statistics or advertising.
That is why you don't see a cookie banner: the law asks for consent for
tracking and other non-essential storage, not for this.

**Cookies:**

| Name | For | Set when | Kept |
| --- | --- | --- | --- |
| `annotinder_device` | A random id that lets you continue a study on the same device without an account. Scripts on the page can't read it | A study accepts your link for the first time | 400 days |
| `annotinder_session` | Keeps a researcher (or a coder who logged in) logged in. Scripts on the page can't read it | You log in | 14 days after the login; removed at logout |
| `annotinder_login` | Carries a login from this site to the login provider and back | You start a login | Until you come back from the login provider, at most 10 minutes |
| `[ANY COOKIES OF THE PROXY, e.g. Cloudflare's "__cf_bm" or "cf_clearance": only if the features that set them are switched on]` | Security of the proxy | | |

**Local storage** (data your browser keeps for this site, not sent to us
automatically):

| What | For |
| --- | --- |
| Your colour theme (light or dark), whether shortcut hints are shown and which keys answer, the height of the answer panel | Your display and keyboard preferences |
| Which instructions of a study you have already seen | So that they are not opened again each time |
| The answers to the unit on your screen that are not yet saved | So that they survive an accidental reload. Removed when the unit is saved |
| The list of studies you opened on this device, each with the details from its link (such as a participant id), never the link's secret | The list of your studies on the coder home page |
| For researchers: unsaved edits of a design, and notices you dismissed | So that a crash or reload doesn't lose your work |

You can delete all of this in your browser's settings. Deleting the
`annotinder_device` cookie means the server no longer recognises your
device: you can't continue studies you started without logging in.

## 6. Who else handles the data

We don't sell data and don't share it for anyone else's purposes. These
suppliers handle data for us, each under a data processing agreement:

| Supplier | What for | Where |
| --- | --- | --- |
| `[HOSTING PROVIDER: NAME, COUNTRY]` | The server and the database | `[LOCATION OF THE DATACENTER]` |
| `[BACKUP STORAGE PROVIDER]` | Encrypted backups. The supplier can't read them | `[LOCATION]` |
| `[PROXY PROVIDER, e.g. Cloudflare, Inc. (United States)]` | Passes all traffic to the server, and protects it against attacks. It can technically see the traffic that passes | `[WORLDWIDE NETWORK / EU]` |
| `[LOGIN PROVIDER AND WHO HOSTS IT]` | Researchers' logins | `[LOCATION]` |

**Outside the European Economic Area:** `[EITHER "None of this data
leaves the EEA." OR describe each transfer and its safeguard, e.g. the
EU–US Data Privacy Framework or standard contractual clauses.]`

Researchers download their study data and handle it under their own
institution's rules. Study admins can also export a whole study and move
it to another AnnoTinder server.

## 7. How long we keep data

| Data | Kept |
| --- | --- |
| Study data | As long as the researcher keeps the study. The researcher decides when to delete it. `[IF A LIMIT APPLIES: "Studies that nobody opened for N months are deleted after a warning to the owner."]` |
| Researcher accounts | Until you ask us to delete it. `[OPTIONAL: "Accounts not used for N years are deleted after a warning."]` |
| Login sessions | They stop working 14 days after their last use, and at logout. `[The record of an expired session (a hash, the provider, times) is not removed automatically today: SEE REVIEWER NOTE 5]` |
| Links to continue on another device | 15 minutes |
| Security and admin logs | `[PERIOD; today they are kept until someone removes them: SEE REVIEWER NOTE 5]` |
| Invitations nobody used | They stop working after 3 months; `[PERIOD UNTIL REMOVED]` |
| Rate limit counters with IP addresses | About 10 minutes |
| Backups | `[PERIOD, e.g. 60 days]`. Deleted data disappears from the backups when they expire |

## 8. Deleting data

- **Coders and participants.** You can quit a study at any time, and
  when you quit you can ask for your answers to be deleted. The
  researcher sees that request and carries it out. A record that a
  deletion happened is kept, so that the researcher can also remove you
  from data they downloaded earlier: the session's number, your
  participant id if you had one, when you asked, when and by whom it was
  deleted, and how many answers; not the answers `[SEE REVIEWER NOTE 8]`. If
  the researcher doesn't respond, contact us at `[PRIVACY EMAIL]` and
  tell us which study it was (the link you used helps).
- **Researchers** can delete a coder's data and delete a whole study.
  This is immediate and permanent in the database, and disappears from
  backups after `[PERIOD]`. (Resetting answers is not deleting: reset
  answers are set aside and stay in the researcher's download until the
  coder's data or the study is deleted.)
- **Your account.** Write to `[PRIVACY EMAIL]`. Before we delete an
  account, the studies it owns must be deleted or handed over to another
  owner.

## 9. Security

In short: connections are encrypted; researchers log in through a login
provider, and sensitive actions (deleting data, API keys, admin work)
need a recent login with a second factor; session keys and API keys are
stored only as hashes; the database is not reachable from the internet;
`[IF SET UP SO: backups are encrypted before they leave the server]`. No system is
perfectly secure. If something goes wrong with your data, we tell the
researchers concerned and, where the law requires it, the supervisory
authority and you.

To report a security problem: `[SECURITY EMAIL]`.

## 10. Your rights

Under the GDPR you may ask to see the data about you, to have it
corrected or deleted, to limit or object to its use, and to receive it in
a usable format. Where the use rests on your consent, you may withdraw
it.

- About a **study**: ask the researcher, who decides about that data. We
  help them carry it out.
- About your **account**: ask us at `[PRIVACY EMAIL]`. We answer within a
  month.

You may complain to the supervisory authority: `[AUTHORITY, e.g. for the
Netherlands the Autoriteit Persoonsgegevens, autoriteitpersoonsgegevens.nl]`.

## 11. Changes

When this statement changes, the new version is published here with its
date. Researchers with an account are told about important changes by
email.

---

## Notes for the reviewer (not part of the statement)

1. **Facts checked in the code** (November 2026, commit `9b26c2a`): the
   lists in §4 and §5 follow what the server stores
   (`server/src/db/schema/`, `docs/coder-identity.md`, `docs/accounts.md`)
   and what the client keeps in the browser. Cookies: `annotinder_device`
   (`runtime/session.ts`: path `/api/d`, 400 days), `annotinder_session`
   (`researcher/login.ts`: 14 days) and `annotinder_login` (10 minutes,
   path `/api/auth`). Local storage keys: `annocate_theme`,
   `annocate_show_shortcuts`, `annotinder_key_mapping`,
   `annotinder_answer_keys`, `annocate_docked_pane_height`,
   `annotinder:instruction-seen:…`, `annotinder:unit-draft:<session>`,
   `annotinder:studies`, `annotinder:design-backup`,
   `annotinder.exampleNotice.<study>`. No session storage, no IndexedDB, no
   cookies set by scripts, and the pages load nothing from other sites
   except what a researcher puts in a study. Check them again at each
   release: several items of the release plan change them (notes 5 and 8).
   The session cookie lasts 14 days from the login: the server extends the
   session with each use, but does not renew the cookie, so the browser
   drops it after 14 days whatever the use.
2. **No cookie banner: the reasoning.** The ePrivacy Directive (article
   5(3); in the Netherlands article 11.7a of the Telecommunicatiewet)
   requires consent for storing or reading information on a device,
   except when it is strictly necessary for a service the user asked for.
   Everything listed in §5 is first-party and serves a function the user
   asked for (continuing a session, staying logged in, keeping
   preferences they set, not losing work). Display preferences are the
   weakest case; EU regulators' guidance on the exemption (Article 29
   Working Party, Opinion 04/2012) treats preferences set by an explicit
   user action as exempt. Information is still required, which is what §5
   does. **This changes at once if** analytics, embedded third-party
   widgets, or proxy features that set non-essential cookies are added.
3. **The 400-day device cookie** is long. It matches how long a coder may
   want to come back to a study; the reviewer may prefer a shorter period
   (a code change).
4. **Legal bases in §4** are placeholders on purpose. For a university
   the basis may be the public task; for another operator, the agreement
   with the researcher or legitimate interest.
5. **Things promised that need doing by hand today:** deleting an
   account on request (no self-service and no admin button yet: work in the
   database; release plan P-A2), and everything about retention in §7: the
   server removes nothing by itself except rate limit counters and used or
   expired links to continue on another device. Expired login sessions, the
   security log and the admin log stay until someone removes them
   (`docs/plans/go-live.md`, P-11).
6. **The lab's own server** can use a shortened version: §2, §4, §5, §7,
   §8, with the university's general privacy statement for the rest, if
   the privacy officer agrees.
7. A Dutch translation may be needed, depending on the participants.
8. **Three things in the code that this statement has to follow**, each
   with an item in the release plan. (a) An email address is linked to a
   coder session whenever a logged-in browser opens a study link, also when
   the study doesn't ask for it (D15, B2-04: planned to happen only where
   sign-in is required or the coder chooses it). (b) Where a study requires
   login, the participant id is the email address, so the deletion record
   keeps it; and the export of a whole study (for the study's admins)
   holds the email address of every session that has one, also where the
   results hide it (D18, B1-23). (c) The results download is kept as a
   file on the server until the next download of that study is made; it is
   not removed when a coder's data or the study is deleted
   (`docs/plans/go-live.md`, P-15). On the standard installation the file
   disappears at the next update of the server. Until these are changed,
   say what is true.
