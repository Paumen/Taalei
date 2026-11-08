---
name: thin
description: Fix catalogue models whose parts are too thin (G27) with clean fixes that leave every model looking like itself — tips sharp, openings open, neighbours untouched — checked by close-ups of every spot that moved. Use when asked to fix thin parts, thicken models, clear G27, or apply thin review verdicts.
---

# Thin parts

Goal: clear `G27` while every model still looks exactly like itself. A fix
that clears the lint but changes how the model looks is worse than no fix.
When no clean fix exists, keep the original and report it.

`docs/asset_style_guide.md` decides what G27 measures; this skill only says
how to fix it.

## Where fixes go wrong

Thickening moves a surface by about as much as the wall grows, 1 to 3 mm.
The damage is at that size, so it never shows on a whole-model render. In
the first weapons and tools round, 33 of 133 fixes were sent back. Every one
was one of these, and none was seen before the review:

- **Tips**: points of arrowheads, spears, blades and wings go blunt, flat,
  bent or skewed.
- **Openings**: bores, muzzles, holes, slots, chain links, grooves, seams and
  the gaps between arms, teeth or tines narrow or close.
- **Neighbours**: a grown part pokes through the part next to it, or covers
  it (a blade through its collar, a red inlay over the gold).
- **Bloat**: a part that was not the thin one grows too (an arrow shaft twice
  as thick, wires four times), or a small part turns chunky next to its peers.
- **Character**: thinning repeats changes what the model is (comb teeth
  became blocks).

## What not to check

Lints catch back faces (`backface`), z-fighting and doubled triangles
(`glb-lint`), walls and tubes (`measures`), triangles, size and colours. Run
them once at the end and fix what they report. Don't look for these in
renders, and don't count a clean lint or a render without magenta as a check:
neither says anything about the damage above.

## 1. Find the thin part

Run `node lint/measures.mjs G27`. For each model, map it with
`tools/thin/thinmap.mjs` then `thinmap.py` (thin faces in red), so the fix
targets the part G27 means.

## 2. Fix

Grow only the thin part, and only to the 0.006 floor unless the kind's
`thin.min` is reached with the same edit.

Before choosing, look at what sits within 3 mm of the thin part: a tip, an
opening or another part. The thicken modes are blind to all three:

- `--sheet` bends and skews tips (17 of 46 sent back).
- `--flat` lost outlines and fused parts (7 of 11 sent back).
- `--inward` fills the hollow it grows into (2 of 3 sent back: tubes fused,
  a spoon bowl deformed).
- The default and `--local` grow into every opening on the part (bores,
  muzzles, slots, grooves).

No mode is safe on its own; the close-up decides. When something sits that
close, try what leaves it alone: limit growth to the faces that need it
(`--parts`, `--local`), grow only the side away from it, close a hollow with
`tools/thin/cap.mjs` (and close the hole it leaves), or rebuild the part as a
closed solid on its own outline (kept: the paper-tidy label frame). If none
is clean, leave the model.

Other fixes, each only when the reason holds:

- **Scale up**: the whole model is thin, not one part.
- **Drop the part**: it does not carry what the model is.
- **Other kind**: another kind is more logical and has a lower `thin.min`.
- **Paper-thin card**: make it a closed slab of at least 0.006.

Models that belong together get the same edit: colour variants that share
geometry, and modular pieces, which must still fit together.

## 3. Check with close-ups

    node tools/thin/closeup.mjs <before.glb> <after.glb> <out.png>

It draws every spot where the surface moved, zoomed in, before and after
side by side from three angles. Look at every row, and judge each spot only
against the list in "Where fixes go wrong". Any hit is a failed fix: try
another way or restore the original. The tool prints how many spots it drew;
report that number, so it shows that every spot was seen.

Don't make whole-model sheets, faceorient or matcap renders to judge a fix.

## 4. Review

Put every changed model on a review page titled `Thin: …`, built with
`tools/review/review.mjs`. On each item say which part grew, how (mode and
side), and what the close-up showed at any tip, opening or neighbour. Mark
doubt high when a close-up shows any change there. Restored models go on the
page too, with what was tried.

## 5. Learn

Before any round, and in every sub agent's brief, run

    node tools/review/review.mjs brief --review "thin:"

and copy what was kept and avoid what was sent back, per kind and per fix.
Only PO verdicts count. When a lesson repeats across reviews, add it to
"Where fixes go wrong" or §2 in general terms.

## Kind limits

0.006 is the floor and is never asked lower. Propose a lower `thin.min` only
when at least three models of the kind, from two kits or more, cannot be
fixed cleanly for the same part. One model that won't fit is not a limit
problem: report it as not fixed.
