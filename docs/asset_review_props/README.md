# Prop families — render overview

Renders of 22 prop families from the kits, each family in one image. Whatever doesn't fit on one
row continues on the next; the image grows as tall as needed. Every row
has a ruler on both the left and the right.

```
node tools/vergelijk-groottes/render.mjs tools/vergelijk-groottes/groepen-props.json docs/asset_review_props
```

These images are a snapshot. The catalogue itself shows the same comparison
live: **`catalog/schaal.html`** (the *Scale* button in the catalogue header) loads the
`.glb` files in the browser and shows 38 families, so it's also correct right after a rescale
or a removed asset. The families there come from `catalog/schaalgroepen.json`, which
`build-catalog.mjs` derives from the rules in `catalog/tools/schaalgroepen.mjs`.

The layout lives in `tools/vergelijk-groottes/groepen-props.json`. The ruler is **1 unit** everywhere, so every sheet has the same yardstick. Behind it lies
graph paper with a fine line every 0.25 unit and a heavy one every whole unit, so you can
read a height off directly. Every label carries the kit on the top line and the model with
its height on the bottom.

## All Kenney kits at 0.65

The seven remaining Kenney kits now all sit at **0.65 of Kenney's own
standard 1-unit tile**, measured against the source files in `kits/sources`:

| Kit | Source vs. the standard tile | Factor on the source |
| --- | --- | --- |
| prototype-kit | 1.00 | 0.650 |
| mini-forest | 1.00 | 0.650 |
| fantasy-town-kit | 1.00 | 0.650 |
| platformer-kit | 1.00 | 0.650 |
| survival-kit | 0.50 (half tiles) | 1.300 |
| pirate-kit | 2.56 | 0.254 |
| modular-cave-kit | 4.00 (4 × 4 tiles) | 0.162 |

So Kenney doesn't draw all its packs at the same scale: survival comes in on
half tiles, pirate at a good two and a half times, and modular-cave at four times the standard.
Those differences have now been removed.

## Other kits rescaled

| Kit | Factor | What it did |
| --- | --- | --- |
| dungeon | ×0.714 (÷1.4) | sat on its own 0.7/1.4 grid: wall 1.40, floor tiles 0.70 and 1.40. Now wall 1.00 and tiles 0.50 / 1.00, the same grid as fantasy-town-kit. |
| fantasy-props | ×0.5 | largest loose props of any kit: barrel and crate were 0.90 high, three times a village-kit barrel. Now 0.45. |
| quaternius-nature | ×0.5 | median height 1.84; the log was 2.67 long against 0.43–1.21 for the natuur logs. |
| rpgtools | ×0.7 | median height 0.33 → 0.23; the knife went from 0.52 to 0.36. |
| survival-kit | ×0.7 | median height 0.51 → 0.35. |
| pirate-kit | ×0.8 then ×0.7 (0.56) | median 0.88 → 0.49; the large ships from 3.99 to 2.23. |
| halloween | ×0.5547 | this puts the four candles at exactly the same height as dungeon's. |
| natuur | ×0.6 | median 0.33 → 0.20; the mountains from 19.4 to 11.6. |
| fantasy-town-kit | ×0.7 | median 1.00 → 0.70. |
| modulair-terrein | ×0.7 | median 0.33 → 0.23. |
| mini-forest | ×0.8 | median 0.58 → 0.46. |
| quaternius-nature | ×0.8 (after the earlier ×0.5) | median 0.69 → 0.55. |
| platformer-kit | ×0.8 then ×0.6 (0.48) | median 0.42 → 0.20. |
| forest | ×0.6 | median 1.00 → 0.60; the dead trees from 1.43–3.81 to 0.86–2.28. |
| restaurant | ×0.7 | median 0.17 → 0.12. |

The scale factor lives in `tools/herschaal-kit.mjs`; for fantasy-props and quaternius-nature
it's also in the import script, so re-importing produces the same result.

**Note — the 1-unit grid no longer applies.** dungeon, after its correction, sits at a
wall height of 1.00, but fantasy-town-kit — which that grid was calibrated on — sits at 0.70
after ×0.7. So those two no longer tile with each other, nor with modular-cave-kit (1.00).
This can be reverted with `node tools/herschaal-kit.mjs fantasy-town-kit 1.4286`.

**survival-kit has also drifted further from the grid.** Its
floor tiles and fences were 0.90 × 0.90 (10% under the 1-unit grid) and are now
0.63 × 0.63. The loose props and tools from that kit are better off for it, its
building pieces worse. This can be reverted with `node tools/herschaal-kit.mjs survival-kit 1.4286`.

**Shrinking raises the triangle density.** The budget is 1000 triangles per
unit, measured over the number of occupied cells, so the same model in a smaller
bounding box counts more heavily. Across the whole catalogue, 66 of 1016 assets are now above
budget (was 51 before all the rescaling).

## Four kits and ten assets removed

Removed as whole kits: **furniture** (11), **holiday-kit** (11), **nature** (3),
**mini-dungeon** (3), **graveyard-kit** (8), **tropical** (4) and **castle-kit** (10) —
50 models. Not just `kits/workfiles/`, but also their block in
`catalog/manifest.js`, their import scripts, their kit colour in `catalog.js` and their
exceptions in `catalog/tools/semantiek.mjs`. The catalogue now counts **1016 models in
24 kits**.

Before that, these ten loose assets had already gone:

| Asset | |
| --- | --- |
| `holiday-kit/rocks-small`, `rocks-medium`, `rocks-large` | |
| `holiday-kit/lantern-hanging` | |
| `quaternius-nature/tree-birch-dead-snow-1` through `-5` | |
| `fantasy-props/vase-rubble-medium` | was above the triangle budget (1113 per unit) |

Removed from `kits/workfiles/`, from `catalog/manifest.js`, from the import scripts (otherwise
they'd come back on the next import), and from the comparison viewer's group files.
Also from `catalog/manifest.js`, from the import scripts, and from the group files of
the comparison viewer — otherwise they'd come back on the next import.

## The families

| Render | Assets | Height | Kits |
| --- | ---: | --- | ---: |
| `servies-kookgerei.png` | 21 | 0.01 – 0.40 | 5 |
| `gereedschap.png` | 41 | 0.07 – 0.75 | 6 |
| `paddenstoelen.png` | 8 | 0.07 – 0.29 | 4 |
| `vaten-kegs.png` | 14 | 0.25 – 0.64 | 5 |
| `kisten.png` | 6 | 0.32 – 0.38 | 5 |
| `kratten-dozen.png` | 18 | 0.07 – 0.83 | 7 |
| `flessen-drankjes.png` | 14 | 0.10 – 0.28 | 5 |
| `kruiken-vazen-emmers.png` | 8 | 0.13 – 0.28 | 2 |
| `boeken-rollen.png` | 15 | 0.03 – 0.22 | 2 |
| `kaarten-sleutels.png` | 7 | 0.01 – 0.30 | 3 |
| `kaarsen.png` | 13 | 0.07 – 0.39 | 3 |
| `lantaarns-fakkels.png` | 13 | 0.26 – 1.65 | 6 |
| `ladders.png` | 6 | 0.72 – 2.36 | 4 |
| `trappen.png` | 16 | 1.00 – 1.45 | 3 |
| `hekken.png` | 30 | 0.22 – 1.00 | 5 |
| `bomen.png` | 42 | 1.15 – 7.85 | 10 |
| `bomen-kaal-dood.png` | 35 | 0.95 – 3.81 | 4 |
| `boomstronken.png` | 6 | 0.10 – 0.48 | 3 |
| `bloemen.png` | 23 | 0.14 – 0.53 | 3 |
| `planten-mais-lisdodde-cactus.png` | 25 | 0.18 – 0.99 | 4 |
| `gras.png` | 23 | 0.08 – 0.60 | 6 |
| `zeesterren-schelpen.png` | 9 | 0.01 – 0.02 | 2 |

Wreaths don't exist in the kits — no model has `wreath` or `krans` (Dutch for wreath)
in its name. There are only two maps (`rpgtools/map-empty`, `rpgtools/map-rolled`)
and they sit together with the keys in one image.

## Tools

41 assets, 0.07 – 0.75 high, from six kits but with rpgtools as the main supplier
(28 pieces), topped up by survival-kit (8), graveyard-kit (2) and one each from
fantasy-props, fantasy-town-kit and pirate-kit.

**Four tool types exist more than once.** A shovel appears four times
(`graveyard-kit/shovel` 0.61, `shovel-dirt` 0.66, `rpgtools/shovel` 0.44,
`survival-kit/tool-shovel` 0.37), a pickaxe three times (`fantasy-props/pickaxe-bronze`
0.60, `rpgtools/pickaxe` 0.39, `survival-kit/tool-pickaxe` 0.30), and axe and hammer
both twice. The triangle counts differ sharply between them: `rpgtools/shovel` has
810 triangles, `survival-kit/tool-shovel` 124 for the same gesture.

**`fantasy-props/pickaxe-bronze` stands out.** Bright orange (`#ffb349`) against
the blue-grey steel (`#6d738a`, `#9da4c4`) of all the other tools, and at 0.60 the
second-tallest piece in the family — it's the only one that wasn't rescaled along with the rest.

**Above the triangle budget** are four pieces, all four rpgtools and all four small and
flat, which drives up the density: `compass-base` 1320, `rope-bundle-a` 1248,
`drafting-compass` 1144, `grindstone` 1114.

## Other things that stand out

**Above the triangle budget** (1000 per unit, style guide §4), within these
22 families, are 34 assets. The heaviest:

| Family | Asset | per unit |
| --- | --- | ---: |
| crates-boxes | `fantasy-props/crate-metal` | 2738 |
| barrels-kegs | `fantasy-props/barrel-holder` | 2676 |
| barrels-kegs | `fantasy-props/barrel-apples` | 2480 |
| bare-dead-trees | `quaternius-nature/tree-common-dead-snow-1` | 2368 |
| crates-boxes | `dungeon/box-stacked` | 2173 |
| bare-dead-trees | `quaternius-nature/tree-common-dead-1` | 2126 |
| plants | `quaternius-nature/cactus-flower-1` | 2112 |
| barrels-kegs | `dungeon/keg-decorated` | 2058 |
| stairs | `dungeon/stairs-wood-decorated` | 2024 |

Eight of the 36 bare/dead trees are still above it, all quaternius-nature, and six of
the plants, five of them quaternius cacti. Those remain the clearest candidates
to simplify.

**Pairs with the same triangle count and the same bounding box** — candidates for
duplicates or pure recolouring:

- `restaurant/pan-a` ↔ `pan-b` and `restaurant/pot-a` ↔ `pot-b` (only the colour differs: brown vs. dark blue)
- `dungeon/bottle-a-brown` ↔ `bottle-a-labeled-brown`
- `rpgtools/torch` ↔ `torch-burnt`
- `dungeon/stairs-wall-left` ↔ `stairs-wall-right` (mirrored, so rightly so)
- `modulair-terrein/hilly-prop-fence-gate-a` ↔ `gate-b`
- `quaternius-nature/tree-stump` ↔ `tree-stump-moss`
- halloween `tree-pine-orange-large/medium/small` ↔ `tree-pine-yellow-…` (three pairs)
- `holiday-kit/tree` ↔ `tree-snow-c`

**Knives are better off now.** `rpgtools/knife` was rescaled with the kit and is now 0.36
instead of 0.52. `restaurant/knife` still sits at 0.40, next to plates of 0.03 from the
same kit — that's now the sharpest scale mismatch remaining.

**Two cookware palettes.** The restaurant kit uses dark grey/navy
(`#88796d`, `#6d738a`) for pans and pots; `mini-dungeon/pot` and the fantasy-props
are warm orange. Side by side they don't read as one kitchen.
`fantasy-props/table-plate`, at 0.01, is moreover almost invisible and falls
outside the tableware palette with its near-black colour.

**Starfish and shells are flat.** All nine are 0.01–0.02 high: discs pressed
onto the ground. That's why that family is shown **from above** — from the side you see
nothing. The number behind the label there is therefore the depth (`d=`), not the height.

**Trees: the spread sits with natuur.** `natuur/tree-pine-6` is 7.85 high,
`tree-pine-5` 6.65 and `tree-pine-4` 5.21, while every other kit stays between 1.15 and 3.74.
After halving quaternius, natuur is the only outlier left.

**Bare and dead trees come from five kits with three trunk colours:** rust brown for forest,
dark grey-brown for halloween, natuur and the quaternius willow/common, and white-grey for
the quaternius birch-dead.

**Ladders and fences aren't at one size yet.** Ladders range from 0.72
(`modular-cave-kit`) via 1.00 (`platformer-kit`, `mini-forest`) to 2.36
(`village-kit/ladder-a`); fences from 0.22 to 1.00.

**Grass is the only family with a single palette:** just `#6d8d33` and `#23562c`.
