---
name: stone
description: Give each brick or stone of masonry catalogue models its own tone, so walls, floors, pillars and paths read as separate stones, the way planks do for wood. Use when asked to tone, recolour or vary bricks, stones, blocks, cobbles or flagstones, or when stone on a model looks like one flat slab.
---

# Stone tones

The plank method (`.claude/skills/plank`) on stone: same tool, same board
map, same tones and gradient, same self-check and review. Read that skill
first; this one lists only what differs.

`node tools/import/plank-tone.mjs --stone <workfile.glb>` works on the
`ivory`, `taupe` and `taupe-dark` bands and takes every piece as a stone.
Work on a scratch copy with the workfile's own name.

## 1. Pick models

- `str-*` models and `obj-resource-stone` with masonry: bricks, blocks,
  cobbles, flagstones, slabs. Leave roof surfaces to `B77`
  (`roof-tone.mjs`): on buildings, tone walls, footings and chimneys only.
- `ivory` only where it is clearly separate stones or bricks; plaster,
  stucco and tiles stay as they are. Put every ivory model in as high doubt.
- Red brick is not terracotta: brick in `terracotta` or `sienna` joins
  `taupe` with `--band terracotta:taupe` (or `sienna:taupe`), then tones.
  Copper, clay pots and roof tiles keep their band.

## 2. Stone map

- A fully flat slab with no stones to see gets one tone like one plank:
  `--force`, with `--whole` when it would be cut.
- Any brick to see on one fused piece (raised bricks are their own pieces,
  but grooves, notches, steps and colour patches are not) is cut apart with
  a spec `cut`, one stone per brick. A colour patch is a stone: key it from
  its old lightness `light` or its outline.
- Check the map with `--debug` before toning, as for planks.

## 3. Light at the top

`B64`, `B65`, `B68` and `B69` want stone lighter at the top. After toning,
run the kind's `v-profile.mjs` line from the style guide with
`--only ivory,taupe,taupe-dark`, so wood and other parts don't get the
gradient twice. Floors, paths, roads and other kinds without such a rule
skip this.

## 4. Self-check and review

As for planks, plus: brick moved from terracotta that now merges with stone
trim next to it, and kept details (carvings, cracks, inscriptions) that
faded. End with a review; band moves, ivory and slabs toned whole go in as
high doubt.
