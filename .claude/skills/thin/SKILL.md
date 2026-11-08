---
name: thin
description: Fix catalogue models whose parts are too thin — tubes, sticks, plates, blades, leaves, roofs, shells and paper-thin cards flagged by G27 — so they read chunky in the catalogue style, choosing per model between scaling up, thickening the part, fewer repeats, dropping an unimportant part, a better kind or a looser kind limit, and checking every result for damage before the PO sees it. Use when asked to fix thin parts, thicken models, clear G27, or apply thin review verdicts.
---

# Thin parts

Goal: every part meets its kind's `thin.min`, while every model still reads
as itself. Where there is a good reason not to, a wall falls back to 0.006,
the bare minimum, and the review says why. A tube under `thin.min` stays an
error. Thin parts break the chunky style
(`I01`); that is the reason, not the number.

`docs/asset_style_guide.md` decides; this skill only says how. G27 there
defines `minTube`, `minWall`, `thin.min` and the limits.

## 1. Find

1. Rebuild (`catalog-assets` §6) and run `node lint/measures.mjs G27`.
2. Work kind by kind. Per model, render the thin parts so the part G27 means
   is known, not guessed.

## 2. Choose a fix

Per model, list what could clear it, drop what clearly can't work, and pick
the best of the rest from the model, its data, its peers and how it looks.
When a model is far off, a bigger measure is likely best.

- **Scale up**: the whole model is too small for its kind; growing it may
  clear the part on its own.
- **Thicken the part**: only the thin part grows, toward `thin.min`, never
  under 0.006. Pick per part which way it grows (around its middle, or away
  from what it sits on) and say which on the review.
- **Fewer repeats**: many thin parts thickened at once read wrong (a rake or
  broom with 12 tines may read right with 8 thicker ones).
- **Drop the part**: it does not carry what the model is or its character.
- **Undo the tool**: an earlier tool made it thicker or thinner than needed.
- **Other kind**: only when another kind is the more logical one and has a
  lower `thin.min`.
- **Looser limit**: the kind's `thin.min` is too strict; propose it to the
  PO, don't force the shape.
- **Paper-thin card** (one sheet, no depth): make it a closed solid slab of
  at least 0.006.

A fix may combine these.

Models that belong together get the same edit: colour variants sharing
geometry, and modular pieces that fit each other (walls, floors, doors,
rails, fences of one kit), which must still fit after.

### Tools

- Scale up: `tools/import/scale.mjs`.
- Fewer repeats, drop or rebuild a part: `tools/detail/slim.mjs`.

### Sensible limits

0.006 is the floor and is never asked lower. Propose a lower `thin.min` for
a kind only when both hold:

- Every other fix in §2 was tried on the model and failed §3, shown as
  renders.
- It holds for the kind, not one model: at least three models of the kind,
  from two kits or more, need it for the same part.

One model that won't fit is not a limit problem: show it on the review as
failed, with the fixes tried. Never ask to exempt a model.

## 3. Check every fix

Before the PO sees a result, compare it with the original. Any of these is a
failed fix: retry it before showing. Every model in the run is always
shown.

- **Tool bugs**: holes, stray or spiked vertices, parts moved off, missing
  or doubled geometry.
- **Misformed model**: the outline or shape no longer matches the original
  from iso, front and right.
- **Colours flipped**: faces or parts took another colour or band than
  before.
- **Glitchy triangles**: slivers, z-fighting, flipped faces, new back faces
  (new red in `faceorient`, magenta in `claywire`).
- **Round things lost**: round, curved or smooth parts went flat, square or
  faceted.
- **Proportions off**: parts or the whole model in odd proportions to each
  other or to the kind's peers.
- **Parts swallowed**: a grown part covers, hides or merges with another
  part.
- **Parts crossing**: a grown part pokes through another part or through
  itself in a way the original did not.
- **Gaps closed**: holes, slots, tines and joints that were open now shut.
- **Lint**: `node lint/glb-lint.mjs <file> --only-problems`, the seven lints
  (size, tpu, measures, mat, palette, bands, backface) and `golden` show nothing new.

Look at renders for each: `pbr` and `matcap` with `--views iso,front,right` next to the
original, and `faceorient`. Judge colour only after viewing
a render (C18).

## 4. Review

Put every changed model on a review page titled `Thin: …`, built with
`tools/review/review.mjs` (it offers the kind's lower thin limits on each
card, for a kind whose limit looks wrong), with the fix chosen and why, and
apply the verdicts.

## 5. Learn

Every verdict on a `Thin:` review is the skill's memory. Before any round,
and in every sub agent's brief, run

    node tools/review/review.mjs brief --review "thin:"

and match a new case to the closest past ones per kind and per fix: copy what
was kept, avoid what was reverted. Only PO verdicts count; notes by Claude in
logs are not guidance. When one lesson shows up across several models and
reviews, write it into §2 or §3 in general terms.
