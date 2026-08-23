# Asset style guide

For an LLM creating or adjusting assets.

## 0. Look
- Faceted, iconic, story book.
- Toy-like, chunky-ish, objects slightly caricatured, .
- Detail count stays low.

## 1. Color
- Colors come from the shared colormap image (`kits/colormap.png`): assets color
  themselves by pointing UVs at its bands. The model is the record — the catalog
  reads the colors straight out of the `.glb`, so there is no list to keep in sync.
- A new color can be added if none of existing comes close, it fits within the existing colors, and always added to the shared colormap.
- Avoid transparency and emmisive, unless it's cor part of the pieces appearance. Add note to PO when you used it.
- Cave kit is exempt from above rules.
- Onderwater kit is exempt too: imported pack, no colormap at all. Each material carries
  its own base colour in its `baseColorFactor`. Do not remap it to the shared colormap —
  that would recolour every species. New sea assets either carry their own material
  colours or use the shared colormap; say which.
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
- Max 1000 tris per occupied grid cell. Measured as tris ÷ (max(1, w × d) × max(1, h))
  over the bounding box: a 2 × 2 floor tile is judged on four cells, and an asset smaller
  than one cell gets exactly one cell's budget — no discount for being small, but no
  1/size³ blow-up either (without the floor, no small prop could ever pass). A flat asset
  has no volume and therefore no density. `build-catalog.mjs` records it per model as
  `driehoekenPerUnit` (`null` when flat) and reports everything above the budget.
- Imported packs get one scale factor for the whole pack, never one per model — that keeps
  the pack's own proportions. The onderwater kit came in at 4× and is loaded at 0.25.
  Its internal proportions are the pack's, oddities
  included: the hammerhead is 3.4 units long and the whale only 1.1.
- Six packs were rescaled after import: dungeon ×0.714 (it sat on its own 0.7/1.4 grid —
  walls were 1.40 and floor tiles 0.70/1.40, now 1.00 and 0.50/1.00), fantasy-props ×0.5
  (its barrel and crate were 0.90, three times a village-kit barrel), quaternius-nature ×0.5
  (median height 1.84, its log 2.67 long against 0.43–1.21 for the natuur logs), rpgtools ×0.7,
  survival-kit ×0.7 and pirate-kit ×0.8. Where the pack has an importer, its `schaal` carries
  the factor, so re-importing reproduces it. The others were changed in place with
  `tools/herschaal-kit.mjs`, which multiplies the baked pack scale in the built `.glb` —
  the same result as importing at `schaal × factor`.
- Shrinking a pack raises `driehoekenPerUnit`: the budget counts per occupied cell, so the
  same model in a smaller bounding box weighs more. Recheck the budget after a rescale.
- Note that survival-kit's building pieces were a 0.90 grid and are now 0.63, so that kit no
  longer tiles with anything. Its props and tools are the better for it, its structures worse.

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
