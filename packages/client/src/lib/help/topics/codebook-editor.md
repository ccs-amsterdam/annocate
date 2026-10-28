---
title: The codebook editor
section: Codebook
order: 1
summary: The item tree, the item form, the preview, errors and warnings, saving, undo, reverting, backups and co-editors.
---

The **Codebook** tab is where you write the codebook: the questions,
unit loops, conditions and end items, in the order coders meet them. This
page explains the editor itself. What the items mean is on their own pages:
[Questions](questions.md), [Unit loops](unit-loops.md),
[Conditions](conditions.md) and [Ending a session](end-items.md).

From top to bottom, the tab has:

- the **toolbar**: the number of issues and warnings, **Visual** or
  **JSON**, undo and redo, **Revert**, **Versions**, **Save** and
  **Publish**;
- a **banner** saying which version you are editing and whether coders use
  it (see [Preview, save and publish](previewing-and-publishing.md));
- the editor: the **tree** of items on the left, the selected **item** on
  the right and, on wide screens, a **preview** of that item in a third
  column.

## The tree

The tree shows every item, indented under the loop or condition it is in.
Its icon shows what it is: a question has the icon of its answer type
(hover over an icon to see the type), a loop a circular arrow, a condition
a branch, an end item an exit arrow. A loop shows its label (or *Unit loop*)
and which units it hands out (*all units*, *part_1, shared*, or *2 coder groups*
for a loop with two [coder groups](coder-groups.md), ...); a condition shows
its condition in words (*if age < 18*), or its label if you gave it one.

Click an item to open it on the right. A loop's row has two extra buttons
that open the loop on its **Layout** or its **Units** tab.

Two marks can appear after an item:

- an **amber dot**: the item has unsaved changes;
- a **red icon**: the item has an issue (hover over it to read it).

## Adding items

Hover over a row and click the **+** at its right. A new item goes **below
that row**: after the item, or for a loop or condition, at the top of what
is inside it. Then choose the type: **Question**, **Unit Loop** (only
outside loops: loops can't be nested), **Condition** or **End** (an
[end item](end-items.md)).

Below the last item of a loop or condition, "below" could mean two places:
still inside, or after the loop. Then the menu first asks **Where?**, for
example **After tone** or **After News articles**. Each place a level
further out is marked with one more outdent icon, so you can see how far
out it goes. An empty loop or condition offers **Inside** it and **After**
it. While you point at a place, a line in the tree shows where the item
will go.

In an empty codebook, click **Add item** above the tree.

New questions are called `question_1`, `question_2`, ... and start as
**Confirm** questions; rename them and choose the answer type. New end
items are called `end_1`, ... and start as **Screened out (not eligible)**.
New loops and conditions start empty: add their items with their own **+**.

> To put an item at the very top of the codebook, add it below the first
> item and then move it to the top (below).

## Moving and deleting

Tick the box in front of one or more items (it appears when you hover over
a row). Ticking a loop or condition takes everything inside it along.
Above the tree you now see how many items are selected, with:

- **Delete**: deletes the ticked items and everything inside them, after
  asking once.
- **Move**: each row's **+** turns into an arrow (**Move below this
  item**). Click it on the row you want the items below; where that is
  ambiguous, it asks where, as when adding. **Move to the top** puts them
  at the top of the codebook. The arrow only shows where the items may go:
  a span question, for example, can't leave its loop.
- The **×** (or **Esc**) clears the selection; **Cancel** (or **Esc**)
  stops moving.

Moved items keep their order. Undo (below) takes back a move or delete.

## The item form

The right column shows the selected item, with **Item Type** at the top and
three views:

- **Form**: the item's settings, with a **Help** button next to the main
  fields. Problems show in red under the field they are about; warnings in
  amber.
- **JSON**: the same item as JSON, for copying settings or editing
  quickly. Loops and conditions are shown without their items (those are
  items of their own). Your edit is applied as soon as it is valid JSON
  that the editor can show; until then a red line says **Not applied:**
  and why. **Format** tidies it up.
- **Preview**: how the item looks to coders, with your unsaved changes.

On screens at least 1500 pixels wide the preview is always shown, in a
third column, and the **Preview** view is gone.

### The preview

For a question outside a loop, the preview shows the question. For a loop,
or a question in one, it shows a unit of the job with the loop's layout,
and controls above it:

- **Unit**, with arrows: step through the job's units, to check the layout
  with short, long and odd ones.
- **On screen**: the question coders are at. It matters for layouts that
  change while coders go through a unit's questions (`::: from`, see
  [Showing parts conditionally](template-blocks.md)).
- A picker for each question that the layout uses, with its options and
  *(no answer)*: try how the layout looks after each answer.

This preview shows a single item. To try the whole job as a coder, use the
**Preview** tab (see
[Preview, save and publish](previewing-and-publishing.md#previewing)).

## Errors and warnings

The editor checks the codebook as you type. The toolbar counts the
results:

- **issues** (red): things that must be fixed before you can preview or
  publish, such as a duplicate name, an empty loop, or a reference to a
  question that doesn't exist (yet) at that point.
- **warnings** (amber): things to check, which don't block anything, such
  as `$unit.byline` while the job's units have no field `byline`. Units
  may be uploaded later, so that is not an error.

Click a count to see the list; click a line to open the item it is about.
Inside a loop's form, a red dot on the **Layout** or **Units** tab shows
which tab has a problem.

You can **save** with issues: a draft is work in progress.

## Saving, undo and revert

- **Save** stores the codebook as the draft. You can save at any time; see
  [Preview, save and publish](previewing-and-publishing.md#saving).
- **Undo** and **Redo** (the curved arrows) step through your last 100
  changes since you opened the codebook. Changes less than a second apart
  count as one step, so a typed word is undone at once.
- **Revert** goes back to the last save. Its menu lists the items you
  changed under **Revert item**: pick one to undo just that item (an item
  you added is removed: *new: removes it*). **Revert all changes** undoes
  everything since the last save. A revert is itself a step you can undo.

If you leave the **Codebook** tab with unsaved changes, a dialog asks
whether to **Save changes**, **Discard changes** or **Cancel**. Your
browser also asks before you close or reload the page.

## Backups in your browser

A second after each change, the editor copies your unsaved changes to your
browser's storage. If the browser closes or crashes, the next time you open
AnnoTinder in that browser a banner says **You have unsaved codebook
changes**, for which job and from when:

- **Continue editing** opens the codebook with your changes, still unsaved:
  look them over and save.
- **Discard** throws them away.

There is one backup at a time (the codebook you were last editing), in this
browser only. The backup is removed when you save or discard your changes.
It is a safety net, not a replacement for saving.

## Working with co-editors

Everyone with access to the job (see [Working together](working-together.md))
edits the same draft. Your unsaved changes
are yours alone; once you save, others see them when they open the
codebook.

AnnoTinder doesn't show who else is editing right now. If someone saved the
draft while you were editing, your save is stopped and a dialog says who
saved it and when:

- **Save mine over theirs** saves your version in place of theirs: the
  changes they saved are lost.
- **Discard mine, load theirs** throws away your unsaved changes and opens
  the saved draft.

To avoid this, agree who edits when, and save often.

## The whole codebook as JSON

**JSON** in the toolbar (next to **Visual**) shows the whole codebook as
one JSON document: useful for an overview, for copying a codebook between
jobs, or for larger edits such as renaming many things at once. The editor
completes property names, checks the structure, and explains a property
when you hover over it. **Fold details** collapses the details of
questions and layouts so that only the structure remains; **Unfold all**
opens everything again; **Format** tidies the layout.

As in the item view, an edit is applied as soon as it is valid; until
then **Not applied:** says why. The issues and warnings counts work as in
the visual editor.
