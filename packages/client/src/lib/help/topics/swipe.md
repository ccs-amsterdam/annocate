---
title: Swipe
section: Question types
order: 5
summary: Answer by swiping the unit left, right or up - fast judgements with two or three options.
---

A **Swipe** question is answered by swiping a card, as in a dating app: left
for one option, right for another, and up for an optional third. In a unit
loop the card is the unit itself, so coders read the article or post and
swipe it away with their answer. It is the fastest way to code many units,
and the reason AnnoTinder has its name.

Swipe questions are categorical, like a [nominal question](nominal-and-ordinal.md)
without the option to choose several: each option has a value (stored) and
a label (shown).

## Options and directions

A swipe question has **two or three options**. Their order in the
**Options** list is their direction, shown by the arrow in front of each:

| Position | Direction |
| --- | --- |
| 1st | swipe left |
| 2nd | swipe right |
| 3rd (optional) | swipe up |

A new swipe question has *No* on the left and *Yes* on the right. **+ Add
option** disappears once there are three. Use the arrows on each row to
swap directions.

Give options a **Color** to make the directions easy to tell apart, such as
red for *No* and green for *Yes*: the colour shows on the buttons and on
the label that appears on the card while it is dragged.

> Put the options where coders expect them: *No* or *Not relevant* on the
> left, *Yes* or *Relevant* on the right. Swapping them halfway through a
> study confuses coders.

## How coders answer

- **Swipe**: drag anywhere on the screen to the side (or up): the unit
  moves with it. While dragging, the option for that direction appears on
  it. Let go far enough (about a
  third of the card's width) or with a quick flick, and the card flies off
  and the answer is given. Let go earlier and it springs back.
- **Tap a button**: under the question there is a button per option, with
  its arrow: left on the left, right on the right, up in the middle.
- **Press a key**: **←**, **→** and **↑**, or **1**, **2** and **3** for
  the 1st, 2nd and 3rd option.

Long units still scroll as usual: dragging up and down scrolls the text.
Swiping up only answers once the unit is scrolled to the end, so a coder
can't skip the rest of a long text by accident.

Outside a unit loop there is no unit, so the question itself is the card.

By default the unit looks the same as during the loop's other questions,
so nothing jumps when a swipe question comes up. Tick **show the unit on a
card** in the question's form to frame it as a card while it is asked.

## When swiping is a good idea

Swiping works best for **quick, simple judgements on many units**:

- **Relevance filtering**: is this article about the election, yes or no?
  Code thousands of search results before the real coding starts.
- **Crowd coding and citizen science**: participants code on their phone,
  in a few spare minutes, with a gesture they already know.
- **Training and validation data** for a classifier, where you need many
  labels on simple categories.
- **Survey experiments** where participants judge a series of messages
  (*Would you share this post?*).

It is less suitable when:

- **there are more than three answers**: use a nominal question;
- **the judgement needs thought**, such as a frame or an argument: the
  speed of swiping invites quick, intuitive answers. That is the point for
  first impressions, but not for careful coding;
- **coders need to read a long text** before they can judge: they can, but
  the card then fills the screen and the swipe gesture is far away from
  where they started reading;
- **mistakes are costly**: a swipe answers at once. Coders can go back to
  the previous question and change their answer, but they need to notice
  first.

## Using the answers

A swipe answer works like a single nominal answer: `$var.relevant.value`
is the value (`yes`), `$var.relevant.label` the label (*Yes*), and
conditions can use *is* and *is one of*, for example to ask follow-up
questions only for relevant units. See [Conditions](conditions.md).

A swipe question can also decide when a shared unit has been coded enough
(see [Shared queues](shared-queues.md)), just like a nominal question with
one answer.
