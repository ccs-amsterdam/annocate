# Glossary

How AnnoTinder names things, in the app, the help and these docs. Where code
keeps the word "codebook", "In code" says why.

## 1. Terms

| Term | Meaning | Not |
| --- | --- | --- |
| **Study** | What a researcher runs in AnnoTinder: its design, units, deployments, links and results. Coders take part in it. | job, project |
| **Design** | Everything someone repeating the study needs (`plans/design.md`): the **unit fields**, the **session** (URL and link parameters, participant id, sample size per link) and the **items** (questions, unit loops with who codes which units, conditions, end items). Versioned. | "codebook" for the whole |
| **Design version** (v1, v2, ...) | A saved state of the design. The latest one is the **draft** until it is deployed; deployed versions are frozen. | "codebook version" |
| **Codebook** | The part of the design coders see: questions with their instructions and options, layouts, conditions, end messages. What the coding client gets (the *coder codebook*) and what **Export** writes (`codebook.md`), e.g. for a paper. The **Editor** tab (Design › Editor) edits the design's items and session. | the whole design; a version |
| **Item** | An entry of the design: a question, unit loop, condition, end item, or the session (shown as the first item in the editor). | |
| **Question** | An item coders answer; its **answer type** (`variable` in the JSON, e.g. `nominal`) says how. Its answers are a column in the results. | "variable" in UI text |
| **Unit** | A thing coders code, with **unit fields** (declared in the design). | document, item |
| **Unit version** | A unit's content as deployed; answers point to the version their coder saw. Draft edits make no versions. | |
| **Set**, **set group** | A named list of units within a group (e.g. `s1` in group `part`); `_overlap`, `_practice`, `_gold` are special sets. | "unitset" |
| **Draft** | Anything not deployed yet: the latest design version if it isn't deployed, and units and sets as edited. | |
| **Deploy** | Make drafts live: a design version, and/or the draft units and sets. One dialog, one verb. | "publish" |
| **Deployment** | What coders get now (a design version with the deployed units and sets, active or paused) and its **settings**: panel return links, who may use each link, a link's own limit. | |
| **Link** | What coders open to start a session; made from the design's link parameters when deploying, with who may use it. | "invite", "invitation" in UI text |
| **Coder** | Anyone coding: a person with a **session** in a study. | annotator, participant (except below) |
| **Participant id** | A label for the coder from a panel (e.g. `PROLIFIC_PID`); never a key. | |
| **Public title** | What coders see as the study's name (the coder home, the coding screen): the design's `public.title`. The study's name is private. | the study's name |
| **Session** | (1) A coder's run through a study. (2) The design's `session`: the values a session starts with (`$session.<name>`), and the parameters that set them. | |
| **Preview** | Trying the drafts as a coder; nothing is stored. | test run |

## 2. In code

Code says what the app says (§3). Where "codebook" stays, it means the
coders' part:

| Identifier | Means |
| --- | --- |
| `CoderCodebook`, `toCoderItems`, the coder session's `codebook` | the **codebook** (what the coding client gets) |
| `codebook_changed` (coder API error) | the coder's **codebook** changed: a new design version was deployed |
| `codebookMarkdown`, `codebook.md` (the editor's Export) | the **codebook** as a document |
| client `codebook/` | the coding client's runtime (templates, conditions, expressions, the item tree) |
| `putDeployment` (`PUT /deployment`) | **deploy** |
| `variable` (a question's answer type; `VariableValue`) | a question's **answer type**; an **answer** |

## 3. Renames

So code and API say what the app says (decided 2026-11-02; they change the
public researcher API, so the R/Python clients follow):

1. Done: `/job/:id/codebook` → `/job/:id/design` (now `/study/:id/design`, item 6), table `codebooks` →
   `design_versions`, `CodebookResponse`/`CodebookWrite`/`CodebookMeta` →
   `DesignVersion`/`DesignWrite`/`DesignVersionMeta`, `codebookId` →
   `designVersionId` (deployments, answers, exports), `codebook_conflict` →
   `design_conflict`. Kept: the coder API's `codebook_changed` and the
   session's `codebook` (that is the coders' codebook).
2. Done: `/invites` → `/links`, table `invites` → `links`, `CoderInvite*` → `Link*`.
   Coder links are `/code/<deployment>?link=<secret>`; a link that only
   some emails may use answers `email_not_allowed` to others.
3. Done: `unitset` → `set` in `SourceStatus` and the distribution tables.
4. Done: client `codebook/` holds the coding runtime (templates, conditions,
   expressions, the item tree); the editor's helpers moved to `design/`
   (`codebookEdit` → `design/itemEdit`).
5. Done: design-meaning identifiers say design: contracts `codebook/` →
   `design/` (`DesignItem`, `DesignItemsSchema`, `validateDesignItems`,
   `DesignIssue`, `designErrors`, `designItemsJsonSchema`), the recipe's and
   the deploy history's `codebook` → `design`, server `designVersionItems`,
   `designVersionSession`, `designVersionUnits`, `runtime/designItems.ts`,
   client `DesignEditor`, `DesignManager`, `DesignTreeView`, `designTree/`,
   `designEditor/`, `useDesignDraft`, `DesignJsonEditor`,
   `DesignVersionsDialog`, `DesignStatusBanner`, `QuestionPreview`,
   `diffDesigns`, help topics `design-editor`, `changing-a-live-design`,
   `design-reproducible`. The local backup key is now
   `annotinder:design-backup`.
6. Done (2026-11-07): job → study everywhere, as AnnoTinder measures how
   coders interpret units rather than having them do work
   (`philosophy.md`): the API (`/api/study/...`, `StudyResponse`,
   `listStudies`, error codes `study_paused`, `study_suspended`,
   `study_full`), the database (`studies`, `study_users`, `study_id`;
   migration 0003), plan limits (`studies`, `unitsPerStudy`,
   `codersPerStudy`, `answersPerStudy`), the client (`/research/studies/...`,
   `StudyManager`, `StudyRunner`) and the docs. Coders stay coders: the
   welcome page and header say Coder and Code.
