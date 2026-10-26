# Plan: codebook drafts and publishing

## Problem

The admin UI presents codebook versions in a way that doesn't match what the
servers do, and leaves users stuck:

- The versions dialog says the *latest* version is "active" and used by
  coders. In fact coders run the **deployed** codebook
  (`deployment.codebookId`); creating or saving a codebook never changes
  that. The admin UI has no way to deploy at all (`PUT /deployment` exists,
  but only the seed and the API call it).
- A codebook is frozen (`immutable`) when it is **deployed**, not when
  annotations come in, as the dialog claims.
- Opening a frozen codebook shows a hardly readable grey "Immutable" chip, and
  the editor lets you make changes you then can't save. Nothing tells you how
  to get to an editable version ("Versions" → "New Version" / "Duplicate").

## Model

Same approach as Qualtrics (edit a draft, publish it) and REDCap (draft mode in
production, with a review of the changes before they go live).

- **Live**: the version coders get (the deployment's codebook). At most one.
  Frozen, because annotations refer to it (`codebookId` on every annotation).
- **Draft**: the latest codebook, if it isn't frozen. At most one; it is what
  the editor and Preview work on.
- **History**: every other version. Read only; can be restored as the draft.

"Immutable" stops being something the user runs into: it is simply what
history is. The UI says **publish** rather than deploy.

The server API stays as it is; everything above is derived from
`GET /codebook` and `GET /deployment`:

| | derived as |
|---|---|
| live | `deployment?.codebookId` |
| draft | the latest codebook, if `!immutable` |
| current (opened by default) | draft ?? latest |

### Mid-session coders (decision A)

When a new version is published, coders who are working **switch to it at
their next unit**. Answers they already gave stay linked to the version they
were given under. This is what the server already does: `PUT /deployment`
bumps the version and refreshes the runtime, which applies the new spec on
the coder's next request (`DeploymentRuntime.refresh`).

### Version notes instead of names

Codebooks had a required `name`, copied to every new version, so the history
was a list of identical names. Versions are now identified by number (order
of creation), and carry an optional `note` saying what changed
(`CodebookWriteSchema.note`, null when unset). The publish dialog asks for it,
prefilled with a summary of the changes (`summarizeChanges` in
`codebook/diff.ts`). Coders never saw the name. (The dev database was rebuilt
without the old column.)

## Phase 1: admin UI (client only)

1. **API**: `getDeployment` / `putDeployment` on `ResearcherApi`, and
   `useDeploymentQuery` / `usePublishMutation` in `admin/queries.ts`
   (publishing invalidates the deployment and the codebook list, since the
   published version becomes frozen).
2. **Pure helpers** (unit tested):
   - `codebook/versions.ts`: live / draft / current ids, version numbers, and
     each version's status (`live`, `draft`, `history`).
   - `codebook/diff.ts`: changes between two codebooks (items added, removed,
     changed, moved to another container), for the publish dialog.
3. **Editor modes** (`CodebookEditor` gets `mode`):
   - `draft`: editable; **Save** updates the draft.
   - `live`: the current version is live and there is no draft. Still
     editable: **Save as draft** creates a new codebook (the draft), and
     coders keep using the live version until it is published.
   - `history`: an older version; read only (tree, YAML and form).
4. **Status banner** above the editor, coloured and readable, saying what
   you're looking at and what to do next:
   - draft: "Draft v4, not live yet. Coders are using v3." [Discard draft]
     (or "Nothing is live yet: coders can't start this job." if never published)
   - live: "v3 is live: coders are using it. Your changes are saved as a new
     draft; coders keep v3 until you publish."
   - history: "Viewing v2, an older version (read only)." [Restore as draft]
     [Back to current]
5. **Publish** button in the editor's action bar (draft, or live with
   unsaved changes). Saves first if needed, then a confirmation dialog:
   - the changes against the live version (from `diff.ts`);
   - what happens: coders switch at their next unit; given answers stay
     linked to the old version; the new version becomes read only;
   - after publishing, the server's `warnings` (e.g. a loop gained questions,
     which reopens finished units).
6. **Restore as draft** (history banner and versions dialog): copies that
   version into the draft, replacing the current draft after a confirm.
7. **Versions dialog**: badges Live / Draft, correct explanation text,
   "View" and "Restore as draft" instead of "Open" / "Duplicate" / "New
   Version".
8. **Unsaved changes dialog**: its "Save" button currently only closes the
   dialog. Make it save, then continue.
9. **Preview**: say that it runs the draft (or the live version if there is
   no draft).
10. Docs: `docs/client.md` §7.

The demo job stays as seeded: v1 is live, so a new user sees the live banner
and gets a draft on their first save.

## Phase 2: coder client follows a new version

The server switches at the next request, but the coder's browser keeps
the codebook it loaded with the session (`JobManager` calls `getSession`
once), so a coder could answer questions that no longer exist or miss new
ones. Add the deployment `version` to the session and unit responses; when
it changes, the client reloads the session (codebook) before showing the next
unit.

## Phase 3 (later)

- Server-side dry run of a publish, so the reopen warnings show *before*
  confirming instead of after.
- Pausing a job (`deployment.active = false`) from the UI.
