---
title: Open answers
section: Question types
order: 7
summary: A question coders answer by typing - one line, or a longer text in a text area.
---

An **Open answer** question shows its text and a field the coder types
the answer in. **Continue** needs some text.

- **One line** (the default): **Enter** continues. For a name, a word, a
  short reason.
- **Several lines** (tick it in the form): a text area, where **Enter**
  starts a new line and **Ctrl + Enter** continues. For comments and
  explanations.
- **At most** a number of characters (10,000 if you set none).

Open answers are in the download as typed. The Results page counts them,
but shows no bars (nearly every answer differs) and leaves them out of
agreement.

In conditions an open answer can only be checked for whether it was
answered (`$var.comment.answered`); its text is `$var.comment.value`.
