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
- Onderwater kit is exempt too: imported pack, no colormap at all. Each material carries
  its own base colour, listed as the `onderwater` palette in `palet.json`. Do not remap it
  to the shared colormap — that would recolour every species. New sea assets either join
  that palette or use the shared colormap; say which.
- defaults:
* alphaMode: "OPAQUE"
* roughnessFactor: 1
* metallicFactor: 0 

## 2. Geometry
- Flat-piece construction. Round shapes visibly built from flat pieces.
- Max 16 flat pieces per full circle equivalent.

## 3. Outlines and shading
- Avoid outlines; unless it's distinctive core feature  of the object's appearance. Add note to PO when you used it.
- Faces use flat palette colors; existing gradient cells may be used.
- No shadow casting in assets.

## 4. Scale
- One wall/floor segment = 1 × 1 unit footprint, wall height = 1 unit.
- Assets may stretch multiple units.
- No solid pieces thinner than 0.015 units.
- Max 1000 tris per 1x1x1 unit.
- Imported packs get one scale factor for the whole pack, never one per model — that keeps
  the pack's own proportions. The onderwater kit came in at 4× and is loaded at 0.25
  (`tools/importeer-onderwater.mjs`). Its internal proportions are the pack's, oddities
  included: the hammerhead is 3.4 units long and the whale only 1.1.

## 5. Origin and orientation
- Default on Y = 0; pivot at footprint centre in X/Z.
- Deviate deliberately, for a functional reason.
- Split nodes put their origin at the joint.
- Objects with distinctive moving features should draw in two or more calls. Eg windmill blades, ship sails, chest cap, etc.

## 6. Reference Assets
- You must render and look reference assets before creating new assets, not just read.
- You must render at least two reference assets next to a new asset at same scale when validating.

palm-detailed-bend
ship-large
boat-row-small
cannon-mobile
tent-canvas
crate-bottles
template-floor-layer-hole
windmill (blades only)
watermill (Rad only)
bridge (mini forest)
mast-ropes
structure-fence-sides
workbench-anvil
lighthouse
