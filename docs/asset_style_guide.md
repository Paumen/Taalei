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

- **M1.** Flowers may be any colour, so the colour-to-material rules do not reach
  them. Cactus flowers count too, though they are filed under plants.
- **M2.** Stems and leaves follow foliage green.
- **M3.** Flowers, grass and plants use light green, never dark green.
- **M4.** Grass is light green.
- **M5.** Trees are dark green. Palms are the exception: their fronds are light green.
- **M6.** Bones and skulls are off-white.
- **M7.** Paper is off-white.
- **M8.** Ceramics are terracotta, off-white, taupe or dark red.
- **M9.** Metal is light grey 15,3.
- **M10.** Steel and cast iron may be blue-grey 6,1.
- **M11.** Coins and jewellery metal are gold 6,0 or silver 3,2. Copper is
  terracotta 5,0. Sword and dagger grips are silver 3,2.
- **M12.** Keys take any metal or precious-metal colour.
- **M13.** Textile is off-white, salmon 13,0, taupe 14,3 or brown 1,0. Wrapped grips
  and bindings on tools and weapons are always taupe 14,3, light half 0.02-0.40.
  A wooden peg or T-handle bar is timber, not binding.
- **M14.** Rope is taupe 14,3, never the light wood lane.
- **M15.** Belts, shoes and straps are leather, wherever a strap turns up: book
  fixtures, bands round bricks or bundles. Colour: M35.
- **M16.** Bottles are glass or ceramic.
- **M17.** Glass is its own material: transparent, dark green or dark red.
- **M18.** The glass bottle shape exists in red and green.
- **M19.** Roofs are dark red.
- **M20.** Worked stone — walls, bricks, floors — is taupe 14,3, blue-grey 6,1 or
  light grey 15,3.
- **M21.** Rocks are light grey 15,3, secondarily taupe 14,3.
- **M22.** Sand and dirt are taupe 14,3 or salmon 13,0: the `soil` material. Laid
  paving and hewn stone are stone; loose boulders, gravel and rubble are rock; a
  grass patch is flora sitting on the ground.
- **M23.** Wicks are blue-grey 6,1.
- **M24.** Flames and glow are yellow 6,0; candle wax and lampshades off-white 5,2.
- **M25.** All cork is taupe 14,3.
- **M26.** Fauna are naturalistic: off-white, salmon, taupe. Fish may also be
  blue 4,2 or light blue-grey 3,2.
- **M27.** The bands on barrels, chests, buckets, trunks, kegs, crates and boxes are
  metal, light grey 15,3, whatever the model is made of.
- **M28.** Chests, barrels, kegs, buckets, boxes and crates are mainly timber, often
  with metal accents.
- **M29.** Structures and furniture are mostly timber, then stone (the bigger sort,
  not modern brick). Metal sparingly.
- **M30.** Food is naturalistic: off-white 5,2, salmon 13,0, terracotta 5,0,
  dark red 8,0 or taupe 14,3. Cheese is the one yellow 6,0. Bone follows M6, the
  plate or bowl its own material.
- **M31.** A liquid is dark red 8,0, dark green 1,1 or blue 4,2. Within those three
  bands the C block does not reach it. Flask: M16. Stopper: M25.
- **M32.** Meat is terracotta 5,0, dark half 0.55-1.00: joint, drumstick, ham,
  steak, roast bird. A cut or inner face stays in that range. Bone follows M6, the
  fat rim the off-white beside it.
- **M33.** What sits beside the meat is not meat: mash, carrots, potatoes, peas.
  Read which is which from the source model — on our palette mash and meat can both
  land on salmon 13,0. `food-stew` and `plate-food-b` hold no meat at all.
- **M34.** Buckles are metal, light grey 15,3 — on a belt, a strap or a bag.
- **M35.** Leather is bark 2,0: belts, straps, boots, bracers, quivers, satchels and
  book covers are all one brown.
- **M36.** Gemstones are dark red 8,0, dark green 1,1 or blue 4,2 — set in a ring,
  a necklace, an amulet or a hilt. The metal around follows M11.
- **M37.** Book covers are bark 2,0, dark red 8,0, dark green 1,1 or blue-grey 6,1.
  Pages follow M7, clasps and corners M9.
- **M38.** Timber is wood light 0,0 or wood middle 1,0; which one is G1.
- **M39.** Bark is bark 2,0. A trunk with a cut face carries timber too and shows
  both lanes (G1).
- **M40.** Foliage is dark green 1,1 or light green 3,1 — trees dark (M5), small
  flora light (M3, M4).
- **M41.** A gemstone carries the `gemstone` tag; M36 gives its colour.

### C. Colour to material — what a band may be used on

- **C1.** Lighter browns: timber only.
- **C2.** Darkest brown: bark and leather only.
- **C3.** Terracotta is never used for timber. Copper (M11) is the exception outside
  ceramics.
- **C4.** Light grey 15,3: metal, stone and rock only.
- **C5.** Retired with the dark grey band it named — cast iron moved to blue-grey
  (M10), wicks to M23. The number is not reused.
- **C6.** Yellow: coins, jewellery, light and fire — and cheese (M30).
- **C7.** Dark red: ceramics, glass, roofs, liquids (M31), gemstones (M36), book
  covers (M37), and very minor accents.
- **C8.** Dark green: foliage, glass, liquids (M31), gemstones (M36), book covers
  (M37), and very minor accents.
- **C9.** Light green: nature only — flora and foliage, including grass and weed
  accents growing on objects and structures. Not a general accent band: green on
  something that grows nothing is a finding.
- **C10.** Blue 4,2, sparingly: fish (M26), liquids (M31), gemstones (M36), otherwise
  minor accents only.
- **C11.** Light blue-grey 3,2: silver (M11) and fish (M26) only.
- **C12.** Blue-grey 6,1: steel and cast iron (M10), worked stone (M20), wicks (M23),
  book covers (M37).
- **C13.** Clear glass: glass only. Nothing that is not glass is transparent.
- **C14.** Salmon 13,0: sand and dirt (M22), textile (M13), food (M30), fauna (M26).
- **C15.** Off-white 5,2 and taupe 14,3 carry no "only" clause. They are the two
  general-purpose bands: a surface taking one is judged by its material's own M rule.

### N. Counting — bands against materials
- **N1.** A model usually has at least one material.
- **N2.** A model usually uses at least as many bands as it has materials. Fewer is
  fine when two materials land on the same band: `village-kit/well-a` puts its rope
  on the taupe it already uses for stone.
- **N3.** A model usually uses at most twice as many bands as materials.
- **N4.** Ceiling: **8 bands for a character, 6 for anything else.**
  - Clear glass is a material, not a band (M17), so windows cost nothing here.
  - An assembly is not a model. It is a scene built from catalogued models, and
    each part answers to the ceiling on its own; the assembly is not counted again.
  - The ceiling limits how many bands, never which. A model sitting at its
    ceiling still answers to the M and C blocks in full.
  - `special` does not switch N4 off. It excuses a model from being told which
    colour a material takes, not from being told how many it may spend.
- **N5.** Bring a model under the ceiling by merging bands, never by repainting.
  - Two bands carrying the same material or the same garment become one.
  - The band with the most triangles survives.
  - The triangles moving onto it keep their gradient position (G3).
  - Take the merge the eye does not catch. Never merge away a two-tone the model is
    recognised by — the hood of `rogue-hooded`, the gold on a hilt beside its blade.
- **N6.** Every model named in `catalog/tags.json` exists in the catalogue. A tag
  pointing at a renamed or removed model silently untags the model it was meant for,
  and an untagged model is one every M and C rule passes over.

### G. Gradient, lanes and look — where the tones come from

- **G1.** Wood is one ladder in three lanes: light 0,0 for surfaces, planks and cut
  faces; middle 1,0 for frames; bark 2,0 for bark only. No bark lane without a bark
  tag, except leather-look surfaces (book covers, bags, straps), which may take it.
  Bark with a cut face shows two tones.
- **G2.** The ladder is one continuous track — #e6bc94 → #b07f5c → #845740 → #5e4232 —
  each lane running anchor to anchor so they join seamlessly.
- **G3.** The gradient position inside a lane comes from the original model.
- **G4.** Which triangles are light or dark is stated in the source model.
- **G5.** Different timber hues or lightness in the source mean different bands on
  our palette too.
- **G6.** Brown and timber objects usually show visible planks or trunks, and do not
  read as smoothed or polished.
