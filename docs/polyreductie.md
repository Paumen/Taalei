# Poly reduction

What off-the-shelf decimation does to catalogue assets, measured on eight models.

## Why it was looked at

Ten models in the catalogue break [G03] (max 5000 tris per occupied grid cell),
and `quat-pirate/cliff-4` alone ships 2.5 MB of geometry. The question was
whether an existing tool can bring those down without breaking [I02] (clean
deliberate facets) or [I07] (the UV spread across the gradient band).

## Tools tried

| tool | what it is | how it was run |
|---|---|---|
| `gltf-transform simplify` | meshoptimizer simplifier, glTF-native | `weld` then `simplify --ratio R --error 1`, with and without `--lock-border` |
| `gltfpack -si` | same simplifier, standalone binary | `-si R -noq` |
| `tools/geometrie/vereenvoudig.mjs` | the same simplifier behind a colormap-aware weld | `--ratio R` |

`pymeshlab`, `fast-simplification` and `trimesh` were installed but not taken
further: none of them round-trips a glTF material and UV set, so every run
would need the colormap reattached by hand.

## The finding that decides it

The stock tools barely move most of these models. `cliff-4` does not reduce at
all — 23714 tris in, 23714 out, at any ratio. It carries 71091 vertices for
23714 triangles: three per triangle, no sharing.

That is the colormap workflow showing up in the topology. Colouring by pointing
UVs at a band splits a vertex wherever the UV differs, and the exporters that
produced these packs split on the normal as well. A simplifier can only collapse
an edge whose vertices are shared, so a fully split mesh is frozen.

Welding before simplifying is the fix, but welding on position alone throws away
what the split was protecting: band edges bleed, the baked gradient flattens
(`arch-door` spread 0.413 → 0.124) and hard edges go smooth.

`vereenvoudig.mjs` welds on position **plus** the colormap lane **plus** the
position within the band quantised to 8 steps, so collapses stop exactly where
the colour changes, then rebuilds per-face normals afterwards to restore the
faceting. 8 steps costs nothing in triangles and returns the spread
(`arch-door` 0.413 → 0.415, `house-b` 0.819 → 0.822).

## Measured

At `--ratio 0.5`, against the catalogue's own metrics:

| model | tris | meshopt | gltfpack | vereenvoudig | spread drift | verdict |
|---|---|---|---|---|---|---|
| `quat-pirate/cliff-4` | 23714 | 100% | 100% | **50%** | 0.0% | clean |
| `quat-dun-2/chest-gold` | 22512 | 98% | 99% | **50%** | +15% | clean, 25% also clean |
| `quat-town/farm-field-c` | 35076 | 98%¹ | 78% | **50%** | −6% | clean |
| `cooking-assets/strainer` | 12936 | 50% | 50% | 50% | — | clean at 50%, ragged holes at 25% |
| `isa-plants/zzplant-plant-large` | 7488 | 50% | 50% | 50% | 0.0% | clean |
| `quat-skeleton/skeleton` | 7471 | 50% | 50% | 50% | +65% | spread doubles; colour smears |
| `asia-pack/house-b` | 7241 | 68%² | 73% | 50% | +0.4% | roof ridges and window lattice dissolve |
| `quat-dun-1/arch-door` | 5704 | 94% | 94% | 50% | +0.4% | arch stones merge into a smooth band |

¹ deletes the soil beds outright, dropping `grounded` and moving the bbox 0.29.
² punches holes through the roof.

Renders of every row sit beside the numbers in the experiment; the pattern is
consistent across them.

## What it is good for

Reduction is safe on **organic and massed forms** — rock formations, foliage,
heaped contents, terrain. `cliff-4` halves with an identical silhouette;
`chest-gold` takes 25% (22512 → 5627 tris) without a visible difference.

It is **not** safe on **hard-surface modular pieces**. `house-b` and `arch-door`
both hit their triangle target and both lose the detail that makes them read:
roof tile ridges, window lattice, individual arch stones. Those two want a
remodel, not a decimation.

`quat-skeleton/skeleton` is a third case: geometry survives, colour does not.
Its spread doubles at 50%, which is band smearing, and it fails [I07] whatever
the triangle count says.

## Notes

- `--no-flat` skips the normal rebuild. Use it on models that were smooth-shaded
  to begin with: on `strainer` the rebuild triples the vertex count and grows
  the file past the original.
- Thin single-sided leaf geometry picks up backfacing triangles as the ratio
  drops. Check `--modes faceorient` before accepting a foliage reduction.
- The tool needs `@gltf-transform/core`, `@gltf-transform/functions` and
  `meshoptimizer` installed globally.
- Nothing in `kits/` was changed. Reductions were written to a scratch directory
  and measured there.
