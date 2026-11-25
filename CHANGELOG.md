# Changelog

What changed for the people who use AnnoTinder: researchers, coders and
those who run a server. Server, client and contracts are released together
under one version.

## 0.9.0 (not yet released)

The first release: the version for the pilot. From this release on the
design format, the API, the export files and the database migrations are
kept stable: later versions add to them and say here what changes.

A database or a study export file (`.annotinder.gz`) from before this
release can't be used with it: start with an empty database
(`docs/hosting.md`, "Updating").

### For researchers

- Studies with annotation, survey questions and experiments in one design,
  made in the editor or through the API: units with fields, unit sets, unit
  loops (each with an id: `loop_1`, `loop_2`, …), practice and gold units,
  conditions.
- A design is checked strictly: a key the format doesn't know, or a name
  that can't be a column, is an error shown in the editor, not stored.
- Deploying keeps a version of the design and the AnnoTinder version it ran
  on. Coders' unsaved answers survive a new version.
- Results as a download (CSV or .xlsx) with documented column names that
  can't collide, and a results view with agreement.
- Who codes is a setting of the study: expert coders or a crowd, chosen when
  you create it and changed in its Settings until its first deploy, then
  locked. The editor offers only the invitation that fits.
- A Coders page lists a study's coders with their units, what is done and
  what remains; add coders (by id, or id and email), edit an email, copy a
  link, move units or delete a coder. A coder's id is fixed, an email can be
  changed (a coder with a new email signs in on a new device). Expert coders
  are made by researchers; a crowd's coders appear with their first session.
- In the download, `coders.csv` is the table of coders (also those who
  haven't started) and `sessions.csv` has one row per coder session.
- Coder links name a study by a random id. At most 5 sessions per coder id
  per study.
- Moving a study between servers: export and import a whole study.
- Deleting a study, or your own account, asks for a fresh login and for
  typing its name. Deleting data also removes stored result files.
- The API has one error shape (`{ error, code?, issues? }`), lists that are
  read in pages, and API keys for scripts (`docs/api/`).

### For coders

- Coding on a phone, tablet or computer, by touch, mouse or keyboard; the
  `/` key opens the keyboard commands on any keyboard layout.
- Answers are saved as you go. Without a connection the screen waits and
  says so; a closed tab loses no finished unit.
- Stop for now and continue later, on this device or another; quit; or quit
  and ask the researchers to delete your answers.
- Logging in is your choice where a study offers it, unless the study
  requires it (expert coders who sign in). A crowd is never required to
  sign in. The researchers don't see the
  address you chose to log in with.

### For those who run a server

- One Docker Compose file: the app, Postgres and a daily database dump; a
  step-by-step hosting guide and a smoke test (`docs/hosting.md`).
- Researcher login through an OpenID Connect provider, with a second factor
  for sensitive actions; registration by invitation, email domain or
  request; plans with limits per researcher, and whether a crowd's coders
  can sign in in their studies (off by default, set per plan; never
  required).
- The server doesn't start on settings that only fit development: with a
  database it needs `ANNOTINDER_SECRET` and `ANNOTINDER_PUBLIC_URL`.
- Rate limits, request size limits, a request log without query strings,
  and `/api/health` and `/api/ready` for monitoring.
- An "About this server" page (`/about`) with what you set: who runs the
  server, where it is hosted, a contact, the privacy statement and the
  terms of use.
- MIT licence.
