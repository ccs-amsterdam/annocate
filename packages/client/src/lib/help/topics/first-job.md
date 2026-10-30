---
title: Your first job
section: Getting started
order: 2
summary: Step by step from an empty job to coders at work - units, a small codebook, a layout, preview, publish, invite, results.
---

This page walks you through a complete, small job: coders read news
articles and say what each one is about and how negative or positive it is.
It takes about fifteen minutes. Every step links to a page with more detail,
but you don't need those to get through it.

You need a small CSV file with a few articles. Save this as `articles.csv`
(any spreadsheet program can save a CSV, or copy it into a text editor):

```text
id,headline,text
a001,Storm hits the coast,"Heavy rain and wind caused flooding in several towns on Tuesday."
a002,Minister resigns,"The minister of finance stepped down after weeks of criticism."
a003,Local team wins cup,"Thousands celebrated in the city centre after the final."
```

## 1. Create a job

> To look around first, choose **Create new job** → **From an example** on
> the **Jobs** page: it makes a ready job (units, a published codebook, an
> invitation, and often example answers) to try and change. Its overview
> says what to try.
>
> **Create new job** → **Guided setup** does steps 1 to 3 below in one go: say
> whether you annotate units, ask questions or run an experiment, upload
> the units, choose who codes what, and name your questions. The job then
> opens in the codebook editor, with each question marked *to specify*:
> choose its answer type there (step 3), then continue with step 4.

1. On the **Jobs** page, click **Create new job**, then **Empty job**.
2. Give it a name under **Job Name**, for example *News pilot*, and click
   **Create Job**.

The job opens on its **Overview** tab. The tabs along the top group the
steps below: **Design** (the **Codebook** and **Units**), **Deploy**
(**Invitations** and **Coders**), **Results**, and the job's **Settings**.
**Preview Job** at the top right tries the job as a coder.

## 2. Upload the units

1. Open the **Units** tab and click **Upload CSV**.
2. Click **Choose a CSV file** and pick `articles.csv`.
3. The `id` column's type should be **unit id**.
4. Click **Use column names**: the `headline` and `text` columns become the
   fields `headline` and `text`.
5. Check the preview, then click **Upload 3 units**.

More in [Uploading units](uploading-units.md).

## 3. Write the codebook

Open the **Codebook** tab. On the left is the codebook as a tree of items;
on the right the form of the item you select.

**A unit loop.** Questions about units go inside a *unit loop*: the loop
asks its questions for every unit a coder gets.

1. Click **Add item**, then **Unit Loop**.
2. In the loop's form, type a **Label (optional)** such as *News articles*.
   Coders see it in their menu.

**The first question.**

1. Hover over the loop's row in the tree and click the **+** at the right.
   The menu asks *where*: choose **Inside News articles**, then
   **Question**.
2. Change **Item Name** to `topic`. The name is the question's column in
   your results.
3. A new question has no answer type yet (it is marked *to specify*): set
   **Answer Type** to **Nominal (categories)**.
4. Under **Question**, type *What is this article mainly about?*
5. Under **Options**, change the labels to *Politics* and *Disasters*, and
   click **+ Add option** for a third, *Sports*. The values (what is stored)
   follow the labels: `politics`, `disasters`, `sports`.

**The second question.**

1. Hover over `topic` in the tree, click its **+** and choose
   **After topic**, then **Question**.
2. Name it `tone`, set **Answer Type** to **Ordinal (ordered options)**,
   and type the question *How negative or positive is the article?*
3. Give the three options the labels *Negative*, *Neutral* and *Positive*.
   Their values are 1, 2 and 3.

The tree now looks like this:

```text
News articles      the unit loop
  ├ topic          nominal: politics, disasters, sports
  └ tone           ordinal: negative (1), neutral (2), positive (3)
```

See [The codebook editor](codebook-editor.md) and
[Questions](questions.md) for everything the editor can do.

## 4. Say how a unit is shown

Select the loop in the tree. Its form has two tabs:

- **Layout**: how a unit is shown to coders. In the sketch, click the
  title and choose `headline`, then the body and choose `text`. This makes
  the template:

  ```template
  # $unit.headline

  $unit.text
  ```

  `$unit.headline` is filled in with each unit's headline. For more than a
  title, byline and body (styles, blocks, conditions), click **Advanced**
  and write the template yourself. See [Layout templates](layout-templates.md).
- **Units**: which units coders get. A new loop has none chosen yet (it is
  marked *to specify*): under **Who codes which units**, choose **Everyone codes
  everything**, with an empty unitset: every coder gets every unit. That is what
  we want here. See [Handing out units](unit-distribution.md).

Try the layout right here, with your own text:

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
---
# $unit.headline

$unit.text
```

## 5. Save and preview

Click **Save** above the tree. Your codebook is now saved as a **draft**
(version 1, *v1*): you and your co-editors see it, coders don't. If the
toolbar shows a red count of issues, click it to see what to fix; you can
save with issues, but not preview or publish.

Click **Preview Job** at the top right. You
now code the job as a coder would, with your real units, on a phone-sized
screen (switch to **Desktop** for a larger one). Nothing you answer in a
preview is stored. Check that the questions read well and the units look
right; go back to the **Codebook** tab to change things, save, and preview
again.

## 6. Publish

On the **Codebook** tab, click **Publish**. The dialog says what publishing
does; click **Publish v1**. Coders can now start. You can keep improving the
codebook: edits go into a new draft until you publish again. See
[Preview, save and publish](previewing-and-publishing.md).

## 7. Invite coders

1. Open the **Invitations** tab.
2. Under **Create invitation link**, type a label (e.g. *Pilot coders*)
   and click **Create**.
3. Click **Copy link** in the table and send the link to your coders.

Anyone who opens the link starts their own session. See
[Invitations](invitations.md) for personal links, limits and participant
ids, and [What coders see](coder-experience.md) for the coder's side.

> Test the job with **Preview**, not with the invitation link. Opening the
> link yourself makes you a coder of the job, and your answers end up in
> the results.

## 8. Follow progress and download results

- The **Overview** tab shows how many coders started, answers per day, and
  progress per loop. The **Coders** tab has a row per coder. See
  [Following progress](coders-and-progress.md).
- On the **Results** tab, click **Download zip** for all answers as CSV
  files, with a row per unit and coder in `annotations.csv`. See
  [Downloading results](results.md).

## Next steps

Before a real study, pilot the codebook with two or three coders on the
same units, compare their answers, and sharpen the questions and options
where they disagree. [Designing an annotation task](design-annotation-tasks.md)
has more advice. From here you can add conditions (questions only asked
when an earlier answer says so), text selection (span questions), or divide
units over coders.
