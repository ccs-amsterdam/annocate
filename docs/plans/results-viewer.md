# Results viewer

Built: the four views (`docs/client.md` §7 "Results"). Not yet: filters by
loop and design version, a histogram for numbers, gold scores per coder,
spans drawn in the text (the Units view lists them), and the streamed
export below.

Today the Results tab only downloads a zip. A researcher who wants to know
whether coding goes well (an unclear question, a careless coder, low
agreement) must download and analyse it elsewhere. A viewer in the app
answers those questions while the study runs.

## Views

New sub-tabs under Results, next to **Download**, built in this order:

1. **Questions**: per question, how coders answered. Bars per option
   (special options apart), a histogram for numbers, a row of bars per scale
   item. Filter by loop and design version.
2. **Agreement**: per unit-loop question, over units with two or more
   coders (see below). Per coder: how often they agree with the others, and
   their score on gold units, so outliers stand out.
3. **Units**: one unit as coders saw it (the coding screen's layout, read
   only) with every coder's answers side by side; spans drawn per coder.
   Sorted by disagreement, to go through the hardest first.
4. **Coders**: one coder's answers and times: median seconds per unit, a
   warning when very fast, practice tries.

A **Refresh** button reloads; nothing updates by itself.

## Agreement

- **Krippendorff's alpha** per question, with the metric from the answer
  type: nominal (categories), ordinal (ordered options, scale items),
  interval (numbers). It allows any number of coders per unit and missing
  codings.
- **Percent agreement**, for reading alongside alpha.
- **Cohen's kappa** per pair of coders who coded the same units (the per
  coder view), and its average.
- Several answers per question (`multiple`): each option as a yes/no
  question.
- **Spans**: each word of the text labelled or not, per label; alpha
  (nominal) and kappa. The usual measure for text annotation.

Computed in TypeScript (contracts, so the server and the client share it),
checked against published examples (Krippendorff 2011) and R's `irr`. It is
a count over units and coders: 10k units with a few coders take
milliseconds, so no worker or WebAssembly.

## Data

The server computes the views and sends small results: counts per option,
agreement per question, one unit's answers at a time. The browser never
downloads all answers for the viewer. One request per view; Refresh asks
again.

## Later: a streamed export

The download now pages through all answers into the browser, which builds
the zip. For large studies the server builds and streams the zip instead,
and the browser's zip code goes (one way to build the files, not two). To
design in from the start:

- A last entry with the row counts, so a broken download is recognised.
- A short-lived download token: a link can't send the `x-annotinder`
  header, and saving to disk needs a link.
- One database snapshot for all files.
- The same files and columns as now (the label code moves to contracts).

The paged answers API stays, for R and Python.

## Later

Final answers (a majority, or a researcher deciding disagreements) and the
coding jobs they need: [final-answers.md](final-answers.md).
