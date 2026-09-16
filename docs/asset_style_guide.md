# Bible

Scope: items in the catalogue.

## 0. Reading the rules

For a model of a given kind, every rule on its ancestor kinds also applies.

**Tag fields**

| id | field | job | set |
|---|---|---|---|
| `F01` | `material` | what it is **made of** | closed, parented |
| `F02` | `kind` | what it **is** — form cohort | closed, hierarchical, **exactly one** |
| `F03` | `size` | rough bbox: `s` `m` `l` | closed, measured |
| `F04` | `tag` | kit/artist, theme, flags (`hero`, `plural`, `anim`, `comp`, `pickup`, `floating`, `offcenter`, `ngons`, etc.) | open |

**[F05] Term.** A term is one of:

| term | matches |
|---|---|
| `*` | every model, or every group |
| `kind:<id>` | that kind and its descendants |
| `mat:<id>` | models carrying that material tag or a subtype of it |
| `mat=<id>` | that material tag exactly |
| `tag:<id>` | models carrying that open tag |
| `size:<s\|m\|l>` | models measured at that size |
| `<field><op><number>` | a recorded numeric field compared: `nmat>=5`, `tris<100`; ops `= > >= < <=` |
| `D<nn>` | the models the definition's term matches |
| `!<term>` | models the term does not match |
| `<term> & <term>` | models both terms match |
| `<term> \| <term>` | models either term matches; `&` binds before `\|` |

In a value, a material id ending in `:` (`wood:`) means that material or any subtype. `any` means every band.

**[F06] Subject.** What the assert is about. A closed set: `model`, any recorded field (`kind`, `size`, `tags`, `mat`, `nmat`, `pbands`, `bands`, `calls`, `tris`, `dens`, `grad`, `anim`, `minEdge`, `grounded`, `centered`, `specialBand`, `specialWhy`), `dim:w`, `dim:d`, `dim:high`, `dim:longest`, `band`, `mat:<id>`, `part:<name> (<presence>)`, `—`.

**[F07] Assert.** Closed vocabulary:

| assert | value | means |
|---|---|---|
| `min` | number | subject ≥ value; a value may name a recorded numeric field with an optional `× n` (`nmat × 2`) |
| `max` | number | subject ≤ value; same |
| `range` | a–b | a ≤ subject ≤ b |
| `fits` | w × d × h | axis-aligned extents each ≤ the box |
| `is` | token | a single-valued subject equals the token |
| `not` | token | subject never equals the token |
| `one-of` | token list | the tokens are the whole set the subject may draw from |
| `any-of` | token list | every value the subject carries is among the tokens, and it carries at least one |
| `has` | token list | the subject carries at least one of the tokens; other values are allowed |
| `expect` | token list | subject is normally one of the tokens |

**[F08] Combining rows.** A row whose `except` matches the model does not apply. Rows that apply and do not disagree all hold. When two rows assert on the same subject and disagree, the more specific row wins:

1. a `part:` subject over a `mat:` subject, and a `mat:` subject over `model`;
2. a §5.2 row over a §5.1 row;
3. a row naming a deeper kind over a row naming a shallower kind;
4. any term over `*`.

`M00` is a fallback: it applies only where no other §4 row sets `mat:metal-iron`.

**[F09] `special` in the counts.** `nmat` counts materials without `special`. Band maxima ignore the `special` band; band minima keep it.

**Definitions**

| id | term | definition |
|---|---|---|
| `D01` | high | the bounding-box Y extent |
| `D02` | tri density | `dens`: tris ÷ bbox surface area, 2(w·d + w·h + d·h) |
| `D03` | hooped container | `kind:obj-container-barrel \| kind:obj-container-bucket \| kind:obj-container-chest \| kind:obj-container-crate` |
| `D04` | variant group | models that read as one thing; `main` is the one shown |
| `D05` | longest | an object's largest extent |
| `D06` | TBD | referenced by `G21`; not yet defined |
| `D07` | palette bands | `pbands`: the fewest distinct bands that give every non-`special` material one band from its palette |

**Colour bands.** `column,row` cell of the 16 × 4 grid of `kits/colormap.png`.

| band | lane |
|---|---|
| `transparent` | — |
| `tan` | 0,0 |
| `camel` | 1,0 |
| `chestnut` | 2,0 |
| `umber` | 3,0 |
| `terracotta` | 5,0 |
| `amber` | 6,0 |
| `sienna` | 8,0 |
| `hunter` | 1,1 |
| `moss` | 3,1 |
| `slate` | 6,1 |
| `azure` | 4,2 |
| `ivory` | 5,2 |
| `basalt` | 13,3 |
| `taupe` | 14,3 |
| `nickel` | 15,3 |

---

## 1. Global

- **`I01`** — Chunky, caricatured; not thin, not primitive.
- **`I02`** — Clean facets, chamfered edges, rounded-soft.
- **`I03`** — Few details, except. 
- **`I04`** — Invented before 1850.
- **`I05`** — Like its deepest kind in shape, colour and style.
- **`I06`** — No outline, unless the outline is a core feature (`P04`).

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `I07` | `*` | — | `grad` | not | 0 |
| `I08` | `*` | `mat:glass` | model | is | `alphaMode` `OPAQUE` |
| `I09` | `*` | — | model | is | `roughnessFactor` 1, `metallicFactor` 0 |
| `I10` | `mat:glass` | — | `calls` | min | 2 |
| `I11` | `*` | `mat:glass` | model | is | 2+ calls only for moving features |
| `I12` | `*` | — | model | is | no shadow casting |

---

## 2. Geometry & budget

Everything measured off the mesh: extents, counts, pivots, band counts.

`tag:plural` and `kind:assy` are exempt.

### 2.1 Construction & placement

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G01` | `tag:ngons` | `tag:hero` | model | range | 8–12 flat pieces per full circle |
| `G02` | `*` | `mat:textile` | `minEdge` | min | 0.015 |
| `G03` | `mat:textile` | — | `minEdge` | min | 0.01 |
| `G04` | `*` | `kind:char` | `dens` | max | TBD — re-measure references under `D02` |
| `G05` | `*` | `tag:floating` | `grounded` | is | true |
| `G06` | `*` | `tag:offcenter` | `centered` | is | true |
| `G07` | `*` | — | `part:split node` | is | origin at the joint |
| `G08` | `*` | `kind:env-terrain-mountain` | `dim:high` | max | 6 |

### 2.2 Bands

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G09` | `*` | — | `nmat` | min | 1 |
| `G10` | `*` | — | `bands` | min | `pbands` |
| `G11` | `*` | `kind:obj-food \| kind:env-fauna` | `bands` | max | `nmat` × 2 |
| `G12` | `kind:obj-food \| kind:env-fauna` | — | `bands` | max | `nmat` × 3 |
| `G13` | `*` | `kind:char \| size:l` | `bands` | max | 5 |
| `G14` | `kind:char` | — | `bands` | max | 6 |
| `G15` | `size:l` | — | `bands` | max | 6 |

### 2.3 Size

`tag:comp`, `tag:plural`, `kind:assy` and `tag:pickup` are exempt.

Min and max per kind live in the kinds.JSON. Each applies to `high` or `longest`, as set there.

Run `node lint/size.mjs`; exemptions and the warning band live in `lint/variables.json`.

if size lint error or warning:
1. verify if model has right kinds tag.
2. verify if model meets tag:plural, tag:pickup, tag:comp criteria.
3. check if more models same kit have errors/warnings.


### 2.4 Boxes and part counts

`tag:comp`, `tag:plural` and `kind:assy` are exempt.

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G16` | `D03` | — | `part:hoop` | range | 5–15% of longest, high |
| `G17` | `kind:obj-container-barrel` | — | `dim:w` | max | 0.75 |
| `G18` | `kind:obj-container-barrel` | — | `part:side plank` | range | 8–14 |
| `G19` | `kind:obj-container-barrel` | — | `tris` | range | 100–1500 |
| `G20` | `kind:obj-container-barrel \| kind:obj-container-bucket` | — | `part:hoop` | max | 3 |
| `G21` | `kind:obj-container-crate & D06` | — | `part:plank` | range | 3–7 side by side per face |
| `G22` | `kind:obj-furniture` | `kind:obj-furniture-table` | model | fits | 1.2 × 1.2 × 1.2 |
| `G23` | `kind:str-marker-flag \| kind:str-stands \| kind:obj-transport-accessory` | — | `part:sail, canopy, canvas` | range | 0.01–0.05 thick |

---

## 3. Taxonomy

What a model *is*, before any material or colour question.

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `T01` | `*` | — | `kind` | is | the kind the glossary resolves the noun to; a noun not in the glossary takes the deepest leaf that fits; the parent is "other" |
| `T02` | `*` | — | `kind` | not | decided by kit of origin |
| `T03` | `*` | — | `tags` | is | the artist tag from the kit, only for artists with several kits adopted |
| `T04` | `tag:plural` | — | model | is | several instances of one thing in one model |
| `T05` | `mat:special` | — | `specialWhy` | not | empty |

- **`T06`** — A `tag:pickup` model is deliberately scaled differently when found and when collected, and is exempt from size rules.

---

## 4. Kind → materials

What a kind is made of. Colour follows from §5.

`kind:assy` is exempt.

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `M00` | `mat=metal-iron` | `kind:obj-kitchenware-cookware` | `mat:metal-iron` | is | `metal-iron-wrought` |
| `M01` | `kind:obj-kitchenware-tableware \| kind:obj-weapon \| kind:obj-tool \| kind:obj-equipment \| kind:char` | `kind:obj-weapon-cannon \| kind:obj-tool-supplies` | `mat:metal-iron` | is | `metal-iron-steel` |
| `M02` | `kind:obj-weapon-cannon \| kind:str` | — | `mat:metal-iron` | is | `metal-iron-cast` |
| `M03` | `kind:obj-tool-supplies` | — | `mat:metal-iron` | is | `metal-iron-wrought` |
| `M04` | `kind:obj-kitchenware-cookware & mat:metal` | — | model | is | paired variants, one `metal-iron-steel` one `metal-iron-cast` |
| `M05` | `kind:obj-container-barrel \| kind:obj-container-bucket` | — | `part:hoop` | is | `metal-iron` |
| `M06` | `kind:obj-container-chest` | — | `part:hoop` | is | `metal-iron` |
| `M07` | `kind:obj-container-crate` | — | `part:hoop` | is | `metal-iron` |
| `M08` | `D03` | — | model | expect | mainly `wood`, often `metal-iron` accents |
| `M09` | `kind:obj-container-bottle` | — | model | has | `glass`, `ceramic` |
| `M10` | `kind:obj-container-bag` | — | `part:fastener, closure` | any-of | `rope`, `leather` |
| `M11` | `kind:obj-kitchenware-tableware-plate` | — | model | any-of | `ceramic`, `metal-iron:`, `wood:` |
| `M12` | `kind:obj-kitchenware-tableware-drinkware` mug, cup, tankard | — | `part:hoop, handle` | any-of | `metal-iron:` |
| `M13` | `kind:obj-kitchenware-tableware-drinkware` mug, cup, tankard | — | model | expect | `wood:` |
| `M14` | `kind:obj-furniture-seating` | — | model | has | `textile` |
| `M15` | `kind:obj-weapon \| kind:obj-tool` | — | `part:handle` (usual) | any-of | `wood:`, `textile` |
| `M16` | `kind:obj-weapon` | — | `part:strap` (sometimes) | any-of | `textile`, `leather` |
| `M17` | `kind:obj-weapon \| kind:obj-tool \| kind:obj-equipment-shield` | fastener joining `stone`, `bone`, `metal-iron-steel` to `wood` | `part:grip, fastener, join` (usual) | expect | `textile`, `rope`, `leather` |
| `M18` | `*` fastener joining `stone`, `bone`, `metal-iron-steel` to `wood` | — | `part:fastener` (sometimes) | expect | `leather` |
| `M19` | `kind:obj-tool \| kind:obj-weapon` | `kind:obj-weapon` special weapon | `mat:metal` | is | `metal-iron:` |
| `M20` | `kind:obj-weapon` special weapon | — | `mat:metal` | one-of | `metal-iron:`, `metal-gold` |
| `M21` | `kind:obj-equipment-clothing` belt, shoe, strap | — | model | has | `leather` |
| `M22` | `kind:obj-tool-hand` | — | `part:wood handle` (usual) | is | `wood-planks` |
| `M23` | `kind:obj-tool-long` | — | `part:pole` (always) | is | `wood-beam` |
| `M24` | `kind:obj-transport-accessory` | — | `part:sail` (sometimes) | is | `textile` |
| `M25` | `kind:obj-transport-boat \| kind:obj-transport-ship` | — | `mat:wood` | min | 2 |
| `M26` | `kind:obj-pocketitem-coin` | — | model | any-of | `metal-gold` |
| `M27` | `kind:obj-pocketitem-key` | — | model | any-of | `metal-iron:`, `metal-gold` |
| `M28` | `kind:obj-pocketitem-book` | — | `part:strap, band, binder, corner` (usual) | any-of | `leather`, `metal-iron:` |
| `M29` | `kind:obj-pocketitem-jewellery` | — | model | any-of | `metal-gold`, `gemstone` |
| `M30` | `kind:obj-resource-wood-log \| kind:env-flora-deadwood-branch` cut-face trunks | — | `part:cut face` (always) | is | `wood-log` |
| `M31` | `kind:obj-resource-wood-log \| kind:env-flora-deadwood-branch` cut-face trunks | — | `part:round side` (always) | is | `wood-bark` |
| `M32` | `*` sticks, unworked poles | — | model | any-of | `wood-bark` |
| `M33` | `kind:obj-instrument` bells | — | model | has | `metal-copper`, `metal-gold` |
| `M34` | `kind:str` | — | model | expect | mainly `wood`, then `stone`; `metal` sparingly |
| `M35` | `kind:str-part-roof` | — | model | has | `ceramic` |
| `M36` | `kind:str-marker-flag` | — | model | has | `textile` |
| `M37` | `kind:str-marker-sign \| kind:str-barrier-post \| kind:str-marker-flag` | — | `part:pole` (usual) | expect | `wood:` |
| `M38` | `kind:str-part-wall \| kind:str-part-floor \| kind:obj-resource-stone` bricks | — | `mat:stone` | is | `stone-masonry` |
| `M39` | `kind:env-terrain-ground` sand, dirt | — | `mat:stone` | is | `stone-soil` |

---

## 5. Subject → colour

Every row names the set of bands its subject may draw from. How rows combine: `F08`.

`kind:assy` is exempt.

### 5.1 Material palettes

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `B01` | `mat=metal-iron-steel` | — | `mat:metal-iron-steel` | one-of | `nickel` |
| `B02` | `mat=metal-iron-wrought` | — | `mat:metal-iron-wrought` | one-of | `basalt` |
| `B03` | `mat=metal-iron-cast` | — | `mat:metal-iron-cast` | one-of | `slate` |
| `B04` | `mat=metal-gold` | — | `mat:metal-gold` | one-of | `amber` |
| `B05` | `mat=metal-copper` | — | `mat:metal-copper` | one-of | `terracotta` |
| `B06` | `mat=wood-planks` | — | `mat:wood-planks` | one-of | `tan` |
| `B07` | `mat=wood-worked` | — | `mat:wood-worked` | one-of | `camel` |
| `B08` | `mat=wood-beam` | — | `mat:wood-beam` | one-of | `chestnut` |
| `B09` | `mat=wood-bark` | — | `mat:wood-bark` | one-of | `umber` |
| `B10` | `mat=wood-log` | — | `mat:wood-log` | one-of | `tan`, `camel`, `chestnut` |
| `B11` | `mat=stone-masonry` | — | `mat:stone-masonry` | one-of | `taupe`, `slate`, `nickel` |
| `B12` | `mat=stone-rock` | — | `mat:stone-rock` | one-of | `nickel`, `taupe` |
| `B13` | `mat=stone-soil` | — | `mat:stone-soil` | one-of | `taupe` |
| `B14` | `mat=paper` | — | `mat:paper` | one-of | `ivory` |
| `B15` | `mat=textile` | — | `mat:textile` | one-of | `ivory`, `hunter` |
| `B16` | `mat=leather` | — | `mat:leather` | one-of | `umber` |
| `B17` | `mat=ceramic` | — | `mat:ceramic` | one-of | `terracotta`, `ivory`, `taupe`, `sienna` |
| `B18` | `mat=bone` | — | `mat:bone` | one-of | `ivory` |
| `B19` | `mat=wax` | — | `mat:wax` | one-of | `ivory` |
| `B20` | `mat=wick` | — | `mat:wick` | one-of | `basalt` |
| `B21` | `mat=glass & !size:s` | — | `mat:glass` | one-of | `transparent` |
| `B22` | `mat=glass & size:s` | — | `mat:glass` | one-of | `transparent`, `sienna`, `hunter` |
| `B23` | `mat=liquid` | — | `mat:liquid` | one-of | `sienna`, `hunter`, `azure` |
| `B24` | `mat=rope` | — | `mat:rope` | one-of | `taupe` |
| `B25` | `mat=cork` | — | `mat:cork` | one-of | `taupe` |
| `B26` | `mat=gemstone` | — | `mat:gemstone` | one-of | `sienna`, `hunter`, `azure` |
| `B27` | `mat=skin` | — | `mat:skin` | one-of | `tan`, `taupe`, `umber` |

### 5.2 By kind and part

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `B28` | `kind:obj-kitchenware-tableware-plate` | — | `mat:ceramic` | one-of | `ivory`, `terracotta` |
| `B29` | `kind:obj-kitchenware-tableware-drinkware` mug, cup, tankard | — | `mat:wood` | one-of | `camel`, `chestnut` |
| `B30` | `kind:obj-kitchenware-cookware-pot` | — | `mat:ceramic` | one-of | `terracotta` |
| `B31` | `kind:obj-food` | `kind:obj-food-meat \| kind:obj-food-vegetable \| kind:obj-food-grain` fish, cheese, chocolate | model | one-of | `any` |
| `B32` | `kind:obj-food` fish | — | model | expect | `nickel`, `basalt`, `slate`, `azure` |
| `B33` | `kind:obj-food` cheese | — | model | one-of | `amber` |
| `B34` | `kind:obj-food-meat` | — | model | one-of | `sienna` |
| `B35` | `kind:obj-food-vegetable` | carrot, pumpkin | model | expect | `moss` |
| `B36` | `kind:obj-food-vegetable` carrot, pumpkin | — | model | one-of | `terracotta` |
| `B37` | `kind:obj-food-grain` | wheat, straw | model | one-of | `tan`, `camel`, `chestnut` |
| `B38` | `kind:obj-food-grain` wheat, straw | — | model | one-of | `tan` |
| `B39` | `*` chocolate | — | model | one-of | `chestnut` |
| `B40` | `kind:obj-weapon \| kind:obj-tool` | — | `part:wrapped grip, binding` (sometimes) | one-of | `taupe`, within UV 0.02–0.40 of the band |
| `B41` | `kind:obj-transport` | — | `mat:wood` | one-of | `camel`, `chestnut` |
| `B42` | `kind:obj-transport-ship \| kind:obj-transport-boat \| kind:obj-transport-accessory` | sails | `mat:textile` | one-of | `ivory`, `hunter`, `slate` |
| `B43` | `kind:obj-transport-accessory` sails \| `kind:str-stands` canvas | — | `mat:textile` | one-of | `ivory`, striped `sienna` and `ivory` |
| `B44` | `kind:obj-pocketitem-book \| kind:obj-weapon-magic & mat:paper` | — | `part:cover` (usual) | one-of | `umber`, `sienna`, `hunter`, `slate` |
| `B45` | `kind:obj-pocketitem-scroll` | — | `mat:paper` | one-of | `ivory` |
| `B46` | `kind:obj-pocketitem-scroll` | — | `part:text` (sometimes) | one-of | `slate` |
| `B47` | `kind:obj-pocketitem-scroll` | — | `part:accent` (sometimes) | one-of | `sienna`, `hunter`, `azure` |
| `B48` | `kind:char \| kind:obj-equipment-clothing` | — | `mat:textile` | one-of | `ivory`, `hunter`, `sienna` |
| `B49` | `kind:str` | — | `mat:glass` | one-of | `transparent` |
| `B50` | `kind:str-part-roof` | — | `mat:ceramic` | one-of | `sienna` |
| `B51` | `kind:env-flora` | `kind:env-flora-tree & !kind:env-flora-tree-palm` | `part:stem, leaf` (usual) | one-of | `moss` |
| `B52` | `kind:env-flora-tree` | `kind:env-flora-tree-palm` | `part:leaf, canopy` | one-of | `hunter` |
| `B53` | `kind:env-flora-plant-flower \| kind:env-flora-plant-cactus` | — | `part:flower` (usual) | one-of | `any` |
| `B54` | `kind:env-fungi` | — | `part:stem` (always) | one-of | `ivory` |
| `B55` | `kind:env-fungi` | — | `part:cap` (always) | one-of | `sienna`, `camel` |
| `B56` | `kind:env-fauna` | — | model | one-of | `any` |
| `B57` | `*` | — | `part:dried stalk` (sometimes) | one-of | `taupe` |
| `B58` | `*` | — | `part:flame, glow, light` (sometimes) | one-of | `amber`, with the lane's UV range not 0 |

---

## 6. Governance & process

Who assigns what:

- **`P01`** — Only the PO assigns `mat:special` and `tag:hero`.
- **`P02`** — When adding to the catalogue, Claude proposes `hero`.
- **`P03`** — Claude asks for `mat:special` only after a recolour and a kind or material change have both failed.
- **`P04`** — When an asset has an outline, Claude tells the PO.
- **`P05`** — The PO does not retire a leaf for having fewer than 6 models.

Making and validating:

- **`P06`** — When creating an asset, Claude first renders and looks at the reference assets.
- **`P07`** — When validating, Claude renders 2+ references of the group beside it at the same scale.
- **`P08`** — A `kind:assy` is not validated directly.
- **`P09`** — Rescaling is done globally for a kit.

Importing a pack:

- **`P10`** — One scale factor for the whole pack, for now.
- **`P11`** — 2 source colours: keep 2.
- **`P12`** — 3–4 source colours: may drop 1.
- **`P13`** — 5 source colours: may drop 2.
- **`P14`** — 6 or more source colours: keep at least 3.

---

## 7. Variants

Which models sit together as one entry and which stand apart. Groups live in `catalog/asset_variants.json`; `build-catalog.mjs` attaches them to the catalogue. A group exists for one of these reasons.

| id | reason | shared | differs |
|---|---|---|---|
| `D08` | material | kind, size, shape | the material it is made of |
| `D09` | recolour | kind, size, shape, material | band |
| `D10` | size | kind, shape, material, band | extents, by redesign |
| `D11` | state | kind, material | a part moved, removed, filled or recoloured |
| `D12` | plural | kind, material, band | how many instances |

What holds of every group, read from `catalog/asset_variants.json`:

- **`V01`** — Its `kits` is one kit; a second only for the same artist, never across artists without the PO.
- **`V02`** — Its `kind` is the same for every member.
- **`V03`** — The more models of a kind, the more sit inside a group.
- **`V04`** — Reasons stack; the more and the wider, the sooner a model earns its own row.
- **`V05`** — A group is judged by how it reads, not by how far it measures.
- **`V06`** — A `D10` member is redesigned at that size: a longer ladder gains rungs.
- **`V07`** — For kinds wanting variety, `D08` and `D09` are made on purpose (`M04` is one).

A variant is what keeps a kind from ballooning. Filled and empty, open and closed, lit and unlit, with lid, without lid and the lid alone each double a group; left apart, ten potions and a shelf of pans crowd out everything else. The same reasons that justify a variant are what justify the model being in the catalogue at all, so the judgement runs both ways: too alike and it is a dedupe, too far apart and it is its own row.

---

## Appendix

see kinds.json.

Main:
`obj` = manufactured/portable thing
`env` = naturally occurring thing
`str` = constructed fixed thing

Other:
`char` = living or acting entity, incl. any obj it may equip, wear or carry
`assy` = a mix of different things from different kinds


Format: `kind — nouns that resolve here`.
Parent lines list nouns that have no leaf yet.
Match with the deepest reasonable tier.
Ground you walk on is `env-terrain`; a rock set on it is `env-rock`.

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
vegetation skin
```
 
