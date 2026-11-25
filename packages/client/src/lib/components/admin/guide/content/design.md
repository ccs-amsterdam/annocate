---
title: Design
page: Design
order: 2
---

<!--
A section of the guide. Each "## Title {#id}" heading is a step: a few short
lines or bullets (Markdown; "[text](topic.md)" links to a help topic).
The comment line under a heading says what the step shows and where
"Show me" goes; both parts are optional:
  show: design, focus: overview | tree | item | form, select: an item's name
  show: map | units | add-coders | coders | deploy | links | results
  show me: Page / data-guide name / What the pointer says
Both on one line, with ";" between: show: units; show me: Units / upload-units / Upload a CSV
The format is described in docs/client.md, section 7, "Guide".
-->

## The design editor {#designer}
<!-- show: design, focus: overview, select: topic -->
An AnnoTinder study is almost entirely defined in a single **design**. The [design editor](design-editor.md) helps you create and navigate it. It has two parts:

1. **The tree**: the coder's journey from start (top) to end (bottom). Here coders start with survey questions (age, news use) and then code headlines (topic, tone).
2. **The item editor**: select an item in the tree to edit its settings. On a wide screen you also see a preview of how the item appears to a coder.

## The tree {#tree}
<!-- show: design, focus: tree, select: topic; show me: Design / add-item / Add item: a question, a unit loop and more -->
The tree shows the study steps from start to end. In the example:

- coders start with some survey questions (age, news use)
- Then they start the **Headlines** annotation task, where each question is repeated for every coding unit.
- The first item in this task (**Headline**) lets you edit how the unit is presented. Here it uses the "headline" and "lead" columns from the units data.
- Coders then answer some questions about the headline (topic, tone), and there is an optional question asked only if the topic is "politics"

## The item editor {#item-editor}
<!-- show: design, focus: item, select: news_use -->
- Each of the items in the tree can be edited by selecting it.
- The item editor shows you the settings for that item, and optionally a preview of how the item appears to the coder
- On a wide screen they are side by side, so you can develop the right layout while seeing it. On a smaller screen you switch between them: Form, Preview.

## Who codes {#modes}
<!-- show: design, focus: form, select: session; show me: Design / who-codes / Who codes: expert coders or a crowd -->
- **Who codes** is at the top of the tree. It decides how coders get in and how units are handed out.
- **Expert coders**: trained coders you add on the Coders page. They get a link each, pick their name, or sign in.
- **A crowd**: many one-time coders who all start from [one link](links.md), which a panel company can hand out.
- You can change the choice until the study's first deploy, which fixes it.

## Questions about the coder {#coder-questions}
<!-- show: design, focus: item, select: age; show me: Design / add-item / Add item: a question, a unit loop and more -->
- Questions outside a unit loop are asked once: before the units (age, news use) or after them.
- Add one with **+**, choose **Question**, and pick its [answer type](question-types.md).

## The annotation task {#unit-loop}
<!-- show: design, focus: item, select: topic; show me: Design / add-item / Add item: choose Unit loop -->
- A [unit loop](unit-loops.md) goes through the units, one at a time.
- Its **layout** says how a unit looks; the questions after it are asked about each unit.
- Select the loop itself to choose which units it gives each coder.

## Questions only sometimes {#branch}
<!-- show: design, focus: tree, select: actor -->
- A **branch** asks its questions only when its [condition](conditions.md) holds: here the actor, only for headlines about politics.
- Conditions can use earlier answers, the unit's fields, and the session.
