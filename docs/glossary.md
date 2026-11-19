# Glossary

How AnnoTinder names things, in the app, the help and these docs. Where an
identifier in code differs, §2 says what it means.

## 1. Terms

| Term | Meaning | Not |
| --- | --- | --- |
| **Study** | What a researcher runs in AnnoTinder: its design, units, deployments, links and results. Coders take part in it. | job, project |
| **Design** | Everything someone repeating the study needs: the **unit fields**, the **session** (coders, assigned conditions, URL and link parameters, participant id) and the **items** (questions, computed variables, unit loops, Show if items, end items). Versioned. | "codebook" for the whole |
| **Design version** (v1, v2, ...) | A saved state of the design. The latest one is the **draft** until it is deployed; deployed versions are frozen. | "codebook version" |
| **Codebook** | The part of the design coders see: questions with their instructions and options, layouts, Show if conditions, end messages. What the coding client gets (the *coder codebook*) and what **Export** writes (`codebook.md`), e.g. for a paper. The **Editor** tab (Design › Editor) edits the design's items and session. | the whole design; a version |
| **Item** | An entry of the design: a question, computed variable, unit loop, Show if item, end item, or the session (shown as the first item in the editor). | |
| **Question** | An item coders answer; its **answer type** (`variable` in the JSON, e.g. `nominal`) says how. Its answers are a column in the results. | "variable" in UI text |
| **Unit** | A thing coders code, with **unit fields** (declared in the design). | document, item |
| **Unit version** | A unit's content as deployed; answers point to the version their coder saw. Draft edits make no versions. | |
| **Set column** | A unit field of type `set` that says who or which group a unit is for (e.g. `coder`, `framing`); each cell lists the unit's values (`anna;bob`, `_overlap`). Stored as a *set group* (`unit_sets`; the sets endpoints say `group`). | "set group" in UI text |
| **Set** | One value of a set column: the units whose cell holds it, in order. `_overlap`, `_practice`, `_gold` are special sets, for every share. | "unitset" |
| **Coders** (of a design) | The design's `session.coders`: a set column whose values are coders; each gets the units of their value (`$session.coder`). Names: a link per coder; email addresses: one link with sign-in. | |
| **Assigned condition** | A condition in `session.conditions`, set when the session starts: by link, or drawn (balanced or random). `$session.<name>`. | |
| **Computed variable** | An item (`type: "computed"`) whose value the server computes when the coder reaches it, never asked. The one type is a random condition (`variable.type: "random"`, drawn random or balanced). `$var.<name>`. In the editor: **Random condition**. | "random condition", "auto question" |
| **Linked to units** | A condition (assigned or random) whose value also selects units: those with its value in a set column. | |
| **Share** | The units a session gets: those whose cells hold its coder and linked conditions' values in each column (plus `_overlap`). A loop works within it. | |
| **Show if** | An item (`show_if`) whose children only show when its condition holds. | "condition" for the item |
| **Sign-in** | A study setting (`signIn`: off, optional, required): whether coders log in. | per-link login |
| **Draft** | Anything not deployed yet: the latest design version if it isn't deployed, and units and sets as edited. | |
| **Deploy** | Make drafts live: a design version, and/or the draft units and sets. One dialog, one verb. | "publish" |
| **Deployment** | What coders get now (a design version with the deployed units and sets, active or paused) and its **settings**: panel return links, sign-in, a link's own limit. | |
| **Link** | What coders open to start a session; made when deploying, one per coder (by name) × condition assigned by link × link parameter combination. | "invite", "invitation" in UI text |
| **Coder** | Anyone coding: a person with a **session** in a study. | annotator, participant (except below) |
| **Participant id** | A label for the coder from a panel (e.g. `PROLIFIC_PID`); never a key. | |
| **Public title** | What coders see as the study's name (the coder home, the coding screen): the design's `public.title`. The study's name is private. | the study's name |
| **Session** | (1) A coder's run through a study. (2) The design's `session`: the values a session starts with (`$session.<name>`), and the parameters that set them. | |
| **Preview** | Trying the drafts as a coder; nothing is stored. | test run |

## 2. In code

Code says what the app says. Where it doesn't:

| Identifier | Means |
| --- | --- |
| `CoderCodebook`, `toCoderItems`, the coder session's `codebook` | the **codebook** (what the coding client gets) |
| `codebook_changed` (coder API error) | the coder's **codebook** changed: a new design version was deployed |
| `codebookMarkdown`, `codebook.md` (the editor's Export) | the **codebook** as a document |
| client `codebook/` | the coding client's runtime (templates, conditions, expressions, the item tree) |
| `putDeployment` (`PUT /deployment`) | **deploy** |
| `variable` (a question's answer type; `VariableValue`) | a question's **answer type**; an **answer** |
| `condition.ts`, `ConditionEditor`, `conditionRules` | a Show if item's (or `::: if` block's) **condition**: a script, or simple rules |
| set groups (`unit_sets`, the sets endpoints' `group`) | **set columns** |
