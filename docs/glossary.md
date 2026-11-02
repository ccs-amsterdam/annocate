# Glossary

How AnnoTinder names things, in the app, the help and these docs. Code
identifiers that predate a term are listed under "In code" with what they
mean; renaming them is proposed in §3.

## 1. Terms

| Term | Meaning | Not |
| --- | --- | --- |
| **Job** | A study in AnnoTinder: its design, units, deployment and results. | project, study (in UI text: "job") |
| **Design** | Everything someone repeating the study needs (`plans/design.md`): the **unit fields**, the **session** (URL and link parameters, participant id, sample size per link) and the **items** (questions, unit loops with who codes which units, conditions, end items). Versioned. | "codebook" for the whole |
| **Design version** (v1, v2, ...) | A saved state of the design. The latest one is the **draft** until it is deployed; deployed versions are frozen. | "codebook version" |
| **Codebook** | The part of the design coders see: questions with their instructions and options, layouts, conditions, end messages. What the coding client gets (the *coder codebook*) and what **Export** writes (`codebook.md`), e.g. for a paper. The **codebook editor** (Design › Codebook) edits the design's items and session. | the whole design; a version |
| **Item** | An entry of the design: a question, unit loop, condition, end item, or the session (shown as the first item in the editor). | |
| **Question** | An item coders answer; its **answer type** (`variable` in the JSON, e.g. `nominal`) says how. Its answers are a column in the results. | "variable" in UI text |
| **Unit** | A thing coders code, with **unit fields** (declared in the design). | document, item |
| **Unit version** | A unit's content as deployed; answers point to the version their coder saw. Draft edits make no versions. | |
| **Set**, **set group** | A named list of units within a group (e.g. `s1` in group `part`); `_overlap`, `_practice`, `_gold` are special sets. | "unitset" |
| **Draft** | Anything not deployed yet: the latest design version if it isn't deployed, and units and sets as edited. | |
| **Deploy** | Make drafts live: a design version, and/or the draft units and sets. One dialog, one verb. | "publish" |
| **Deployment** | What coders get now (a design version with the deployed units and sets, active or paused) and its **settings**: panel return links, who may use each link, a link's own limit. | |
| **Link** | What coders open to start a session; made from the design's link parameters when deploying, with who may use it. | "invite", "invitation" in UI text |
| **Coder** | Anyone coding: a person with a **session** in a job. | annotator, participant (except below) |
| **Participant id** | A label for the coder from a panel (e.g. `PROLIFIC_PID`); never a key. | |
| **Session** | (1) A coder's run through a job. (2) The design's `session`: the values a session starts with (`$session.<name>`), and the parameters that set them. | |
| **Preview** | Trying the drafts as a coder; nothing is stored. | test run |

## 2. In code

Older identifiers that mean a term above:

| Identifier | Means |
| --- | --- |
| `codebooks` table, `/job/:id/codebook` endpoints, `CodebookResponse`, `codebookId` | a **design version** |
| `CodebookEditor`, `useCodebookDraft`, `client/src/lib/codebook/` | the **codebook editor** and design-item helpers |
| `toCoderItems`, `CoderCodebook` | the **codebook** (coders' part) |
| `putDeployment` (`PUT /deployment`) | **deploy** |
| `variable` (a question's answer type; `VariableValue`) | a question's **answer type**; an **answer** |

## 3. Proposed renames (not done)

So code and API say what the app says. Each is mechanical but touches the
public researcher API (and the R/Python clients), so it waits for a decision:

1. `/job/:id/codebook` → `/job/:id/design`, `codebooks` → `design_versions`,
   `CodebookResponse`/`CodebookWrite` → `DesignVersion`/`DesignWrite`,
   `codebookId` → `designVersionId` (in deployments, answers, exports).
2. Done: `/invites` → `/links`, table `invites` → `links`, `CoderInvite*` → `Link*`.
   Kept: the coder URL parameter `?invite=<secret>` (links already sent out
   keep working) and the error code `email_not_invited`.
3. Done: `unitset` → `set` in `SourceStatus` and the distribution tables.
4. Client: `CodebookEditor` stays (it is the codebook editor); `codebook/`
   helpers that work on the whole design move to `design/`.
