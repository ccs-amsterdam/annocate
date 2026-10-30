---
title: Online panels and crowd coding
section: Coders
order: 2
summary: Run a job with participants from Prolific, MTurk or another panel - ids in the link, screenouts, completion links and sample sizes.
---

Online panels and crowd-working platforms (Prolific, MTurk, CloudResearch,
survey panels) send their participants to your study with a link, and
expect them back when they are done. AnnoTinder supports this flow for
survey experiments (participants judge a few messages) and for crowd coding
(many workers code many units, each unit by a few of them).

## The flow

1. The panel sends a participant to your **link**, with the
   participant's id added to it.
2. AnnoTinder stores the id with the coder, and if you like other values
   from the link (a study id, a condition the panel assigned).
3. The participant answers your questions and codes their units.
4. At the end, or when they are screened out, an **end item** sends them to
   the panel's return link, with their id or a completion code in it.
5. You match the panel's records to AnnoTinder's results by the
   participant id, and pay those who completed.

## The link for the panel

Panels send participants to a link with their id in it. Tell the codebook
which URL parameter has the id: add a **Session** item to the codebook (see
[Session parameters](session-parameters.md)) and tick **Participant id from
a URL parameter**, with the name the panel uses, such as `PROLIFIC_PID`.
Optionally give a **pattern** the id must fit, e.g. `[0-9a-f]{24}` for
Prolific's ids, so a link with a typo or a placeholder that wasn't filled in
doesn't start.

After publishing, the link on the **Invitations** tab ends in
`PROLIFIC_PID=<participant id>`. In the link you give the panel, replace
`<participant id>` with the panel's placeholder, which the panel fills in
for each participant. On Prolific that is `{{%PROLIFIC_PID%}}`; other panels
have their own (check their documentation). On the link itself (the pencil
icon) you can set a **Label**, e.g. *Prolific pilot*, and **Max uses**: a
little above the number of places in the study, as a safety net if the link
leaks.

The participant id then appears in the Coders tab and as `participant_id` in
the results. It also keeps sessions apart: a participant who opens the link
again on the same device continues their session, and one who opens it on
another device is told they already started (see
[Participant ids](invitations.md#participant-ids)).

## Values from the link

Panels often send more than the participant id, for instance a study id and
a session id, and want some of them back in the return link. Add them to the
Session item as **URL parameters**: a name for the codebook (`study`), the
**URL key** as the panel sends it (`STUDY_ID`), and its values (any value,
optionally with a pattern; or a list). Without a default a URL parameter is
required.

The codebook can then use them as **session values**:

| Write | Gives |
| --- | --- |
| `$session.participant` | The participant id |
| `$session.study` | The value of the URL parameter `STUDY_ID` |
| `$session.source` | The optional `?source=` of any link |

Session values work everywhere: in texts, conditions, end items' messages
and return links. A link that misses a required parameter, or has a value
that doesn't fit, doesn't start: the participant sees which parameter is
missing, so you notice a broken link in your first test. The values are
stored when the participant starts, and are in the Coders tab's download
(`coders.csv`, as `session.<name>`).

```text
<your link>&PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

> If your link already contains a `?`, add parameters with `&` (as above).
> Test the complete link yourself before you launch.

## Sending participants back

Panels usually want participants back through one of several return links:
one for completes, and often others for screenouts or for those who didn't
consent. Use [end items](end-items.md) for this:

```text
Consent                   nominal: yes, no
Condition: if consent is "no"
  └ End: no_consent       screened out → panel's "no consent" link
Age                       numeric
Condition: if age < 18
  └ End: too_young        screened out → panel's screenout link
Unit loop                 10 news articles
End: done                 complete → panel's completion link
```

Put the panel's link in **Redirect to (optional)**, with `$session` (or
`$var`) references where the panel wants values:

```text
https://panel.example/complete?id=$session.participant&study=$session.STUDY_ID
https://app.prolific.com/submissions/complete?cc=C1A2B3C4
```

Values are URL-encoded, so they can't break the link. The participant sees
your message and is sent on after three seconds, or when they click
**Continue**. The outcome (*screenout* or *complete*) is in the `ended`
column of `coders.csv`, so you can check the panel's list against yours.

> Put an end item with the outcome **Complete** at the very end of the
> codebook. Without it, participants who finish see AnnoTinder's own
> closing screen and are not sent back to the panel.

## Screening and attention checks

- **Screening**: ask the screening questions first, each followed by a
  condition with a screenout end item, so ineligible participants leave
  quickly. Many panels can pre-screen on their side; screen in AnnoTinder
  only on what the panel can't.
- **Attention checks**: a question with one right answer, and a condition
  on any other answer with a screenout end item. Inside a unit loop this
  works per unit, e.g. on a unit with an obvious answer.

> Panels have rules about screening out and attention checks (for example
> when you may reject a participant, and whether screened-out participants
> are paid). Follow them: they protect your participants, and your account.

## Experimental conditions

For a survey experiment, give each participant a condition with an
[assigned variable](auto.md) (**Random draw** or **Balanced**), and show
different material with conditions or `::: if` blocks. If the panel assigns
the condition (for example two panel studies, one per condition), make the
condition a **link parameter** with the conditions as its values: publishing
makes a link per condition, to give each panel study its own (see
[Session parameters](session-parameters.md)).

## How many participants?

For crowd coding, units are usually **shared among coders**: each unit goes
to coders until enough of them coded it (see
[Shared queues](shared-queues.md)). With **Units per coder, at most**, you can
work out how many participants you need:

```text
participants ≈ units × coders per unit ÷ units per participant
```

For 600 units, each coded by 3 participants, 20 units per participant:
600 × 3 ÷ 20 = 90 participants. Recruit a few more for those who stop
halfway: the units held by someone who stops (up to five) go back to the
queue after 15 minutes.

When every unit is full (coded by *at most* coders, or agreed on),
participants who arrive later get no units in that
loop and go on to the next item: with an end item **Complete** after the
loop, they are sent back right away. Watch the **Progress** on the Overview
tab (see [Following progress](coders-and-progress.md)) and stop recruiting
once the units are complete.

For a survey experiment where everyone judges the same few messages, use
**Everyone codes everything** instead, possibly with the order **Random (each coder their
own order)**.

## Before you launch

1. **Preview** the whole codebook, on a phone too: many panel participants
   use one.
2. Publish, and open the panel link yourself with made-up values, e.g.
   `PROLIFIC_PID=test1&STUDY_ID=s1` (fitting your patterns). Go through to
   the end and check that you land on the panel's page with the right
   values.
3. Check the Coders tab: your test session should show the id. Test
   sessions count as real coders (they also take units from a shared
   queue), so give them recognisable ids and leave them out of the
   analysis.
4. Launch a small pilot batch first, and look at the results before the
   full sample.
