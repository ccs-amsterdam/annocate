---
title: Your first study
section: Getting started
order: 2
summary: Step by step from an empty study to coders at work - units, questions, coders, preview, deploy, link, results.
---

A small study in about fifteen minutes: coders read news articles and say
what each is about and how positive it is. Each step links to more detail,
but you don't need it to get through.

To follow along, save this as `articles.csv`:

```text
id,headline,text
a001,Storm hits the coast,"Heavy rain and wind caused flooding in several towns on Tuesday."
a002,Minister resigns,"The minister of finance stepped down after weeks of criticism."
a003,Local team wins cup,"Thousands celebrated in the city centre after the final."
```

## 1. Create a study

On the **Studies** page, click **Create new study** and choose:

- **Empty study**: type a name and click **Create Study**. Follow the
  steps below.
- **From an example**: a ready study to look around in.

The study opens on **Overview**. The other pages: **Design**, **Units**,
**Deploy**, **Links**, **Results** (with **Coders**) and **Settings**;
**Preview** is at the top right.

## 2. Upload the units

1. **Units** → **Upload CSV** → **Choose a CSV file**.
2. Check that `id` has the type **unit id**, and click **Use column
   names** (`headline` and `text` become fields).
3. Click **Upload 3 units**.

More: [Uploading units](uploading-units.md).

## 3. Write the questions

Open **Design**. Left: the design as a tree of items. Right: the
form of what you select.

1. Click **add item +** on the **Start** row → **Unit loop**. A unit loop asks its questions for
   every unit. Give it a **Label**, e.g. _News articles_.
2. Hover over the loop, click **+** → **Inside News articles** →
   **Question**.
3. **Item Name**: `topic` (its column in the results). Choose the answer
   type **Categories**. **Question**: _What is this article mainly
   about?_ **Options**: _Politics_, _Disasters_, _Sports_.
4. Hover over `topic`, click **+** → **After topic** → **Question**. Name
   it `tone`, choose **Ordered options**, ask _How positive is the
   article?_ with _Negative_, _Neutral_, _Positive_ (stored as 1, 2, 3).

Questions asked once per coder, such as consent or background questions,
go before or after the loop (**add item +** → **Question**).

More: [The design editor](design-editor.md), [Questions](questions.md),
[Choosing a question type](question-types.md).

## 4. Show the units

Select the loop's **Unit layout** item (the first item in the loop).
Click **Title** and choose `headline`, then **Body** and choose `text`:

```example
unit:
  headline: Storm hits the coast
  text: Heavy rain and wind caused flooding in several towns on Tuesday.
---
# $unit.headline

$unit.text
```

Select the loop itself to see which units it codes: by default all the
coder's units. More: [Layout templates](layout-templates.md).

## 5. Choose who codes

A new design asks first, with two cards (also **Who codes** above the
tree). It can't be deployed until you choose:

- **Crowd (one link)**: one link for anyone. Without more settings,
  every coder codes all units. Optionally take a coder id from the URL
  (for a panel), ask coders to sign in, or set a maximum number of
  coders. Whether coders divide the units is set on each unit loop.
- **Expert coders**: coders you know, each with their own units, named
  in the units' coder set (`coder_set`). They get a link each, pick their
  name from one link, or sign in.

For this study, choose **Crowd (one link)**. More: [Links](links.md#who-codes),
[Giving each coder their own units](own-units.md).

## 6. Save and preview

1. Click **Save** above the tree. This is a draft (v1): coders don't see
   it. A red issue count in the toolbar says what to fix first.
2. Click **Preview** at the top right and code the study as a coder
   would. Nothing is stored.
3. Change what reads badly on **Design**, save, and preview again.

More: [Preview, save and deploy](previewing-and-publishing.md).

## 7. Deploy and share the link

1. Save the design, then on **Deploy** click **Deploy**.
2. Open **Links** and click **Copy link**.
3. Send the link to your coders.

> Test with **Preview**, not the link: opening the link makes you a coder,
> and your answers end up in the results.

More: [Links](links.md), [What coders see](coder-experience.md).

## 8. Follow progress and download results

- **Overview** shows coders started, answers per day and progress per
  loop; **Results › Coders** has a row per coder. See
  [Following progress](coders-and-progress.md).
- **Results › Download** → **Download**: CSV files (or one Excel workbook), with a row per unit and coder
  in `annotations.csv`. See [Downloading results](results.md).

## Next

Pilot the questions with two or three coders on the same units and sharpen
them where they disagree. See
[Designing an annotation task](design-annotation-tasks.md).
