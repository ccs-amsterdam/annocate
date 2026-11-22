---
title: The design editor
section: Editor
order: 1
summary: The item tree, the item form, the preview, errors and warnings, saving, undo, reverting, backups and co-editors.
---

**Design** is where you write the design. From top to bottom:

- the **toolbar**: issue counts, **Visual** or **JSON**, undo and redo,
  **Revert**, **Export** (the design as a document, e.g. for an appendix),
  **Versions** and **Save** (deploying is on **Deploy**);
- a **banner** saying which version you edit (see
  [Preview, save and deploy](previewing-and-publishing.md));
- the **tree** on the left, the selected item's **form** on the right and,
  on wide screens, a **preview** in a third column.

## Above the tree

- **Title shown to coders**: edit it in place. The study's own name stays
  private.
- **Coder unit assignments**: who codes and how they get in (see
  [Links](links.md#coder-unit-assignments)).
- **URL parameters**: values a link carries (see
  [URL parameters](session-parameters.md)).
- **Display**: fixed or responsive layouts, and light or dark (see
  [How answers are laid out](answer-layouts.md#fixed-or-responsive)).

## Items

The tree lists the **items**, in the order coders meet them:

- a **Question** or **Computed variable** (such as a
  [random condition](random-condition.md)), asked or drawn once per coder;
- a **Block (if/else)**: items grouped, with an optional label and
  condition (see [Blocks and conditions](conditions.md));
- a **Unit loop**: questions asked for every unit (see
  [Unit loops](unit-loops.md)).

Blocks and loops can have a condition, so only some coders get them. An
[end item](end-items.md) goes in a block (e.g. one with a condition), not
at the top level.

**Add item** above the tree adds a **Question**, **Computed variable**,
**Block (if/else)** or **Unit loop** **At the end** or **At the start**. A
new block starts empty.

## The tree

The items before, between and after unit loops are grouped in a lightly
tinted card; each unit loop is its own card. A block has a coloured bar on
its left and lines up with the items around it.

Each item shows an icon for its type (a question: its answer type). A loop
shows its label and which units it hands out. A block shows its label
and/or its condition (_if age < 18_); without either it says **Block**. A
block with a condition has an **Add else items** button on its row; its
**Else** part shows under its items once it has items.

Below the tree, **At the end** is what coders see after the whole study,
and where they go next (see [Ending a session](end-items.md)).

Marks after an item: an **amber dot** for unsaved changes, a **red icon**
for an issue (hover to read it).

## Adding items

1. Hover over a row and click **+** at its right.
2. Where there is more than one place (e.g. below the last item of a
   loop), choose **Where?**: **After tone**, **After News articles**, ...
   A line in the tree shows the place.
3. Choose the type: at the top level **Question**, **Computed variable**,
   **Block (if/else)** or **Unit loop**; in a block **Question**,
   **Computed variable**, **Block (if/else)** or **End**; in a loop
   **Question**, **Block (if/else)** or **End**.

The new item goes below the row (for a loop or block: at the top inside
it). New questions are `question_1`, ... and need an answer type; new end
items start as **Screened out**. Loops can't be nested or put in a block.

## Moving and deleting

Tick the box in front of items (it appears on hover); a loop or block
takes its contents along. Then:

- **Delete**: after asking once.
- **Move**: click the arrow on the row to move them below, or **Move to
  the top**. Arrows only show where the items may go.
- **×** or **Esc** clears the selection; **Cancel** stops moving.

Undo takes back a move or delete.

## The item form

Three views:

- **Form**: the settings, with **Help** buttons. Problems in red under
  their field, warnings in amber.
- **JSON**: the item as JSON. Applied as soon as it is valid; until then
  **Not applied:** says why. **Format** tidies it.
- **Preview**: the item as coders see it, with unsaved changes (on screens
  wider than 1500 pixels, always shown in a third column).

### The preview

For a loop or a question in one, the preview shows a unit with the loop's
layout. Above it:

- **Unit** with arrows: step through units (try short, long and odd ones);
- **On screen**: which question coders are at (for layouts that change,
  see [Showing parts conditionally](template-blocks.md));
- a picker per question the layout uses, to try each answer.

To try the whole study, use **Preview** at the top right.

## Errors and warnings

The toolbar counts:

- **issues** (red): must be fixed before preview or deploy, e.g. a
  duplicate name, an empty loop, a reference to a question that isn't
  asked yet, a unit field the design doesn't declare;
- **warnings** (amber): worth checking, block nothing.

Click a count for the list, and a line to open its item. A red dot on a
loop's **Layout** or **Units** tab shows where the problem is. You can
save with issues.

## Saving, undo and revert

- **Save** stores the draft (see
  [Preview, save and deploy](previewing-and-publishing.md#saving)).
- **Undo** / **Redo**: the last 100 changes.
- **Revert**: back to the last save, for one item (**Revert item**) or
  everything (**Revert all changes**).

Leaving the tab with unsaved changes asks to **Save changes**, **Discard
changes** or **Cancel**.

## Backups in your browser

Unsaved changes are copied to your browser's storage. After a crash, a
banner **You have unsaved design changes** offers **Continue editing**
(then save) or **Discard**. One backup, in this browser only: a safety
net, not a replacement for saving.

## Working with co-editors

Everyone with access (see [Working together](working-together.md)) edits
the same draft; your unsaved changes are yours alone. If someone saved
while you were editing, your save stops and asks:

- **Save mine over theirs**: their saved changes are lost;
- **Discard mine, load theirs**.

Agree who edits when, and save often.

## The whole design as JSON

**JSON** in the toolbar shows the whole design as one document, with
completion and explanations on hover: for an overview, copying between
studies, or renaming many things at once. Parts: `public` (title),
`session` (invitations, URL parameters, display, the end) and `items`.
**Fold details** shows only the structure; **Format** tidies it.
