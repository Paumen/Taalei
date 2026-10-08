---
name: stylize
description: Restyle a kit whose models are true to real-world size and proportion toward the catalogue look — small things bigger, big things smaller, every model chunkier and more stylized, still recognisable. Use when asked to stylize a kit or kind, make models chunkier, or bring a realistic kit in line with the catalogue's proportions.
---

# Stylizing a kit

Goal: the kit reads like the rest of the catalogue. Sizes move toward each
kind's catalogue median, and every model gets fuller, rounder and thicker
without losing what it is. Read `docs/asset_style_guide.md` first; the lints
decide what is allowed. `catalog-assets` §6 is the rebuild.

The tools in `tools/stylize/` cover the common, generic part: resize, the
three proportion moves and inflation. They suit plain single-mesh models and
are a first pass, not the method. Look at every model after it; many need a
different move or a hand-made one, and some need none.

## Rules the PO holds to

- Recognisable first. No broken or "frankenstein" looks, no lumps, no seams.
- Round stays round and square stays square. Scale round and square parts
  evenly; only straight runs may change length.
- Smooth curves stay smooth.
- Chunkier never means thinner: no part may end thinner, relative to the
  model, than it started.
- Sharp things get less inflation. Tines, slots, holes, gaps and joints stay
  open.
- Chunkier must not create thin-tube (G27) failures. When a model shrinks
  and a part drops under its minimum, thicken that part, not the model.
- Work kind by kind, in batches the PO reviews. Fix flagged models one at a
  time and show each fix in more than one view or mode.

## 1. Batch

1. Branch from main. List the batch's models and kinds from
   `catalog/build/catalog.json`.
2. Copy the originals to a scratch folder with a `Textures` link to the
   kit's `Textures`, so they render and can be restored.
3. Take the seven lint baselines (`size`, `tpu`, `measures`, `backface`,
   `mat`, `palette`, `bands`), filtered to the batch's models.
4. Look at the originals and at each kind's catalogue peers before choosing
   settings.

## 2. Size

`stylize.mjs` sets each model's longest side by one of these. Pick per
model, not per kit.

| Mode | Use for |
|---|---|
| kind | Kinds with 3+ catalogue peers whose members are one sort of thing (doors, signs, cones) |
| mixed | Kinds that hold different things (`str`, railings, roof parts, pipes, fauna): halfway between kind median and curve |
| curve | Small parts filed in a kind of big things (door handle, newel cap, drain cover), and items the kind median would blow up (bells, horns, sticks) |
| refs | Items with same-named models in other kits (piano, guitar, dice, sledgehammer) |
| parent | Pieces of another model (pizza slice, apple slice, forked tongue): scale with it |
| height | Tables, desks and counters: also aim at the kind's median height |

- Peers come only from other kits. Drop kits that skew a kind, such as a
  weapon-only pack whose swords are real-world size.
- A kind's `longest` and `high` limits clamp the result. Put a model in
  `noClamp` when its kind's limits are for something else (a door handle in
  a kind clamped to door height). A tealight under a candle kind's `high.min`
  is the same case.
- Within a kind, sizes keep their order: `(length / batch median)^0.5`.

## 3. Shape

`stylize.mjs` makes one move per model, chosen from its proportions:

- **stick** (over 4× as tall as wide): thicker, straight runs keep length.
  Good for posts, columns, spindles, sticks, pens. Wrong for flat lattices
  and panels (`noStick`): it stretches their pattern.
- **squeeze** (taller than wide): straight runs shorten, never below their
  width. Good for bottles, glasses, doors, signs, pillars, chimneys. Wrong
  for frames, posters, trellises, tongues, and anything whose aspect ratio
  is its identity (`keep`).
- **flat**: thickens flat items toward the kind's catalogue thickness:
  boards, plates, trays, slices, paving, lily pads. Wrong for panels lying
  flat that are already thick enough (`noFlat`). Bowls get deeper with it.
- **depth**: for flat symbols, toward 0.3 of the longest side; thin line art
  (snowflake, wifi, reticle) only toward 0.15.

Then `inflate.mjs` pushes the surface out and scales back to size:

| k | Use for |
|---|---|
| 0.03 | Default |
| 0.02 | Sharp or thin-edged: saw blades, can lips, glasses, tins, cones, tiles, spikes |
| 0.01 | Holes, lattices, grates, spokes, tines, wires, rails, ladders, trellises, seams, fine detail |
| 0 | Where even 0.01 fuses gaps or erases joints: picket gates, brick arches, ring stacks |

- The push is a share of the second-largest side. A share of the longest
  side balloons long thin things.
- Use `inflateUv` to inflate one material only, such as the brass of a candle
  holder while the wax and wick keep their shape.

## 4. Look, fix, check

1. Render before and after side by side: copy each original as
   `<name>.0.glb` and each result as `<name>.1.glb` into one folder with a
   `Textures` link, then run
   `node tools/renders/render.mjs <dir> --out <out> --views iso --sheet-only --sheet-cols 4`.
   Use at most 14 pairs per run.
2. Compare a `faceorient` render of both. New red areas are flipped faces;
   check whether the original already had them.
3. Copy into `kits/workfiles/<kit>`, then run `backfaces`, `build-catalog` and
   the lints. Diff against the baseline by the line text with numbers
   stripped.
4. Rebuild per `catalog-assets` §6 and render a locked-scale sheet beside
   catalogue peers.

## Gotchas

- `backfaces.mjs` caches by file. A "new" backface error can be an old one
  never measured: put the original back, rerun, and compare before blaming
  the change.
- `tpu` rises whenever a model shrinks with the same triangle count. Report
  it; don't decimate unless asked.
- Straight-run detection samples the surface. A squeeze factor can move a
  few percent between runs; models near the 4× stick limit can flip moves.
- `taaleiland.schaal` records the kit-wide factor only; per-model resizes are
  not recorded there.
- A lint minimum can be wrong for a part. For example, a 12 mm minimum on a
  dart needle turns it into a cone. Raise it with the PO rather than forcing
  the shape.
- Thickening open shells (a key hole, a button) exposes their hollow backs.
  Leave them, or close them first.

## Hard cases and what worked

- **Hafted tools and weapons** (axes, hammers, knives, swords, brushes, rakes):
  treat grip and head as two zones. Find where the head starts from the
  width profile and turn the head to face front. Grips get longer and
  thicker toward the catalogue's grip-to-length share; they are never
  shortened or narrowed. Heads grow evenly. Blades widen evenly, never
  toward the tip. A uniform stick or squeeze ruins these. The tools don't
  do this.
- **Pencils and pens**: thicken only the straight body, and scale the tip and
  the end evenly. Whole-body thickening makes a crayon. A pen clip grows with
  the body and reads as a marker.
- **Orientation**: keep the original lie unless the catalogue's peers lie
  differently (pencils upright, a toothbrush flat with the bristles up, a
  scroll flat). Turning a model sideways to squeeze it is a common mistake.
- **Fine features that must read** (fishhook barb, dart flights): enlarge only
  that feature, blended smoothly into the curve on both sides, a little
  (1.3–1.8×). More looks broken.
- **Wire and mesh** (mesh bin, whisk, spring): rebuild with fewer, thicker,
  round wires. Inflating one-sided strips shows them broken from behind.
  Keep a spring's path and thicken only its wire.
- **Candles in holders**: inflate only the holder material; wax and wick keep
  their proportions.
- **Thin parts after shrinking** (cannon axles, ladder rungs, barrier bars):
  thicken those parts to the minimum. If that makes the
  model a mess (microwave handle, a tangled phone cord, a keyboard layout),
  revert it and report the old finding.
- **Modular parts** (doors, bricks, wall panels, rails): size them by the
  kind like the rest, and check they still fit each other.
