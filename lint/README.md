# Lint

Four checks read their rows from `kinds.json` and `materials.json` instead of from a table in `docs/asset_style_guide.md`. How the rows resolve is `F10` in that guide; the rows themselves are the JSON.

| check | rows in | guide |
|---|---|---|
| `node lint/size.mjs` | `kinds.json` — `high.min`, `high.max`, `longest.min`, `longest.max` | §2.3 |
| `node lint/mat.mjs` | `kinds.json` — `mat.«material»`, `has` | §4.1 |
| `node lint/palette.mjs` | `materials.json` — `bands` | §5.1 |
| `node lint/bands.mjs` | `kinds.json` — `band`, `band.«material»` | §5.2 |

Exemptions, the warning band and the per-size palettes live in `variables.json`.

## Reading a finding

**Size, error or warning**

1. Verify the model has the right kind tag.
2. Verify whether it meets the `tag:plural`, `tag:pickup` or `tag:comp` criteria.
3. Check whether more models from the same kit have errors or warnings.

**Palette, error**

1. Verify the model has the right material tags.
2. Verify whether the band is a §5.2 case.
3. Check whether more models from the same kit have errors.

## Why some kind bands name no part

Each of these was first written as a row naming a part or a noun. Read as coverage — the model shows at least one band from the list — the part became redundant, so the field is kept on the kind alone.

| kind | as written | why the part drops |
|---|---|---|
| `obj-kitchenware-tableware-drinkware` | mug, cup, tankard, `mat:wood` | a goblet, chalice or glass is not wooden, so `band.wood` already picks out the noun |
| `obj-food-meat` | model, `is` `sienna` | under `is` every band must be `sienna`, which no meat model meets: each carries bone or fat as `ivory` |
| `obj-pocketitem-book` | `part:cover` | the paper is `ivory` by its §5.1 palette, so `umber`, `sienna`, `hunter` and `slate` can only be the cover |
| `env-flora-tree` | `part:leaf, canopy` | a trunk is wood, whose palettes hold no `hunter`, so only the canopy can carry it |
| `env-fungi` | `part:stem` | the stem is the only `ivory` part of a fungus |
