---
name: review
description: Put doubtful model changes to the PO as a before/after review page and apply the verdicts. Use whenever a task changes models or tags in ways a person should judge (recolours, rescales, retags, shape or geometry edits, lint fixes decided per case), when asked to show doubtful changes for review, or when handed review verdicts.
---

# Review of doubtful changes

Any task that decides per model hands its doubtful changes to the PO this way,
before the PR is merged. Every flow uses the same list fields and the same
page; the tool, not the flow, decides risk and what the page shows.

## 0. Calibrate

Run `node tools/review/review.mjs brief` before choosing what to send. It reads
every past verdict in `tools/review/log.json` and advises: a change type the
PO often undoes is sent in full, one the PO nearly always keeps is sent only
where risk is high, and a review with undone changes gets a follow-up round
of the related changes not yet reviewed (same change, kind branch, material
or kit). Follow the advice. The log is committed, so it carries across sessions.

## 1. List

Write a list JSON in the scratchpad (format: `node tools/review/review.mjs`):
`title`, `base` (the commit before the changes), and per item:

- `model`, `group` (the kind, or a heading)
- `change`: what was done, a short clause
- `why`: why you doubt it, a short clause; leave it out when you don't
- `proposal`: a proposal for the PO (another kind, a tag, a looser rule), with
  or without a change to the model
- `warn`: a heads-up the PO must not miss, such as a fallback to a lower limit

Put every doubtful change in, not a sample, plus the other visible changes of
the task. Leave out models already given a verdict. Order doesn't matter.

## 2. Build and publish

    node tools/review/review.mjs build <list.json> --out <scratchpad>/review

Risk is set by the tool, the same way for every flow: high when the item has a
`why` or `proposal`, or the diff shows a size change of ×1.2 or more either
way, a kind change, ±40% triangles, 35% of the colour moved, or points moved
5% of the model. A high-risk card gets an amber edge and its reasons in amber.

The page keeps one layout for every flow. On top, an overview grid: one tile
per model, an amber dot for high risk, the border coloured by verdict; a tap
jumps to the card. A card: kit/name with the group and badges (size ×N for a
size change of ×1.2 or more, new, no change, proposal only, tags only);
before and after pictures (a slider by default, boxes on what changed) with ↻
in the picture for the back; the true-size view when only size changed; a
small picture beside the facts when only kind or tags changed or nothing did;
fact rows, old value left, new right; three big buttons Undo, Try again, Keep, each jumping to the next card
(a second press clears), each with a smaller twin beside it: ✕✕ (Undo,
awful), 💬 (Try again, opens the comment box, no jump), ★ (Keep, great); a row with Relax
rule, Other and 💬; "What's wrong?" issue buttons after Try again, the kind's
lower thin limits after Relax rule. The comment box opens with 💬, Relax rule
or Other; Keep with a comment is keep but. The note (reasons, change, proposal, warn)
sits beside kit/name. A tap on a change icon, tag chip, swatch or number flags that value; a
tap on an after picture drops a numbered pin. The top bar switches Slider,
Unjudged and Scale.

Publish `<out>/review.html` as an artifact with `capabilities: {db: {}}`,
renamed `_v2`, `_v3`, … on each new round, and link it in the PR. Every tap
saves itself to the artifact's db collection `verdicts`, one doc per model;
there is no copy button.

## 3. Verdicts

When the PO says the review is done, read the verdicts yourself:
`ArtifactData` `list` of collection `verdicts` on the review artifact. Save
the docs as JSON in the scratchpad (lines of `kit/name: verdict — comment`
also work) and run

    node tools/review/review.mjs apply <verdicts>

| Page        | Verdict   | Done by `apply`         | Work left for you                |
|-------------|-----------|-------------------------|----------------------------------|
| Keep        | `keep`    | nothing                 | a kept proposal: do it           |
| Try again   | `retry`   | model and tags put back | a new attempt, per the comment   |
| Undo        | `revert`  | model and tags put back | none                             |
| Keep + comment | `keepbut` | nothing                 | the follow-up in the comment     |
| Relax rule  | `relax`   | model and tags put back | loosen or except the rule in `lint/*.json` |
| Other       | `other`   | nothing                 | what the comment says            |
| Later       | `later`   | nothing                 | left open                        |

Flags or pins without a verdict count as Try again, a comment alone as
Other, ★ alone as Keep, ✕✕ alone as Undo. Read pins against the after pictures (front or back,
x and y from the top left). A Try again or Undo can point to another problem
with the model than the change itself: look at the whole model against its
source and peers before retrying the same change. A later fix on a reverted
file, such as a glb-lint repair, is applied again on top. Rebuild, lint, and
put the retried models in the next round.

`apply` logs every verdict, with the risk as `doubt`. `brief` lists the latest
★ and ✕✕ changes: copy the great ones in later work. Run `brief` again: when
it asks for a follow-up, build the next round from it without waiting to be
asked, with the changes most like the undone ones first.
