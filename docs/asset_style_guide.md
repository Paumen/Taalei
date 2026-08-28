# Asset style guide

For an LLM creating or adjusting assets.
Scope: items in catalog.

## 0. Look

Toy-like and iconic: chunky, slightly caricatured — not thin or spindly, except for building panels (will get the look once assembled), also not overshot into too primitively.
Clean deliberate facets, chamfered edges — rounded-soft, not noisy.
Few details,, except for organic objects.

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
- Max 2000 tris per occupied grid cell. Measured as tris ÷ (max(0.49, w × d) × max(0.7, h))
  over the bounding box: a 2 × 2 floor tile is judged on four cells, and an asset smaller
  than 0.7 × 0.7 × 0.7 is judged as if it were that size.
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

Appendix A: Material and color rules
a. Flowers may be any colour
b. stems and leaves follow foliage green.
c. Bones and skulls are off-white.
d. Paper is off-white
e. Ceramic is offwhite, Teracotta, taupe.
f. metal is usually light grey.
g. steel/cast iron can be dark grey.
h. Textile: off-white, salmon 13,0, khaki 14,0 or brown 12,0.
i. Bottles are glass or ceramic 
J. glass is special own material transparant, or dark green or dark red.
K. Ceramics are usually Teracotta, offwhite, taupe, or dark red.
L. Roofs are usually dark red.
L. Usual Colour variants: glass bottle shape exists in red and green.
N. Wood is one ladder in three lanes — light 0,0 surfaces/planks/cut faces, middle 1,0 frames, bark 2,0 bark only; no bark lane without a bark tag; bark with a cut face shows two tones.
M. The ladder is one continuous track: #e6bc94 → #b07f5c → #845740 → #5e4232, each lane running anchor to anchor so they join seamlessly.
O. The gradient position inside a lane comes from the original: 465 checked, 419 restored.
P. Which triangles are light or dark is stated in the source model — the rule that's also in CLAUDE.md.
Q. Wicks are dark grey.
R. Coins and metal in jewelery usually are gold, alternatively silver.
S. Keys can be any metal or edelmetaal color.
T. Bands on barrels, buckets, and chests are usually light grey (metal).
U. All chests, barrels, kegs, buckets, boxes, crates, are mainly timber. Regularly with metal accents.
V. All kurk is usually same light salmon brown.
W. Grass is light green.
X. Trees are usually dark green.
Y. If model had different timber hues or Lightness in source material, it will use different bands on our shared palettame too.
Z. Stones is xxx
AA. Rocks are xxx
AB. Sand and dirt are.xxx
AC. Light uses xxx
AD. Rope is xxx
AE. Structures and furniture are usually (predominantly) made of timber, and secondly stone (bigger type, not modern bricks), metals are used sparingly.
AF. Objects with brown colors and timber, usually show visibly planks / trunks. And don't have a too smoothen ed or polished look.
AG. Blue is used sparingly, and only for minnor details or accents.
AH. Light Green is only used for fauna, and very minnor details or accents.
AI. Terracotta is not use for timber.
AJ. Yellow is usually only used for coins, jemelery light, or fire.
AK. Dark grey is only used for cast iron and stone. 
Al. Dark red is only used for ceramics, glass,, and very minnor details or accents.
AN. Dark green is only used for foiliage, glass, and very minnor details or accents.
AM. Darkest brown is only used for bark. and leather.
AO. Lighter browns is only used for timber.
AP. Light grey is only used for metal, stone, and rock.
