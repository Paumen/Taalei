# Asset style guide

For an LLM creating or adjusting assets.

## 0. Look
- Faceted, iconic, story book.
- Toy-like, cubish/chunky, objects are slightly caricatured, .
- Detail count stays low.

## 1. Color
- Colors come from `palet.json`.
- One shared colormap image only: assets color themselves by pointing UVs at its cells.
- A new color can be added if none of existing comes close, it fits within the existing colors, and always added to the shared colormap.
- Cave kit is exempt from above rules.

## 2. Geometry
- Flat-piece construction, always. Round shapes must be visibly built from flat pieces.
- Max 16 flat pieces per full circle equivalent.

## 3. Outlines and shading
- No outlines; only on explicit request per asset.
- Faces use flat palette colors; existing gradient cells may be used.

## 4. Scale
- One wall/floor segment = 1 × 1 unit footprint, wall height = 1 unit. Tolerance 5%.
- Nothing thinner than 0.05 units.

## 5. Origin and orientation
Base on Y = 0; pivot at footprint centre in X/Z. Deviate only deliberately, for a functional reason.

## Reference Assets
Render and look, not just read.

palm-detailed-bend
ship-large
boat-row-small
cannon-mobile
tent-canvas
crate-bottles
gate-metal-bars
template-floor-layer-hole
windmill
watermill
bridge (mini forest)
mast-ropes
structure-fence-sides
workbench-anvil
campfire-pit
