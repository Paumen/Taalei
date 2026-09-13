# Asset style guide

For an LLM creating or adjusting assets.
Scope: items in catalog, and how they are tagged.

## 0. Look

- **L1.** `--` ⚪ Toy-like and iconic: chunky, slightly caricatured — not thin or spindly, and
  not so pared back it reads as primitive. Building panels are the exception:
  they may be thin, and get the look once assembled.
- **L2.** `--` ⚪ Clean deliberate facets, chamfered edges — rounded-soft, not noisy.
- **L3.** `--` ⚪ Few details, except on organic objects.
- **L4.** `--` ⚪ Every object was invented before 1850.
- **L5.** `--` ⚪ Models of one deepest kind look alike in shape, colour and style.

## 1. Colour
- **P1.** `--` ⚪ Colours come from the shared colormap image (`kits/colormap.png`): assets colour
  themselves by pointing UVs at its bands.
- **P2.** `--` ⚪ When recolouring onto the shared map, keep the baked shading: the UV spread across
  the gradient band must be maintained.
- **P3.** `--` ⚪ Defaults: `alphaMode` `OPAQUE`, except for the one clear glass colour;
  `roughnessFactor` 1; `metallicFactor` 0.

## 2. Geometry
- **G1.** `PW` 🔴 Objects with distinctive moving features, or with glass, draw in two or more calls. All others in one.
- **G2.** `--` ⚪ Flat-piece construction. At most 16 flat pieces per full circle equivalent.
- **G3.** `--` ⚪ Typically 8-12. Use 16 only for hero objects, and for objects that are a true
  even circle in reality.

## 3. Outlines and shading
- **R1.** `--` ⚪ Avoid outlines, unless one is a distinctive core feature of the object's appearance. Note it to the PO when you use one.
- **R2.** `--` ⚪ Faces use palette colours and gradient bands for baked shading.
- **R3.** `--` ⚪ No shadow casting in assets.

## 4. Scale
- **X1.** `--` ⚪ One wall/floor segment = 1 × 1 unit footprint, wall height = 1 unit.
- **X2.** `--` ⚪ Assets may stretch multiple units.
- **X3.** `--` ⚪ No solid pieces thinner than 0.015 units.
- **X4.** `FW` 🔴 Max 5000 tris per occupied grid cell; char and plural models are exempt. Measured as tris ÷ (max(0.49, w × d) × max(0.7, h))
  over the bounding box: a 2 × 2 floor tile is judged on four cells, and an asset smaller
  than 0.5 × 0.5 × 0.5 is judged as if it were that size.
- **X5.** `--` ⚪ Imported packs get one scale factor for the whole pack for now.
- **X6.** `FW` 🟢 Nothing is taller than 6 units, except env-terrain-mountain.

## 5. Origin and orientation
- **O1.** `--` ⚪ Default on Y = 0; pivot at footprint centre in X/Z.
- **O2.** `--` ⚪ Deviate deliberately, for a functional reason.
- **O3.** `--` ⚪ Split nodes put their origin at the joint.

## 6. Reference Assets
- **V1.** `--` ⚪ Render and look at the reference assets before creating a new asset — reading them is not enough.
- **V2.** `--` ⚪ When validating, render at least two reference assets from same group beside the new one at the same scale.

## 7. Tagging

| field | job | set | who |
|---|---|---|---|
| `material` | what it is **made of** | closed, 36, parented | Claude, linted |
| `kind` | what it **is** — form cohort | closed, hierarchical, **exactly one** | Claude via glossary, PO reviews |
| `use` | what it is **for** — where you'd look | closed, small, zero or more | Claude, PO reviews |
| `size` | rough bbox: `s` `m` `l` | measured | automated |
| `tag` | kit/artist, theme, flags, candidate kinds | open | mixed |

### T. Fields

- **T1.** `--` ⚪ `kind`, `material` and `use` are closed sets.
- **T2.** `--` ⚪ Kind is form (what peers it's compared against). Material is substance. Use is function.
- **T3.** `--` ⚪ A kind leaf may carry its material's name: `env-remains-bones` beside material `bone`.
- **T4.** `--` ⚪ A kind implies its parents.
- **T5.** `--` ⚪ A new leaf needs at least 6 models, variants included. An existing leaf is not retired for dropping below.
- **T6.** `--` ⚪ Artist tags are derived from the kit, and only for artists of which several kits are adopted in catalog.

### K. Kind

- **K1.** `--` ⚪ Exactly one kind per model. `assy` and `scene` are kinds.
- **K2.** `--` ⚪ Tag the deepest leaf that fits. The parent is the "other" level; never add `-other` leaves.
- **K3.** `--` ⚪ Tie-breaker: when two kinds fit, pick the one whose lint rules you want applied. A leather bag is `obj-container-bag`, not `obj-equipment`.
- **K4.** `--` ⚪ `assy` = distinct things in one top-level (table + mugs); `scene` crosses them (house + tree). A dual-function axe is one kind, two uses.
- **K5.** `--` ⚪ Ground mesh → `env-terrain`; placed body → `env-rock`. A cobbled path is terrain; a cliff prop is `env-rock-formation`.
- **K6.** `--` ⚪ `env-fauna` = ambient/prop creature; `char` = rigged or acting.
- **K7.** `--` ⚪ Kit of origin never decides kind. A mushroom from a food kit is `env-fungi`.
- **K8.** `--` ⚪ Appendix B is the glossary. Every common noun resolves to exactly one kind. Resolve against it before tagging.
- **K9.** `--` ⚪ Style rules attach to kind. A leaf with fewer than 6 models inherits its parent's rules; sparse leaves get no hand-written rules.

### U. Use

- **U1.** `--` ⚪ Set: `container` `food` `weapon` `tool` `wearable` `decor` `transport` `light`.
- **U2.** `--` ⚪ Use is for browsing and retrieval only. Lint and normalization ignore it.
- **U3.** `--` ⚪ A use is not implied by kind; tag it explicitly. `obj-container-*` models still carry `use:container`.
- **U4.** `--` ⚪ Catalogue search and LLM asset lookup always query kind and use together.

### F. Flags

- **F1.** `--` ⚪ `size` is measured, never hand-set.
- **F2.** `--` ⚪ `animation` is measured. `ngons` and `hero` are judged.
- **F3.** `--` ⚪ `ngons` marks a round cross-section — the form §2 counts facets on.
- **F4.** `--` ⚪ `plural` is several instances of one thing in one model. It replaces the `stacks` tag, which is removed.

## Appendix A: Material and colour rules

Band ids are column,row in `kits/colormap.png`. Where a colour name below has
an id, it is: light grey 15,3 · dark grey 13,3 · blue-grey 6,1 · light blue-grey/silver 3,2 ·
blue 4,2 · off-white 5,2 · taupe 14,3 · terracotta 5,0 ·
yellow/gold 6,0 · dark red 8,0 · dark green 1,1 · light green 3,1 ·
light brown 0,0 · mid brown 1,0 · dark brown 2,0 · bark 3,0.

### Status of a rule

Every rule carries how far it is automated and whether the catalogue passes it
today. A new rule starts as a warning and is raised to error once it has been
tuned against the catalogue.

| code | meaning |
|---|---|
| `FE` | fully lint enforced — error |
| `PE` | partially lint enforced — error |
| `FW` | fully lint enforced — warning |
| `PW` | partially lint enforced — warning |
| `--` | not automated |

🟢 no findings in the catalogue today · 🔴 findings open · ⚪ nothing measures it.
Statuses are regenerated by `node tools/rule-status.mjs`, never hand-set; it reads
lint's findings and rewrites every marker below. The same run rewrites section C from the
rows of M. `--check` fails when they are stale.
Lint reads 1750 models and skips the `assemblies` group and any model with no colours.
A status marker is metadata, not rule text — the 140-char limit measures the rule
text alone.

### S. Special — the one way out of every rule below

- **S1.** `PE` 🟢 `special` is a material tag and a joker: it exempts **one** band on the
  model from every rule that band trips.
- **S2.** `PE` 🟢 The joker is spent once. A second band with no material behind it is a
  finding, whatever the first one was.
- **S3.** `PE` 🟢 Spent on N4 it lifts the ceiling by one; every other band still answers
  to M and C. N2 and N3 do not count the joker as a material.
- **S4.** `FE` 🟢 Only the PO assigns the tag. A `special` records which band it covers
  and why; one without a stated reason is a finding on the tag.
- **S5.** `PE` 🟢 N3 leaves the joker's band out of its count; N2 keeps it. That band is
  the one the reason on the tag names.
- **S6.** `--` ⚪ `hero` is the PO's alone, like `special` (S4). Claude proposes `hero` when adding to the catalogue.
- **S7.** `--` ⚪ Claude asks for `special` only after legal recolouring and a kind or material change have both failed.

### M. Material to colour — what a thing is made of, and the colour that takes

One row per material (or kind, or part) and the bands it takes; a rule spanning several rows repeats its id. `any` = any colour.

| id | status | kind | part | material | bands | note |
|---|---|---|---|---|---|---|
| **M1** | `FE` 🟢 | env-flora-tree |  | foliage | dark green | env-flora-tree-palm follows M2 |
| **M2** | `FE` 🟢 | env-flora-tree-palm | fronds | foliage | light green |  |
| **M3** | `FE` 🟢 | env-flora-plant-grass |  |  | light green |  |
| **M4** | `PE` 🟢 |  | stems, leaves | foliage | light green |  |
| **M5** | `--` ⚪ | env-flora-plant-flower, env-flora-plant-cactus in bloom | flowers |  | any |  |
| **M6** | `FE` 🔴 |  |  | wood | light brown, mid brown, dark brown |  |
| M6 |  |  |  | wood-bark | bark |  |
| **M7** | `--` ⚪ |  | trunk with a cut face | wood-log, wood-bark |  | carries both tags |
| **M8** | `PE` 🟢 |  | walls, bricks, floors | stone-masonry | taupe, blue-grey, light grey |  |
| **M9** | `FE` 🔴 |  |  | stone-rock | light grey, taupe | taupe secondarily |
| **M10** | `FE` 🟢 |  | sand, dirt | stone-soil | taupe |  |
| **M11** | `PE` 🟢 |  |  | metal-iron-steel | light grey |  |
| **M12** | `PE` 🔴 |  |  | metal-iron-wrought | dark grey |  |
| M12 |  |  |  | metal-iron-cast | blue-grey |  |
| **M13** | `FE` 🟢 |  |  | metal-gold | yellow |  |
| M13 |  |  |  | metal-silver | light blue-grey |  |
| **M14** | `FE` 🟢 |  |  | metal-copper | terracotta | takes no other metal subtype |
| **M15** | `PE` 🟢 | obj-pocketitem-key |  | metal-iron-wrought | dark grey |  |
| M15 |  | obj-pocketitem-key |  | metal-gold | yellow |  |
| **M17** | `PE` 🔴 | obj-container-barrel, -chest, -bucket, -crate | hoops | metal-iron-wrought | dark grey |  |
| **M18** | `PE` 🔴 |  |  | textile | off-white, dark green, dark red | taupe only for grips and bindings (M19) |
| **M18b** | `PE` 🔴 | obj-transport-ship, -boat, -accessory |  | textile | blue-grey | in addition to M18 |
| **M19** | `PW` 🔴 | obj-tool, obj-weapon | wrapped grips, bindings | textile | taupe | always; light half 0.02-0.40 |
| **M20** | `FE` 🔴 |  |  | leather | bark |  |
| **M21** | `--` ⚪ |  | belts, shoes, straps | leather |  |  |
| **M22** | `FE` 🔴 |  |  | rope | taupe |  |
| **M23** | `FE` 🟢 |  |  | cork | taupe | all cork |
| **M24** | `FE` 🟢 |  |  | glass | clear glass, dark green, dark red |  |
| **M25** | `FE` 🔴 |  |  | ceramic | terracotta, off-white, dark red |  |
| **M26** | `PE` 🟢 | obj-container-bottle |  | glass or ceramic |  |  |
| **M27** | `PE` 🟢 | obj-container-bottle |  | glass | dark red, dark green, clear glass |  |
| **M28** | `FE` 🟢 |  |  | liquid | dark red, dark green, blue |  |
| **M29** | `FE` 🔴 | env-remains-bones |  | bone | off-white |  |
| **M30** | `FE` 🟢 |  |  | paper | off-white |  |
| **M31** | `FE` 🟢 | obj-food-meat |  |  | dark red |  |
| **M32** | `--` ⚪ | env-fauna |  |  | any |  |
| **M33** | `FE` 🟢 |  | flames, glow, lights | emissive | yellow | spread wide across the band |
| **M34** | `FE` 🟢 |  | candle wax | wax | off-white |  |
| **M35** | `FW` 🟢 |  | wicks | wick | dark grey |  |
| **M36** | `FE` 🟢 |  |  | gemstone | dark red, dark green, blue |  |
| **M37** | `PE` 🟢 | obj-pocketitem-book, obj-weapon-magic with paper | book covers |  | bark, dark red, dark green, blue-grey |  |
| **M38** | `PE` 🔴 | str-part-roof |  | ceramic | dark red |  |
| **M39** | `PE` 🔴 | obj-container-barrel, -chest, -bucket, -crate |  | mainly wood, often metal-iron accents |  |  |
| **M40** | `--` ⚪ | str, obj-furniture |  | mostly wood, then stone (the bigger sort, not modern brick); metal sparingly |  |  |
| **M42** | `FE` 🔴 |  |  | wood-planks | light brown |  |
| M42 |  |  |  | wood-worked | mid brown |  |
| M42 |  |  |  | wood-beam | dark brown | wood-log and wood-bark follow M6 |
| **M43** | `FE` 🟢 |  |  | skin | light brown, taupe, bark |  |
| **M44** | `PE` 🟢 |  | dried stalks | vegetation | taupe | vegetation is a plant's non-green matter |
| M44 |  |  | grain straw | vegetation | light brown | M51 |
| M44 |  |  | blooms | vegetation | any | fungi: M72 |
| **M45** | `--` ⚪ | obj-food |  | food | any | like fauna; what it is made of decides nothing |
| **M46** | `--` ⚪ | obj-tool |  | metal-iron; a handle wood, textile or both |  |  |
| **M47** | `--` ⚪ | obj-weapon |  | metal-iron; a handle wood or textile |  |  |
| **M48** | `--` ⚪ | simple obj-weapon, obj-weapon-ranged-bow |  | wood, wholly or partly |  |  |
| **M49** | `--` ⚪ | special obj-weapon |  | partly metal-gold, metal-silver or gemstone |  |  |
| **M50** | `--` ⚪ | obj-weapon | straps | textile or leather |  | some models |
| **M51** | `--` ⚪ |  | wheat, grain, straw |  | light brown |  |
| M51 |  | obj-food-grain |  |  | light brown, mid brown, dark brown |  |
| **M52** | `--` ⚪ | a model whose only material is bone |  | bone | off-white | alone |
| **M53** | `--` ⚪ | obj-kitchenware-tableware-plate |  | ceramic | off-white, terracotta | a plate may also be metal-iron or wood |
| **M54** | `--` ⚪ | obj-furniture |  | wood |  | a rug, a carpet or an upholstered obj-furniture-seating is textile |
| **M55** | `--` ⚪ | obj-pocketitem-coin |  | metal-gold |  |  |
| **M56** | `--` ⚪ | str-marker-flag, sails (obj-transport-accessory) |  | textile |  |  |
| **M57** | `--` ⚪ | str-marker-sign, flag poles, str-barrier-post |  | wood |  | usually |
| **M58** | `--` ⚪ | obj-kitchenware-cookware-pan |  | metal-iron-steel or metal-iron-cast |  | paired as variants (M65) |
| **M59** | `--` ⚪ | obj-kitchenware-tableware-cutlery |  | metal-iron |  |  |
| **M60** | `--` ⚪ | obj-kitchenware-cookware-pot | cooking pots, crockpots | ceramic | terracotta | cauldrons and kettles are iron (M65) |
| **M61** | `--` ⚪ | obj-transport-boat, -ship |  | more than one wood |  |  |
| **M62** | `PW` 🔴 | obj-weapon, obj-equipment, obj-kitchenware-tableware, obj-tool |  | metal-iron-steel |  |  |
| **M63** | `PW` 🟢 | obj-tool-supplies |  | metal-iron-wrought |  | its parent kind stays steel |
| **M64** | `PW` 🟢 | obj-weapon-cannon, every str with iron |  | metal-iron-cast |  | another subtype may sit on top |
| **M65** | `PW` 🔴 | metal obj-kitchenware-cookware |  | metal-iron-steel and metal-iron-cast |  | both exist, paired as variants; a model keeps the iron it is |
| **M66** | `PW` 🔴 | all other iron |  | metal-iron-wrought |  |  |
| **M67** | `PW` 🟢 | a model |  | more than one iron subtype allowed |  | each counts under N2; never merge two iron bands into one |
| **M68** | `PW` 🟢 | char |  | metal-iron-steel |  | an assembly answers per part; until it does, M66 stands |
| **M69** | `--` ⚪ | sails (obj-transport-accessory), str-stands canvas |  | textile | off-white, dark red | dark red only striped with off-white |
| **M70** | `--` ⚪ | char | clothing | textile | dark red | the only dark red textile besides the stripes of M69 |
| **M71** | `--` ⚪ | str, and any model of size m or l |  | glass | clear glass | only size s glass may be dark red or dark green |
| **M72** | `--` ⚪ | env-fungi | fungus stems |  | off-white |  |
| M72 |  | env-fungi | fungus caps |  | dark red, light brown, mid brown, dark brown |  |
| **M73** | `--` ⚪ | bells |  | metal-copper, metal-gold or metal-silver |  | never iron |
| **M74** | `--` ⚪ | tongs (obj-tool-hand) |  | metal-iron-steel or metal-iron-wrought |  | never cast |
| **M75** | `--` ⚪ | obj-container-bag | fasteners, closures | rope or leather |  |  |
| **M76** | `--` ⚪ | obj-resource stack, obj-resource-metal included | straps | leather |  |  |
| **M77** | `--` ⚪ |  | sticks, unworked poles | wood-bark |  |  |
| M77 |  | obj-tool-long | poles | wood-beam | dark brown |  |
| **M78** | `--` ⚪ | obj-tool-hand | wood handles | wood-planks | light brown |  |
| **M79** | `--` ⚪ | obj-weapon, obj-tool, obj-equipment-shield | grips, fasteners, joins | textile, rope or leather |  | often; not wood or metal |
| **M80** | `--` ⚪ |  | a fastener joining stone, bone or steel to wood | leather |  | usually |
| **M81** | `--` ⚪ | obj-transport | wooden parts | wood | mid brown, dark brown |  |
| **M82** | `--` ⚪ | mugs, cups, tankards (obj-kitchenware-tableware) |  | wood | dark brown, mid brown |  |
| M82 |  | mugs, cups, tankards (obj-kitchenware-tableware) | hoops, handles | metal-iron-steel |  |  |
| **M83** | `--` ⚪ | obj-food | fish |  | light grey, dark grey, blue-grey, blue | default |
| M83 |  | obj-food | cheese |  | yellow | default |
| M83 |  | obj-food-vegetable |  |  | light green | default |
| **M84** | `--` ⚪ | obj-food-vegetable | carrot, pumpkin |  | terracotta |  |
| M84 |  | obj-food | chocolate |  | light brown, mid brown, dark brown | bread: M51, meat: M31 |
| **M85** | `--` ⚪ | obj-pocketitem-jewellery |  | metal-gold | yellow | with gemstones (M36) |
| **M86** | `--` ⚪ | obj-pocketitem-scroll |  | paper | off-white |  |
| M86 |  | obj-pocketitem-scroll | scroll accents |  | dark red, dark green, blue |  |
| M86 |  | obj-pocketitem-scroll | scroll text |  | blue-grey |  |
| **M87** | `--` ⚪ | obj-pocketitem-book | straps, bands, binders, corners | leather | bark |  |
| M87 |  | obj-pocketitem-book | straps, bands, binders, corners | metal-iron-wrought | dark grey |  |
| **M88** | `--` ⚪ | env-flora-deadwood-branch log | cut face | wood | light brown | never inverted |
| M88 |  | env-flora-deadwood-branch log | round side | wood-bark | bark |  |
| **M89** | `--` ⚪ | any model | minor accent |  | blue, dark red, dark green, taupe, off-white, terracotta | blue sparingly |
| **M90** | `PE` 🔴 | obj, str | weed accents growing on it | foliage | light green |  |
| **M91** | `PE` 🔴 | env-flora-deadwood |  |  | bark | a cut face follows M88 |

### C. Colour to material

Derived from the rows of M by `node tools/rule-status.mjs`, one row per band: what takes it, and the rules that say so. Do not edit the rows.

| id | status | band | takes |
|---|---|---|---|
| **C1** | `PE` 🔴 | light grey | stone-masonry (M8), stone-rock (M9), metal-iron-steel (M11), fish (M83) |
| **C2** | `PE` 🔴 | blue-grey | stone-masonry (M8), metal-iron-cast (M12), textile (M18b), book covers (M37), fish (M83), scroll text (M86) |
| **C3** | `FE` 🟢 | light blue-grey | metal-silver (M13) |
| **C4** | `PE` 🟢 | blue | liquid (M28), gemstone (M36), fish (M83), scroll accents (M86), minor accent (M89) |
| **C5** | `PE` 🔴 | yellow | metal-gold (M13, M15, M85), emissive (M33), cheese (M83) |
| **C6** | `PE` 🔴 | dark red | textile (M18, M69, M70), glass (M24, M27), ceramic (M25, M38), liquid (M28), obj-food-meat (M31), gemstone (M36), book covers (M37), fungus caps (M72), scroll accents (M86), minor accent (M89) |
| **C7** | `PE` 🟢 | dark green | foliage (M1), textile (M18), glass (M24, M27), liquid (M28), gemstone (M36), book covers (M37), scroll accents (M86), minor accent (M89) |
| **C8** | `FE` 🔴 | light green | foliage (M2, M4, M90), env-flora-plant-grass (M3), obj-food-vegetable (M83) |
| **C9** | `FE` 🔴 | light brown | wood (M6, M88), wood-planks (M42, M78), skin (M43), vegetation (M44), wheat, grain, straw (M51), obj-food-grain (M51), fungus caps (M72), chocolate (M84) |
| C9 |  | mid brown | wood (M6, M81, M82), wood-worked (M42), obj-food-grain (M51), fungus caps (M72), chocolate (M84) |
| C9 |  | dark brown | wood (M6, M81, M82), wood-beam (M42, M77), obj-food-grain (M51), fungus caps (M72), chocolate (M84) |
| **C10** | `FE` 🔴 | bark | wood-bark (M6, M88), leather (M20, M87), book covers (M37), skin (M43), env-flora-deadwood (M91) |
| **C11** | `FE` 🟢 | clear glass | glass (M24, M27, M71) |
| **C12** | `PW` 🔴 | taupe | stone-masonry (M8), stone-rock (M9), stone-soil (M10), textile (M19), rope (M22), cork (M23), skin (M43), vegetation (M44), minor accent (M89) |
| **C13** | `PW` 🔴 | off-white | textile (M18, M69), ceramic (M25, M53), bone (M29, M52), paper (M30, M86), wax (M34), fungus stems (M72), minor accent (M89) |
| **C14** | `PW` 🟢 | terracotta | metal-copper (M14), ceramic (M25, M53, M60), carrot, pumpkin (M84), minor accent (M89) |
| **C15** | `FW` 🔴 | dark grey | metal-iron-wrought (M12, M15, M17, M87), wick (M35), fish (M83) |

### N. Counting — bands against materials
- **N1.** `FE` 🔴 A model has at least one material.
- **N2.** `FE` 🔴 A model uses at least as many bands as it has materials. Every material
  tag counts, subtypes included.
- **N3.** `FE` 🟢 A model uses at most twice as many bands as materials; food, fauna and vegetation may use three times, a decorated food five.
- **N4.** `FE` 🟢 Ceiling: **6 bands for a human character or a decorated food, 5 for
  anything else.** A skeleton takes the 5; an assembly answers per part.
- **N5.** `FE` 🟢 A model of size `l` may take a sixth band where it carries at least five material tags.
- **N6.** `--` ⚪ An import with 2 colours keeps 2; 3–4 may drop 1; 5 may drop 2; more keep at least 3. N4 still caps.

### D. Dimensions and detail

"High" is the bounding-box Y extent; "longest dimension" its largest extent. Kinds name the leaf and its children.

- **D1.** `--` ⚪ Hoops on obj-container-barrel, -chest, -bucket and -crate are 5–15% of the model's longest dimension high.
- **D2.** `--` ⚪ obj-container-barrel and -bucket have at most three hoops.
- **D3.** `--` ⚪ obj-container-barrel has 8 to 14 side planks and 100 to 1500 tris.
- **D4.** `--` ⚪ obj-container-barrel is 0.2–0.8 high and at most 0.75 wide.
- **D5.** `--` ⚪ A near-cube obj-container-crate (extents within 15%) shows 3 to 7 planks side by side per face and is 0.2–0.8 high.
- **D6.** `--` ⚪ obj-container-pot is 0.2–0.4 high; obj-container-bottle and -bucket 0.1–0.4; an obj-container-chest with lid 0.2–0.5.
- **D7.** `--` ⚪ obj-equipment-shield is 0.2–0.6 high.
- **D8.** `--` ⚪ obj-furniture fits a 1.2 × 1.2 × 1.2 box; obj-furniture-table fits 0.5 high on a 2 × 2 footprint.
- **D9.** `--` ⚪ obj-furniture-table and -seating are at least 0.2 high; -seating at most 0.7.
- **D10.** `--` ⚪ obj-kitchenware-cookware-pan and -pot, lid included, are at most 0.4 high.
- **D11.** `--` ⚪ obj-kitchenware-tableware-plate and -cutlery: longest dimension 0.1–0.4.
- **D12.** `--` ⚪ obj-lighting-candle is 0.1–0.7 high; obj-lighting-lantern and -torch 0.1–1.0.
- **D13.** `--` ⚪ obj-pocketitem-scroll or a closed obj-pocketitem-book: longest dimension 0.1–0.3. An open book is judged by its longest cover edge.
- **D14.** `--` ⚪ obj-pocketitem-coin and -key: longest dimension at most 0.2; plural coin models are exempt.
- **D15.** `--` ⚪ obj-tool-long is 0.3–1.2 long.
- **D16.** `--` ⚪ A humanoid char, skeleton included, is 0.4–0.8 high; animals are exempt.
- **D17.** `--` ⚪ obj-weapon: ranged-bow, ranged-crossbow, melee-sword 0.4–1.0; melee-hammer, melee-axe 0.2–0.8; melee-dagger 0.1–0.5; magic-staff 0.2–1.2.
- **D18.** `--` ⚪ str-marker-flag, sails, canopy and canvas cloth is under 0.1 thick.
- **D19.** `--` ⚪ env-flora-tree, conifer and palm included, is 0.6–2.4 high.

### Open items

- M8, C1: to be reduced to 2 bands.

## Appendix B: Kind tree + glossary

`obj` = manufactured/portable thing · `env` = naturally occurring thing ·
`str` = constructed part of the world · `char` = living or acting entity

Format: `kind — nouns that resolve here`. Parent lines list nouns that have no
leaf yet (see K2).

```
obj-container-chest — chest, trunk, coffer, strongbox
obj-container-barrel — barrel, cask, keg
obj-container-bucket — bucket, pail
obj-container-crate — crate, box, case
obj-container-bottle — bottle, flask, vial, potion
obj-container-bag — bag, sack, pouch, purse, backpack, satchel
obj-container-pot — pot (storage), planter, vase, urn, amphora, jar, jug, pitcher, ewer
obj-container — basket, tub, trough, bin, can, coffin

obj-kitchenware-tableware-cutlery — knife (table), fork, spoon
obj-kitchenware-tableware-plate — plate, dish, platter, tray, saucer, bowl
obj-kitchenware-tableware — mug, cup, goblet, tankard, teapot, glass
obj-kitchenware-cookware-pan — pan, skillet
obj-kitchenware-cookware-pot — cooking pot, cauldron, kettle, crockpot
obj-kitchenware-cookware — grill, spit, ladle, cutting board
obj-kitchenware

obj-furniture-seating-bench — bench, couch, sofa, pew
obj-furniture-seating-chair — chair, armchair, throne
obj-furniture-seating-stool — stool, footstool
obj-furniture-seating
obj-furniture-table — table, desk, workbench
obj-furniture-bed — bed, bedroll, bunk, cot, hammock
obj-furniture-storage — cabinet, shelf, bookcase, wardrobe, chest of drawers, dresser
obj-furniture — rug, carpet

obj-food-meat — meat, ham, sausage, drumstick, steak, burger, roast, leg
obj-food-vegetable — carrot, cabbage, pumpkin, turnip, onion, potato, tomato
obj-food-grain — bread, loaf, wheat sheaf, flour sack, cake, pie, donut, croissant, muffin, waffle, cookie, roll, cinnamon, baguette, slice, brownie
obj-food — fish (as food), fruit, apple, cheese, egg, honey, coconut

obj-weapon-melee-sword — sword, blade, rapier, scimitar, katana
obj-weapon-melee-dagger — dagger, knife (combat)
obj-weapon-melee-axe — axe, hatchet, battleaxe
obj-weapon-melee-hammer — hammer (war), mace, club, flail
obj-weapon-melee — spear, pike, halberd, scythe (weapon), knuckles, claws, gauntlet blade

obj-weapon-ranged-bow — bow, longbow
obj-weapon-ranged-crossbow — crossbow
obj-weapon-ranged-accessory — arrow, bolt, quiver
obj-weapon-ranged — sling, throwing knife, javelin

obj-weapon-magic-staff — staff, wizard staff
obj-weapon-magic — wand, orb, focus (magic)

obj-weapon-cannon — cannon, cannonball

obj-weapon

obj-equipment-armor — helmet, chestplate, pauldron, greaves, gauntlet
obj-equipment-shield — shield, buckler
obj-equipment-clothing — cape, cloak, robe, hat, hood, boots, shoes, belt, glove
obj-equipment — crown

obj-tool-hand — hammer (tool), saw, chisel, trowel, wrench, tongs, brush
obj-tool-long — shovel, spade, pickaxe, rake, hoe, pitchfork, broom, scythe (tool)
obj-tool-supplies — screw, nail, bolt, rope, chain, hook, wire
obj-tool — lever, spring, gear, pulley, anvil, grindstone

obj-transport-ship — ship, galleon, longship, hull (ship)
obj-transport-boat — boat, rowboat, canoe, raft, dinghy
obj-transport-cart — cart, wagon, carriage, wheelbarrow, sled
obj-transport-accessory — anchor, paddle, oar, wheel, sail, rudder, mast
obj-transport — saddle, balloon

obj-lighting-lantern — lantern, lamp
obj-lighting-torch — torch, brazier
obj-lighting-candle — candle, candlestick, candelabra
obj-lighting — campfire, chandelier, streetlight

obj-pocketitem-coin — coin, gold pile, gem (cut)
obj-pocketitem-key — key
obj-pocketitem-book — book, tome, journal, spell book
obj-pocketitem-scroll — scroll, letter, map (rolled), parchment, blueprint
obj-pocketitem-jewellery — ring, necklace, amulet, bracelet, earring, pendant, brooch
obj-pocketitem — compass, hourglass, dice, mirror (hand)

obj-resource-metal — ingot, bar, nugget, ore lump, cog, spare part
obj-resource-wood-log — log (cut), timber, firewood, cordwood
obj-resource-wood-plank — plank (stock), board (loose), pallet
obj-resource-wood
obj-resource-stone — brick (loose), cut block
obj-resource-textile — textile bolt, cloth roll
obj-resource — hide, raw stock

obj — barrel stand, weapon stand, easel, statue, signboard (freestanding), music instrument, bell, cage

str-part-door — door, gate (building), hatch
str-part-floor — floor, floor tile, ceiling
str-part-roof — roof, roof tile, chimney, gable
str-part-window — window, shutter
str-part-wall — wall, wall segment, arch (building), corner
str-part-pillar — pillar, column, beam, support
str-part-frame — frame, framework, post-and-beam frame, scaffold, structure (open)
str-part — room, cellar, souterrain, dungeon

str-building — house (whole), hut, tower, crypt, church, castle, lighthouse, inn, barracks, stables, blacksmith, mill, windmill, watermill, sawmill, gazebo, well

str-stands — tent, stall, market stand, awning, canopy

str-platform-deck — deck, boardwalk
str-platform-dock — dock, pier, jetty
str-platform

str-barrier-fence — fence, fence segment, railing, palisade, gate (fence)
str-barrier-post — post, bollard, stake
str-barrier — wall (low, garden), hedge (trimmed), barricade

str-access-stairs — stairs, steps, ramp
str-access-ladder — ladder
str-access-bridge — bridge, plank (crossing), rope bridge
str-access

str-marker-sign — sign, signpost, notice board, direction arrow
str-marker-flag — flag, banner, pennant
str-marker-tombstone — tombstone, gravestone, cross (grave), memorial
str-marker — milestone, waystone, totem

str — stage, altar, plinth, pedestal, shrine, fountain, gallows, waterwheel, mine entrance, fireplace

env-flora-plant-cactus — cactus, succulent
env-flora-plant-flower — flower, tulip, rose, sunflower, bellflower, daisy, lily, violet
env-flora-plant-grass — grass, grass tuft, reed
env-flora-plant — cattail, bush, shrub, fern, ivy, vine, seaweed, lily pad

env-flora-tree-conifer — conifer, pine, spruce, fir
env-flora-tree-palm — palm
env-flora-tree — tree, oak, birch, willow, bush (tree-sized)

env-flora-deadwood-stump — stump
env-flora-deadwood-branch — branch, twig, log (fallen), driftwood
env-flora-deadwood — dead tree, fallen tree, root

env-fungi — mushroom, toadstool, fungus, lichen

env-fauna — fish, mammal, bird, insect, starfish, octopus, crab, lobster, frog, snail

env-remains-bones — bone, skull, skeleton (prop), ribcage, carcass
env-remains — shell, egg (wild), nest, feather

env-rock-formation — arch (rock), monolith, spire, cliff, outcrop
env-rock-boulder — boulder, rock (large)
env-rock-pebble — pebble, stone (small), gravel
env-rock — crystal, ore (in rock), stalagmite

env-terrain-mountain — mountain, hill, mesa, volcano
env-terrain-ground — ground, dirt path, stone path, sand, snow patch
env-terrain — island base, cave floor, riverbed

env-water — water, pond, wave, waterfall, ice, pool, lake

env — cloud, snow drift, lava, smoke, fog

assy — several distinct things, one top-level
scene — crosses env / str / obj
char — playable, npc, skeleton (rigged), animal (rigged)
```
