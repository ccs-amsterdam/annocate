---
title: Ending a session
section: Codebook
order: 6
summary: End items end a coder's session early or on purpose - screened out or complete - with a message and an optional link back to a panel.
---

Normally a session ends when the coder has gone through the whole codebook:
they see *"Job Complete!"* and that's it. An **end item** ends the session
at a point you choose, says how it ended, and can send the coder on to
another website. You need one when:

- a participant **doesn't consent**, or **doesn't fit** the study (too
  young, wrong country);
- a participant **fails an attention check**;
- participants come from an **online panel** that needs them sent back with a
  return link, both when they complete and when they are screened out (see
  [Online panels and crowd coding](online-panels.md)).

An end item usually sits inside a [condition](conditions.md): it is only
reached when the condition holds. An end item at the very end of the
codebook is reached by everyone who finishes.

```text
Consent                   nominal: yes, no
Condition: if consent is "no"
  └ End: no_consent       screened out, "Thank you for your time."
Age                       numeric
Condition: if age < 18
  └ End: too_young        screened out
Unit loop                 20 news articles
End: done                 complete, back to the panel
```

## Adding an end item

Click the **+** in the codebook tree where the session should end, and
choose **End** (see [Adding items](codebook-editor.md#adding-items)). It has
these fields:

| Field | What it does |
| --- | --- |
| **Item Name** | Its name, e.g. `too_young`. Shown in the editor and stored with the coder's session. |
| **Outcome** | **Screened out (not eligible)** or **Complete** |
| **Message (optional)** | Shown on the last screen. Markdown, and it can use references such as `$var.group.label` |
| **Redirect to (optional)** | A web address to send the coder to, e.g. a panel's return link |

## Screened out or complete

The outcome says *why* the session ended. It is stored with the coder and
is in the `ended` column of `coders.csv` in the results (with the time in
`ended_at`), so you can tell screened-out participants from those who
completed, and both from those who simply stopped.

| Outcome | Use for | Heading the coder sees |
| --- | --- | --- |
| **Screened out (not eligible)** | No consent, not in the target group, failed attention check | *Thank you* |
| **Complete** | The coder did what was asked | *Job Complete!* |

Sessions that end without an end item (the coder reached the end of the
codebook) have an empty `ended` column. If you need to know who completed,
for example for payment, put an end item with the outcome **Complete** at
the end of the codebook.

## What the coder sees

The last screen shows the heading, then your message, or if there is none,
a standard sentence (*"This is the end of the job for you."* for a
screenout). With a redirect link there is a **Continue** button, and the
coder is sent on automatically after three seconds.

The message is a template, like a question text: markdown, references and
`{{ }}` all work, e.g.
*"Thank you! Your completion code is **C1234**."* An end item inside a unit
loop can also use the unit's data. [Snippets](snippets.md) don't work in end
items, also not inside a loop: the message is shown outside the loop's
layout.

After the end, the session is closed: the coder can't go back or answer
anything more, and opening the link again on the same device shows the same
ending (and redirects again). Everything they answered before the end is
kept.

In **Preview**, the redirect is shown as a button but not followed.

## Redirect links

The redirect link must start with `https://` (or `http://`). It can contain
`$var` references, which are filled in with the coder's answers or
assigned variables, **URL-encoded**: spaces, `&` and other special
characters in a value can't break the link.

```text
https://panel.example/return?status=screenout&id=$var.pid.value
https://panel.example/return?status=complete&id=$var.pid.value&group=$var.group.value
```

Here `pid` and `group` are questions of the codebook, typically
[assigned variables](auto.md): `pid` taken from the link the participant
came in with, `group` drawn at random. How to get a panel's participant id
into the codebook is explained in
[Online panels and crowd coding](online-panels.md).

Only `$var` and `$session` references work in a redirect link: no `$unit` and no
`{{ }}`. Use `.value`, not `.label`, so that the panel gets the stored value.
An unanswered question leaves its place in the link empty.

## Typical uses

### Consent refused

A first question *"Do you agree to take part?"* with the options *Yes* and
*No*, then a condition *consent is "no"* with an end item **Screened out**
inside it, with a short message thanking them. Everything else comes after
the condition, so only those who agreed continue.

### Not eligible

Background questions first (age, country, language), then one condition per
reason, or one condition with **Any rule may hold**, around a screenout end
item. Ask the screening questions as early as possible, so ineligible
participants don't spend time on the rest.

### Failed attention check

An attention check is a question with one obviously right answer, such as
*"To show you are reading carefully, choose 'Somewhat disagree'"*. Put a
condition *check is not "somewhat_disagree"* after it, with a screenout end
item inside. Inside a unit loop, the same works per unit: an end item there
ends the session after saving the current unit's answers.

> Online panels have rules about screening out participants and about
> attention checks, for example whether participants must still be paid.
> Check them before you use an end item to remove participants.

### Back to the panel

At the end of the codebook, an end item **Complete** with the panel's
completion link as **Redirect to (optional)**, and inside each screening condition one
**Screened out** with the panel's screenout link.

## Where end items can go

End items can stand anywhere: at the top level, inside conditions, and
inside unit loops. Every end item needs a unique name, like any item with a
name.

An end item is only reached when the coder gets to its place. An end item
placed after a unit loop is reached once the coder has finished their units
in that loop.
