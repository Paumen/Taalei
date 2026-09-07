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
- **M6.** Timber is wood light 0,0, wood middle 1,0 or wood dark 2,0. G1 says which.
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
- **C10.** Darkest brown: bark and leather only.
- **C11.** Clear glass: glass only.

### N. Counting — bands against materials
- **N1.** A model has at least one material.
- **N2.** A model uses at least as many bands as it has materials.
- **N3.** A model uses at most twice as many bands as materials.
- **N4.** Ceiling: **6 bands for a human character, 5 for anything else.** A
  skeleton is not a human character: it is made of bone and takes the 5.
  - An assembly is not a model. It is a scene built from catalogued models, and
    each part answers to the ceiling on its own.

### G. Gradient — where inside a band a material sits

The M and C blocks say which band a material takes. They leave open where in it the
material sits, and that is most of what the eye reads: the bands are wide, and two models
on the same band can be a third of the whole wood ramp apart. Positions below are per
band, 0 at the light edge and 1 at the dark edge, but the rules are stated in OKLab
lightness — L survives a change to `kits/colormap.png`, a position does not.

The measurement is area-weighted over the triangles: what these rules ask is how much of
the object reads as that tone, not how many vertices carry it. `tools/gradient-lint.mjs`
does the measuring; `tools/color-lint.mjs` cannot, and says so in its own header.

- **G1.** Timber takes its band from what the wood has been made into, not from how the
  surface was cut. Wood light 0,0 is sawn stock and the cut face: planks, boards, panels,
  decking, floors, furniture tops, signs, and the end grain where a log, trunk or branch
  has been cut through. Wood middle 1,0 is planks worked into a thing — the container
  family of G6, and fences and gates. Wood dark 2,0 is what holds a thing up: beams,
  posts, frames, poles, shafts, handles, hulls, staves. Bark 3,0 is the round outside of
  a log or trunk. A model that carries several of these shows several bands: a cut log is
  bark on its round and wood light on its end, a fence is wood middle on its boards and
  wood dark on its posts. Which band the source pack happened to use is not a reason: it
  is why a barrel is one colour in one kit and another colour in the next.
- **G2.** Planks and end grain sit at mean L 0.71–0.78.
- **G8.** Worked planks sit at mean L 0.61–0.67. The band exists so a crate does not read
  as the beam it stands on: before the ramp was cut in four the two shared one band, and
  the container family was pinned to it by G6 alone.
- **G3.** Beams and structure sit at mean L 0.49–0.55.
- **G4.** Bark sits at mean L 0.406–0.425, the dark end of its band.
- **G5.** Leather sits at mean L 0.425–0.46, just above it. Bark and leather share band
  3,0 and are told apart by where in it they sit — no model carries both materials, so
  the split is exact and not a convention to be blurred. The two windows meet rather
  than leaving a gap: the catalogue puts bark at L 0.415 and leather at 0.441 by habit,
  0.026 apart, and windows further apart than that would move leather off a tone that
  reads right today.
- **G6.** A container is one family, and G1 does not divide it. Chests, crates,
  trunks, boxes, barrels, buckets and kegs — the list M39 already treats as one thing —
  all take wood middle 1,0 and all sit on the same mean, whether the maker built them
  from staves or from nailed boards. A crate standing next to a barrel has to read as
  the same timber; which of the two the surface looks like is not a difference anyone
  places them for. A light trim of a few per cent — the lid boards on the dungeon
  barrels — may stay on wood light 0,0: band 1,0 is only 0.10 L wide, and folding a
  highlight that far above the mean into it costs the other ninety-nine per cent most
  of its shading.
- **G7.** Every band a model uses spreads over at least 0.03 L, and that spread is the
  model's own: moving a band changes where its mean sits, never how much contrast it
  carries. Scaling a model's shading to the width of a window opens up a subtle
  gradient and flattens a strong one — both are the maker's baked shading thrown away.
  Shrink only where the model would otherwise fall outside the band it is on, per side
  and no further than that side needs. A band flat on one line
  of the gradient is a recolour that lost the baked shading section 1 asks to keep, not a
  deliberate flat colour. A band carried by fewer than 8 triangles is a chamfer or a cap
  and is not measured. Where a model carried its own light and dark groups on two
  different bands, they belong on one band on a single scale — the lighter group stays
  the lighter one inside it. That is what the gradient inside a band is for.

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
