# Plans

Designs for features that are not built. The rest of `docs/` describes
what exists.

| Plan | Status |
| --- | --- |
| [examples.md](examples.md): example jobs for learning AnnoTinder, later templates and a library of reusable flows | Examples built; templates and library not |
| [setup-wizard.md](setup-wizard.md): a guided setup for a new job (annotate / survey / experiment, units and who codes what, question names), ending in the editor; recipes shared with examples | Built; next steps listed |
| [sets-and-session-parameters.md](sets-and-session-parameters.md): set groups as columns, assign-a-set loops with overlap, session parameters in the codebook, links generated from them; auto variables assigned when reached, stratified balancing | Built |
| [special-sets.md](special-sets.md): overlap at a rate (default for crowd coding), and the special sets `_gold` (silent checks, health) and `_practice` (feedback), `$unit._practice` | Proposed; to build later |
| [gold-checks.md](gold-checks.md): hidden unit fields, and checking coders against known answers | Superseded by special-sets.md, except hidden fields and server-side checks |
| [question-loops.md](question-loops.md): the same questions once per value of a list | Idea, not designed in detail |
| [passkeys.md](passkeys.md): passkeys as a second factor checked by AnnoTinder, and a login shared with AmCAT | Passkeys built (`ANNOTINDER_2FA=annotinder`); step-up and the AmCAT login not |
| [encryption.md](encryption.md): encrypting participants' answers in the browser | On hold |

Local coding from R and Python is planned in `../compositions.md`.
