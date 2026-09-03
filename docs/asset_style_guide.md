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

Band ids are column,row in `kits/colormap.png`. Where a colour name below has
an id, it is: light grey 15,3 · dark grey 10,0 · blue-grey 6,1 · light
blue-grey 3,2 · blue 4,2 · off-white 5,2 · taupe 14,3 · salmon 13,0 ·
khaki 14,0 · terracotta 5,0 · yellow/gold 6,0 · dark red 8,0 · dark green 1,1 ·
light green 3,1 · wood light 0,0 · wood middle 1,0 · bark 2,0.

A. Flowers may be any colour.
B. Stems and leaves follow foliage green.
C. Bones and skulls are off-white.
D. Paper is off-white.
E. Ceramics are usually terracotta, off-white, taupe, or dark red.
F. Metal is usually light grey 15,3.
G. Steel/cast iron can be dark grey 10,0.
H. Textile: off-white, salmon 13,0, khaki 14,0 or brown 1,0.
I. Bottles are glass or ceramic.
J. Glass is a special own material: transparent, or dark green or dark red.
K. Roofs are usually dark red.
L. Usual colour variants: glass bottle shape exists in red and green.
M. Wood is one ladder in three lanes — light 0,0 surfaces/planks/cut faces, middle 1,0 frames, bark 2,0 bark only; no bark lane without a bark tag; bark with a cut face shows two tones. Leather is the one exception: leather-look surfaces (book covers, bags, straps) may use the bark lane without a bark tag.
N. The ladder is one continuous track: #e6bc94 → #b07f5c → #845740 → #5e4232, each lane running anchor to anchor so they join seamlessly.
O. The gradient position inside a lane comes from the original model.
P. Which triangles are light or dark is stated in the source model — the rule that's also in CLAUDE.md.
Q. Wicks are dark grey 10,0.
R. Coins and metal in jewellery are usually gold 6,0, alternatively silver 3,2. Copper is terracotta 5,0.
S. Keys can be any metal or precious-metal colour.
T. Bands on barrels, buckets, and chests are usually light grey (metal).
U. All chests, barrels, kegs, buckets, boxes, crates are mainly timber, regularly with metal accents.
V. All cork is usually the same light salmon brown.
W. Grass is light green.
X. Trees are usually dark green.
Y. If a model had different timber hues or lightness in the source material, it uses different bands on our shared palette too.
Z. Stone (worked stone: walls, bricks, floors) is taupe 14,3, blue-grey 6,1, or light grey 15,3.
AA. Rocks are light grey 15,3, secondarily taupe 14,3.
AB. Sand and dirt are taupe 14,3, khaki 14,0, or salmon 13,0.
AC. Light: flames and glow are yellow 6,0; candles and lampshades are off-white 5,2.
AD. Rope is wood light 0,0 or khaki 14,0.
AE. Fauna use naturalistic colours — off-white, salmon, taupe, khaki; fish may also be blue 4,2 or light blue-grey 3,2.
AF. Structures and furniture are usually (predominantly) made of timber, and secondly stone (bigger type, not modern bricks); metals are used sparingly.
AG. Objects with brown colours and timber usually show visible planks/trunks, and don't have a too smoothed or polished look.
AH. Blue 4,2 is used sparingly: fish (rule AE) and otherwise only minor details or accents.
AI. Light green is only used for flora, and very minor details or accents.
AJ. Terracotta is not used for timber (copper, rule R, is the exception outside ceramics).
AK. Yellow is usually only used for coins, jewellery, light, or fire.
AL. Dark grey 10,0 is only used for cast iron, stone, and wicks.
AM. Dark red is only used for ceramics, glass, roofs, and very minor details or accents.
AN. Dark green is only used for foliage, glass, and very minor details or accents.
AO. Darkest brown is only used for bark and leather.
AP. Lighter browns are only used for timber.
AQ. Light grey 15,3 is only used for metal, stone, and rock.
AR. Belts and shoes are usually leather.
AS. A model usually has at least one material.
AT. A model usually uses equal or more color bands than materials.
AU. A model usually does not use more than twice as many color bands than maerials.
