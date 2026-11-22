# Final answers and coding jobs (plan, later)

Two features that share one piece of design:

- **Final answers**: one answer per unit and question, made from several
  coders' answers: by a rule (a majority) or by a researcher deciding where
  coders disagree (adjudication).
- **Coding jobs**: more than one kind of link in a study, each with its own
  units and screen: the coders' job, a researchers' job to decide
  disagreements, a researchers' job to code a sample first (for answer keys
  and training).

## Terms

"Gold" is taken: `_gold` units are units with a known answer that coders are
checked on (`architecture.md` §6.2). The outcome here is the **final
answer** of a unit; a study's final answers can then be the answer keys of
its gold and practice units (below).

## Final answers

Per unit and question, at most one final answer, with where it came from:

| Source | Made by |
| --- | --- |
| `majority` | A rule over the coders' answers, applied by the researcher |
| `decided` | A researcher in a decide job (below) |
| `coded` | A researcher in a reference job: their own answer, no coders needed |

**Majority rule** (Results → Final answers): at least `n` coders, and one
answer given by at least `p`% of them (e.g. 75%). Applying it fills in the
units that meet it and lists the others as undecided. It never overwrites a
`decided` or `coded` answer; applying it again updates its own answers when
coders' answers changed. Per answer type:

- categories (one answer): the value; several answers: each option as yes/no;
- ordered options and numbers: the value, or optionally the median;
- spans: per word and label, as agreement does (`results-viewer.md`); later.

**Storage**: a table `final_answers` (study, unit, question, value, source,
rule, decided by (the session, for `decided` and `coded`), when; one row per
unit and question). Not a flag on coders' answers: a majority has no coder,
and "the final answer of a unit" must be one row, whatever produced it. A
researcher's answers in a job are also stored as ordinary answers of their
session (timing, as coders'), so their work is kept like any coder's.

**Export**: `final_answers.csv` (unit, question, value, label, source),
and agreement of each coder with the final answers in the Coders view.

## Coding jobs

A study has jobs; each is a deployment with its own links, units and screen,
answered under the same questions:

| Job | Units | Screen | Answers go to |
| --- | --- | --- | --- |
| Coders (now: the study's deployment) | The design's | The design's | Coders' answers |
| Decide | Undecided units | The questions, plus the coders' answers per option | Final answers (`decided`) |
| Reference | A sample the researcher picks | The questions | Final answers (`coded`) |

- A job's design is derived from the study's: the unit loop's questions,
  layout and instructions; a job doesn't have its own editor at first.
- Job links are deployments `<studyId>.<job>`, as the preview is
  `<studyId>.preview`. Their sessions are marked with the job, and left out
  of the coders' results, progress and agreement.
- Who may open a job link: the study's team (logged in), not the crowd.

## Final answers as answer keys

Gold and practice units now take their answers from unit columns
(`<question>_gold`, `<question>_practice`). With final answers, a loop can
take them from there instead: code a sample in a reference job, then use it
for practice and gold. The columns stay for answer keys made elsewhere.

## What changes in the existing model

- `deployments` is keyed by study: it gets a job key (the coders' job is the
  default), and coder sessions a job.
- The runtime registry parses `<studyId>.<job>`.
- Results, progress and agreement filter on the coders' job.

## Decided

1. **Coders' answers in a decide job**: a button opens a dialog with the
   answers per coder id, and a tab with the counts per option.
2. **Answers that change after a decision**: the decision stays. A decision
   shows when answers to its unit and question were given or changed after
   it (from the timestamps), so the researcher can look again. Answers are
   not frozen.
3. **A reference job in agreement**: optional, off by default.
