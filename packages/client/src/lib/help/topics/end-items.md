---
title: Ending a session
section: Editor
order: 6
summary: End items end a coder's session early or on purpose - screened out or complete - with a message and an optional link back to a panel.
---

Normally a session ends when the coder has gone through the whole design.
What they see then, and where they go next (e.g. back to a panel), is set
at **At the end**, the last row of the editor's tree. An **end item** ends
the session early, at a point you choose, says how it ended, and can send
the coder on to another website. You need one when:

- a coder **doesn't consent**, or **doesn't fit** the study (too
  young, wrong country);
- a coder **fails an attention check**;
- coders come from an **online panel** that needs them sent back with a
  return link, both when they complete and when they are screened out (see
  [Online panels and crowd coding](online-panels.md)).

An end item usually sits inside a [condition](conditions.md): it is only
reached when the condition holds. For everyone who finishes, use **At the
end** instead.

```text
Consent                   nominal: yes, no
Condition: if consent is "no"
  └ End: no_consent       screened out, "Thank you for your time."
Age                       numeric
Condition: if age < 18
  └ End: too_young        screened out
Unit loop                 20 news articles
At the end                "Thank you!", back to the panel
```

## Adding an end item

Click the **+** in the design tree where the session should end, and
choose **End** (see [Adding items](design-editor.md#adding-items)). It has
these fields:

| Field                      | What it does                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| **Item Name**              | Its name, e.g. `too_young`. Shown in the editor and stored with the coder's session.     |
| **Outcome**                | **Screened out (not eligible)** or **Complete**                                          |
| **Message (optional)**     | Shown on the last screen. Markdown, and it can use references such as `$var.group.label` |
| **Redirect to (optional)** | A web address to send the coder to, e.g. a panel's return link                           |

## Screened out or complete

The outcome says _why_ the session ended. It is stored with the coder and
is in the `ended` column of `coders.csv` in the results (with the time in
`ended_at`), so you can tell screened-out coders from those who
completed, and both from those who simply stopped.

| Outcome                         | Use for                                                     | Heading the coder sees |
| ------------------------------- | ----------------------------------------------------------- | ---------------------- |
| **Screened out (not eligible)** | No consent, not in the target group, failed attention check | _Thank you_            |
| **Complete**                    | The coder did what was asked                                | _Study Complete!_      |

Sessions that end without an end item (the coder reached the end of the
design) have an empty `ended` column. If you need to know who completed,
for example for payment, put an end item with the outcome **Complete** at
the end of the design.

## What the coder sees

The last screen shows the heading, then your message, or if there is none,
a standard sentence (_"This is the end of the study for you."_ for a
screenout). With a redirect link there is a **Continue** button, and the
coder is sent on automatically after three seconds.

The message is a template, like a question text: markdown, references and
`{{ }}` all work, e.g.
_"Thank you! Your completion code is **C1234**."_ An end item inside a unit
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
`$var` and `$session` references, which are filled in with the coder's
answers, random conditions and session values, **URL-encoded**: spaces,
`&` and other special characters in a value can't break the link.

```text
https://panel.example/return?status=screenout&id=$session.coder
https://panel.example/return?status=complete&id=$session.coder&group=$var.group.value
```

Here `$session.coder` is the coder id the link came with (a
crowd invitation's coder id from a URL parameter, see [Links](links.md#coder-ids)),
and `group` is a [random condition](random-condition.md) of the design,
drawn at random. How to get a panel's participant id into the design as the coder id is
explained in [Online panels and crowd coding](online-panels.md).

Only `$var` and `$session` references work in a redirect link: no `$unit` and no
`{{ }}`. Use `.value`, not `.label`, so that the panel gets the stored value.
An unanswered question leaves its place in the link empty.

## Typical uses

### Consent refused

A first question _"Do you agree to take part?"_ with the options _Yes_ and
_No_, then a condition _consent is "no"_ with an end item **Screened out**
inside it, with a short message thanking them. Everything else comes after
the condition, so only those who agreed continue.

### Not eligible

Background questions first (age, country, language), then one condition per
reason, or one condition with **Any rule may hold**, around a screenout end
item. Ask the screening questions as early as possible, so ineligible
coders don't spend time on the rest.

### Failed attention check

An attention check is a question with one obviously right answer, such as
_"To show you are reading carefully, choose 'Somewhat disagree'"_. Put a
condition _check is not "somewhat_disagree"_ after it, with a screenout end
item inside. Inside a unit loop, the same works per unit: an end item there
ends the session after saving the current unit's answers.

> Online panels have rules about screening out participants and about
> attention checks, for example whether participants must still be paid.
> Check them before you use an end item to remove coders.

### Back to the panel

**At the end** sends coders to the panel's completion link, and inside each
screening condition an end item **Screened out** sends them to the panel's
screenout link.

## Where end items can go

End items can stand anywhere: at the top level, inside conditions, and
inside unit loops. Every end item needs a unique name, like any item with a
name.

An end item is only reached when the coder gets to its place. An end item
placed after a unit loop is reached once the coder has finished their units
in that loop.
