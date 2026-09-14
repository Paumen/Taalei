# Bible

Scope: items in the catalogue.

**[F01] Rule format.** Tables hold the standardised rules: one row = one subject, fixed columns, kind-tree order, a deeper kind overrides its parent. Everything that doesn't fit the columns is prose under the table. Rule text is capped at 140 characters.

Definitions:

- [D01] "high" is the bounding-box Y extent.
- [D02] "long" is the extent along the object's main axis; "longest dimension" is an object's largest extent.
- [D03] A kind names the leaf and its children.
- [D04] Tri density = tris ÷ (max(0.49, w × d) × max(0.7, h)). A 2 × 2 floor tile is judged on four cells; anything under 0.5 × 0.5 × 0.5 is judged as that size.
- [D05] Vegetation is a plant's non-green matter. Fungi are not vegetation.
- [D06] "Hooped containers" = `obj-container-barrel`, `obj-container-chest`, `obj-container-bucket`, `obj-container-crate`.

Colour ids:

| band | id |
|---|---|
| `tan` | C01 |
| `camel` | C02 |
| `chestnut` | C03 |
| `umber` | C04 |
| `terracotta` | C06 |
| `amber` | C07 |
| `sienna` | C09 |
| `hunter` | C13 |
| `moss` | C15 |
| `slate` | C18 |
| `azure` | C25 |
| `ivory` | C27 |
| `basalt` | C313 |
| `taupe` | C314 |
| `nickel` | C315 |

Tag fields:

| id | field | job | set |
|---|---|---|---|
| `F02` | `material` | what it is **made of** | closed, 36, parented |
| `F03` | `kind` | what it **is** — form cohort | closed, hierarchical, **exactly one** |
| `F04` | `size` | rough bbox: `s` `m` `l` | closed |
| `F05` | `tag` | kit/artist, theme, flags | open |

---

## 1. Intent

How a model should look and draw.

Form:

- [I01] Toy-like and iconic: chunky, slightly caricatured — not thin or spindly, and not so pared back it reads as primitive.
- [I02] Clean, deliberate facets, chamfered edges — rounded-soft, not noisy.
- [I03] Few details, except on organic objects.
- [I04] Every object was invented before 1850.
- [I05] Models of one deepest kind look alike in shape, colour and style.

Colour:

- [I06] Colours come from the shared colormap image (`kits/colormap.png`): assets colour themselves by pointing UVs at its bands.
- [I07] When recolouring onto the shared map, keep the baked shading: the UV spread across the gradient band must be maintained.

Draw:

- [I08] Defaults: `alphaMode` `OPAQUE`, except for the one clear `glass` colour; `roughnessFactor` 1; `metallicFactor` 0.
- [I09] Objects with distinctive moving features, or with `glass`, draw in 2 or more calls. All others in one.
- [I10] Avoid outlines unless an outline is a distinctive core feature of the object's appearance.
- [I11] No shadow casting in assets.

---

## 2. Geometry & budget

Everything measured off the mesh: extents, counts, pivots, band counts.

### Construction & placement

- [G01] Flat pieces per full circle equivalent: typically 8–12. Use 16 only for `hero`-tagged models and forms that are truly circular in reality.
- [G02] No solid pieces thinner than 0.015 units.
- [G03] Max 5000 tris per occupied grid cell; `char`- and `plural`-tagged models are exempt.
- [G04] Default on Y = 0, pivot at footprint centre in X/Z; leave either only deliberately, for a functional reason.
- [G05] Split nodes put their origin at the joint.

### Band counts

- [G06] A model has at least 1 material.
- [G07] A model uses at least as many bands as it has materials. Every material tag counts, subtypes included.
- [G08] A model uses at most twice as many bands as materials; `food`, `env-fauna` and `vegetation` may use 3 times, a decorated `food` 5.
- [G09] Band ceiling: 5.`char` 6. 
- [G10] A model of size `l` may exceed the band ceiling by 1 when it carries at least 5 material tags.
- [G11] Material counts ignore `special` as a material.
- [G12] Max-band rules leave the `special` band out (ceiling +1); the min-band rule keeps it.

### Size

| id | kind | dimension | min | max |
|---|---|---|---|---|
| `G13` | any | high | — | 6 |
| `G14` | `obj-container-chest` with lid | high | 0.2 | 0.5 |
| `G15` | `obj-container-barrel` | high | 0.2 | 0.8 |
| `G16` | `obj-container-bucket` | high | 0.1 | 0.4 |
| `G17` | `obj-container-crate`, near-cube | high | 0.2 | 0.8 |
| `G18` | `obj-container-bottle` | high | 0.1 | 0.4 |
| `G19` | `obj-container-pot` | high | 0.2 | 0.4 |
| `G20` | `obj-kitchenware-tableware-cutlery` | longest | 0.1 | 0.4 |
| `G21` | `obj-kitchenware-tableware-plate` | longest | 0.1 | 0.4 |
| `G22` | `obj-kitchenware-cookware-pan` with lid | high | — | 0.4 |
| `G23` | `obj-kitchenware-cookware-pot` with lid | high | — | 0.4 |
| `G24` | `obj-furniture-seating` | high | 0.2 | 0.7 |
| `G25` | `obj-furniture-table` | high | 0.2 | — |
| `G26` | `obj-weapon-melee-sword` | long | 0.4 | 1.0 |
| `G27` | `obj-weapon-melee-dagger` | long | 0.1 | 0.5 |
| `G28` | `obj-weapon-melee-axe` | long | 0.2 | 0.8 |
| `G29` | `obj-weapon-melee-hammer` | long | 0.2 | 0.8 |
| `G30` | `obj-weapon-ranged-bow` | long | 0.4 | 1.0 |
| `G31` | `obj-weapon-ranged-crossbow` | long | 0.4 | 1.0 |
| `G32` | `obj-weapon-magic-staff` | long | 0.2 | 1.2 |
| `G33` | `obj-equipment-shield` | high | 0.2 | 0.6 |
| `G34` | `obj-tool-long` | long | 0.3 | 1.2 |
| `G35` | `obj-lighting-lantern` | high | 0.1 | 1.0 |
| `G36` | `obj-lighting-torch` | high | 0.1 | 1.0 |
| `G37` | `obj-lighting-candle` | high | 0.1 | 0.7 |
| `G38` | `obj-pocketitem-coin` | longest | — | 0.2 |
| `G39` | `obj-pocketitem-key` | longest | — | 0.2 |
| `G40` | `obj-pocketitem-book`, closed | longest | 0.1 | 0.3 |
| `G41` | `obj-pocketitem-scroll` | longest | 0.1 | 0.3 |
| `G42` | `env-flora-tree` | high | 0.6 | 2.4 |
| `G43` | humanoid `char`, `char` skeleton included | high | 0.4 | 0.8 |

- [G44] `env-terrain-mountain` is exempt from the 6-high cap.
- [G45] Hooped-container hoops are 5–15% of the longest dimension high.
- [G46] `obj-container-barrel` is at most 0.75 wide, has 8–14 side planks, 100–1500 tris and at most 3 hoops.
- [G47] `obj-container-bucket` has at most 3 hoops.
- [G48] Near-cube `obj-container-crate` (extents within 15%) has 3–7 planks side by side per face.
- [G49] `obj-furniture` fits 1.2 × 1.2 × 1.2; `obj-furniture-table` fits 2 × 2 × 0.5.
- [G50] Open `obj-pocketitem-book` is judged on its longest cover edge.
- [G51] Plural `obj-pocketitem-coin` is exempt from the 0.2 cap.
- [G52] `str-marker-flag`, `obj-transport-accessory` sails, `str-stands` canopy and canvas cloth are under 0.1 thick.

---

## 3. Taxonomy

What a model *is*, before any material or colour question.

Kind and material sets:

- [T01] A kind leaf may carry its material's name: `env-remains-bones` beside material `bone`.
- [T02] A kind implies its parents.
- [T03] `assy` is a kind: distinct things in one top-level (`obj-furniture-table` + `obj-kitchenware-tableware` mugs).
- [T04] Tag the deepest leaf that fits. The parent is the "other" level.
- [T05] The appendix below is the glossary. Every common noun resolves to exactly one kind. Resolve against it before tagging.

Tie-breakers:

- [T06] `env-terrain-ground` mesh → `env-terrain`; placed body → `env-rock`. A cobbled path is `env-terrain`; a cliff prop is `env-rock-formation`.
- [T07] Kit of origin never decides kind. A mushroom from a food kit is `env-fungi`.

Tag semantics:

- [T08] Artist tags are derived from the kit, and only for artists with several kits adopted in the catalogue.
- [T09] `size` is measured, never hand-set.
- [T10] `animation` is measured.
- [T11] `ngons` marks a round cross-section — the form the flat-pieces-per-circle limit counts on.
- [T12] `plural` is several instances of one thing in one model.
- [T13] `special` is a material tag and a joker: it exempts **one** band on the model from every rule that band trips.
- [T14] A `special` records which band it covers and why.

---

## 4. Kind → material

What a kind is made of. Colour follows from section 5. `—` = the whole model.

| id | kind | part | material |
|---|---|---|---|
| `M01` | hooped containers | hoops | `metal-iron` |
| `M02` | `obj-container-bottle` | — | `glass` or `ceramic` |
| `M03` | `obj-container-bag` | fasteners, closures | `rope` or `leather` |
| `M04` | `obj-kitchenware-tableware-plate` | — | `ceramic`, `metal-iron` or `wood` |
| `M05` | `obj-kitchenware-tableware` mugs, cups, tankards | hoops, handles | `metal-iron` |
| `M06` | `obj-kitchenware-tableware` | `metal-iron` | `metal-iron-steel` |
| `M07` | `obj-furniture` | — | `wood` |
| `M08` | `obj-furniture` rugs, carpets | — | `textile` |
| `M09` | `obj-furniture-seating`, upholstered | — | `textile` |
| `M10` | `obj-weapon`, `obj-tool` | `metal-iron` | `metal-iron-steel` |
| `M11` | `obj-weapon`, `obj-tool` | handles | `wood`, `textile` or both |
| `M12` | `obj-weapon` | straps | `textile` or `leather` |
| `M13` | `obj-weapon-cannon` | `metal-iron` | `metal-iron-cast` |
| `M14` | `obj-equipment` | `metal-iron` | `metal-iron-steel` |
| `M15` | `obj-equipment-clothing` belts, shoes, straps | — | `leather` |
| `M16` | `obj-tool-hand` | `wood` handles | `wood-planks` |
| `M17` | `obj-tool-long` | poles | `wood-beam` |
| `M18` | `obj-tool-supplies` | `metal-iron` | `metal-iron-wrought` |
| `M19` | `obj-transport-accessory` | sails | `textile` |
| `M20` | `obj-pocketitem-coin` | — | `metal-gold` |
| `M21` | `obj-pocketitem-key` | — | `metal-iron` or `metal-gold` |
| `M22` | `obj-pocketitem-book` | straps, bands, binders, corners | `leather` or `metal-iron` |
| `M23` | `obj-pocketitem-jewellery` | — | `metal-gold` with `gemstone` |
| `M24` | `obj-resource-wood-log`, `env-flora-deadwood-branch`, trunks with a cut face | cut face | `wood-log` |
| `M25` | `obj-resource-wood-log`, `env-flora-deadwood-branch`, trunks with a cut face | round side | `wood-bark` |
| `M26` | `obj` bells | — | `metal-copper` or `metal-gold` |
| `M27` | `str` | `metal-iron` | `metal-iron-cast` |
| `M28` | `str-part-roof` | — | `ceramic`, `sienna` |
| `M29` | `str-marker-flag` | — | `textile` |
| `M30` | `char` | `metal-iron` | `metal-iron-steel` |

- [M31] `metal-iron` with no subtype set by a kind row is `metal-iron-wrought`.
- [M32] Hooped containers are mainly `wood`, often with `metal-iron` accents.
- [M33] `obj-kitchenware-tableware` mugs, cups and tankards are often `wood`.
- [M34] `obj-kitchenware-cookware` `metal` exists as paired variants, one `metal-iron-steel` and one `metal-iron-cast`.
- [M35] `obj-tool` and `obj-weapon` `metal` is at least `metal-iron`.
- [M36] `obj-weapon`, `obj-tool` and `obj-equipment-shield` grips, fasteners and joins are often `textile`, `rope` or `leather`.
- [M37] Simple `obj-weapon` and `obj-weapon-ranged-bow` may be wholly or partly `wood`.
- [M38] Special `obj-weapon` may be partly `metal-gold` or `gemstone`.
- [M39] Sticks and unworked poles are `wood-bark`.
- [M40] A fastener joining `stone`, `bone` or `metal-iron-steel` to `wood` is usually `leather`.
- [M41] `obj-transport-boat` and `obj-transport-ship` are built from more than one `wood`.
- [M42] `str` is mainly `wood`, then `stone` (the bigger sort, not modern brick); `metal` sparingly.
- [M43] `str-marker-sign`, `str-barrier-post` and `str-marker-flag` poles are usually `wood`.
- [M44] Cut face `wood-log` / round side `wood-bark` is never the other way round.
- [M45] `obj` bells are never `metal-iron`.

---

## 5. Subject → colour

`—` = the whole subject. Material rows first (material-tree order), then kind rows (kind-tree order); a kind row overrides a material row.

| id | subject | part | band |
|---|---|---|---|
| `B01` | `metal-iron-steel` | — | `nickel` |
| `B02` | `metal-iron-wrought` | — | `basalt` |
| `B03` | `metal-iron-cast` | — | `slate` |
| `B04` | `metal-gold` | — | `amber` |
| `B05` | `metal-copper` | — | `terracotta` |
| `B06` | `wood-planks` | — | `tan` |
| `B07` | `wood-worked` | — | `camel` |
| `B08` | `wood-beam` | — | `chestnut` |
| `B09` | `wood-bark` | — | `umber` |
| `B10` | `stone-masonry` | — | `taupe`, `slate` or `nickel` |
| `B11` | `stone-rock` | — | `nickel` or `taupe` |
| `B12` | `stone-soil` | — | `taupe` |
| `B13` | `paper` | — | `ivory` |
| `B14` | `textile` | — | `ivory` or `hunter` |
| `B15` | `leather` | — | `umber` |
| `B16` | `ceramic` | — | `terracotta`, `ivory`, `taupe` or `sienna` |
| `B17` | `bone` | — | `ivory` |
| `B18` | `wax` | — | `ivory` |
| `B19` | `wick` | — | `basalt` |
| `B20` | `glass`, size `m` or `l` | — | `transparent` |
| `B21` | `glass`, size `s` | — | `transparent`, `sienna` or `hunter` |
| `B22` | `liquid` | — | `sienna`, `hunter` or `azure` |
| `B23` | `rope` | — | `taupe` |
| `B24` | `cork` | — | `taupe` |
| `B25` | `gemstone` | — | `sienna`, `hunter` or `azure` |
| `B26` | `skin` | — | `tan`, `taupe` or `umber` |
| `B27` | `obj-kitchenware-tableware-plate` | `ceramic` | `ivory` or `terracotta` |
| `B28` | `obj-kitchenware-tableware` mug, cup, tankard | `wood` | `camel` or `chestnut` |
| `B29` | `obj-kitchenware-cookware-pot` | `ceramic` | `terracotta` |
| `B30` | `obj-food` cheese | — | `amber` |
| `B31` | `obj-food-meat` | — | `sienna` |
| `B32` | `obj-food-vegetable` carrot, pumpkin | — | `terracotta` |
| `B33` | `obj-food-grain` | — | `tan`, `camel` or `chestnut` |
| `B34` | `obj-food-grain` wheat, straw | — | `tan` |
| `B35` | chocolate | — | `chestnut` |
| `B36` | `obj-weapon`, `obj-tool` | wrapped grips, bindings | `taupe` |
| `B37` | `obj-weapon-magic` `paper` | covers | `umber`, `sienna`, `hunter` or `slate` |
| `B38` | `obj-transport` | `wood` | `camel` or `chestnut` |
| `B39` | `obj-transport-accessory` sails, `str-stands` canvas | — | `ivory`, or striped `sienna` and `ivory` |
| `B40` | `obj-pocketitem-book` | covers | `umber`, `sienna`, `hunter` or `slate` |
| `B41` | `obj-pocketitem-scroll` | — | `ivory` |
| `B42` | `obj-pocketitem-scroll` | text | `slate` |
| `B43` | `obj-pocketitem-scroll` | accents | `sienna`, `hunter` or `azure` |
| `B44` | `str` | `glass` | `transparent` |
| `B45` | `env-flora` | stems, leaves | `moss` |
| `B46` | `env-flora-tree` | — | `hunter` |
| `B47` | `env-fungi` | stems | `ivory` |
| `B48` | `env-fungi` | caps | `sienna` or `camel` |
| `B49` | any | dried stalks | `taupe` |
| `B50` | any | flames, glow, lights | `amber` |

- [B51] `wood-log` is any brown.
- [B52] Never merge two `metal-iron` bands into one.
- [B53] `stone-masonry` covers `str-part-wall`, `str-part-floor` and `obj-resource-stone` bricks; `stone-soil` covers `env-terrain-ground` sand and dirt.
- [B54] `textile` may also be `sienna` on `char` `obj-equipment-clothing` and on sail/canvas striping.
- [B55] `obj-transport-ship`, `obj-transport-boat` and `obj-transport-accessory` `textile` may also be `slate`.
- [B56] `obj-weapon` and `obj-tool` wrapped grips and bindings keep UVs in the light half of the `taupe` band (0.02–0.40).
- [B57] `wax` here is `obj-lighting-candle` wax.
- [B58] `obj-food` may be any colour; its material decides nothing about the band.
- [B59] `obj-food` fish is usually `nickel`, `basalt`, `slate` or `azure`.
- [B60] `obj-food-vegetable` is usually `moss`.
- [B61] `env-flora-tree-palm` is exempt from the `hunter` rule.
- [B62] `env-flora-plant-flower` and `env-flora-plant-cactus` flowers may be any colour.
- [B63] `env-fauna` may be any colour.
- [B64] Flames, glow and lights spread UVs wide across the `amber` gradient band.

---

## 6. Governance & process

Who decides, and what happens around the asset.

Roles:

- [P01] Only the PO assigns material tag `special` and tag `hero`.
- [P02] Claude proposes `hero` when adding to the catalogue.
- [P03] Claude asks for material tag `special` only after both recolouring within the colour rules and a kind or material change have failed.
- [P04] Tell the PO when an asset uses an outline.

Creating and validating:

- [P05] Render and look at the reference assets before creating a new asset — reading them is not enough.
- [P06] When validating, render at least 2 reference assets from the same group beside the new one at the same scale.
- [P07] `assy` models are not validated directly.

Importing:

- [P08] Imported packs get one scale factor for the whole pack for now.
- [P09] An import with 2 colours keeps 2; 3–4 may drop 1; 5 may drop 2; more keep ≥3.

Catalogue upkeep:

- [P10] An existing leaf is not retired for dropping below 6 models.
- [P11] The `stacks` tag is removed; `plural` replaces it.

---

## Appendix: kind tree + glossary

`obj` = manufactured/portable thing · `env` = naturally occurring thing ·
`str` = constructed part of the world · `char` = living or acting entity

Format: `kind — nouns that resolve here`. Parent lines list nouns that have no
leaf yet.

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
obj-weapon-ranged-accessory — arrow, bolt (crossbow), quiver
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
obj-tool-supplies — screw, nail, bolt (fastener), rope, chain, hook, wire
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
char — playable, npc, skeleton (rigged), animal (rigged)
```

Materials
```
metal
├─ metal-iron
│  ├─ metal-iron-steel
│  ├─ metal-iron-wrought
│  └─ metal-iron-cast
├─ metal-gold
└─ metal-copper
wood
├─ wood-planks
├─ wood-worked
├─ wood-beam
├─ wood-log
└─ wood-bark
stone
├─ stone-masonry
├─ stone-rock
└─ stone-soil
paper      textile    leather    foliage
ceramic    bone       food       wax
wick       glass      liquid     emissive
rope       cork       gemstone   special
plastic    vegetation skin 
```
