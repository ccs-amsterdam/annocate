---
title: Ending a session
section: Editor
order: 6
summary: End items end a coder's session early or on purpose - screened out or complete - with a message and an optional link back to a panel.
---

A session normally ends after the whole design; what coders see then, and
where they go, is set at **At the end**, the button below the tree. An **end
item** ends the session earlier, for coders who:

- don't consent or don't fit the study;
- fail an attention check;
- must be sent back to an online panel (see
  [Online panels and crowd coding](online-panels.md)).

Put it inside a [block with a condition](conditions.md), so only some
coders reach it (an end item can't stand on its own at the top level):

```text
Consent                   categories: yes, no
if consent is "no"
  └ End: no_consent       screened out
Age                       number
if age < 18
  └ End: too_young        screened out
Unit loop                 20 news articles
At the end                "Thank you!", back to the panel
```

## Adding an end item

Click **+** where the session should end and choose **End** (see
[Adding items](design-editor.md#adding-items)).

| Field                   | Does                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| **Item Name**           | e.g. `too_young`; stored with the session                                |
| **Outcome**             | **Screened out (not eligible)** or **Complete**                          |
| **Message (optional)**  | the last screen's text: markdown and references (`$var.group.label`)     |
| **Then send coders to** | nowhere, **This URL**, or a panel's return link set in the study's **Settings** |

## Screened out or complete

The outcome is in the `ended` column of `coders.csv` (time in
`ended_at`). Coders who reach the end of the design normally have an
empty `ended`; to mark completes, e.g. for payment, end with an end item
**Complete**.

| Outcome          | For                                         | Heading          |
| ---------------- | ------------------------------------------- | ---------------- |
| **Screened out** | no consent, not eligible, failed a check     | _Thank you_      |
| **Complete**     | did what was asked                          | _Study Complete!_ |

## What the coder sees

The heading and your message (or a standard sentence). With a redirect, a
**Continue** button, and after three seconds they are sent on. In a loop
the message can use the unit's data; [snippets](snippets.md) don't work
here. Afterwards the session is closed; earlier answers are kept. The
preview shows a redirect but doesn't follow it.

## Redirect links

A redirect starts with `https://` and can contain `$var` and `$session`
references, URL-encoded:

```text
https://panel.example/return?status=complete&id=$session.coder&group=$var.group.value
```

`$session.coder` is the coder id from the link (see
[Links](links.md#coder-ids)). Use `.value`, not `.label`. No `$unit` or
`{{ }}`.

## Typical uses

- **Consent refused**: _"Do you agree to take part?"_, then a block
  if _consent is "no"_ with a screened-out end item.
- **Not eligible**: screening questions first, then a block with a
  condition (**Any rule may hold**) around a screened-out end item.
- **Failed attention check**: _"Choose 'Somewhat disagree'"_, then a
  block if _check is not "somewhat_disagree"_. In a loop, the unit's answers are
  saved first.
- **Back to the panel**: **At the end** sends coders to the completion
  link; end items in screening conditions to the screenout link.

> Panels have rules about screening out and attention checks (e.g.
> whether to pay). Check them first.

End items go in a block (in a loop or not) and need a unique name. One after a loop is
reached once the coder finished that loop.
