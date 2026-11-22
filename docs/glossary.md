# Glossary

How AnnoTinder names things, in the app, the help and these docs. Where an
identifier in code differs, §2 says what it means.

## 1. Terms

| Term | Meaning | Not |
| --- | --- | --- |
| **Study** | What a researcher runs in AnnoTinder: its design, units, deployments, links and results. Coders take part in it. | job, project |
| **Design** | Everything someone repeating the study needs: the **unit fields**, the **session** (the coder unit assignment, URL parameters, the normal end) and the **items** (questions, computed variables, unit loops, Show if items, end items). Versioned. | "codebook" for the whole |
| **Design version** (v1, v2, ...) | A saved state of the design. The latest one is the **draft** until it is deployed; deployed versions are frozen. | "codebook version" |
| **Codebook** | The part of the design coders see: questions with their instructions and options, layouts, Show if conditions, end messages. What the coding client gets (the *coder codebook*) and what **Export** writes (`codebook.md`), e.g. for a paper. The **Design** tab edits the design's items and session. | the whole design; a version |
| **Item** | An entry of the design: a question, computed variable, unit loop, Show if item, end item, or the session (the Study entry: the first item, edited above the editor's tree). | |
| **Question** | An item coders answer; its **answer type** (`variable` in the JSON, e.g. `nominal`) says how. Its answers are a column in the results. | "variable" in UI text |
| **Unit** | A thing coders code, with **unit fields** (declared in the design). | document, item |
| **Unit version** | A unit's content as deployed; answers point to the version their coder saw. Draft edits make no versions. | |
| **Set column** | A unit field of type `set` that says who or which group a unit is for (e.g. `coder`, `framing`); each cell lists the unit's values (`anna;bob`, `_overlap`). Stored as a *set group* (`unit_sets`; the sets endpoints say `group`). | "set group" in UI text |
| **Set** | One value of a set column: the units whose cell holds it, in order. `_overlap`, `_practice`, `_gold` are special sets, for every coder, but only in the coder unit assignment's column (elsewhere ordinary values). | "unitset" |
| **Coder unit assignment** | The design's `session.invite`: who codes and how they get in. **Specific coders** (`mode: "coders"`): a set column whose values are coders, each with their own units (`$session.coder`); a link per coder, one link where coders pick their name, or one link where coders sign in with the column's email addresses. **Crowd** (`mode: "crowd"`, the default): one link for anyone, optionally with a coder id from the URL (`coderParam`), required sign-in, a set column for the special units (`column`; with other sets, a link per set: `$session.group`) and a maximum of coders per link (`maxCoders`, per set `groupMaxCoders`). Its special units (overlap, practice, gold) are those of its column. Whether a crowd divides the units is each loop's (`units.divide`). In the editor: **Coder unit assignments**. | "invite" for a link |
| **URL parameter** | A value a link carries in its URL, declared in `session.urlParams`; `$session.<name>`. Required unless it has a default. In the editor: **URL parameters**. | "session parameter", "link parameter" |
| **Questions block** | In the editor's tree, the items between unit loops (or before or after them), shown as one block. Only a view: the design stays one list. | an item |
| **Computed variable** | An item (`type: "computed"`) whose value the server computes when the coder reaches it, never asked. The one type is a random condition (`variable.type: "random"`, drawn random or balanced). `$var.<name>`. In the editor: **Random condition**. | "random condition", "auto question" |
| **Linked to units** | A random condition whose value also selects units: those with its value in a set column. | |
| **Share** | The units a session gets: those whose cells hold its coder (or crowd link's set) and linked random conditions' values in each column (plus `_overlap`). A loop works within it: a subset (`units.subset`), the coding units or not (`units.coding`), or an earlier loop's units (`units.sameAs`). | |
| **Shared queue** | A crowd's loop with `units.divide`: its units are handed out among the coders (of one link) until each is done. In the editor: **Divide units among coders**. | |
| **Placement** | Where a loop puts the overlap, practice or gold units among the coding units: spread (the default), before, after, or left out (`ignore`). In the editor: **Spread throughout**, **Before coding units**, **After coding units**, **Leave out**. | |
| **Show if** | An item (`show_if`) whose children only show when its condition holds. | "condition" for the item |
| **Sign-in** | Coders logging in, to keep their session across devices. Always possible; required only where the coder unit assignment says so (specific coders who sign in, or a crowd with `login`), and only there do researchers see coders' emails. | a study setting |
| **Draft** | Anything not deployed yet: the latest design version if it isn't deployed, and units and sets as edited. | |
| **Deploy** | Make drafts live: a design version, and/or the draft units and sets. One dialog, one verb. | "publish" |
| **Deployment** | What coders get now (a design version with the deployed units and sets, active or paused) and its **settings**: panel return links. | |
| **Link** | What coders open to start a session; made when deploying: one, one per coder (specific coders with a link each), or one per set of a crowd's column. Its settings come from the design. | "invite" for a link |
| **Coder** | Anyone coding or answering (also in surveys and experiments): a person with a **session** in a study. | annotator, participant, respondent |
| **Coder id** | Who the coder is: `$session.coder`, the results' `coder` column. Specific coders' value in the coders' column, a crowd's id from a URL parameter (e.g. a panel's `PROLIFIC_PID`), or the login's email where a crowd requires sign-in; never a key. | participant id |
| **Coder session** | One coder's session in a study (`sessionId`, the results' `session_id`); a coder can have more than one (e.g. a new device). | "coder" for a session row |
| **Public title** | What coders see as the study's name (the coder home, the coding screen): the design's `public.title`. The study's name is private. | the study's name |
| **Session** | (1) A coder's run through a study. (2) The design's `session` (the Study entry): the coder unit assignment, the URL parameters (`$session.<name>`), the normal end and the display. | |
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
