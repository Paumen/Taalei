---
name: review
description: Put doubtful model changes to the PO as a before/after review page and apply the verdicts. Use whenever a task changes models or tags in ways a person should judge (recolours, rescales, retags, shape or geometry edits, lint fixes decided per case), when asked to show doubtful changes for review, or when handed review verdicts.
---

# Review of doubtful changes

Any task that decides per model hands its doubtful changes to the PO this way,
before the PR is merged.

## 0. Calibrate

Run `node tools/review/review.mjs brief` before choosing what to send. It reads
every past verdict in `tools/review/log.json` and advises: a change type the
PO often undoes is sent in full, one the PO nearly always keeps is sent only
where doubt is high, and a review with undone changes gets a follow-up round
of the related changes not yet reviewed (same change, kind branch, material
or kit). Follow the advice. The log is committed, so it carries across sessions.

## 1. List

Write a list JSON in the scratchpad (format: `node tools/review/review.mjs`):
`title`, `base` (the commit before the changes), and per item `model`,
`group`, `change` (what was done), `note` (why it is doubtful) and `doubt`
(`high` first, `low` after). Leave `types` out; the tool derives them.

Put every doubtful change in, not a sample: high doubt first, then the other
visible changes of the task grouped by kind of change. Leave out models
already given a verdict.

## 2. Build and publish

    node tools/review/review.mjs build <list.json> --out <scratchpad>/review

It renders each model from two angles and diffs it. A card has two columns,
before left and after right; boxes on the after image mark what changed. A
model with only tag or invisible changes shows one image. A size change of 20%
or more shows both at true scale in the scale page's style, at least 1 m tall: its grid (0.1 m dashed, 0.2 m solid, 1 m heavy), red and white ruler sticks in 0.2 m blocks,
and the kind's limits as lines. The Slider switch wipes between before and
after. Keep, Fail and Revert sit side by side, the other verdicts and the comment box always show; a verdict of the three scrolls to the next card. Each change type is a white glyph in a coloured circle (size, tags,
colour, shape, mesh); a fact row puts the old value left, the new value right,
and the glyph with the delta centred between them. Tags are catalogue chips
(removed struck through in red, added filled), colours catalogue swatches
(removed slashed, added ticked). Publish `<out>/review.html` as an artifact,
renamed `_v2`, `_v3`, … on each new round, and link it in the PR.

## 3. Verdicts

The PO marks each item Keep, Fail (retry), Keep but…, Revert, Relax rule, Other or
Later, with a comment where the verdict needs one, and pastes the copied
verdicts (JSON, or lines of `kit/name: verdict — comment`). Save them to the
scratchpad and run

    node tools/review/review.mjs apply <verdicts>

Reverts are done by the tool, file and tags. Then do the work it prints:
keep but (the follow-up in the comment), retry (another fix, as the comment says
if there is one), relax (loosen or except the rule in `lint/*.json`, as the comment says),
other. Later stays open for the next round. Next to the verdict a card can carry a
mark: ★ great (spot on, beyond expectations) or ✕✕ bad (opposite of the goal,
high impact); a mark without a verdict counts as keep or revert. `brief` lists
the latest marked changes: copy the great ones in later work, and never repeat
the bad ones. A later fix on a reverted file,
such as a glb-lint repair, is applied again on top. Rebuild, lint, and
put the retried models in the next round.

`apply` logs every verdict. Run `brief` again: when it asks for a follow-up,
build the next round from it without waiting to be asked, with the
changes most like the undone ones first.
