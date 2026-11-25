# Legal texts

> **These are drafts, written by the developers, not by a lawyer.** They
> are a starting point for the owner and for the university's privacy
> officer and legal office to review and change. Nothing here is legal
> advice, and none of it should be published as it is.

Text in `[SQUARE BRACKETS]` is a placeholder: a fact about the
organisation or the server that the drafts don't know and must not guess.

## What is here

| File | What it is | Who reads it |
| --- | --- | --- |
| [`privacy-statement.md`](privacy-statement.md) | What a server stores about researchers and coders, why, for how long, who else handles it, and how to get data deleted. Includes the section on cookies and browser storage | Everyone who uses the server; ethics committees; privacy officers |
| [`terms-of-use.md`](terms-of-use.md) | The rules for researchers who use a server someone else runs: what is allowed, what the researcher is responsible for, and what the operator does and doesn't promise | Researchers on the public server |
| [`data-processing-agreement-outline.md`](data-processing-agreement-outline.md) | What a data processing agreement (DPA, in Dutch *verwerkersovereenkomst*) must contain, and the facts about AnnoTinder that go into one. An outline, not an agreement | The owner, the privacy officer, institutions that ask for a DPA |
| [`../../LICENSE`](../../LICENSE) | The software's licence (MIT). About the code, not about any server | Anyone who uses or changes the code |

## The idea behind the roles

Privacy law (the GDPR) asks, for each use of personal data, who decides
why and how it is used. That party is the **controller**. A party that
only handles the data on the controller's instructions is a **processor**.
On an AnnoTinder server there are two kinds of data, with different roles:

| Data | Controller | Processor |
| --- | --- | --- |
| **A study's data**: the units, the coders and participants, their answers | The researcher's institution (in practice: the researcher). They decide what is collected, from whom and why, and they inform the participants | Whoever runs the server |
| **Accounts and running the server**: researchers' logins, roles, security logs | Whoever runs the server | Its suppliers (hosting, proxy, backup storage) |

A processor needs a written agreement with each controller: the DPA.
Suppliers of the processor that also handle the data are
**sub-processors**, and the processor needs an agreement with each of
them as well.

## Which server needs what

| | The lab's server (university VM, invite-only) | The public server (annotinder.com) |
| --- | --- | --- |
| **Privacy statement** | Yes. A short version: who runs it, what is stored, cookies, contact. If only people of the own university use it, the university's general privacy statement may cover most of it: ask the privacy officer | Yes, complete, before the first outside researcher |
| **Terms of use** | Optional. Lab rules or a short "house rules" page may be enough | Yes |
| **DPA with researchers' institutions** | Not for researchers of the own university (the same organisation can't be its own processor). Yes when researchers of other institutions put their study data on it | Yes, with every institution whose researchers use it. In practice: a standard DPA that is part of the terms, plus a signed one for institutions that ask |
| **Agreements with suppliers** | The VM is the university's own. Check the backup store and the login provider | Hosting provider, Cloudflare, backup store, login provider: each needs a DPA (most offer a standard one online) |
| **Entry in the register of processing** | Ask the privacy officer: universities keep a register, and a new system that holds research data usually has to be entered | The same, for whichever organisation runs it |
| **Server info page** (who runs this, where, contact: the app's "About this server" page, `/about`, filled in through the `ANNOTINDER_*` settings in `docs/hosting.md`; release plan, P-A3) | Yes | Yes |

## What the owner must decide or get checked

Each of these is also in the checklists of
[`../plans/go-live.md`](../plans/go-live.md).

1. **Who is the operator of the public server, legally?** The drafts say
   `[OPERATOR]`. It must be an organisation that can sign agreements and
   carry liability: the university, a faculty or department, a foundation.
   A private person as the processor of other institutions' research data
   is a real personal risk and something institutions will not accept.
   This is the first question for the legal office, because every other
   text depends on it.
2. **Review of the three drafts** by the university's privacy officer and
   legal office. Ask them in particular about: the legal bases in the
   privacy statement (§4), the liability clause in the terms (§10), the
   applicable law and court, and whether the university has its own DPA
   template that must be used. (Dutch universities often use a model
   agreement made by SURF; ask.)
3. **Cloudflare in front of the public server.** Cloudflare decrypts all
   traffic, so it handles coders' answers and login cookies. It is a US
   company. It offers a standard DPA with the EU's standard contractual
   clauses and, by its own account, takes part in the EU–US Data Privacy
   Framework (not checked for this draft: look up its current status),
   which is what makes such a transfer lawful on paper. On the Free plan
   a visitor is served by the nearest Cloudflare data centre, anywhere in
   the world. Whether the university
   accepts it for research data is a policy question: ask before the
   domain is moved. If the answer is no, the alternatives are a proxy from
   an EU company, or no proxy and the hosting provider's own protection
   against attacks (`../hosting.md`, "Cloudflare in front").
4. **The hosting location.** The drafts, the docs and the app say nothing
   about where any server is hosted. Each server states its own provider
   and location, on its "About this server" page (`ANNOTINDER_HOSTING`; release plan, P-A3) and in its privacy
   statement, and it must be true for the VM, the database, the backups
   and the proxy.
5. **Retention.** How long accounts and studies are kept when nobody uses
   them, and how long backups go back (privacy statement §7). The app
   deletes nothing by itself today, so whatever is promised must be done
   by hand until there is tooling (`../plans/go-live.md`, P-11).
6. **Contact addresses** that are read: general, privacy, and security.
7. **The licence** (below).
8. **A data protection impact assessment (DPIA)?** Probably not needed
   for the service as such, but that is the privacy officer's call, and
   individual studies with sensitive data may need one. Ask.

## The licence: MIT, and what to check

`LICENSE` at the top of the repository is the MIT licence, with the line
"Copyright (c) 2026 Kasper Welbers and Wouter van Atteveldt". More names
can be added later (the line is just text); contributors keep the
copyright on what they contribute, under the same licence, whether or not
they are named.

**Check before the release:**

- **Who owns the copyright.** Under Dutch law, software written as part
  of a job normally belongs to the employer. So the university, not the
  individual authors, may be the copyright holder, and it may have a
  policy on publishing software as open source (often with the technology
  transfer office or the research software engineers). Ask whether the
  licence choice needs approval, and whether the copyright line should
  name the university (for example "Copyright (c) 2026 [UNIVERSITY] and
  the AnnoTinder authors").
- **Funders.** Some grants require an open licence, a few prescribe one.
- **Contributors from elsewhere.** Their contributions fall under the
  repository's licence if that is stated (a line in the README or a
  `CONTRIBUTING` file is the usual way).
- **Dependencies.** The packages AnnoTinder uses must have licences that
  fit (permissive ones do). Run a licence check on the dependencies once
  before the release.
- The `package.json` files have no `license` field yet, and there is no
  `SECURITY.md` (release plan, B7-06).

**MIT or AGPL-3.0?**

| | MIT | AGPL-3.0 |
| --- | --- | --- |
| In one sentence | Do what you like, keep the copyright notice, no warranty | Do what you like, but if you change it and let others use it over a network, you must publish your changes under the same licence |
| A company hosts a changed, closed version as a paid service | Allowed | Not allowed without publishing the changes |
| Universities and others self-hosting | No questions asked | Usually fine, but some legal offices and many companies avoid AGPL software on principle |
| Reuse of parts (the R and Python packages, the design viewer, embedding in AmCAT or other tools) | Unrestricted | The other project must be compatible with the AGPL, which rules out permissively licensed projects taking the code |
| Changing your mind later | Easy: new versions can move to another licence | Hard: going to a more permissive licence needs every copyright holder's consent |

**The developers' recommendation: MIT.** AnnoTinder's aim is that
researchers use it, cite it and build on it, including from R and Python
and inside other tools. The risk the AGPL protects against (someone
selling a closed, improved AnnoTinder) is small for academic software,
and the AGPL's cost (institutions that won't touch it, friction for the
packages) is real. If that risk ever becomes real, later versions can
still move to the AGPL; the other direction is much harder.

The licence covers the code only. Running a server brings the
responsibilities in the other documents, whatever the licence.
