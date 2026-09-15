# Bible

Scope: items in the catalogue.

A term is one of:

| term | matches |
|---|---|
| `*` | every model, or every group |
| `kind:<id>` | that kind and its descendants |
| `kind=<id>` | that kind exactly, no descendants |
| `mat:<id>` | models carrying that material tag or a subtype of it |
| `mat=<id>` | that material tag exactly |
| `tag:<id>` | models carrying that open tag |
| `size:<s\|m\|l>` | models measured at that size |
| `<field><op><number>` | a recorded numeric field compared: `mat>=5`, `tris<100`; ops `= > >= < <=` |
| `D06`, `D10` | a definition id that names a set of models |
| `!<term>` | models the term does not match |

**[F07] Subject.** What the assert is about. A closed set: `model`, any recorded field of F11 (`kind`, `size`, `tags`, `mat`, `bands`, `calls`, `tris`, `dens`, `grad`, `anim`, `minEdge`, `grounded`, `centered`, `specialBand`, `specialWhy`), `dim:w`, `dim:d`, `dim:high`, `dim:longest`, `band`, `mat:<id>`, `part:<name> (<presence>)`, `—`.

**[F08] Assert.** Closed vocabulary:

| assert | value | means |
|---|---|---|
| `min` | number | subject ≥ value; a value may name a recorded numeric field with an optional `× n` (`mat × 2`) |
| `max` | number | subject ≤ value; same |
| `range` | a–b | a ≤ subject ≤ b |
| `fits` | w × d × h | axis-aligned extents each ≤ the box |
| `count-min` | number | at least that many |
| `count-max` | number | at most that many |
| `count-range` | a–b | between a and b |
| `is` | token | a single-valued subject equals the token |
| `not` | token | subject never equals the token |
| `one-of` | token list | the tokens are the whole set the subject may draw from |
| `any-of` | token list | every value the subject carries is among the tokens, and it carries at least one |
| `all-of` | token list | the subject carries every token and nothing else |
| `expect` | token list | subject is normally one of the tokens |
| `default` | token | applies only where no more specific row constrains the same subject |
| `see` | rule id | the row defers to that rule |
| `note` | prose | a reading the linter never evaluates |

**[F15] `special` in the counts.** `mat` is counted without `special`. Band maxima ignore the `special` band; band minima keep it.

Definitions:

| id | term | definition |
|---|---|---|
| `D01` | high | the bounding-box Y extent |
| `D03` | kind | a kind names the leaf and its children |
| `D04` | tri density | `dens`: tris ÷ (w × d × h), triangles per 1 × 1 × 1 cell |
| `D07` | variant group | models that read as one thing; `main` is the one shown |
| `D09` | longest | an object's largest extent |
| `D10` | near-cube | extents within 15% of each other |

Colour bands. 
`column,row` cell of the 16 × 4 grid of `kits/colormap.png`.

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

Tag fields:

| id | field | job | set |
|---|---|---|---|
| `F02` | `material` | what it is **made of** | closed, parented |
| `F03` | `kind` | what it **is** — form cohort | closed, hierarchical, **exactly one** |
| `F04` | `size` | rough bbox: `s` `m` `l` | closed, measured |
| `F05` | `tag` | kit/artist, theme, flags (hero, plural, anim, comp, etc) | open |

---

## 1. Intent

How a model should look and draw.

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `I01` | `*` | — | model | is | chunky, caricatured; not thin, not primitive |
| `I02` | `*` | — | model | is | clean facets, chamfered edges, rounded-soft |
| `I03` | `!kind:env` | — | model | is | few details |
| `I04` | `*` | — | model | is | invented before 1850 |
| `I05` | `*` | — | model | is | like its deepest kind in shape, colour, style |
| `I06` | `*` | — | `band` | one-of | `any` |
| `I07` | `*` | — | `grad` | not | 0 |
| `I08.1` | `!mat:glass` | — | model | is | `alphaMode` `OPAQUE` |
| `I08.2` | `*` | — | model | is | `roughnessFactor` 1, `metallicFactor` 0 |
| `I09.1` | `mat:glass` | — | `calls` | min | 2 |
| `I09.2` | `*` | — | model | is | 2+ calls only for moving features or glass |
| `I10` | `*` | — | model | not | outline, unless the outline is a core feature |
| `I11` | `*` | — | model | is | no shadow casting |

---

## 2. Geometry & budget

Everything measured off the mesh: extents, counts, pivots, band counts.

### 2.1 Construction & placement

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G01` | `tag:ngons` | `tag:hero` | model | count-range | 8–12 flat pieces per full circle |
| `G02` | `*` | `mat:textile` | `minEdge` | min | 0.015 |
| `G02.1` | `mat:textile` | — | `minEdge` | min | 0.01 |
| `G03` | `*` | `kind:char` + `tag:plural` | `dens` | max | 5000 |
| `G04.1` | `*` | `tag:floating` | `grounded` | is | true |
| `G04.2` | `*` | `tag:offcenter` | `centered` | is | true |
| `G05` | `*` | — | `part:split node` (sometimes) | is | origin at the joint |

### 2.2 Band counts

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G06` | `*` | — | `mat` | min | 1 |
| `G07` | `*` | — | `bands` | min | `mat` |
| `G08.1` | `*` | — | `bands` | max | `mat` × 2 |
| `G08.2` | `mat:food` + `mat:vegetation` + `kind:env-fauna` | — | `bands` | max | `mat` × 3 |
| `G08.3` | `mat:food` & `tag:decorated` | — | `bands` | max | `mat` × 5 |
| `G09.1` | `!kind:char` | `size:l` & `mat>=5` | `bands` | max | 5 |
| `G09.2` | `kind:char` | `size:l` & `mat>=5` | `bands` | max | 6 |
| `G10.1` | `!kind:char` & `size:l` & `mat>=5` | — | `bands` | max | 6 |
| `G10.2` | `kind:char` & `size:l` & `mat>=5` | — | `bands` | max | 7 |

### 2.3 Size

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G13` | `*` | `kind:env-terrain-mountain` | `dim:high` | max | 6 |
| `G14` | `kind:obj-container-chest` & with lid | — | `dim:high` | range | 0.2–0.5 |
| `G15` | `kind:obj-container-barrel` | — | `dim:high` | range | 0.2–0.8 |
| `G16` | `kind:obj-container-bucket` | — | `dim:high` | range | 0.1–0.4 |
| `G17` | `kind:obj-container-crate` & `D10` | — | `dim:high` | range | 0.2–0.8 |
| `G18` | `kind:obj-container-bottle` | — | `dim:high` | range | 0.1–0.4 |
| `G19` | `kind:obj-container-pot` | — | `dim:high` | range | 0.2–0.4 |
| `G20` | `kind:obj-kitchenware-tableware-cutlery` | — | `dim:longest` | range | 0.1–0.4 |
| `G21` | `kind:obj-kitchenware-tableware-plate` | — | `dim:longest` | range | 0.1–0.4 |
| `G22` | `kind:obj-kitchenware-cookware-pan` & with lid | — | `dim:high` | max | 0.4 |
| `G23` | `kind:obj-kitchenware-cookware-pot` & with lid | — | `dim:high` | max | 0.4 |
| `G24` | `kind:obj-furniture-seating` | — | `dim:high` | range | 0.2–0.7 |
| `G25` | `kind:obj-furniture-table` | — | `dim:high` | min | 0.2 |
| `G26` | `kind:obj-weapon-melee-sword` | — | `dim:longest` | range | 0.4–1.0 |
| `G27` | `kind:obj-weapon-melee-dagger` | — | `dim:longest` | range | 0.1–0.5 |
| `G28` | `kind:obj-weapon-melee-axe` | — | `dim:longest` | range | 0.2–0.8 |
| `G29` | `kind:obj-weapon-melee-hammer` | — | `dim:longest` | range | 0.2–0.8 |
| `G30` | `kind:obj-weapon-ranged-bow` | — | `dim:longest` | range | 0.4–1.0 |
| `G31` | `kind:obj-weapon-ranged-crossbow` | — | `dim:longest` | range | 0.4–1.0 |
| `G32` | `kind:obj-weapon-magic-staff` | — | `dim:longest` | range | 0.2–1.2 |
| `G33` | `kind:obj-equipment-shield` | — | `dim:high` | range | 0.2–0.6 |
| `G34` | `kind:obj-tool-long` | — | `dim:longest` | range | 0.3–1.2 |
| `G35` | `kind:obj-lighting-lantern` | — | `dim:high` | range | 0.1–1.0 |
| `G36` | `kind:obj-lighting-torch` | — | `dim:high` | range | 0.1–1.0 |
| `G37` | `kind:obj-lighting-candle` | — | `dim:high` | range | 0.1–0.7 |
| `G38` | `kind:obj-pocketitem-coin` | `tag:plural` | `dim:longest` | max | 0.2 |
| `G39` | `kind:obj-pocketitem-key` | — | `dim:longest` | max | 0.2 |
| `G40` | `kind:obj-pocketitem-book` & closed | — | `dim:longest` | range | 0.1–0.3 |
| `G41` | `kind:obj-pocketitem-scroll` | — | `dim:longest` | range | 0.1–0.3 |
| `G42` | `kind:env-flora-tree` | — | `dim:high` | range | 0.6–2.4 |
| `G43` | `kind:char` humanoid, skeleton included | — | `dim:high` | range | 0.4–0.8 |

### 2.4 Boxes and part counts

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G45` | `D06` | — | `part:hoop` (usual) | range | 5–15% of longest, high |
| `G46.1` | `kind:obj-container-barrel` | — | `dim:w` | max | 0.75 |
| `G46.2` | `kind:obj-container-barrel` | — | `part:side plank` (always) | count-range | 8–14 |
| `G46.3` | `kind:obj-container-barrel` | — | `tris` | range | 100–1500 |
| `G46.4` | `kind:obj-container-barrel` | — | `part:hoop` (always) | count-max | 3 |
| `G47` | `kind:obj-container-bucket` | — | `part:hoop` (always) | count-max | 3 |
| `G48` | `kind:obj-container-crate` & `D10` | — | `part:plank` (always) | count-range | 3–7 side by side per face |
| `G49.1` | `kind:obj-furniture` | `kind:obj-furniture-table` | model | fits | 1.2 × 1.2 × 1.2 |
| `G49.2` | `kind:obj-furniture-table` | — | model | fits | 2 × 2 × 0.5 |
| `G50` | `kind:obj-pocketitem-book` & open | — | `dim:longest` | see | `G40`, on the longest cover edge |
| `G52` | `kind:str-marker-flag` + `kind:str-stands` + `kind:obj-transport-accessory` | — | `part:sail, canopy, canvas` (sometimes) | range | 0.01–0.05 thick |

---

## 3. Taxonomy

What a model *is*, before any material or colour question.

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `T01` | `*` | — | `kind` | note | a leaf may carry its material's name (`env-remains-bones`) |
| `T03` | `kind=assy` | — | `kind` | is | distinct things in one top-level |
| `T04` | `*` | — | `kind` | is | the deepest leaf that fits; the parent is "other" |
| `T05` | `*` | — | `kind` | is | the one kind the appendix glossary resolves the noun to |
| `T06.1` | `kind:env-terrain` | — | `kind` | is | ground mesh and cobbled path `env-terrain`, not `env-rock` |
| `T06.2` | `kind:env-rock` | — | `kind` | is | placed body `env-rock`, cliff prop `env-rock-formation` |
| `T07` | `*` | — | `kind` | not | decided by kit of origin |
| `T08` | `*` | — | `tags` | is | the artist tag from the kit, only for artists with several kits adopted |
| `T11` | `tag:ngons` | — | model | is | round cross-section, what `G01` counts on |
| `T12` | `tag:plural` | — | model | is | several instances of one thing in one model |
| `T14.1` | `mat:special` | — | `specialBand` | one-of | `any` |
| `T14.2` | `mat:special` | — | `specialWhy` | not | empty |
| `T15` | `tag:pickup` | — | model | is | sized to be seen and collected, not to stand in the world |

Building the catalogue:

- **`T09`** — `size` is measured, never hand-set.
- **`T10`** — `anim` is read off the glb, never hand-set.

---

## 4. Kind → material

What a kind is made of. Colour follows from section 5.

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `M01.1` | `kind:obj-container-barrel` | — | `part:hoop` (always) | is | `metal-iron` |
| `M01.2` | `kind:obj-container-bucket` | — | `part:hoop` (always) | is | `metal-iron` |
| `M01.3` | `kind:obj-container-chest` | — | `part:hoop` (usual) | is | `metal-iron` |
| `M01.4` | `kind:obj-container-crate` | — | `part:hoop` (sometimes) | is | `metal-iron` |
| `M02` | `kind:obj-container-bottle` | — | model | any-of | `glass`, `ceramic` |
| `M03` | `kind:obj-container-bag` | — | `part:fastener, closure` (sometimes) | any-of | `rope`, `leather` |
| `M04` | `kind:obj-kitchenware-tableware-plate` | — | model | any-of | `ceramic`, `metal-iron:`, `wood:` |
| `M05` | `kind:obj-kitchenware-tableware` mug, cup, tankard | — | `part:hoop, handle` (sometimes) | is | `metal-iron:` |
| `M06` | `kind:obj-kitchenware-tableware` | — | `mat:metal-iron` | is | `metal-iron-steel` |
| `M07` | `kind:obj-furniture` | rug, carpet + upholstered | model | any-of | `wood:` |
| `M08` | `kind:obj-furniture` rug, carpet | — | model | any-of | `textile` |
| `M09` | `kind:obj-furniture-seating` upholstered | — | model | any-of | `textile` |
| `M10` | `kind:obj-weapon` + `kind:obj-tool` | — | `mat:metal-iron` | is | `metal-iron-steel` |
| `M11` | `kind:obj-weapon` + `kind:obj-tool` | — | `part:handle` (usual) | any-of | `wood:`, `textile` |
| `M12` | `kind:obj-weapon` | — | `part:strap` (sometimes) | any-of | `textile`, `leather` |
| `M13` | `kind:obj-weapon-cannon` | — | `mat:metal-iron` | is | `metal-iron-cast` |
| `M14` | `kind:obj-equipment` | — | `mat:metal-iron` | is | `metal-iron-steel` |
| `M15` | `kind:obj-equipment-clothing` belt, shoe, strap | — | model | any-of | `leather` |
| `M16` | `kind:obj-tool-hand` | — | `part:wood handle` (usual) | is | `wood-planks` |
| `M17` | `kind:obj-tool-long` | — | `part:pole` (always) | is | `wood-beam` |
| `M18` | `kind:obj-tool-supplies` | — | `mat:metal-iron` | is | `metal-iron-wrought` |
| `M19` | `kind:obj-transport-accessory` | — | `part:sail` (sometimes) | is | `textile` |
| `M20` | `kind:obj-pocketitem-coin` | — | model | any-of | `metal-gold` |
| `M21` | `kind:obj-pocketitem-key` | — | model | any-of | `metal-iron:`, `metal-gold` |
| `M22` | `kind:obj-pocketitem-book` | — | `part:strap, band, binder, corner` (usual) | any-of | `leather`, `metal-iron:` |
| `M23` | `kind:obj-pocketitem-jewellery` | — | model | all-of | `metal-gold`, `gemstone` |
| `M24` | `kind:obj-resource-wood-log` + `kind:env-flora-deadwood-branch` + cut-face trunks | — | `part:cut face` (always) | is | `wood-log` |
| `M25` | `kind:obj-resource-wood-log` + `kind:env-flora-deadwood-branch` + cut-face trunks | — | `part:round side` (always) | is | `wood-bark` |
| `M26` | `kind:obj` bells | — | model | any-of | `metal-copper`, `metal-gold` |
| `M27` | `kind:str` | — | `mat:metal-iron` | is | `metal-iron-cast` |
| `M28` | `kind:str-part-roof` | — | model | any-of | `ceramic` |
| `M29` | `kind:str-marker-flag` | — | model | any-of | `textile` |
| `M30` | `kind:char` | — | `mat:metal-iron` | is | `metal-iron-steel` |
| `M31` | `mat=metal-iron` | — | `mat:metal-iron` | default | `metal-iron-wrought` |
| `M32` | `D06` | — | model | expect | mainly `wood`, often `metal-iron` accents |
| `M33` | `kind:obj-kitchenware-tableware` mug, cup, tankard | — | model | expect | `wood:` |
| `M34` | `kind:obj-kitchenware-cookware` & `mat:metal` | — | model | is | paired variants, one `metal-iron-steel` one `metal-iron-cast` |
| `M35` | `kind:obj-tool` + `kind:obj-weapon` | — | `mat:metal` | is | `metal-iron:` |
| `M36` | `kind:obj-weapon` + `kind:obj-tool` + `kind:obj-equipment-shield` | — | `part:grip, fastener, join` (usual) | expect | `textile`, `rope`, `leather` |
| `M37` | `kind:obj-weapon` simple + `kind:obj-weapon-ranged-bow` | — | model | note | `wood:` wholly or partly is fine; `M35` constrains only the metal |
| `M38` | `kind:obj-weapon` special | — | `mat:metal` | one-of | `metal-iron:`, `metal-gold` |
| `M39` | `*` sticks, unworked poles | — | model | any-of | `wood-bark` |
| `M40` | `*` fastener joining `stone`, `bone`, `metal-iron-steel` to `wood` | — | `part:fastener` (sometimes) | expect | `leather` |
| `M41` | `kind:obj-transport-boat` + `kind:obj-transport-ship` | — | `mat:wood` | count-min | 2 |
| `M42` | `kind:str` | — | model | expect | mainly `wood`, then `stone`; `metal` sparingly |
| `M43` | `kind:str-marker-sign` + `kind:str-barrier-post` + `kind:str-marker-flag` | — | `part:pole` (usual) | expect | `wood:` |
| `M44` | `*` | — | — | see | `M24`, `M25`; never the other way round |
| `M45` | `kind:obj` bells | — | model | not | `metal-iron:` |
| `M46` | `kind:str-part-wall` + `kind:str-part-floor` + `kind:obj-resource-stone` bricks | — | `mat:stone` | is | `stone-masonry` |
| `M47` | `kind:env-terrain-ground` sand, dirt | — | `mat:stone` | is | `stone-soil` |

---

## 5. Subject → colour

Every row names the set of bands its subject may draw from; F12.4 bounds a
model's bands by the union over the rows that match it.

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `B01` | `mat=metal-iron-steel` | — | model | one-of | `nickel` |
| `B02` | `mat=metal-iron-wrought` | — | model | one-of | `basalt` |
| `B03` | `mat=metal-iron-cast` | — | model | one-of | `slate` |
| `B04` | `mat=metal-gold` | — | model | one-of | `amber` |
| `B05` | `mat=metal-copper` | — | model | one-of | `terracotta` |
| `B06` | `mat=wood-planks` | — | model | one-of | `tan` |
| `B07` | `mat=wood-worked` | — | model | one-of | `camel` |
| `B08` | `mat=wood-beam` | — | model | one-of | `chestnut` |
| `B09` | `mat=wood-bark` | — | model | one-of | `umber` |
| `B51` | `mat=wood-log` | — | model | one-of | `tan`, `camel`, `chestnut` |
| `B10` | `mat=stone-masonry` | — | model | one-of | `taupe`, `slate`, `nickel` |
| `B11` | `mat=stone-rock` | — | model | one-of | `nickel`, `taupe` |
| `B12` | `mat=stone-soil` | — | model | one-of | `taupe` |
| `B13` | `mat=paper` | — | model | one-of | `ivory` |
| `B14` | `mat=textile` | — | model | one-of | `ivory`, `hunter` |
| `B15` | `mat=leather` | — | model | one-of | `umber` |
| `B16` | `mat=ceramic` | — | model | one-of | `terracotta`, `ivory`, `taupe`, `sienna` |
| `B17` | `mat=bone` | — | model | one-of | `ivory` |
| `B18` | `mat=wax` | — | model | one-of | `ivory` |
| `B19` | `mat=wick` | — | model | one-of | `basalt` |
| `B20` | `mat=glass` & `size:m\|l` | — | model | one-of | `transparent` |
| `B21` | `mat=glass` & `size:s` | — | model | one-of | `transparent`, `sienna`, `hunter` |
| `B22` | `mat=liquid` | — | model | one-of | `sienna`, `hunter`, `azure` |
| `B23` | `mat=rope` | — | model | one-of | `taupe` |
| `B24` | `mat=cork` | — | model | one-of | `taupe` |
| `B25` | `mat=gemstone` | — | model | one-of | `sienna`, `hunter`, `azure` |
| `B26` | `mat=skin` | — | model | one-of | `tan`, `taupe`, `umber` |
| `B52` | `mat:metal-iron` | — | `bands` | not | two `metal-iron` bands merged into one |
| `B57` | `mat=wax` | — | model | see | `B18` is `obj-lighting-candle` wax |
| `B27` | `kind:obj-kitchenware-tableware-plate` | — | `mat:ceramic` | one-of | `ivory`, `terracotta` |
| `B28` | `kind:obj-kitchenware-tableware` mug, cup, tankard | — | `mat:wood` | one-of | `camel`, `chestnut` |
| `B29` | `kind:obj-kitchenware-cookware-pot` | — | `mat:ceramic` | one-of | `terracotta` |
| `B58` | `kind:obj-food` | — | model | one-of | `any` |
| `B59` | `kind:obj-food` fish | — | model | expect | `nickel`, `basalt`, `slate`, `azure` |
| `B30` | `kind:obj-food` cheese | — | model | one-of | `amber` |
| `B31` | `kind:obj-food-meat` | — | model | one-of | `sienna` |
| `B60` | `kind:obj-food-vegetable` | — | model | expect | `moss` |
| `B32` | `kind:obj-food-vegetable` carrot, pumpkin | — | model | one-of | `terracotta` |
| `B33` | `kind:obj-food-grain` | — | model | one-of | `tan`, `camel`, `chestnut` |
| `B34` | `kind:obj-food-grain` wheat, straw | — | model | one-of | `tan` |
| `B35` | `*` chocolate | — | model | one-of | `chestnut` |
| `B36` | `kind:obj-weapon` + `kind:obj-tool` | — | `part:wrapped grip, binding` (sometimes) | one-of | `taupe` |
| `B56` | `kind:obj-weapon` + `kind:obj-tool` | — | `part:wrapped grip, binding` (sometimes) | range | UV 0.02–0.40 of the `taupe` band |
| `B37` | `kind:obj-weapon-magic` & `mat:paper` | — | `part:cover` (sometimes) | one-of | `umber`, `sienna`, `hunter`, `slate` |
| `B38` | `kind:obj-transport` | — | `mat:wood` | one-of | `camel`, `chestnut` |
| `B55` | `kind:obj-transport-ship` + `kind:obj-transport-boat` + `kind:obj-transport-accessory` | — | `mat:textile` | one-of | `ivory`, `hunter`, `slate` |
| `B39` | `kind:obj-transport-accessory` sails + `kind:str-stands` canvas | — | model | one-of | `ivory`, striped `sienna` and `ivory` |
| `B40` | `kind:obj-pocketitem-book` | — | `part:cover` (usual) | one-of | `umber`, `sienna`, `hunter`, `slate` |
| `B41` | `kind:obj-pocketitem-scroll` | — | model | one-of | `ivory` |
| `B42` | `kind:obj-pocketitem-scroll` | — | `part:text` (sometimes) | one-of | `slate` |
| `B43` | `kind:obj-pocketitem-scroll` | — | `part:accent` (sometimes) | one-of | `sienna`, `hunter`, `azure` |
| `B54` | `kind:char` + `kind:obj-equipment-clothing` | — | `mat:textile` | one-of | `ivory`, `hunter`, `sienna` |
| `B44` | `kind:str` | — | `mat:glass` | one-of | `transparent` |
| `B65` | `kind:str-part-roof` | — | model | one-of | `sienna` |
| `B45` | `kind:env-flora` | — | `part:stem, leaf` (usual) | one-of | `moss` |
| `B46` | `kind:env-flora-tree` | `kind:env-flora-tree-palm` | model | one-of | `hunter` |
| `B62` | `kind:env-flora-plant-flower` + `kind:env-flora-plant-cactus` | — | `part:flower` (usual) | one-of | `any` |
| `B47` | `kind:env-fungi` | — | `part:stem` (always) | one-of | `ivory` |
| `B48` | `kind:env-fungi` | — | `part:cap` (always) | one-of | `sienna`, `camel` |
| `B63` | `kind:env-fauna` | — | model | one-of | `any` |
| `B49` | `*` | — | `part:dried stalk` (sometimes) | one-of | `taupe` |
| `B50` | `*` | — | `part:flame, glow, light` (sometimes) | one-of | `amber` |
| `B64` | `*` | — | `part:flame, glow, light` (sometimes) | is | the `amber` lane's UV range not 0 |

---

## 6. Governance & process

Who assigns what:

- **`P01`** — only the PO assigns `mat:special` and `tag:hero`.
- **`P02`** — adding to the catalogue, Claude proposes `hero`.
- **`P03`** — Claude asks for `mat:special` only after a recolour and a kind or
  material change have both failed.
- **`P04`** — an outline on an asset, Claude tells the PO.
- **`P10`** — the PO does not retire a leaf for being below 6 models.

Making and validating:

- **`P05`** — creating an asset, Claude renders and looks at the reference
  assets first.
- **`P06`** — validating, Claude renders 2+ references of the group beside it at
  the same scale.
- **`P07`** — a `kind=assy` is not validated directly.
- **`P07`** — Rescaling must be done for a kit globally.

Importing a pack:

- **`P08`** — one scale factor for the whole pack, for now.
- **`P09`** — 2 source colours: keep 2.
- **`P09.1`** — 3–4 source colours: may drop 1.
- **`P09.2`** — 5 source colours: may drop 2.
- **`P09.3`** — 6 or more source colours: keep at least 3.

---

## 7. Variants

Which models sit together as one entry and which stand apart. Groups live in
`catalog/asset_variants.json`; `build-catalog.mjs` attaches them to the
catalogue. A group exists for one of these reasons.

| id | reason | shared | differs |
|---|---|---|---|
| `D11` | material | kind, size, shape | the material it is made of |
| `D12` | recolour | kind, size, shape, material | band |
| `D13` | size | kind, shape, material, band | extents, by redesign |
| `D14` | state | kind, material | a part moved, removed, filled or recoloured |
| `D15` | plural | kind, material, band | how many instances |

What holds of every group, read from `catalog/asset_variants.json`:

- **`V07`** — its `kits` is one kit; a second only for the same artist, never
  across artists without the PO.
- **`V08`** — its `kind` is the same for every member.

How groups are drawn, none of it failed by the build:

- **`V10`** — the more models of a kind, the more sit inside a group.
- **`V11`** — reasons stack; the more and the wider, the sooner a model earns
  its own row.
- **`V12`** — a group is judged by how it reads, not by how far it measures.
- **`V13`** — a `D13` member is redesigned at that size: a longer ladder gains
  rungs.
- **`V15`** — for kinds wanting variety, `D11` and `D12` are made on purpose
  (`M34` is one).

A variant is what keeps a kind from ballooning. Filled and empty, open and
closed, lit and unlit, with lid, without lid and the lid alone each double a
group; left apart, ten potions and a shelf of pans crowd out everything else.
The same reasons that justify a variant are what justify the model being in
the catalogue at all, so the judgement runs both ways: too alike and it is a
dedupe, too far apart and it is its own row.

---

## Appendix: kind tree + glossary

Main:
`obj` = manufactured/portable thing
`env` = naturally occurring thing
`str` = constructed fixed thing

Other
`char` = living or acting entity, incl potential obj it may equip, wear, carry
`assy` = a mix of different things from different kinds.

Format: `kind — nouns that resolve here`. 
Parent lines list nouns that have no leaf yet.
Match with deepest tier reasonable.

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
obj-kitchenware-tableware — mug, cup, goblet, chalice, tankard, teapot, glass
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
obj-weapon-ranged-accessory — arrow, bolt (crossbow), dart, quiver
obj-weapon-ranged — sling, throwing knife, javelin, pistol, rifle, musket, blunderbuss, shotgun

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
obj-lighting-campfire — campfire, bonfire, fire pit
obj-lighting — chandelier

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

obj-instrument — bell, gong, drum, lute

obj-art-sculpture — statue, fountain
obj-art

obj — barrel stand, weapon stand, easel, signboard (freestanding), cage, heart token, star token

str-part-door — door, gate (building), hatch
str-part-floor — floor, floor tile, ceiling
str-part-roof — roof, roof tile, chimney, gable
str-part-window — window, shutter
str-part-wall — wall, wall segment, arch (building), corner
str-part-pillar — pillar, column, beam, support
str-part-frame — frame, framework, post-and-beam frame, scaffold, structure (open)
str-part — room, cellar, souterrain, dungeon

str-building-tower — tower, lighthouse, mill, windmill

str-building — house (whole), hut, crypt, church, castle, inn, barracks, stables, blacksmith, watermill, sawmill, gazebo, well

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
