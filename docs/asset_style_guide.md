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
- The four wood bands are not four colours but one ramp cut in four, each cell ending
  where the next begins. A position only means something together with its band, and the
  seams between them are invisible — a model can read as the same timber as its
  neighbour while linting as another band. Each band spans 0.10 in OKLab lightness with
  a 0.013 gap to the next, the ramp running L 0.799 down to 0.360: `0,0` 0.799-0.699,
  `1,0` 0.686-0.586, `2,0` 0.573-0.473, `3,0` 0.460-0.360. The ramp is cut by what the
  wood has been made into, lightest to darkest: sawn planks and the end grain of a cut
  log, then planks worked into a thing — chests, barrels, crates, buckets, fences —
  then beams and structure, then the bark of a log or trunk.
  `tools/colormap-respace.mjs --cells 4` lays the ramp out; the kits each carry a copy
  of the map, so `tools/colormap-propagate.mjs` must follow it or nothing changes.
- The other bands are spanned deliberately too, in the same units. Blue 4,2 and light
  blue-grey 3,2 span 0.24; taupe 14,3 and light grey 15,3 0.20; light green 3,1 0.16;
  yellow/gold 6,0, dark red 8,0, dark green 1,1 and blue-grey 6,1 0.12; off-white 5,2
  0.08. A band's ends are in the image, not in this list — read them off the map.
- `tools/colormap-band-lightness.mjs` moves a single band to a lightness range, keeping
  the hue and chroma it carries at each position; `tools/colormap-respace.mjs` is the
  one for the three wood bands together, which move as one ramp.
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
wood light 0,0 · wood middle 1,0 · wood dark 2,0 · bark 3,0.

### S. Special — the one way out of every rule below

- **S1.** `special` is a material tag and a joker: it exempts **one** band on the
  model from **one** rule. `rpgtools/pencil-a-long` is yellow because a pencil is
  yellow, and no material it carries justifies that band — the joker covers it.
- **S2.** The joker is spent once. A second band with no material behind it is a
  finding, whatever the first one was.
- **S3.** It does not lift the N4 ceiling, and it does not excuse the rest of the
  model: every other band still answers to the M and C blocks. The N2 and N3
  counts leave it out: the joker has no colour of its own, so it is not a
  material a model owes a band for. The cheese is one band of yellow for one
  material, not one short of two.
- **S5.** N3 leaves the band the joker paid for out of the count as well — the
  same thing S3 says, seen from the colour side. A band no material owes is not
  one the ceiling charges against, and charging it made every joker a finding:
  `rpgtools/pencil-a-long` is one band of yellow because a pencil is yellow, not
  one band over its timber. N2 keeps that band, because there the joker's colour
  is the one the material is wearing: take the cheese's yellow away and it reads
  as short a band, which S3 says it is not. Which band the joker paid for is the
  band named by the first rule it is spent on; a joker spent on an M rule names
  none, since an M finding is a material without its band and not the reverse.
- **S4.** Only the PO assigns the tag, and a `special` records next to it which
  band it covers and why. A `special` without a stated reason is a finding on the tag.

### M. Material to colour — what a thing is made of, and the colour that takes

Grouped: flora, wood, stone, metal, textile and leather, glass and ceramics,
organic, light, gems and books, built things, plastic.

- **M1.** Trees are dark green.
- **M2.** Palm fronds are light green.
- **M3.** Grass is light green.
- **M4.** Stems and leaves are light green.
- **M5.** Flowers may be any colour. Cactus flowers count too.
- **M6.** Timber is any of the four wood bands: wood light 0,0, wood middle 1,0, wood dark
  2,0 or bark 3,0. W1 says which. A log or a trunk is timber on the bark band as much as a
  plank is timber on wood light — the band says what the wood was made into, not whether
  it is wood.
- **M7.** Bark is bark 2,0. A trunk with a cut face carries timber too and shows
  both lanes.
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
- **M17.** The bands on barrels, chests, buckets, trunks, kegs, crates and boxes
  are metal, light grey 15,3.
- **M18.** Textile is off-white, taupe 14,3, brown 1,0, dark green 1,1 or
  dark red 8,0. The flags and sails of a rigged ship may also be blue-grey
  6,1 — the black of this palette, and the colour a pirate rig flies.
- **M19.** Wrapped grips and bindings on tools and weapons are always taupe 14,3,
  light half 0.02-0.40.
- **M20.** Leather is bark 2,0.
- **M21.** Belts, shoes and straps are leather.
- **M22.** Rope is taupe 14,3, never the light wood lane.
- **M23.** All cork is taupe 14,3.
- **M24.** Glass is its own material: transparent, dark green or dark red.
- **M25.** Ceramics are terracotta, off-white, taupe or dark red.
- **M26.** Bottles are glass or ceramic.
- **M27.** The glass bottle exists in red and green.
- **M28.** A liquid is dark red 8,0, dark green 1,1 or blue 4,2.
- **M29.** Bones and skulls are off-white.
- **M30.** Paper is off-white.
- **M31.** Meat is terracotta 5,0, dark half 0.55-1.00.
- **M32.** Fauna are naturalistic: off-white, salmon, taupe. Fish may also be
  blue 4,2 or light blue-grey 3,2.
- **M33.** Flames and glow are yellow 6,0.
- **M34.** Candle wax and lampshades are off-white 5,2.
- **M35.** Wicks are blue-grey 6,1.
- **M36.** Gemstones are dark red 8,0, dark green 1,1 or blue 4,2.
- **M37.** Book covers are bark 2,0, dark red 8,0, dark green 1,1 or
  blue-grey 6,1. Pages follow M30, clasps and corners M11.
- **M38.** Roofs are ceramic, dark red.
- **M39.** Chests, barrels, kegs, buckets, boxes and crates are mainly timber,
  often with metal accents.
- **M40.** Structures and furniture are mostly timber, then stone (the bigger
  sort, not modern brick). Metal sparingly.
- **M41.** Plastic is dark red 8,0 or yellow/gold 6,0. It shares both bands
  with other materials — C5 and C6 name it alongside them — and only claims
  the specific triangle groups baked to those bands, not a whole model just
  because another part of it is metal or timber.
- **M42.** The band tags take their band, and a timber model carrying the tag must use it:
  `planks` wood light 0,0, `worked-planks` wood middle 1,0, `beam` wood dark 2,0. W1
  says the same from the wood side; this is the half `tools/color-lint.mjs` can check
  from the catalogue, one band per tag, so a plank deck on beams that uses wood light
  alone is a finding on its beam and not on its count. `logs` and `bark` are W1's and
  not checked here.

### C. Colour to material — what a band may be used on

In the order of the band list above.

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
- **C10.** Darkest brown: bark, leather and the timber of a log or trunk. M6 puts timber
  on this band when W1 sends it there; what the band still excludes is every material that
  is not one of those three.
- **C11.** Clear glass: glass only.

### N. Counting — bands against materials
- **N1.** A model has at least one material.
- **N2.** A model uses at least as many bands as it has materials, and timber counts for
  its band tags rather than once. W1 gives timber a band per band tag, so a plank deck on
  beams owes two bands, not one: counting timber once let a model collapse both onto a
  single band and still pass. Timber with no band tag counts once.
- **N3.** A model uses at most twice as many bands as materials.
- **N4.** Ceiling: **6 bands for a human character, 5 for anything else.** A
  skeleton is not a human character: it is made of bone and takes the 5.
  - An assembly is not a model. It is a scene built from catalogued models, and
    each part answers to the ceiling on its own.

### W. Wood — which band a timber model takes, and where inside it

The wood ramp is cut in four by what the wood has been made into. Lightest to darkest:

- `0,0` **wood light** — planks, and the end grain where a log, trunk or branch is cut
  through.
- `1,0` **wood middle** — planks worked into a thing: chests, barrels, crates, buckets,
  fences.
- `2,0` **wood dark** — beams and structure.
- `3,0` **bark** — logs and trunks.

- **W1.** The tag names the band. A model tagged `planks` takes wood light, `worked-planks`
  wood middle, `beam` wood dark, `logs` or `bark` bark. A model carrying several of those
  tags takes several bands, one per tag — a fence of boards on posts is `worked-planks`
  and `beam`, so it is wood middle and wood dark, never one of them. A timber model with
  no band tag has no band this rule can give it: tag it first.
- **W2.** Where a model takes several bands, its own gradient says which surface goes to
  which: the lighter end of the gradient takes the lighter band, in order, down to the
  darker. What the source pack banded the surface as is not a reason.
- **W3.** Planks and end grain sit at mean L 0.71–0.78.
- **W4.** Worked planks sit at mean L 0.61–0.67. Worked planks are not too light: a crate
  must not read as the plank stock it was built from, nor as the beam it stands on.
- **W5.** Beams and structure sit at mean L 0.49–0.55.
- **W6.** Bark sits at mean L 0.406–0.425, the dark end of its band.
- **W7.** Leather sits at mean L 0.425–0.46, just above it. Bark and leather share band
  3,0 and are told apart by where in it they sit — no model carries both materials, so
  the split is exact and not a convention to be blurred.
- **W8.** Every band a model uses spreads over at least 0.03 L, and that spread is the
  model's own: moving a band changes where its mean sits, never how much contrast it
  carries. Shrink only where the model would otherwise fall outside the band it is on,
  per side and no further than that side needs. A band flat on one line of the gradient
  is a recolour that lost the baked shading section 1 asks to keep, not a deliberate flat
  colour. A band carried by fewer than 8 triangles is a chamfer or a cap and is not
  measured.

Positions are per band, 0 at the light edge and 1 at the dark edge, but the rules are
stated in OKLab lightness — L survives a change to `kits/colormap.png`, a position does
not. The measurement is area-weighted over the triangles: what these rules ask is how
much of the object reads as that tone, not how many vertices carry it.
`tools/gradient-lint.mjs` does the measuring; `tools/color-lint.mjs` cannot, and says so
in its own header. The tag half of W1 — that a `planks`, `worked-planks` or `beam` model
uses its band at all — is a catalogue fact, and M42 has `tools/color-lint.mjs` check it.

### X. Accepted findings — models the lint reports and the PO has left standing

- **X1.** `rpgtools/torch-burnt` — C2 and N2. It is `rpgtools/torch` with the
  cloth head and the rope rings burnt: 384 triangles that split 264 cloth / 120
  rope, exactly the off-white and taupe groups of the unburnt torch, all of them
  collapsed onto blue-grey 6,1. Blue-grey is the black this palette has and char
  is black, so the model reads right; C2 does not list char among what the band
  is for, and N2 counts two bands against timber, textile and rope. Appendix A
  has no colour for charred material, and the two ways out — a rule for char, or
  a recolour back into taupe that leaves the burnt torch looking like the plain
  one — are both open. Until one is picked the lint fails on this model, and that
  is the intended state, not a gap to be closed by loosening C2 or N2.
