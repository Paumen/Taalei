# Asset style guide

For an LLM creating or adjusting assets.
Scope: items in catalog, and how they are tagged.

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
- **G1.** `PW` 🔴 Objects with distinctive moving features, or with glass, draw in two or more calls. All others in one.

## 6. Reference Assets
- Render and look at the reference assets before creating a new asset — reading them is not enough.
- When validating, render at least two reference assets from same group beside the new one at the same scale.

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
an id, it is: light grey 15,3 · dark grey 13,3 · blue-grey 6,1 · light blue-grey 3,2 ·
blue 4,2 · off-white 5,2 · taupe 14,3 · terracotta 5,0 ·
yellow/gold 6,0 · dark red 8,0 · dark green 1,1 · light green 3,1 ·
wood light 0,0 · wood middle 1,0 · wood dark 2,0 · bark 3,0.

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
lint's findings and rewrites every marker below. `--check` fails when they are stale.
Lint reads 1560 models and skips the `assemblies` group and any model with no colours.
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

- **M1.** `FE` 🟢 Trees are dark green.
- **M2.** `FE` 🟢 Palm fronds are light green.
- **M3.** `FE` 🟢 Grass is light green.
- **M4.** `PE` 🟢 Stems and leaves are light green.
- **M5.** `--` ⚪ Flowers may be any colour. Cactus flowers count too.
- **M6.** `FE` 🟢 Wood is any of the three wood bands; wood-bark is bark 3,0.
- **M7.** `--` ⚪ A trunk with a cut face carries wood-log and wood-bark.
- **M8.** `PE` 🟢 stone-masonry — walls, bricks, floors — is taupe 14,3, blue-grey 6,1 or
  light grey 15,3. **to be reduced to 2**
- **M9.** `FE` 🟢 stone-rock is light grey 15,3, secondarily taupe 14,3.
- **M10.** `FE` 🟢 stone-soil — sand and dirt — is taupe 14,3.
- **M11.** `PE` 🟢 metal-iron-steel is light grey 15,3.
- **M12.** `PE` 🟢 metal-iron-wrought is dark grey 13,3; metal-iron-cast is blue-grey 6,1.
- **M13.** `FE` 🟢 metal-gold is gold 6,0; metal-silver is silver 3,2.
- **M14.** `FE` 🟢 metal-copper is terracotta 5,0 and takes no other metal subtype.
- **M15.** `PE` 🟢 Keys take the colour of any metal subtype.
- **M17.** `PE` 🟢 The bands on container group: barrels, chests, buckets, kegs, crates and boxes
  are metal-iron-wrought, dark grey 13,3.
- **M18.** `PE` 🟢 Textile is off-white, taupe 14,3, dark green 1,1 or dark red 8,0.
- **18b** `PE` 🟢 The flags and sails of a rigged ship are off-white, dark green 1,1, dark red 8,0 or blue-grey 6,1 — never taupe 14,3.
- **M19.** `PW` 🔴 Wrapped grips and bindings on tools and weapons are always taupe 14,3,
  light half 0.02-0.40.
- **M20.** `FE` 🔴 Leather is bark.
- **M21.** `--` ⚪ Belts, shoes and straps are leather.
- **M22.** `FE` 🟢 Rope is taupe 14,3.
- **M23.** `FE` 🟢 All cork is taupe 14,3.
- **M24.** `FE` 🟢 Glass is transparent, dark green or dark red.
- **M25.** `FE` 🟢 Ceramics are terracotta, off-white, or dark red.
- **M26.** `PE` 🟢 Bottles are glass or ceramic.
- **M27.** `PE` 🔴 The glass bottles exists in red and green.
- **M28.** `FE` 🟢 A liquid is dark red 8,0, dark green 1,1 or blue 4,2.
- **M29.** `FE` 🟢 Bones and skulls are off-white.
- **M30.** `FE` 🟢 Paper is off-white.
- **M31.** `FE` 🔴 Meat is terracotta 5,0, dark half 0.55-1.00.
- **M32.** `--` ⚪ Fauna may be any colors. 
- **M33.** `FE` 🟢 Flames and glow are yellow 6,0.
- **M34.** `FE` 🟢 Candle wax are off-white 5,2.
- **M35.** `--` ⚪ Wicks are blue-grey 6,1.
- **M36.** `FE` 🟢 Gemstones are dark red 8,0, dark green 1,1 or blue 4,2.
- **M37.** `PE` 🟢 Book covers are bark, dark red 8,0, dark green 1,1 or
  blue-grey 6,1. 
- **M38.** `PE` 🔴 Roofs are ceramic, dark red.
- **M39.** `PE` 🔴 Chests, barrels, kegs, buckets, boxes and crates are mainly wood,
  often with metal-iron accents.
- **M40.** `--` ⚪ Structures and furniture are mostly wood, then stone (the bigger
  sort, not modern brick). Metal sparingly.
- **M41.** `FE` 🟢 Plastic is dark red 8,0 or yellow/gold 6,0.
- **M42.** `FE` 🟢 Wood subtypes take their band: `wood-planks` 0,0, `wood-worked` 1,0,
  `wood-beam` 2,0. `wood-log` and `wood-bark` follow M6.
- **M43.** `FE` 🟢 Skin is wood light 0,0, taupe 14,3 or bark 3,0.
- **M44.** `PE` 🟢 Vegetation is a plant's non-green matter: dried stalks and husks taupe 14,3, mushroom stems off-white 5,2, blooms and caps any colour.
- **M45.** `--` ⚪ Food may be any colour, like fauna. What it is made of decides nothing about its band.
- **M46.** `--` ⚪ Tools are metal-iron; a handle is wood, textile or both.
- **M47.** `--` ⚪ Weapons are metal-iron, with a handle of wood or textile.
- **M48.** `--` ⚪ A simple weapon or a bow may be wholly or partly wood.
- **M49.** `--` ⚪ A special weapon may be partly metal-gold, metal-silver or gemstone.
- **M50.** `--` ⚪ Some weapons carry textile or leather straps.
- **M51.** `--` ⚪ Food of grain or bread is taupe 14,3.
- **M52.** `--` ⚪ A model whose only material is bone is off-white 5,2 alone.
- **M53.** `--` ⚪ Plates are usually ceramic, and may be metal-iron or wood.
- **M54.** `--` ⚪ Furniture is wood, except a rug, a carpet or an upholstered seat, which is textile.
- **M55.** `--` ⚪ Coins are metal-gold.
- **M56.** `--` ⚪ Flags and sails are textile.
- **M57.** `--` ⚪ Signs, flag poles and posts are usually wood.
- **M58.** `--` ⚪ Pans are usually metal-iron.
- **M59.** `--` ⚪ Cutlery is metal-iron.
- **M60.** `--` ⚪ Pots are ceramic; a pan may be metal-iron.
- **M61.** `--` ⚪ A boat or ship is built from more than one wood.
- **M62.** `PW` 🔴 obj-weapon, obj-equipment, obj-kitchenware-tableware and obj-tool are metal-iron-steel.
- **M63.** `PW` 🟢 obj-tool-supplies is metal-iron-wrought; its parent kind stays steel.
- **M64.** `PW` 🟢 obj-weapon-cannon and every str model with iron carry metal-iron-cast; another subtype may sit on top.
- **M65.** `PW` 🟢 Metal cookware always exists as both steel and cast, paired as variants; a model keeps the iron it is.
- **M66.** `PW` 🟢 All other iron is metal-iron-wrought.
- **M67.** `PW` 🟢 A model may carry more than one iron subtype; each counts under N2. Never merge two iron bands into one.
- **M68.** `PW` 🟢 char iron is metal-iron-steel. An assembly answers per part; until it does, M66 stands.

### C. Colour to material

- **C1.** `PE` 🟢 Light grey 15,3: metal-iron-steel, stone and rock only. **to be reduced to 2**
- **C2.** `PE` 🔴 Blue-grey 6,1: cast iron (M12), worked stone (M8),
  wicks (M35), book covers (M37), and the flags and sails of a rigged ship (M18).
- **C3.** `FE` 🟢 Light blue-grey 3,2: silver (M13).
- **C4.** `PE` 🟢 Blue 4,2: sparingly, minor accents only.
- **C5.** `PE` 🟢 Yellow: metal-gold, emissive, fire and plastic (M41).
- **C6.** `PE` 🟢 Dark red: ceramics, glass, roofs, plastic (M41), textile (M18), gemstones (M36), minor accents.
- **C7.** `PE` 🟢 Dark green: foliage, glass, textile only on character clothing or weapons (M18), and minor accents.
- **C8.** `FE` 🔴 Light green: nature only — flora, including grass and weed accents
  growing on objects and structures.
- **C9.** `FE` 🟢 Lighter browns: wood only; skin may take wood light 0,0 (M43).
- **C10.** `FE` 🟢 Darkest brown: wood-bark, leather, skin, and a log or trunk.
- **C11.** `FE` 🟢 Transparent: glass only.
- **C12.** `PW` 🔴 Taupe 14,3: soil, rock (M9), masonry (M8), textile (M18), rope, cork, skin, dried vegetation (M44), grain food (M51) and grips (M19).
- **C13.** `PW` 🔴 Off-white 5,2: bone, paper, wax, ceramics (M25), textile (M18) and mushroom stems (M44).
- **C14.** `PW` 🟢 Terracotta 5,0: copper (M14), ceramics (M25), meat (M31) and blooms and caps (M44).
- **C15.** `FW` 🟢 Dark grey 13,3: metal-iron-wrought only.

### N. Counting — bands against materials
- **N1.** `FE` 🟢 A model has at least one material.
- **N2.** `FE` 🔴 A model uses at least as many bands as it has materials. Every material
  tag counts, subtypes included.
- **N3.** `FE` 🟢 A model uses at most twice as many bands as materials; food, fauna and vegetation may use three times, a decorated food five.
- **N4.** `FE` 🟢 Ceiling: **6 bands for a human character or a decorated food, 5 for
  anything else.** A skeleton takes the 5; an assembly answers per part.
- **N5.** `FE` 🟢 A model of size `l` may take a sixth band where it carries at least five material tags.

### W. 

- **W2.** `FW` 🔴 No band spreads over more than 0.90 of its cell, light end to dark end.

## Appendix B: Kind tree + glossary

`obj` = manufactured/portable thing · `env` = naturally occurring thing ·
`str` = constructed part of the world · `char` = living or acting entity

Format: `kind — nouns that resolve here`. Parent lines list nouns that have no
leaf yet (see K2).

```
obj-container-jug — jug, pitcher, ewer
obj-container-chest — chest, trunk, coffer, strongbox
obj-container-barrel — barrel, cask, keg
obj-container-bucket — bucket, pail
obj-container-crate — crate, box, case
obj-container-bottle — bottle, flask, vial, potion
obj-container-bag — bag, sack, pouch, purse, backpack, satchel
obj-container-pot — pot (storage), planter, vase, urn, amphora, jar
obj-container — basket, tub, trough, bin, can, coffin

obj-kitchenware-tableware-cutlery — knife (table), fork, spoon
obj-kitchenware-tableware-plate — plate, dish, platter, tray, saucer
obj-kitchenware-tableware-bowl — bowl
obj-kitchenware-tableware — mug, cup, goblet, tankard, teapot, glass
obj-kitchenware-cookware-pan — pan, skillet
obj-kitchenware-cookware-pot — cooking pot, cauldron, kettle, crockpot
obj-kitchenware-cookware — grill, spit, ladle, cutting board
obj-kitchenware

obj-furniture-table — table, desk, workbench
obj-furniture-seating — chair, stool, bench, throne
obj-furniture — bed, cabinet, shelf, bookcase, wardrobe, rug, chest of drawers, fridge, freezer

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
obj-equipment — ring, necklace, amulet, bracelet, crown, goggles, earring

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
obj-pocketitem — compass, hourglass, dice, mirror (hand)

obj-resource-metal — ingot, bar, nugget, ore lump
obj-resource-wood — plank (stock), board (loose), pallet
obj-resource-stone — brick (loose), cut block
obj-resource-textile — textile bolt, cloth roll
obj-resource — hide, raw stock, spare part

obj — barrel stand, weapon stand, easel, statue, signboard (freestanding), music instrument, bell, cage

str-part-door — door, gate (building), hatch
str-part-floor — floor, floor tile, ceiling
str-part-roof — roof, roof tile, chimney, gable
str-part-window — window, shutter
str-part-wall — wall, wall segment, arch (building), corner
str-part-pillar — pillar, column, beam, support
str-part — house (whole), tower, hut, tent, awning, room, cellar, souterrain, dungeon, crypt, mill, windmill, lighthouse, church, castle, stand, stall, stables, watermill

str-platform-deck — deck, boardwalk, scaffold
str-platform-dock — dock, pier, jetty
str-platform — stage, altar, plinth, pedestal

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

str — well, fountain, gallows, waterwheel, mine entrance, fireplace

env-flora-plant-cactus — cactus, succulent
env-flora-plant-flower — flower, tulip, rose, sunflower, bellflower, daisy, lily, violet
env-flora-plant-grass — grass, grass tuft, reed
env-flora-plant — cattail, bush, shrub, fern, ivy, vine, seaweed, lily pad

env-flora-tree-conifer — conifer, pine, spruce, fir
env-flora-tree-palm — palm
env-flora-tree — tree, oak, birch, willow, bush (tree-sized)

env-flora-deadwood-stump — stump
env-flora-deadwood-branch — branch, twig, log, driftwood
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
