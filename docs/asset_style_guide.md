# Asset style guide

For an LLM creating or adjusting assets.
Scope: items in catalog.

## 0. Look

- Toy-like and iconic: chunky, slightly caricatured — not thin or spindly, and
  not so pared back it reads as primitive. Building panels are the exception:
  they may be thin, and get the look once assembled.
- Clean deliberate facets, chamfered edges — rounded-soft, not noisy.
- Few details, except on organic objects.

## 1. Colour
- Colours come from the shared colormap image (`kits/colormap.png`): assets colour
  themselves by pointing UVs at its bands. The model is the record — the catalog
  reads the colours straight out of the `.glb`, so there is no list to keep in sync.
- When recolouring onto the shared map, keep the baked shading: the UV spread across
  the gradient band must be maintained.
- A new colour is only added when no existing band comes close, and when it earns
  more than the one item asking for it — it must have other uses in the catalogue.
  Once approved, it goes into the shared colormap.
- Defaults:
  - `alphaMode`: `OPAQUE`, except for the one clear glass colour.
  - `roughnessFactor`: 1
  - `metallicFactor`: 0

## 2. Geometry
- Flat-piece construction. At most 16 flat pieces per full circle equivalent.
- Typically 8-12. Use 16 only for hero objects, and for objects that are a true
  even circle in reality.

## 3. Outlines and shading
- Avoid outlines, unless one is a distinctive core feature of the object's appearance. Note it to the PO when you use one.
- Faces use palette colours and gradient bands for baked shading.
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
- Objects with distinctive moving features draw in two or more calls — windmill blades, ship sails, a chest cap.

## 6. Reference Assets
- Render and look at the reference assets before creating a new asset — reading them is not enough.
- When validating, render at least two reference assets beside the new one at the same scale.

The references:
- `palm-detailed-bend`
- `ship-large`
- `boat-row-small`
- `cannon-mobile`
- `tent-canvas`
- `crate-bottles`
- `template-floor-layer-hole`
- `windmill` (blades only)
- `watermill` (wheel only)
- `mast-ropes`
- `structure-fence-sides`
- `lighthouse`

## Appendix A: Material and colour rules

Band ids are column,row in `kits/colormap.png`. Where a colour name below has
an id, it is: light grey 15,3 · blue-grey 6,1 · light blue-grey 3,2 ·
blue 4,2 · off-white 5,2 · taupe 14,3 · salmon 13,0 · terracotta 5,0 ·
yellow/gold 6,0 · dark red 8,0 · dark green 1,1 · light green 3,1 ·
wood light 0,0 · wood middle 1,0 · bark 2,0.

### S. Special — the one way out of every rule below

- **S1.** A model tagged `special` is a deliberate exception, and no rule below
  applies to it — except the N4 ceiling. Only the PO assigns the tag.
- **S2.** A `special` records its reason next to the tag. A `special` without a
  stated reason is a finding on the tag.

### M. Material to colour — what a thing is made of, and the colour that takes

- **M1.** Flowers may be any colour. Cactus flowers count too.
- **M2.** Stems and leaves are light green green.
- **M4.** Grass is light green.
- **M5.** Trees are dark green.
- m58 Palms fronds are light green.
- **M6.** Bones and skulls are off-white.
- **M7.** Paper is off-white.
- **M8.** Ceramics are terracotta, off-white, taupe or dark red.
- **M9.** Metal is light grey 15,3.
- **M10.** Steel and cast iron may be blue-grey 6,1.
- **M11.** Precious metal are gold 6,0 or silver 3,2.
- m57 Copper is
  terracotta 5,0.
   
- **M12.** Keys take any metal or precious-metal colour.
- **M13.** Textile is off-white, taupe 14,3 or brown 1,0, darkgreen, darkred.
- m56 Wrapped grips
  and bindings on tools and weapons are always taupe 14,3, light half 0.02-0.40.
- **M14.** Rope is taupe 14,3, never the light wood lane.
- **M15.** Belts, shoes and straps are leather.
- **M16.** Bottles are glass or ceramic.
- **M17.** Glass is its own material: transparent, dark green or dark red.
- **M18.** The glass bottles exists in red and green.
- **M19.** Roofs are ceremic dark red.
- **M20.** Worked stone — walls, bricks, floors — is taupe 14,3, blue-grey 6,1 or
  light grey 15,3. **to be reduced to 2**
- **M21.** Rocks are light grey 15,3, secondarily taupe 14,3.
- **M22.** Sand and dirt are taupe 14,3.
- **M23.** Wicks are blue-grey 6,1.
- **M24.** Flames and glow are yellow 6,0;
- m55 candle wax and lampshades off-white 5,2.
  
- **M25.** All cork is taupe 14,3.
- **M26.** Fauna are naturalistic: off-white, salmon, taupe. Fish may also be
  blue 4,2 or light blue-grey 3,2.
- **M27.** The bands on barrels, chests, buckets, trunks, kegs, crates and boxes are
  metal, light grey 15,3.
- **M28.** Chests, barrels, kegs, buckets, boxes and crates are mainly timber, often
  with metal accents.
- **M29.** Structures and furniture are mostly timber, then stone (the bigger sort,
  not modern brick). Metal sparingly.

- **M31.** A liquid is dark red 8,0, dark green 1,1 or blue 4,2. 
- **M32.** Meat is terracotta 5,0, dark half 0.55-1.00.

- **M34.** Buckles are metal, light grey 15,3.
- **M35.** Leather is bark 2,0.
- **M36.** Gemstones are dark red 8,0, dark green 1,1 or blue 4,2
- **M37.** Book covers are bark 2,0, dark red 8,0, dark green 1,1 or blue-grey 6,1.
  Pages follow M7, clasps and corners M9.
- **M38.** Timber is wood light 0,0 or wood middle 1,0.
- **M39.** Bark is bark 2,0. A trunk with a cut face carries timber too and shows
  both lanes (G1).

### C. Colour to material — what a band may be used on

- **C1.** Lighter browns: timber only.
- **C2.** Darkest brown: bark and leather only.
- **C4.** Light grey 15,3: metal, stone and rock only. **to be reduced to 2**
- **C6.** Precious metal, light and fire.
- **C7.** Dark red: ceramics, glass, roofs, minor accents.
- **C8.** Dark green: foliage, glass,
- , and minor accents.
- **C9.** Light green: nature only — flora, including grass and weed
  accents growing on objects and structures. 
- **C10.** Blue 4,2, sparingly
  minor accents only.
- **C11.** Light blue-grey 3,2: silver (M11).
- **C12.** Blue-grey 6,1: steel and cast iron (M10), worked stone (M20), wicks (M23),
  book covers (M37).
- **C13.** Clear glass: glass only.

### N. Counting — bands against materials
- **N1.** A model has at least one material.
- **N2.** A model uses at least as many bands as it has materials. 
- **N3.** A model uses at most twice as many bands as materials.
- **N4.** Ceiling: **7 bands for a character, 5 for anything else.**
  - An assembly is not a model. It is a scene built from catalogued models, and
    each part answers to the ceiling on its own.

