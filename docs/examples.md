# Recipes, example studies and the setup wizard

A **recipe** (contracts `recipe.ts`) is everything a new study starts
with, in one document: units, set columns (by the units' ids), the first
design version (a draft, or deployed with `publish`, with its declared unit
fields), and the study's sign-in setting. `POST /study/from-recipe` makes a study from one in a
single transaction (`server/src/shared/recipes.ts`), with the same role,
limits and ownership checks as creating a study. Afterwards it is an
ordinary study: nothing records how it was made except `origin` for an
example.

Two things make recipes:

- **Example studies** (`packages/server/examples/<id>.json`, loaded by
  `server/src/examples.ts`): recipes with a deployed design, a title, a
  category, a description, and sometimes example answers.
- **The setup wizard** builds a recipe in the browser
  (`client/src/lib/admin/setupRecipe.ts`; `client.md` §7, "Guided setup").
  The server knows nothing about wizard steps.
- **A design file** (`designs/v<n>.json` in the results download, or
  Export › Design file in the editor): **Create new study › From a file**
  makes a recipe of it in the browser (`client/src/lib/admin/designImport.ts`):
  a study with that design, its declared unit fields, and no units.

## Example studies

`GET /examples` lists them; `POST /study/from-example` (`{ example, name? }`)
makes the study, deploys its design and writes its example answers, so it
can be tried right away. The study records the example it came from
(`origin`), and its overview says what to try until the researcher
dismisses it.

| Category | Example | Shows |
| --- | --- | --- |
| Simple annotation | Sentiment by swiping | a swipe question; 20 units divided over 3 coders (a link each) plus 5 overlap units; example answers that disagree on some overlap units |
| Simple annotation | Labeling actors in texts | span annotation |
| Surveys and experiments | A simple survey | survey question types, a Show if item, an end item that screens out |
| Surveys and experiments | A simple experiment | a random condition (a computed item) choosing one of two versions of a text |
| Surveys and experiments | Survey with annotations | survey questions, then a unit loop; both in one download |
| Surveys and experiments | Experiment with annotations: a tour | the question types, a condition that changes layout and questions, a unit loop |

**Example answers** are written when the study is made: a few coders
("Example coder 1..n") with fixed answers, so results look the same every
time. A researcher who adopts the study for real use removes them with a
reset or by deleting those coders.

Units in examples are texts written for them, so there are no copyright
questions. Each example's set columns must each show something (a column
that gives every coder all units only confuses). A development server on an
empty database creates the tour through the same code.

## Later

- **Actors and their stance**: label actors, then a stance question per
  labeled actor. Needs value loops (`plans/question-loops.md`).
- **Templates**: "Save as template" writes a recipe without units, with
  the unit fields the design declares. Making a study from one asks for a
  CSV and matches its columns to those fields (the wizard's units step).
- **A library**: templates shared between researchers and linked to the
  publications that used or introduced them, so a coding scheme or
  experiment can be found, reused and cited.
