# Asset style guide

For an LLM creating or adjusting assets.
Scope: items in catalog.

## 0. Look

- Toy-like, chunky-ish, objects slightly caricatured,
- Slightly faceted, iconic, story book. 
- Detail count stays low.

## 1. Color
- Colors come from the shared colormap image (`kits/colormap.png`): assets color
  themselves by pointing UVs at its bands. The model is the record — the catalog
  reads the colors straight out of the `.glb`, so there is no list to keep in sync. For recoloring to shared map, baked shading via uv spread on gradient band must be maintained.
- A new color addotion can only be added if none of existing comes close and has more use cases on existing catalog than just the item added. if approved, its added to the shared colormap.
- defaults:
* alphaMode: "OPAQUE", except for one clear glass color.
* roughnessFactor: 1
* metallicFactor: 0 

## 2. Geometry
- Flat-piece construction. Max 16 flat pieces per full circle equivalent. Typically 8-12, 16 for objects that are typically only full even circle in reality and or hero objects. 

## 3. Outlines and shading
- Avoid outlines; unless it's distinctive core feature  of the object's appearance. Add note to PO when you used it.
- Faces use palette colors and gradient bands for baked shading.
- No shadow casting in assets.

## 4. Scale
- One wall/floor segment = 1 × 1 unit footprint, wall height = 1 unit.
- Assets may stretch multiple units.
- No solid pieces thinner than 0.015 units.
- Max 1000 tris per occupied grid cell. Measured as tris ÷ (max(0.25, w × d) × max(0.5, h))
  over the bounding box: a 2 × 2 floor tile is judged on four cells, and an asset smaller
  than 0.5 × 0.5 × 0.5 is judged as if it were that size.
- Imported packs get one scale factor for the whole pack.

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
mast-ropes
structure-fence-sides
lighthouse
