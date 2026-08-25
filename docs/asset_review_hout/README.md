# Wood assets — render overview

Renders of every loose wood asset in the kits: wood (stack), firewood, logs,
campfire, timber, planks, pallet, timber stack, branches and roots. Each family
sits in one image; whatever doesn't fit on one row continues on the next, and every
row has a ruler on both the left and the right.

```
node tools/vergelijk-groottes/render.mjs tools/vergelijk-groottes/hout.json docs/asset_review_hout
```

The layout lives in `tools/vergelijk-groottes/hout.json`. The ruler is **1 unit** everywhere, with graph paper behind it: a fine line every
0.25 unit, a heavy one every whole unit. Every label carries the kit on the top line and the
model with its height on the bottom.

The catalogue shows the same comparison live: `catalog/schaal.html` (the *Scale*
button) loads the `.glb` files in the browser, so it's also correct right after a rescale.

Six kits have been rescaled; which ones and why is documented in
`docs/asset_review_props/README.md`. For these families that affects quaternius-nature
(×0.5), survival-kit (×0.7) and pirate-kit (×0.8).

## The families

| Render | Assets | Height |
| --- | ---: | --- |
| `hout-logs.png` | 13 | 0.25 – 0.75 |
| `hout-timber.png` | 7 | 0.05 – 0.29 |
| `hout-planken.png` | 11 | 0.06 – 0.61 |
| `hout-stapel-pallet.png` | 4 | 0.10 – 0.24 |
| `hout-kampvuur.png` | 6 | 0.09 – 0.41 |
| `hout-takken.png` | 6 | 0.04 – 0.28 |
| `hout-wortels.png` | 6 | 0.23 – 1.05 |

Left out of scope: structural wood (wooden walls, floors, stairs, beams,
posts, railings) from fantasy-town-kit, village-kit, dungeon and mini-dungeon.
Those are building pieces, not loose wood props.

## What the renders show

**Logs now sit close together.** After halving quaternius-nature,
`q-nature/log` is 0.37 high and 1.34 long, against 0.25–0.35 high and 0.43–1.21 long for the
natuur logs. `survival/tree-log` went from 0.50 to 0.35 high and from 1.80 to 1.26 long
and has landed within the band as a result. What's left is `resources/wood-log-stack`
at 0.75 — a stack, so rightly the tallest.

**Two wood palettes side by side.** natuur, quaternius-nature and
modulair-terrein/hilly use grey-brown (`#8f785b`, `#88796d`);
resources, survival-kit, fantasy-town-kit, castle-kit and pirate-kit use
warm orange (`#d07b56`, `#dd9f79`, `#995a41`). In `hout-logs.png` those two
families sit one above the other and read as two different kinds of wood.

**Shading.** The natuur assets (logs, branches, roots, stumps) render smooth
shaded — round, soft shapes with no visible facets. The kit assets
(resources, survival, town) are clearly faceted.

**Roots stand upright.** `root-3` through `root-6` are 0.63 / 0.69 / 0.81 / 1.05
high: standing points, not lying roots. Only `root-1` and `root-2` lie
low (0.23 / 0.24). All six have 80 triangles and the same colour (`#88796d`).

**Timber is very flat.** `timber-whole-1` and `timber-cut-1` through `-4` are 0.05–0.09
high at ~0.42 long; they read as slats, not beams.

**Two assets with identical geometry.** survival's `tree-log` and `tree-log-small`
both have 88 triangles and the same footprint; only the length differs.

**Above the triangle budget** (1000 per unit, style guide §4):
`resources/wood-log-stack` 3576, `natuur/timber-stack-2` 1460,
`resources/wood-planks-stack-large` 1176. None of the three is in a kit that
was rescaled, so these numbers are unchanged.

**A group split in the catalogue stands out:** campfires, `camp-wood-pile` and
`firewood-a` sit in the `food` group; `graveyard/debris-wood` sits in `rocks`.
