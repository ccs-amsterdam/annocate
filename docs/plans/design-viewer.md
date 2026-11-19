# Plan: viewing a design from its file (reproducibility)

The design file exists (§1); the viewer does not.

A study is reproducible when anyone with the design file can see what coders
saw, years later, without an account or a server. So:

1. A **design file** (`design.json`): the whole design, plus which format
   and which client it was made with.
2. A **design viewer**: a page that runs purely in the browser. Drop a
   design file on it and go through the study as a coder would.
3. Optional extras in the viewer, in this order:
   - the units (the export's unit versions), shown in the loops;
   - the answers (the export's annotations), to review a coder's answers
     in the view that coder actually saw.
4. **Versioned viewers**: every release's viewer stays available. A design
   file says which version it ran on, and can be opened in that version.

## 1. The design file

```jsonc
{
  "format": "annotinder-design",
  "formatVersion": 1,          // the design schema (contracts); bumped on breaking changes
  "client": { "release": "1.4.0", "commit": "a1b2c3d" }, // the client the study ran on: the release for people, the commit for exactness
  "exportedAt": "2026-11-02T10:00:00Z",
  "name": "Pilot",
  "design": { "items": [...], "session": {...}, "units": { "fields": [...] } }
}
```

- **Where it comes from** (built: contracts `version.ts`, `RELEASE`,
  `DESIGN_FORMAT_VERSION`, `DesignFileSchema`):
  - Every design version can be downloaded from the editor (Export ›
    Design file).
  - The results export includes `designs/v<n>.json` for each deployed
    design version that has answers.
- **The client version per deployment:** the server records the release
  and commit (`ANNOTINDER_COMMIT`) a deployment ran on. A server upgrade
  during a study therefore shows up in the deploy history and in the
  export, so "this study ran on 1.4.0" is a recorded fact. This needs real
  release versioning: the packages are at `0.0.0`.
- **Two different versions:**
  - `formatVersion` decides whether a viewer can read the file at all; the
    viewer validates the file with its contracts.
  - `client` is the version the study looked like, and where to open it to
    see it exactly.

## 2. The viewer

- **A static page with no server**, built from the coding client:
  `JobRunner` with a **local coder API** (an in-memory `CoderApi`) instead
  of the HTTP one. The researcher preview runs a real server session, so
  this local API is the main new piece. It needs to:
  - serve the session and the coder codebook (contracts `toCoderItems`,
    which the server uses too);
  - hand out units in file order. Distribution is not emulated: no sets,
    leases or quotas. A loop shows its units, or placeholders, one after
    another. The viewer picks session values (a coder, conditions, link
    and URL parameters) from a picker;
  - keep answers in memory. Gold and practice feedback can run locally,
    since the answer-key logic is pure contracts code;
  - end where the design ends.
- **Placeholder units:** made from `units.fields`, e.g. a text field shows
  "Text of field *body*", an image field shows a grey box, and so on.
  That's enough to see layouts, questions and flow.
- **Units from a file:** the export's unit versions (CSV or JSON), matched
  to the declared fields.
- **Answers from a file (secondary):** pick a coder from the export's
  annotations. The viewer serves that coder's units, in that coder's
  order, with their answers filled in, read-only. Answers are matched by
  unit version, so the coder sees exactly the text they coded.
- **No upload:** the file stays in the browser, so there are no data
  protection questions.

## 3. Versioned viewers

- Each release builds the viewer as a static bundle at its own address on
  our own domain, `viewer.annotinder.org/1.4.0/`, with a `latest/`. The bundles are
  immutable and never rebuilt.
- **Where they are hosted:** releases are built in CI, so the bundles can
  go to GitHub Pages or any static host for free. The release assets also
  carry the viewer as a zip, for archiving with the data (OSF, Zenodo).
- **Opening a file:**
  - The viewer reads `formatVersion` and `client`.
  - If it can't read the format, it says so and links to the version the
    file names.
  - If it can read the format but is a different release, it offers "Open
    in 1.4.0 (what coders saw)".
- **A single-file viewer, on request:** one self-contained `viewer.html`
  per release (a few MB), as a download per release or an option in the
  results export, so archived data can carry its own viewer and not depend
  on our hosting.

## 4. Compatibility rules this creates

- After the first release, the design format (contracts) gets a
  `formatVersion`, and breaking changes bump it.
- Older files still open in their own viewer version, so new versions
  don't have to read every old format. An upgrade step (`v1 → v2`) is
  optional: write one when it's cheap. Before the first release there is
  no migration code.
- The coding client's rendering is part of the release, so even a design
  with an unchanged format can look different in a later version. That's
  why the version a study ran on is recorded (§1) and opened (§3).

## 5. Importing a design into a new study

A design file can also start a study: "New study from a design file"
makes a study with that design as its draft. Before any units are
uploaded, it shows what they need (the declared unit fields with their
types, the set columns and their values), so the upload can be checked
against it.

## 6. Steps

1. Local coder API and the viewer page (`/viewer`, inside the app, no
   login), with placeholder units.
2. Units from the export file.
3. Release build: a versioned static viewer and the release zip, plus the
   "open in version" flow.
4. Answers from the export: per coder, read-only.
5. Importing a design file into a new study (§5).
