# Glossary

How AnnoTinder names things, in the app, the help and these docs. Where an
identifier in code differs, §2 says what it means.

## 1. Terms

| Term | Meaning | Not |
| --- | --- | --- |
| **Study** | What a researcher runs in AnnoTinder: its design, units, deployments, links and results. Coders take part in it. | job, project |
| **Design** | Everything someone repeating the study needs: the **unit fields**, the **session** (the who codes, URL parameters, the normal end) and the **items** (questions, experiments, branches and unit loops at the top level; inside branches and loops also nested branches and end items; inside loops also layout items). Versioned. | "codebook" for the whole |
| **Design version** (v1, v2, ...) | A saved state of the design. The latest one is the **draft** until it is deployed; deployed versions are frozen. | "codebook version" |
| **Codebook** | The part of the design coders see: questions with their instructions and options, layouts, conditions, end messages. What the coding client gets (the *coder codebook*) and what **Export** writes (`codebook.md`), e.g. for a paper. The **Design** page edits the design's items and session. | the whole design; a version |
| **Item** | An entry of the design: a branch, unit loop, layout item, question, experiment, end item, or the session (the Study entry: the first item, edited above the editor's tree). | |
| **Question** | An item coders answer; its **answer type** (`variable` in the JSON, e.g. `nominal`) says how. Its answers are a column in the results. | "variable" in UI text |
| **Unit** | A thing coders code, with **unit fields** (declared in the design). | document, item |
| **Unit version** | A unit's content as deployed; answers point to the version their coder saw. Draft edits make no versions. | |
| **Role column** | A unit column with a fixed name and meaning: `coder_set`, `condition_set`, `part_set` (set columns: each cell lists the unit's values, `anna;bob`) and `test_set`. Any other column is data. Stored as a *set group* (`unit_sets`; the sets endpoints say `group`). | "set group" in UI text; a free-named "set column" |
| **Coder set** | The units' `coder_set`: who codes each unit, by the ids of the study's **expert coders** (`anna`, `anna;bob`). Names only coders there are: add them first (the Coders page). Made in the coder set dialog (Who codes, Units, Coders). | "coder distribution", "coders column" |
| **Condition set** | The units' `condition_set`: each condition's units, for the experiment that selects units (`selectsUnits: true`). | a "linked column" |
| **Part set** | The units' `part_set`: parts of the study (e.g. `pre`, `post`); a unit loop shows one part (`units.part`). | "subset" |
| **Set** | One value of a set column: the units whose cell holds it, in order (`anna#3`: with a position). | "unitset" |
| **Test set**, **test unit** | The units' `test_set` (label **Test set**): `overlap`, `practice` or `gold`, one per unit; a test unit is a unit in a test set: `overlap` (coded by every coder, to compare them), `practice` (feedback when wrong) or `gold` (checked silently). Empty: a coding unit (`$unit.test_set` is the unit's test set in layouts). Test units are everyone's: `coder_set` and `condition_set` don't select them; one with a part is only in that part's loops. | "special unit", `test_unit`, `_overlap`, `_practice`, `_gold` |
| **Answer column**, **feedback column** | Unit columns `answer_<q>` (the right answer to question `q`, for practice and gold units: `politics`, alternatives `a\|b`, ranges `3..5`) and `feedback_<q>` (feedback on practice units). Never shown to coders. | `<q>_gold`, `<q>_practice`, `<q>_practice_message` |
| **Coder unit assignment** | The design's `session.invite`: who codes and how they get in. **Expert coders** (`mode: "coders"`): the study's expert coders in the units' **coder set** code, each with their own units (`$session.coder`: their coder id); a link per coder, one link where coders pick their id, or one link where coders sign in with their email address (each coder's, given by the researchers). **Crowd (one link)** (`mode: "crowd"`, the default). In the editor: **Who codes**. | "invite" for a link; a "column" of the invite |
| **Crowd (one link)** | The who codes `mode: "crowd"` (also for surveys and survey experiments): one link for anyone, optionally with a coder id from the URL (`coderParam`), required sign-in (`login`) and a maximum of coders (`maxCoders`). Whether its coders divide the units is each loop's (`units.divide`). "Crowd" in code and these docs. | a link per set, `$session.group`, `groupMaxCoders`, a crowd's column |
| **URL parameter** | A value a link carries in its URL, declared in `session.urlParams`; `$session.<name>`. Required unless it has a default. In the editor: **URL parameters**. | "session parameter", "link parameter" |
| **Branch** | An item (`type: "branch"`, "Branch" in the editor): items only some coders get. Its `condition` (required) decides: its `children` show only when it holds, its optional `elseChildren` instead when it doesn't. Holds questions, experiments, end items and other branches (in a loop also layout items, but no experiments), with an optional `label` for the editor (e.g. "Screen-out"). Works the same at any level; a unit loop can't go in one (give the loop a condition). | "Block", "Questions block", "Show if", a group of items without a condition |
| **Experiment** | An item (`type: "experiment"`) that assigns each coder one of its **conditions** when they reach it, never asked: drawn at random or balanced, or a URL parameter's value (`variable: { type: "experiment", draw: "random" \| "balanced" \| "url_param", param?, options?, selectsUnits?, stratify? }`). Outside unit loops only. `$var.<name>` is the coder's condition. | "random condition", "computed variable", "auto question" |
| **Condition** (of an experiment) | One of an experiment's values (e.g. `control`, `treatment`); a coder is assigned one. Not to be confused with a branch's or loop's **condition** (when it is shown). | group, arm |
| **Selects units** | An experiment with `selectsUnits: true`: its condition also selects units, those with that condition in the **condition set**. At most one, only with one link. | "linked to units", `units: "<column>"` |
| **Share** | The units a session gets: those with its coder in `coder_set` (expert coders) and its condition in `condition_set` (an experiment that selects units), plus the test units. A loop works within it: a part (`units.part`), the coding units or not (`units.coding`), or the previous loop's units (`units.sameAsPrevious`). | |
| **Shared queue** | A crowd's loop with `units.divide`: its units are handed out among the coders (of one link) until each is done. In the editor: **Divide units among coders**. | |
| **Placement** | Where a loop puts the overlap, practice or gold test units among the coding units: spread (the default), before, after, or left out (`ignore`). In the editor: **Spread throughout**, **Before coding units**, **After coding units**, **Leave out**. | |
| **Sign-in** | Coders logging in, to keep their session across devices. Always possible; required only where the who codes says so (expert coders who sign in, or a crowd with `login`), and only there do researchers see coders' emails. | a study setting |
| **Draft** | Anything not deployed yet: the latest design version if it isn't deployed, and units and sets as edited. | |
| **Deploy** | Make drafts live: a design version, and/or the draft units and sets. One dialog, one verb. | "publish" |
| **Deployment** | What coders get now (a design version with the deployed units and sets, active or paused) and its **settings**: panel return links. | |
| **Link** | What coders open to start a session; made when deploying: one, or one per coder (expert coders with a link each). Its settings come from the design. | "invite" for a link; a link per set |
| **Coder** | Anyone coding or answering (also in surveys and experiments), known in a study by their **coder id**: an **expert coder** (made by the researchers, with their own units and optionally an email address to sign in with) or a **crowd's** coder (made when they start with a coder id). A session without a coder id has no coder. | annotator, participant, respondent |
| **Coder id** | Who the coder is: `$session.coder`, the results' `coder` column. Per study, never changed, one coder whatever its case. The id the researchers gave an expert coder (never their email address, unless they chose it as id), a crowd's id from a URL parameter (e.g. a panel's `PROLIFIC_PID`), or the login's email where a crowd requires sign-in; never a key. | participant id |
| **Coder session** | One coder's session in a study (`sessionId`, the results' `session_id`); a coder can have more than one (e.g. a new device). | "coder" for a session row |
| **Public title** | What coders see as the study's name (the coder home, the coding screen): the design's `public.title`. The study's name is private. | the study's name |
| **Session** | (1) A coder's run through a study. (2) The design's `session` (the Study entry): the who codes, the URL parameters (`$session.<name>`), the normal end and the display. | |
| **Preview** | Trying the drafts as a coder; nothing is stored. | test run |

## 2. In code

Code says what the app says. Where it doesn't:

| Identifier | Means |
| --- | --- |
| `CoderCodebook`, `toCoderItems`, the coder session's `codebook` | the **codebook** (what the coding client gets) |
| `design_changed` (coder API error) | the coder's **codebook** changed: a new design version was deployed |
| `codebookMarkdown`, `codebook.md` (the editor's Export) | the **codebook** as a document |
| client `codebook/` | the coding client's runtime (templates, conditions, expressions, the item tree) |
| `putDeployment` (`PUT /deployment`) | **deploy** |
| `variable` (a question's answer type; `VariableValue`) | a question's **answer type**; an **answer** |
| `RandomConditionFields`, help topic `random-condition` | an **experiment**'s settings and help (its conditions, drawn at random or balanced) |
| `condition.ts`, `ConditionEditor`, `conditionRules` | a branch's or unit loop's (or `::: if` block's) **condition**: a script, or simple rules |
| set groups (`unit_sets`, the sets endpoints' path `:group`) | **role columns** (`column` in the recipe's `sets[]` and the units page query) |
| `invite.mode: "crowd"` | **Crowd (one link)** |
