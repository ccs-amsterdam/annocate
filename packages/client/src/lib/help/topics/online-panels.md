---
title: Online panels and crowd coding
section: Coders
order: 2
summary: Run a study with coders from Prolific, MTurk or another panel - ids in the link, screenouts, completion links and sample sizes.
---

Panels (Prolific, MTurk, CloudResearch) send participants to your link and
expect them back when done.

## The flow

1. The panel sends a participant to your link with its id for them (on
   Prolific `PROLIFIC_PID`).
2. AnnoTinder stores it as the coder id (`$session.coder`), plus other
   values from the link if you like.
3. The coder answers and codes.
4. An **end item** sends them to the panel's return link.
5. You match the panel's records to the results by coder id.

## The link for the panel

1. **Coder invitations** → **Crowd** → tick **Coder id from a URL
   parameter**, with the panel's name for it (`PROLIFIC_PID`). Keep
   **Required** on; optionally a **pattern** such as `[0-9a-f]{24}`.
2. Deploy. The link under **Deploy › Links** ends in
   `PROLIFIC_PID=<coder id>`.
3. Replace `<coder id>` with the panel's placeholder (Prolific:
   `{{%PROLIFIC_PID%}}`) and give that link to the panel.
4. Optionally set a **Label** (_Prolific pilot_) and **Max uses** a bit
   above the number of places.

The id shows on **Coders** and as `coder` in the results, and keeps
sessions apart (see [Coder ids](links.md#coder-ids)).

## Values from the link

For more values (a study id, a session id), add
[URL parameters](session-parameters.md): a name (`study`) and **In the URL
as** (`STUDY_ID`). Use them as `$session.study` in texts, conditions and
return links. A link missing a required value doesn't start and says
which, so a broken link shows in your first test.

```text
<your link>&PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

> If the link already contains a `?`, add parameters with `&`.

## Sending coders back

Use [end items](end-items.md), one per return link:

```text
Consent                   categories: yes, no
Show if: consent is "no"
  └ End: no_consent       screened out → panel's "no consent" link
Age                       number
Show if: age < 18
  └ End: too_young        screened out → panel's screenout link
Unit loop                 10 news articles
End: done                 complete → panel's completion link
```

In each end item, **Then send coders to** → _A panel's return link_, with a
name (e.g. `panel_complete`). Put the actual links in the study's
**Settings** under **Panel return links**: they apply at once, without
deploying, and each run fills in its own. (A fixed link can go in the end
item: _This URL_.) References are URL-encoded:

```text
https://panel.example/complete?id=$session.coder&study=$session.study
https://app.prolific.com/submissions/complete?cc=C1A2B3C4
```

> End the design with an end item **Complete**, or finishing coders see
> AnnoTinder's own closing screen and aren't sent back.

The outcome is in the `ended` column of `coders.csv`, to check against the
panel.

## Screening and attention checks

- **Screening**: screening questions first, each followed by a Show if
  with a screened-out end item. Pre-screen on the panel where you can.
- **Attention checks**: a question with one right answer and a Show if on
  other answers.

> Follow the panel's rules on screening out and rejecting (e.g. whether
> screened-out participants are paid).

## Experimental conditions

Draw a [random condition](random-condition.md) and show different material
with [Show if](conditions.md) or `::: if`. See
[Experimental conditions](experimental-conditions.md).

## How many coders?

For crowd coding, share the units (see [Shared queues](shared-queues.md))
and set **Units per coder, at most**:

```text
coders ≈ units × coders per unit ÷ units per coder
```

600 units × 3 ÷ 20 = 90 coders, plus a few for those who stop. When every
unit is full, later coders skip the loop (and with an end item
**Complete** after it, go straight back): stop recruiting when
**Overview** shows the units complete (see
[Following progress](coders-and-progress.md)).

For an experiment where everyone judges the same few messages, don't share
the units; consider **Random** order.

## Before you launch

1. **Preview** the design, also on a phone.
2. Deploy and open the panel link yourself with made-up values
   (`PROLIFIC_PID=test1&STUDY_ID=s1`); check you land on the panel's page.
3. Check **Coders** shows the id. Test sessions are real coders (they take
   queue units too): give them recognisable ids and leave them out.
4. Run a small pilot batch first.
