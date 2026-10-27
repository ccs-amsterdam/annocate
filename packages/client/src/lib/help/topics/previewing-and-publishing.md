---
title: Preview, save and publish
section: Getting started
order: 3
summary: Drafts and published versions, saving, the versions dialog, previewing a job, and what publishing does to coders who are at work.
---

A codebook goes through three stages: your **unsaved changes** in the
editor, a saved **draft** that you and your co-editors share, and a
**published** version that coders get. This works like Qualtrics or
REDCap: you edit a draft, and coders only see your changes once you
publish it.

| Stage | Who sees it | How you get there |
| --- | --- | --- |
| Unsaved changes | only you, in this browser | editing |
| Draft | you and your co-editors, and **Preview** | **Save** |
| Live version | coders | **Publish** |

Every saved version gets a number: v1, v2, ... Published versions can never
change again, so every answer stays linked to the exact version it was
given under.

## Saving

Click **Save** in the codebook editor's toolbar. You can save as often as
you like, also while the codebook still has issues: a draft is work in
progress. Previewing and publishing need a codebook without issues.

A banner under the toolbar always says what you are looking at:

| Banner | Means |
| --- | --- |
| **New codebook** | nothing is saved yet; the first save makes v1 |
| **Draft v3: not live yet** | you are editing the draft; coders use the live version (if any) until you publish it |
| **v2 is live: coders are using it** | you opened the live version and there is no draft. It can't be changed, so the button says **Save as draft**: your changes become a new draft, and coders keep using v2 |
| **Viewing v1, an older version** | a version from the history: read only |

If you leave the **Codebook** tab with unsaved changes, AnnoTinder asks
whether to **Save changes** or **Discard changes**. Unsaved changes are
also kept in your browser, in case it closes; see
[Backups in your browser](codebook-editor.md#backups-in-your-browser).

## The versions dialog

Click **Versions** in the toolbar to see every version, newest first. Each
has its number, its note, when it was created (a draft: when it was last
saved, and by whom), and a tag:

- **Live**: the version coders get.
- **Draft**: the version you are working on. There is at most one draft:
  the newest version, if it was not published.
- **In editor**: the version open in the editor now.
- **Has issues: fix them before publishing**: the version doesn't pass the
  editor's checks.

Its buttons:

| Button | What it does |
| --- | --- |
| **Edit** / **View** | opens the draft to edit, or another version to read |
| **Restore as draft** | copies an older (or the live) version into the draft. If there is a draft, its content is replaced, after you confirm. Then publish it to go back to that version |
| **Delete draft** | deletes the draft and everything saved in it since the live version, for all editors. It asks first, and can't be undone |

To go back to an earlier version, restore it as the draft and publish that.
Nothing is ever lost this way: the version you go back from stays in the
history.

## Previewing

Click **Preview Job** at the top right, or open the **Preview** tab. You
then code the job as a coder would, with the job's real units:

- The preview runs the **latest saved version**: the draft if there is one,
  otherwise the live version. A label above it says which (*Previewing v3
  (draft)*). Save first: unsaved changes are not in the preview.
- Nothing you answer is stored, and you don't show up as a coder in
  progress or results.
- **Mobile**, **Desktop** and **Full Width** switch the screen size. Pick a
  device under **Preset**, or type a width and height.
- **Reset preview session** starts the preview over, as a new coder.
- An end item's redirect is shown, but not followed.
- In a loop with **The invitation's units**, the preview gives you the
  units of the first invitation that has units.
- Assigned variables (random, balanced) are drawn for you as for any
  coder.

The preview needs a saved codebook with at least one item and uploaded
units. If the latest version has issues, the preview says so: fix them,
save, and open the preview again.

> The editor also has a preview of the selected item, which shows your
> unsaved changes at once. See [The codebook editor](codebook-editor.md).
> Use it while writing, and the full preview to try the whole job.

## Publishing

Click **Publish** in the toolbar. Unsaved changes are saved first. The
**Publish** button is greyed out while the codebook has issues, or when the
version in the editor is already live and unchanged.

The dialog shows:

- **Warnings** about answers that no longer fit, for example when an option
  value was removed or a question changed type: coders' earlier answers
  with that value no longer fit the question.
- **Changes since v2**: every item that was added, removed, changed or
  moved, compared with the live version.
- **What changed?**: a note for the version history. It is filled in with
  a summary of the changes; rewrite it in your own words if you like
  ("Added a question about sources").
- **What happens**: what publishing does (below).

Click **Publish v3** to make the draft live. Afterwards a second dialog may
list warnings from the server, for instance that a loop gained questions
and finished units become unfinished again. See
[Changing a codebook while coding runs](changing-a-live-codebook.md).

The first publish is what lets coders start: until then, coders who open
an invitation link can't begin.

## What coders experience when you publish

Coders who are working keep the version they started with until their
answers are next saved: when they finish the unit they have open, or answer
a question outside a loop. Then AnnoTinder loads the new version, as after
a reload, and they continue where they were:

- They stay on the unit they had open, with their answers to it, as far as
  those still fit the new version. A question the new version added is
  asked; otherwise they give their last answer once more, to save the unit.
- Answers they gave earlier stay linked to the version they were given
  under.
- New coders start with the new version.

So you can publish while people are coding. Still, small, deliberate
changes are best: every change during a study is a change in the
instrument. Write a clear version note, so you can later tell which coders
worked with which version. The results download has the codebook version of
every answer.
