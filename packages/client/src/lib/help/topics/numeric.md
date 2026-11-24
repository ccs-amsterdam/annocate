---
title: Numbers
section: Question types
order: 3
summary: Numeric questions - a range, steps, labels at break points, and buttons, a slider or a box.
---

A **Number** question asks for one number: sources quoted, age, a 0-100
thermometer, a 0-10 credibility rating. For a few labelled ordered
categories, use [ordered options](nominal-and-ordinal.md).

## Range and steps

| Setting     | Does                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------- |
| **Minimum** | lowest number (empty: no limit)                                                                |
| **Maximum** | highest number (empty: no limit)                                                               |
| **Steps**   | **Whole numbers** (default), **One decimal**, **Two decimals**, or **Custom** (e.g. 5, or 0.5) |

Steps count from the minimum: minimum 1, steps 2 allows 1, 3, 5, ... A new
question starts at 0 to 10.

## Labels at break points

Under **Labels (optional)**, **+ Add label** puts a word at a number
(0 _Very cold_, 50 _Neutral_, 100 _Very warm_). Coders see them along the
buttons or slider, or as a hint under a box. `$var.thermo.label` gives the
label for an exact match, else the number.

## Layouts

| Layout                      | Coders see                             | Needs               |
| --------------------------- | -------------------------------------- | ------------------- |
| **Buttons (one per value)** | a button per number; one click answers | minimum and maximum |
| **Slider**                  | a slider and **Continue**              | minimum and maximum |
| **Number input**            | a box and **Continue**                 | nothing             |

**Auto**: a number input without a minimum or maximum, buttons for up to
6 numbers, else a slider.

- **Buttons** are fastest and make every number equally easy. Up to 11
  fit in one row; choose them yourself for e.g. 0-10. Keys **1** to **9**
  work with up to nine buttons.
- **Slider** starts without a value (**Continue** stays disabled until
  moved). Keys: **←** **→** move it (from the middle), **Home** / **End**
  go to the ends, **Ctrl + Enter** continues. Coders tend to stay near the
  start, and fine positions are hard on phones.
- **Number input** refuses numbers outside the range or between steps.
  Use it for counts and age.

## Using the answers

`$var.age.value` is the number; conditions compare it
(`$var.age.lt(18)`, see [Conditions](conditions.md)). The results have one
column, without a `_label` column.
