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
- Objects with distinctive moving features, or with glass, draw in two or more calls. All others in one.

## 6. Reference Assets
- Render and look at the reference assets before creating a new asset — reading them is not enough.
- When validating, render at least two reference assets from same group beside the new one at the same scale.

## Appendix A: Material and colour rules

Band ids are column,row in `kits/colormap.png`. Where a colour name below has
an id, it is: light grey 15,3 · blue-grey 6,1 · light blue-grey 3,2 ·
blue 4,2 · off-white 5,2 · taupe 14,3 · terracotta 5,0 ·
yellow/gold 6,0 · dark red 8,0 · dark green 1,1 · light green 3,1 ·
wood light 0,0 · wood middle 1,0 · wood dark 2,0 · bark 3,0.

### S. Special — the one way out of every rule below

- **S1.** `special` is a material tag and a joker: it exempts **one** band on the
  model from **one** rule.
- **S2.** The joker is spent once. A second band with no material behind it is a
  finding, whatever the first one was.
- **S3.** Spent on N4 it lifts the ceiling by one; every other band still answers
  to M and C. N2 and N3 do not count the joker as a material.
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
- **M6.** Wood is any of the three wood bands; wood-bark is bark 3,0.
- **M7.** A trunk with a cut face carries wood-log and wood-bark.
- **M8.** stone-masonry — walls, bricks, floors — is taupe 14,3, blue-grey 6,1 or
  light grey 15,3. **to be reduced to 2**
- **M9.** stone-rock is light grey 15,3, secondarily taupe 14,3.
- **M10.** stone-soil — sand and dirt — is taupe 14,3.
- **M11.** metal-iron is light grey 15,3.
- **M12.** metal-iron may be blue-grey 6,1 where it is steel or cast iron.
- **M13.** metal-gold is gold 6,0; metal-silver is silver 3,2.
- **M14.** metal-copper is terracotta 5,0 and takes no other metal subtype.
- **M15.** Keys take the colour of any metal subtype.
- **M16.** Buckles are metal-iron, light grey 15,3.
- **M17.** The bands on container group: barrels, chests, buckets, kegs, crates and boxes
  are metal-iron, light grey 15,3.
- **M18.** Textile is off-white, taupe 14,3, dark green 1,1 or dark red 8,0.
- 18b The flags and sails of a rigged ship are off-white, dark green 1,1, dark red 8,0 or blue-grey 6,1 — never taupe 14,3.
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
- **M39.** Chests, barrels, kegs, buckets, boxes and crates are mainly wood,
  often with metal-iron accents.
- **M40.** Structures and furniture are mostly wood, then stone (the bigger
  sort, not modern brick). Metal sparingly.
- **M41.** Plastic is dark red 8,0 or yellow/gold 6,0.
- **M42.** Wood subtypes take their band: `wood-planks` 0,0, `wood-worked` 1,0,
  `wood-beam` 2,0. `wood-log` and `wood-bark` are W1's.
- **M43.** Skin is wood light 0,0, taupe 14,3 or bark 3,0.
- **M44.** Vegetation is a plant's non-green matter: dried stalks and husks taupe 14,3, mushroom stems off-white 5,2, blooms and caps any colour.
- **M45.** Food may be any colour, like fauna. What it is made of decides nothing about its band.
- **M46.** Tools are metal-iron; a handle is wood, textile or both.
- **M47.** Weapons are metal-iron, with a handle of wood or textile.
- **M48.** A simple weapon or a bow may be wholly or partly wood.
- **M49.** A special weapon may be partly metal-gold, metal-silver or gemstone.
- **M50.** Some weapons carry textile or leather straps.
- **M51.** Food of grain or bread is taupe 14,3.
- **M52.** A model whose only material is bone is off-white 5,2 alone.
- **M53.** Plates are usually ceramic, and may be metal-iron or wood.
- **M54.** Furniture is wood, except a rug, a carpet or an upholstered seat, which is textile.
- **M55.** Coins are metal-gold.
- **M56.** Flags and sails are textile.
- **M57.** Signs, flag poles and posts are usually wood.
- **M58.** Pans are usually metal-iron.
- **M59.** Cutlery is metal-iron.
- **M60.** Pots are ceramic; a pan may be metal-iron.
- **M61.** A boat or ship is built from more than one wood.

### C. Colour to material

- **C1.** Light grey 15,3: metal, stone and rock only. **to be reduced to 2**
- **C2.** Blue-grey 6,1: steel and cast iron (M12), worked stone (M8),
  wicks (M35), book covers (M37), and the flags and sails of a rigged ship (M18).
- **C3.** Light blue-grey 3,2: silver (M13).
- **C4.** Blue 4,2: sparingly, minor accents only.
- **C5.** Yellow: metal-gold, emissive, fire and plastic (M41).
- **C6.** Dark red: ceramics, glass, roofs, plastic (M41), textile (M18), minor accents.
- **C7.** Dark green: foliage, glass, textile only on character clothing or weapons (M18), and minor accents.
- **C8.** Light green: nature only — flora, including grass and weed accents
  growing on objects and structures.
- **C9.** Lighter browns: wood only; skin may take wood light 0,0 (M43).
- **C10.** Darkest brown: wood-bark, leather, skin, and a log or trunk.
- **C11.** Tranaparant: glass only.

### N. Counting — bands against materials
- **N1.** A model has at least one material.
- **N2.** A model uses at least as many bands as it has materials. Every material
  tag counts, subtypes included.
- **N3.** A model uses at most twice as many bands as materials; food, fauna and vegetation may use three times, a decorated food five.
- **N4.** Ceiling: **6 bands for a human character or a decorated food, 5 for
  anything else.** A skeleton takes the 5. An assembly is not a model; each part answers on its own.

### W. 

- **W1.** Every wood gradient band spreads over at least 0.03 L.
- **W2.** No band spreads over more than 0.90 of its cell, light end to dark end.
