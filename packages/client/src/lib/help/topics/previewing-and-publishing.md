---
title: Preview, save and deploy
section: Getting started
order: 3
summary: Drafts and deployed design versions, saving, the versions dialog, previewing a study, and what deploying does to coders who are at work.
---

You edit a draft; coders only see your changes once you deploy.

| Stage           | Who sees it                          | How            |
| --------------- | ------------------------------------ | -------------- |
| Unsaved changes | only you, in this browser            | editing        |
| Draft           | you, your co-editors, and **Preview** | **Save**       |
| Live version    | coders                               | **Deploy changes** |

Every saved version gets a number (v1, v2, ...). Deployed versions never
change, so every answer stays linked to the version it was given under.

**Units and sets are drafts too.** Uploading, replacing or deleting units
and changing sets only reaches coders when you deploy. A bar at the top of
the study says what isn't deployed yet.

## Saving

Click **Save** in the editor's toolbar, as often as you like, also with
issues. Preview and deploy need a design without issues.

The banner under the toolbar says what you are looking at:

| Banner                              | Means                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------ |
| **New design**                      | nothing saved yet; the first save makes v1                               |
| **Draft v3: not live yet**          | you edit the draft; coders use the live version until you deploy         |
| **v2 is live: coders are using it** | no draft; **Save as draft** makes your changes a new draft               |
| **Viewing v1, an older version**    | read only                                                                |

Leaving **Design** with unsaved changes asks to save or discard them.
See also [Backups in your browser](design-editor.md#backups-in-your-browser).

## The versions dialog

**Versions** in the toolbar lists every version, tagged **Live**,
**Draft** (at most one), **In editor** or **Has issues**.

| Button               | Does                                                             |
| -------------------- | ---------------------------------------------------------------- |
| **Edit** / **View**  | open the draft to edit, or another version to read               |
| **Restore as draft** | copy an older version into the draft (replacing it, after asking) |
| **Delete draft**     | delete the draft for all editors; can't be undone                |

To go back to an earlier version: restore it as draft, then deploy.

## Previewing

Click **Preview** at the top right to code the study as a coder, with the
real units:

- It runs the **latest saved version** (the draft, else the live one).
  Save first.
- Nothing is stored; you don't appear as a coder.
- **Mobile**, **Desktop** and **Full Width** switch the screen size;
  **Preset** picks a device.
- **Reset preview session** starts over as a new coder.
- **Preview as** chooses which coder you are (with specific coders) and
  URL parameter values.
- Redirects are shown, not followed.

The preview needs a saved design without issues and uploaded units. The
editor's item preview shows unsaved changes at once: use it while writing.

## Deploying

The editor only saves: deploy on **Deploy › Deploy changes** (the editor's
banner and the "Not deployed yet" bar on other pages link there). It has a
checkbox for the saved **design** draft and for the draft **units and
sets**; what you leave out stays a draft. It shows:

- **Warnings** about earlier answers that no longer fit (a removed option,
  a changed type);
- **Changes since** the live version;
- **What changed?**: a note for the history (prefilled; rewrite it if you
  like).

The first deploy lets coders start and makes the study's
[links](links.md). See also
[Changing a design while coding runs](changing-a-live-design.md).

## What coders experience when you deploy

Coders at work switch to the new version the next time their answers are
saved, and continue where they were:

- at the first unit not saved yet, with their answers as far as they still
  fit;
- earlier answers stay linked to their version;
- new coders start with the new version.

You can deploy while people code, but keep changes small and write a clear
version note: every change is a change in the instrument. The results
have the design version of every answer.
