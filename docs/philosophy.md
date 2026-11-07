# AnnoTinder

Draft, to be edited. The source for the README, the welcome page and the
"About AnnoTinder" help topic.

Annotation is the process of adding notes to a (multimodal) text. As a
research method, it helps us translate raw texts into quantitative
representations that can be compared and analyzed. Annotation is thus a
form of measurement.

What is commonly left out of the equation is the annotator. Annotations
are indeed measurements, but not just measurements of texts. They are
also, and sometimes primarily, measurements of the annotator. This means
that annotations can be used to study people, but also that annotators are
confounders in the measurement of texts. If Dutch people tend to annotate
a thunderstorm as a mild shower, that tells you something about the
Netherlands, and you should take it into account when they tell you to
just take the bike.

AnnoTinder was designed to capture this dual measurement. It views an
annotation as a relation between an observer and a text, and it integrates
research designs for measuring people with designs for measuring texts.

Survey and experimental research have developed many solid practices for
measuring people: their perspectives, emotions, attitudes, and more.

Content analysis research has developed ways to take the annotator out of
the equation: by training people to follow transparent and reproducible
protocols, and by striving to reduce disagreement between annotators as
much as possible.

AnnoTinder brings both traditions into one design. From content analysis
it takes the protocol: a codebook, training with feedback (practice
units), checks against known answers (gold units), and overlap between
coders to measure agreement. From survey and experimental research it
takes the participant: questions about coders before and after coding,
randomly assigned conditions, links for panels, and respect for people's
time and their right to withdraw. Because both live in one study, you
decide where the annotator stands: as noise to reduce (train, check,
aggregate), as a variable to account for (record who saw what, model coder
effects), or as the subject of study (vary what coders see, compare how
groups read the same texts).

1. **Coding is measurement.** Every answer comes with what the coder saw
   (the exact unit version and design version), when, and how long it
   took. Agreement, gold checks and overlap are measurements too, not just
   quality control.
2. **Coders are participants.** You can measure things about them as well:
   surveys before and after, experimental conditions, practice. Their
   experience comes first: fast, mobile and clear, with the right to quit
   and to have their data deleted.
3. **Reproducible by design.** One design file describes a whole study.
   Every deployed version is kept with the release it ran on, so anyone can
   see what coders saw.
4. **Simple first.** Sensible defaults and a setup wizard get a study
   running in minutes. Advanced options are there when you need them, and
   out of the way when you don't.
5. **Open.** Open source and self-hostable, with your data in formats you
   can take anywhere.

## Terms

A researcher runs a **study**. Its **design** says what **coders** do: the
questions, the **units** they code and how units are handed out. Coders
start from a **link**; what coders see of a design is its **codebook**.
See `glossary.md`.

## Open questions

- **Slogan.** Not decided. "Annotation as measurement" is the common view;
  the point here is that an annotation measures the relation between
  annotator and text. Candidates so far: "Every annotation measures two
  things" (doesn't quite capture it), something playing on "annotations
  are people".
- **The name.** AnnoTinder started as a joke (a swiping annotation tool).
  Keep the name, but in the branding relate it to the real meaning of
  tinder: something kindling-related.
- **Phenomenology.** There may be an interesting phenomenological element
  here (annotation as an experience of a text); not worked out yet.
