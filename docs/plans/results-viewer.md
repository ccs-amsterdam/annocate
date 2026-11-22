# Results viewer (proposal)

Today the Results tab only downloads a zip. A researcher who wants to know
whether coding goes well (an unclear question, a careless coder, low
agreement) must download and analyse it elsewhere. A viewer in the app
answers those questions while the study runs.

## Views

New sub-tabs under Results, next to **Download**:

1. **Questions**: per question, how coders answered. Bars per option
   (special options apart), a histogram for numbers, a row of bars per scale
   item. Filter by loop, design version and coder.
2. **Agreement**: per unit-loop question, over units with two or more
   coders: Krippendorff's alpha (nominal, ordinal or interval, from the
   answer type) and percent agreement. Per coder: how often they agree with
   the others, and their score on gold units, so outliers stand out.
3. **Units**: one unit as coders saw it (the coding screen's layout, read
   only) with every coder's answers side by side; spans drawn per coder.
   Units can be sorted by disagreement, to go through the hardest first.
4. **Coders**: one coder's answers and times: median seconds per unit, a
   warning when very fast, practice tries.

## Data

Built in the browser from the answers the download already reads
(`GET /annotations`, paged), kept in memory while the tab is open, with a
**Refresh** button. That works up to roughly 100k answers. Beyond that, a
server endpoint with summaries per question (later, with the per-unit
summary of `architecture.md` §11 item 11).

## Not in this plan

Changing answers, and adjudication: picking a final answer per unit where
coders disagree. That could follow from the Units view.

## Open questions

1. Which views first? Proposal: Questions and Agreement, then Units, then
   Coders.
2. Agreement for spans: token-level agreement (each word labelled or not, per
   label), or overlap of whole spans?
3. Adjudication: wanted later, or out of scope?
4. Refresh by hand, or update while the tab is open?
