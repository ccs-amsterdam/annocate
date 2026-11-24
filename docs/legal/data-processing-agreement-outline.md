# Data processing agreement: an outline

> **DRAFT, not reviewed, and not an agreement.** This is a list of what a
> data processing agreement must contain, with the facts about AnnoTinder
> that go into one. The agreement itself should come from the
> university's legal office or be based on an established model
> ([`README.md`](README.md)). Text in `[SQUARE BRACKETS]` is a
> placeholder.

## What it is, and when it is needed

A data processing agreement (DPA; in Dutch *verwerkersovereenkomst*) is
the written agreement that the GDPR (article 28) requires between a
**controller** (who decides why and how personal data is used) and a
**processor** (who handles it for them).

For AnnoTinder: a researcher's institution is the controller of the
personal data in the researcher's studies. Whoever runs the server is the
processor.

| Situation | DPA? |
| --- | --- |
| A researcher uses a server run by their own institution | No: one organisation. The institution's internal rules apply (register of processing, security policy) |
| A researcher from **another** institution uses the lab's server | Yes, between the two institutions. Often arranged as part of a collaboration or consortium agreement |
| Any researcher uses the public server | Yes, between the server's operator and the researcher's institution |
| The operator uses a hosting provider, a proxy, a backup store | Yes, between the operator and each supplier (a **sub-processor** agreement). Most suppliers publish a standard one that applies by accepting their terms |

**Universities usually require one.** A researcher who puts personal
data on an outside service without a DPA breaks their own institution's
rules, and privacy officers and ethics committees ask for it. So for the
public server this is not optional paperwork: without a DPA on offer,
careful researchers can't use it.

**How to offer it on a public server.** Signing a separate agreement
with every institution doesn't scale. The usual way:

1. A standard DPA that is part of the terms of use, accepted when a
   researcher starts using the service
   (`docs/plans/go-live.md`, P-12).
2. A signed version of the same text for institutions that ask.
3. Willingness to look at an institution's own template when they insist.
   Dutch universities often use a model agreement from SURF; ask the
   legal office whether the standard DPA can simply follow that model.

A researcher usually can't sign for their institution. The standard DPA
should say that the researcher confirms they may accept it, or name the
institution's signatory.

## What it must contain

The first list is what article 28(3) of the GDPR requires. The second
column says what is already true of AnnoTinder, to help fill it in.

| The agreement must say | For AnnoTinder |
| --- | --- |
| **Subject, duration, nature and purpose** of the processing | Hosting an annotation and survey tool: storing studies, distributing units to coders, collecting answers, offering the results for download. For as long as the researcher uses the service |
| **The kinds of personal data** | Coders' and participants' answers and response times; rough device details and how their screen looked (shortcut style, width, theme); participant ids and link parameters the study keeps; email addresses of coders who log in; whatever personal data is in the uploaded units (decided by the researcher) |
| **The kinds of people** | Coders, survey and experiment participants, people mentioned in the material being coded, the researcher's team |
| **Only on documented instructions** of the controller | The researcher's actions in the app and the terms are the instructions. The operator doesn't use study data for anything else and doesn't look into it except as the terms allow |
| **Confidentiality** of everyone with access | Who at the operator has access to the server and the database: `[NAMES OR ROLES]`, bound by `[EMPLOYMENT TERMS / A SIGNED STATEMENT]` |
| **Security measures** (article 32) | An annex. Starting points: `docs/security.md`; encrypted connections; login through a provider with a second factor for sensitive actions; keys stored as hashes; the database not reachable from the internet; encrypted off-site backups and tested restores (`docs/hosting.md`); security updates; who has access |
| **Sub-processors**: only with permission, under the same obligations | An annex with the list: `[HOSTING PROVIDER]`, `[BACKUP STORE]`, `[PROXY, e.g. Cloudflare]`, `[LOGIN PROVIDER HOST]`, each with location. General permission, with notice of changes `[N weeks]` ahead and a right to object |
| **Help with data subjects' requests** | The app supports it: coders can ask for deletion, researchers can delete a coder's data, find a coder's data in the results download, and delete a study. The operator forwards requests it receives to the researcher |
| **Help with security duties, data breaches and impact assessments** | The operator reports a breach that affects study data to the researchers concerned without undue delay, and at the latest within `[N hours, often 24 to 48]`, with what is known. Contact: `[SECURITY EMAIL]`. The controller decides about reporting to the authority and to participants |
| **Delete or return the data at the end** | Researchers download results and can export a whole study at any time, and can delete a study themselves. Deleting an account and its remaining studies is done by the operator on request (not yet in the app: release plan, P-A2). Deleted data is gone from backups after `[BACKUP RETENTION]` |
| **Information and audits** | The operator answers reasonable questions and provides this documentation. On-site audits: `[TO AGREE; for a free service, usually limited to documentation and questionnaires, at the controller's cost]` |

Also usual, and asked for by universities:

- **Where the data is**, and no transfer outside the European Economic
  Area without the safeguards the GDPR requires. State the location of
  the server, the database, the backups and the proxy, each as it really
  is: `[LOCATIONS]`. A proxy with a worldwide network is the difficult
  item here ([`README.md`](README.md), decision 3).
- **Liability** between the two parties, and how it relates to the terms
  of use.
- **Which law applies**, and how the agreement ends.
- **Who the contacts are** on both sides, for privacy and for security.

## Annexes to prepare

1. **Description of the processing**: the first three rows of the table.
2. **Security measures**: one or two pages, in plain language, kept up
   to date.
3. **Sub-processors**: name, what for, where. The same list as in the
   privacy statement (§6).
4. **Contacts and the breach procedure**: who to call, how fast.

## Before this can be offered

- The operator is an organisation that can sign
  ([`README.md`](README.md), decision 1).
- The operator has its own agreements with every sub-processor on the
  list.
- Someone reads the security and privacy mailboxes.
- There is a written, short procedure for a data breach: who decides,
  who informs the researchers, where it is recorded. The university has
  one; follow it.
