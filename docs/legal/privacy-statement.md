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
| Response times | Per question: how long it was on screen before you answered and in total, how long the page was hidden meanwhile, and how often you changed the answer |
| Your session | Which link you used, when you started, which units you were given, and how the session ended |
| Your device, roughly | The kind of device (phone, tablet, desktop), the browser and the operating system. Not the full "user agent" |
| A participant id | Only if the researcher's link carries one (for example the id a panel company gave you) |
| Other link details | Only the ones the study is set up to keep (for example a condition, or a panel's session id) |
| Your email address | Only if the study asks you to log in |
| A request to delete | If you quit and ask for your answers to be deleted (§8) |

Not stored about you by AnnoTinder: your name, your IP address, your
location, or which other studies you took part in. (Your browser keeps
one random id for all studies in a cookie, but the server stores only a
separate code per study derived from it, so stored data from two studies
can't be linked to one device.)

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
| Your account | Your email address, an id from your login provider, whether the provider verified your address, whether your last login used a second factor, when you registered and last logged in | To give you access and let colleagues add you to a study by email address | `[TO DECIDE, e.g. performing the agreement with you (the terms of use) / legitimate interest / public task]` |
| Roles and limits | Your role on the server and in studies, your plan and limits, a request to become a researcher if you made one | To decide what you may do | The same |
| Login sessions and API keys | A random key per session or API key, stored only as a hash | To keep you logged in; for R and Python clients | The same |
| Security log | Your logins: when, with which provider, with a second factor or not; logins you linked | To detect misuse of accounts | `[TO DECIDE, e.g. legitimate interest in a secure service]` |
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
  for a minute. These counters are deleted after about ten minutes.
- **Server logs.** `[DESCRIBE: e.g. "The web server in front of the
  application keeps no access logs" / "keeps access logs with IP addresses
  for N days, for security"]`.
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
| `annotinder_device` | A random id that lets you continue a study on the same device without an account. Scripts on the page can't read it | You open a study link | 400 days |
| `annotinder_session` | Keeps a researcher (or a coder who logged in) logged in | You log in | 14 days after your last visit; removed at logout |
| `annotinder_login` | Carries a login from this site to the login provider and back | You start a login | At most 10 minutes |
| `[ANY COOKIES OF THE PROXY, e.g. Cloudflare's "__cf_bm" or "cf_clearance": only if the features that set them are switched on]` | Security of the proxy | | |

**Local storage** (data your browser keeps for this site, not sent to us
automatically):

| What | For |
| --- | --- |
| Your colour theme (light or dark), whether shortcut hints are shown, the height of the answer panel | Your display preferences |
| The answers to the unit on your screen that are not yet saved | So that they survive an accidental reload |
| The list of studies you opened on this device | The "continue coding" list on the coder home page |
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
| Login sessions | 14 days after your last visit |
| Security and admin logs | `[PERIOD]` |
| Rate limit counters with IP addresses | About 10 minutes |
| Backups | `[PERIOD, e.g. 60 days]`. Deleted data disappears from the backups when they expire |

## 8. Deleting data

- **Coders and participants.** You can quit a study at any time, and
  when you quit you can ask for your answers to be deleted. The
  researcher sees that request and carries it out; a record that a
  deletion happened is kept (without your answers), so that the
  researcher can also remove you from data they downloaded earlier. If
  the researcher doesn't respond, contact us at `[PRIVACY EMAIL]` and
  tell us which study it was (the link you used helps).
- **Researchers** can delete individual coders' data, reset answers, and
  delete a whole study. This is immediate and permanent on the server,
  and disappears from backups after `[PERIOD]`.
- **Your researcher account.** Write to `[PRIVACY EMAIL]`. Before we
  delete an account, its studies must be deleted or handed over to
  another owner.

## 9. Security

In short: connections are encrypted; researchers log in through a login
provider, and sensitive actions (deleting data, API keys, admin work)
need a recent login with a second factor; session keys and API keys are
stored only as hashes; the database is not reachable from the internet;
backups are encrypted before they leave the server. No system is
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

1. **Facts checked in the code** (November 2026): the lists in §4 and §5
   follow what the server stores (`docs/coder-identity.md`,
   `docs/accounts.md`, the database schema) and what the client keeps in
   the browser (`annotinder_device`, `annotinder_session`,
   `annotinder_login`; local storage for theme, shortcut hints, panel
   height, draft answers, opened studies, design backup, dismissed
   notices). Check them again at each release.
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
5. **Things promised that need doing by hand today:** deleting a
   researcher account on request (no self-service yet), and any automatic
   retention in §7 (`docs/plans/go-live.md`, P-03 and P-11).
6. **The lab's own server** can use a shortened version: §2, §4, §5, §7,
   §8, with the university's general privacy statement for the rest, if
   the privacy officer agrees.
7. A Dutch translation may be needed, depending on the participants.
