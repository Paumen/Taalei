# Asset style guide

For an LLM creating or adjusting assets.

## 0. Look
- Faceted, iconic, story book.
- Toy-like, chunky-ish, objects slightly caricatured, .
- Detail count stays low.

## 1. Color
- Colors come from `palet.json`.
- One shared colormap image: assets color themselves by pointing UVs at its cells.
- A new color can be added if none of existing comes close, it fits within the existing colors, and always added to the shared colormap.
- Avoid transparency and emmisive, unless it's cor part of the pieces appearance. Add note to PO when you used it.
- Cave kit is exempt from above rules.
- defaults:
* alphaMode: "OPAQUE"
* roughnessFactor: 1
* metallicFactor: 0 

## 2. Geometry
- Flat-piece construction. Round shapes visibly built from flat pieces.
- Max 16 flat pieces per full circle equivalent.
- Max 12 flat pieces for objects smaller than 1x1x1 per full circle equivalent.
- Max 12 flat pieces for objects smaller than 0.5x0.5x0.5 per full circle equivalent.

## 3. Outlines and shading
- Avoid outlines; unless it's distinctive core feature  of the object's appearance. Add note to PO when you used it.
- Faces use flat palette colors; existing gradient cells may be used.
- No shadow casting in assets.

## 4. Scale
- One wall/floor segment = 1 × 1 unit footprint, wall height = 1 unit.
- Assets may stretch multiple units.
- No solid pieces thinner than 0.02 units.
- Max 1000 tris per 1x1x1 unit.

## 5. Origin and orientation
- Default on Y = 0; pivot at footprint centre in X/Z.
- Deviate deliberately, for a functional reason.
- Split nodes put their origin at the joint.
- Objects with distinctive moving features should draw in two or more calls. Eg windmill blades, ship sails, chest cap, etc.

## 6. Reference Assets
- You must render and look reference assets before creating new assets, not just read.
- You must render at least two reference assets next to a new asset when validating.

palm-detailed-bend
ship-large
boat-row-small
cannon-mobile
tent-canvas
crate-bottles
gate-metal-bars
template-floor-layer-hole
windmill (blades only)
watermill (Rad only)
bridge (mini forest)
mast-ropes
structure-fence-sides
workbench-anvil
campfire-pit
