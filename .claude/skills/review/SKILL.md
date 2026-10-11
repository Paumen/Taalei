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

It renders before and after from two angles and diffs each model into type
badges (⤢ size, # tag, ◐ recolour, ◇ shape, △ geometry) with one to three pips
for how large the change is, and rows: kind and tags old → new (removed struck
through, added green), size with its factor, triangles with the change in
percent, colour as before and after band bars with real swatches and the share
of surface recoloured, how far vertices moved, and the share of pixels changed.
Strength colours run grey, amber, red. The Diff switch shows the changed
pixels in cyan on a grey copy, for changes too small to see. Publish `<out>/review.html` as an artifact,
renamed `_v2`, `_v3`, … on each new round, and link it in the PR.

## 3. Verdicts

The PO marks each item Keep, Keep but…, Revert, Retry, Relax rule, Other or
Later, with a comment where the verdict needs one, and pastes the copied
verdicts (JSON, or lines of `kit/name: verdict — comment`). Save them to the
scratchpad and run

    node tools/review/review.mjs apply <verdicts>

Reverts are done by the tool, file and tags. Then do the work it prints:
keep but (the follow-up in the comment), retry (another fix, the comment says
how), relax (loosen or except the rule in `lint/*.json`, as the comment says),
other. Later stays open for the next round. A later fix on a reverted file,
such as a glb-lint repair, is applied again on top. Rebuild, lint, and
put the retried models in the next round.

`apply` logs every verdict. Run `brief` again: when it asks for a follow-up,
build the next round from it without waiting to be asked, with the
changes most like the undone ones first.
