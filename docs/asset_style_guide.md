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
  themselves by pointing UVs at its bands.
- When recolouring onto the shared map, keep the baked shading: the UV spread across
  the gradient band must be maintained.
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
- Max 3000 tris per occupied grid cell. Measured as tris ÷ (max(0.49, w × d) × max(0.7, h))
  over the bounding box: a 2 × 2 floor tile is judged on four cells, and an asset smaller
  than 0.5 × 0.5 × 0.5 is judged as if it were that size.
- Imported packs get one scale factor for the whole pack for now.

## 5. Origin and orientation
- Default on Y = 0; pivot at footprint centre in X/Z.
- Deviate deliberately, for a functional reason.
- Split nodes put their origin at the joint.
- Objects with distinctive moving features draw in two or more calls — windmill blades, ship sails, a chest cap. All others in one.

## 6. Reference Assets
- Render and look at the reference assets before creating a new asset — reading them is not enough.
- When validating, render at least two reference assets from same group beside the new one at the same scale.

## Appendix A: Material and colour rules

Band ids are column,row in `kits/colormap.png`. Where a colour name below has
an id, it is: light grey 15,3 · blue-grey 6,1 · light blue-grey 3,2 ·
blue 4,2 · off-white 5,2 · taupe 14,3 · salmon 13,0 · terracotta 5,0 ·
yellow/gold 6,0 · dark red 8,0 · dark green 1,1 · light green 3,1 ·
wood light 0,0 · wood middle 1,0 · wood dark 2,0 · bark 3,0.

### S. Special — the one way out of every rule below

- **S1.** `special` is a material tag and a joker: it exempts **one** band on the
  model from **one** rule.
- **S2.** The joker is spent once. A second band with no material behind it is a
  finding, whatever the first one was.
- **S3.** It does not lift the N4 ceiling, and every other band still answers to
  the M and C blocks. N2 and N3 do not count the joker as a material.
- **S5.** N3 leaves the joker's band out of its count; N2 keeps it. That band is
  named by the first rule the joker is spent on; an M rule names none.
- **S4.** Only the PO assigns the tag. A `special` records which band it covers
  and why; one without a stated reason is a finding on the tag.

### M. Material to colour — what a thing is made of, and the colour that takes

- **M1.** Trees are dark green.
- **M2.** Palm fronds are light green.
- **M3.** Grass is light green.
- **M4.** Stems and leaves are light green.
- **M5.** Flowers may be any colour. Cactus flowers count too.
- **M6.** Timber is any of the wood bands, not bark. 
- **M7.** A trunk with a cut face carries timber and bark.
- **M8.** Worked stone — walls, bricks, floors — is taupe 14,3, blue-grey 6,1 or
  light grey 15,3. **to be reduced to 2**
- **M9.** Rocks are light grey 15,3, secondarily taupe 14,3.
- **M10.** Sand and dirt are taupe 14,3.
- **M11.** Metal is light grey 15,3.
- **M12.** Steel and cast iron may be blue-grey 6,1.
- **M13.** Precious metal is gold 6,0 or silver 3,2.
- **M14.** Copper is terracotta 5,0.
- **M15.** Keys take any metal or precious-metal colour.
- **M16.** Buckles are metal, light grey 15,3.
- **M17.** The bands on container group: barrels, chests, buckets, kegs, crates and boxes
  are metal, light grey 15,3.
- **M18.** Textile is off-white, taupe 14,3, brown 1,0, dark green 1,1 or dark
  red 8,0.
- 18b The flags and sails of a rigged ship may also be blue-grey 6,1.
- **M19.** Wrapped grips and bindings on tools and weapons are always taupe 14,3,
  light half 0.02-0.40.
- **M20.** Leather is bark.
- **M21.** Belts, shoes and straps are leather.
- **M22.** Rope is taupe 14,3.
- **M23.** All cork is taupe 14,3.
- **M24.** Glass is transparent, dark green or dark red.
- **M25.** Ceramics are terracotta, off-white, taupe or dark red.
- **M26.** Bottles are glass or ceramic.
- **M27.** The glass bottles exists in red and green.
- **M28.** A liquid is dark red 8,0, dark green 1,1 or blue 4,2.
- **M29.** Bones and skulls are off-white.
- **M30.** Paper is off-white.
- **M31.** Meat is terracotta 5,0, dark half 0.55-1.00.
- **M32.** Fauna may be any colors. 
- **M33.** Flames and glow are yellow 6,0.
- **M34.** Candle wax are off-white 5,2.
- **M35.** Wicks are blue-grey 6,1.
- **M36.** Gemstones are dark red 8,0, dark green 1,1 or blue 4,2.
- **M37.** Book covers are bark, dark red 8,0, dark green 1,1 or
  blue-grey 6,1. 
- **M38.** Roofs are ceramic, dark red.
- **M39.** Chests, barrels, kegs, buckets, boxes and crates are mainly timber,
  often with metal accents.
- **M40.** Structures and furniture are mostly timber, then stone (the bigger
  sort, not modern brick). Metal sparingly.
- **M41.** Plastic is dark red 8,0 or yellow/gold 6,0.
- **M42.** Band tags take their band: `planks` wood light 0,0, `worked-planks`
  wood middle 1,0, `beam` wood dark 2,0. `logs` and `bark` are W1's.

### C. Colour to material

- **C1.** Light grey 15,3: metal, stone and rock only. **to be reduced to 2**
- **C2.** Blue-grey 6,1: steel and cast iron (M12), worked stone (M8),
  wicks (M35), book covers (M37), and the flags and sails of a rigged ship (M18).
- **C3.** Light blue-grey 3,2: silver (M13).
- **C4.** Blue 4,2: sparingly, minor accents only.
- **C5.** Yellow: precious metal, light, fire and plastic (M41).
- **C6.** Dark red: ceramics, glass, roofs, plastic (M41), minor accents.
- **C7.** Dark green: foliage, glass, and minor accents.
- **C8.** Light green: nature only — flora, including grass and weed accents
  growing on objects and structures.
- **C9.** Lighter browns: timber only.
- **C10.** Darkest brown: bark, leather and a log or trunk.
- **C11.** Tranaparant: glass only.

### N. Counting — bands against materials
- **N1.** A model has at least one material.
- **N2.** A model uses at least as many bands as it has materials. Timber counts
  once per band tag; timber with no band tag counts once.
- **N3.** A model uses at most twice as many bands as materials.
- **N4.** Ceiling: **6 bands for a human character, 5 for anything else.** A
  skeleton takes the 5. An assembly is not a model; each part answers on its own.

### W. 

- **W1.** Every wood gradient band spreads over at least 0.03 L.
