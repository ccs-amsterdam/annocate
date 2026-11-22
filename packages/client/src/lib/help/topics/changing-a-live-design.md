---
title: Changing a design while coding runs
section: Editor
order: 7
summary: What happens to finished units, units in progress and earlier answers when you deploy a new design version during a study, and how to change things safely.
---

You can deploy a new version while coders work. Nothing they answered is
overwritten. Two rules explain the effects:

- **Answers are stored per question name**, with the design version.
- **A unit is finished when every question of its loop has an answer** in
  the current version (skipped counts). Add a question and finished units
  lack it.

## What each change does

| Change                                   | Units already finished                                         | Units to come             |
| ---------------------------------------- | -------------------------------------------------------------- | ------------------------- |
| **Question added** to a loop             | unfinished again: coders get them back and answer only the new question | asked             |
| **Question added** outside a loop        | asked once coders switch to the new version                     | asked                     |
| **Question removed**                     | answers stay in the data                                        | not asked                 |
| **Option value** removed or changed      | stay finished; old answers no longer fit (answer again on going back) | current options      |
| **Option label** changed                 | nothing changes                                                 | new label                 |
| **Answer type** changed                  | as a removed value                                              | new type                  |
| **Question renamed**                     | as removing it and adding a new one                             | asked under the new name  |
| **Text, instruction or layout** changed  | stay finished                                                   | new text                  |
| **Conditions or order** changed          | stay finished                                                   | new design                |
| **Units tab** of a loop changed          | coded units stay the coder's                                    | new rules                 |

Units and sets you change are drafts until deployed (see
[Set columns](sets.md)). The deploy dialog warns about removed values and
changed types; afterwards it says how many codings became unfinished.

### Units that become unfinished again

They count as unfinished in progress and for handing out units. Coders
get them back first, see their earlier answers and answer only what is
new (in a [shared queue](shared-queues.md) they return to the queue).
Coders who stopped don't come back; the new question stays empty for
them.

### Earlier answers in the results

Every row of `annotations.csv` has its `design_version` and unit version.
Removed or renamed questions keep their column, after the current ones.
Labels are those the coder saw. See [Downloading results](results.md).

## What working coders see

They switch to the new version when their answers are next saved, and
continue where they were. See
[What coders experience when you deploy](previewing-and-publishing.md#what-coders-experience-when-you-deploy).

## Resetting answers

To have units coded again (a question changed meaning, a coder
misunderstood), **reset** answers. They are kept for analysis but no
longer count: the units are unfinished again, also for the same coders.

- **Results › Coders** → **Reset answers…**: all coders;
- the reset icon in a coder's row: that coder;
- **Units**: select units → **Reset answers…**.

Then choose the questions (a whole loop, or some). Only loop answers can
be reset. To download them, tick **Include answers that were reset** on
**Results**.

## Advice

- **Pilot first**: changes are cheap before anyone codes.
- **Labels and texts can change; values can't.** Don't give a value a new
  meaning; add an option instead. See
  [Values and labels](design-values-and-labels.md).
- **Don't rename questions** once coding started.
- **Adding a question costs coders time**: finished units come back.
- **Write a version note** and report changes in your methods section.
- To undo a deploy, **Versions** → **Restore as draft** on the previous
  version, and deploy it.
