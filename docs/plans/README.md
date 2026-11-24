# Plans

Designs for features that are not built. The rest of `docs/` describes
what exists.

Two files are about the release, not about a feature:
[release-plan.md](release-plan.md) (the work before the first release) and
[go-live.md](go-live.md) (the owner's checklists for the lab's server and
the public server, the open questions, and the code items they lead to).

| Plan | What |
| --- | --- |
| [design-viewer.md](design-viewer.md) | Reproducibility: a browser-only viewer to go through a design file as coders did (placeholder units, the export's units, a coder's answers), versioned per release; importing a design file into a new study |
| [question-loops.md](question-loops.md) | The same questions once per value of a list (per span, per answer value); value loops and value branches; loop settings that depend on a condition |
| [results-viewer.md](results-viewer.md) | Looking at the answers in the app: answers per question, agreement, a unit with every coder's answers, a coder's answers and times |
| [final-answers.md](final-answers.md) | One answer per unit from several coders' (a majority rule, or a researcher deciding); coding jobs: links to decide disagreements or code a sample first |
| [exports-and-files.md](exports-and-files.md) | The raw results export (built) and file storage: S3 and Garage later, multimedia |
| [encryption.md](encryption.md) | Encrypting participants' answers in the browser (on hold) |

Elsewhere: local coding from R and Python (`../compositions.md`), templates
and an examples library (`../examples.md`), smaller open points
(`../architecture.md` §11, `../client.md` §9).
