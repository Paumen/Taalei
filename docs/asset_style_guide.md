# Bible

Scope: items in the catalogue.

## 0. How to read a rule

**[F01] Rule format.** Every rule is one table row. No rule lives in prose.
A row is `id | when | subject | assert | value | sev | except`; a table may drop
a column it never uses and may add columns whose meaning is fixed by its
section header. Rule text is capped at 140 characters. Kind rows run in
kind-tree order and a deeper kind overrides its parent; material rows run in
material-tree order and a deeper material overrides its parent; a kind row
overrides a material row.

**[F06] Selector (`when`, `except`).** A selector is terms joined by `+` (any
of them matches) or `&` (all of them must). `&` binds tighter than `+`. A
term is one of:

| term | matches |
|---|---|
| `*` | every model |
| `kind:<id>` | that kind and its descendants |
| `kind=<id>` | that kind exactly, no descendants |
| `mat:<id>` | models carrying that material tag or a subtype of it |
| `mat=<id>` | that material tag exactly |
| `tag:<id>` | models carrying that open tag |
| `size:<s\|m\|l>` | models measured at that size |
| `!<term>` | models the term does not match |

A term's value may list alternatives with `|`: `size:m\|l`. A term may also be a definition id from D01–D10 that names a set of kinds (`D06`). An empty `except`
cell (`—`) means no exemption. Words in a `when` cell that are not terms
(`mug, cup, tankard`, `upholstered`, `simple`) name a reading a person makes;
they force the row to `sev manual`.

**[F07] Subject.** What the assert is about: `model`, `dim:w`, `dim:d`,
`dim:high`, `dim:long`, `dim:longest`, `bands`, `mat`, `mat:<id>`, `band`,
`calls`, `tris`, `minEdge`, or `part:<name>`. A `part:` subject names a piece
of the mesh; parts are not recorded per model, so every `part:` row is
`sev manual` (Q07).

**[F08] Assert.** Closed vocabulary:

| assert | value | means |
|---|---|---|
| `min` | number | subject ≥ value |
| `max` | number | subject ≤ value |
| `range` | a–b | a ≤ subject ≤ b |
| `fits` | w × d × h | axis-aligned extents each ≤ the box |
| `count-min` | number | at least that many |
| `count-max` | number | at most that many |
| `count-range` | a–b | between a and b |
| `is` | token | subject equals the token |
| `not` | token | subject never equals the token |
| `one-of` | token list | subject is one of the tokens, and nothing else |
| `expect` | token list | subject is normally one of the tokens |
| `allow` | token list | widens the rule named in `except`; never fails alone |
| `exempt` | rule id | the `when` set is exempt from that rule |
| `see` | rule id | the row restates or defers to that rule |

**[F09] Severity.** `error` = fails the build. `glb` = fails the build, read
from the glb instead of the catalogue. `warn` = reported, does not fail.
`none` = an allowance, nothing to check. `manual` = true but not checkable
from recorded data; the linter skips it and lists it. `intent` = how a model
should look; human judgement. `process` = about people, not models.

**[F10] Exemption.** A model leaves a rule only through that rule's `except`
cell, or through material tag `special` (T13). There is no other escape.

**[F11] Units and sources.** Lengths are catalogue units, measured off the
mesh as recorded in `catalog/catalog.json`: `wdh` (w, d, h), `tris`, `mat`,
`bands`, `calls`, `grounded`, `centered`, `minEdge`, `spread`, `colors`,
`size`, `kind`, `tags`. `sev glb` values (`I08`, `I11`) are read from the glb
itself, not from the catalogue.

Definitions:

| id | term | definition |
|---|---|---|
| `D01` | high | the bounding-box Y extent |
| `D02` | long | the extent along the object's main axis (Q06) |
| `D03` | kind | a kind names the leaf and its children |
| `D04` | tri density | tris ÷ (max(0.49, w × d) × max(0.7, h)) (Q01) |
| `D05` | vegetation | a plant's non-green matter; fungi are not vegetation |
| `D06` | hooped containers | `obj-container-` `barrel`, `chest`, `bucket`, `crate` |
| `D07` | variant group | models that read as one thing; `main` is the one shown |
| `D08` | reads as | what a player notices at a glance, not what numbers differ by |
| `D09` | longest | an object's largest extent |
| `D10` | near-cube | extents within 15% of each other |

Colour bands. The band name is the token used in `value`; the id is its
position on `kits/colormap.png`.

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
| `F02` | `material` | what it is **made of** | closed, parented (Q08) |
| `F03` | `kind` | what it **is** — form cohort | closed, hierarchical, **exactly one** |
| `F04` | `size` | rough bbox: `s` `m` `l` | closed, measured |
| `F05` | `tag` | kit/artist, theme, flags | open |

---

## 1. Intent

How a model should look and draw.

| id | when | subject | assert | value | sev |
|---|---|---|---|---|---|
| `I01` | `*` | model | is | chunky, caricatured; not thin, not primitive | intent |
| `I02` | `*` | model | is | clean facets, chamfered edges, rounded-soft | intent |
| `I03` | `!kind:env` | model | is | few details | intent |
| `I04` | `*` | model | is | invented before 1850 | intent |
| `I05` | `*` | model | is | like its deepest kind in shape, colour, style | intent |
| `I06` | `*` | band | is | a named band of `kits/colormap.png` | error |
| `I07` | `*` | band | is | UV spread across the gradient band kept | manual |
| `I08.1` | `!mat:glass` | model | is | `alphaMode` `OPAQUE` | glb |
| `I08.2` | `*` | model | is | `roughnessFactor` 1, `metallicFactor` 0 | glb |
| `I09.1` | `mat:glass` | calls | min | 2 | error |
| `I09.2` | `*` | model | is | 2+ calls only for moving features or glass | manual |
| `I10` | `*` | model | not | outline, unless the outline is a core feature | manual |
| `I11` | `*` | model | is | no shadow casting | glb |

---

## 2. Geometry & budget

Everything measured off the mesh: extents, counts, pivots, band counts.

### 2.1 Construction & placement

| id | when | except | subject | assert | value | sev |
|---|---|---|---|---|---|---|
| `G01` | `tag:ngons` | `tag:hero` | model | count-range | 8–12 flat pieces per full circle | warn |
| `G02` | `*` | — (Q16) | `minEdge` | min | 0.015 | error |
| `G03` | `*` | `tag:char` + `tag:plural` | `tris` | max | 5000 per occupied grid cell (Q01) | error |
| `G04` | `*` | — (Q02) | model | is | `grounded` and `centered` | error |
| `G05` | `*` | — | `part:split node` | is | origin at the joint | manual |

### 2.2 Band counts

`mat` is the model's material-tag count, `bands` its band count.

| id | when | except | subject | assert | value | sev |
|---|---|---|---|---|---|---|
| `G06` | `*` | — | `mat` | min | 1 | error |
| `G07` | `*` | — | `bands` | min | `mat` | error |
| `G08.1` | `*` | — | `bands` | max | `mat` × 2 | error |
| `G08.2` | `mat:food` + `mat:vegetation` + `kind:env-fauna` | — | `bands` | max | `mat` × 3 | error |
| `G08.3` | `mat:food` & `tag:decorated` | — | `bands` | max | `mat` × 5 | error |
| `G09.1` | `!tag:char` | `see G10` | `bands` | max | 5 | error |
| `G09.2` | `tag:char` | — | `bands` | max | 6 | error |
| `G10` | `size:l` & `mat` ≥ 5 | — | `bands` | max | `G09` + 1 | error |
| `G11` | `mat:special` | — | `mat` | is | counted without `special` | error |
| `G12` | `mat:special` | — | `bands` | is | max rules ignore the `special` band, min rules keep it | error |

### 2.3 Size

`dim` is the dimension of `D01`, `D02` or `D09`; `—` is no bound on that side.

| id | when | except | dim | min | max | sev |
|---|---|---|---|---|---|---|
| `G13` | `*` | `see G44` | high | — | 6 | error |
| `G14` | `kind:obj-container-chest` & with lid | — | high | 0.2 | 0.5 | manual |
| `G15` | `kind:obj-container-barrel` | — | high | 0.2 | 0.8 | error |
| `G16` | `kind:obj-container-bucket` | — | high | 0.1 | 0.4 | error |
| `G17` | `kind:obj-container-crate` & near-cube | — | high | 0.2 | 0.8 | error |
| `G18` | `kind:obj-container-bottle` | — | high | 0.1 | 0.4 | error |
| `G19` | `kind:obj-container-pot` | — | high | 0.2 | 0.4 | error |
| `G20` | `kind:obj-kitchenware-tableware-cutlery` | — | longest | 0.1 | 0.4 | error |
| `G21` | `kind:obj-kitchenware-tableware-plate` | — | longest | 0.1 | 0.4 | error |
| `G22` | `kind:obj-kitchenware-cookware-pan` & with lid | — | high | — | 0.4 | manual |
| `G23` | `kind:obj-kitchenware-cookware-pot` & with lid | — | high | — | 0.4 | manual |
| `G24` | `kind:obj-furniture-seating` | — | high | 0.2 | 0.7 | error |
| `G25` | `kind:obj-furniture-table` | — | high | 0.2 | — | error |
| `G26` | `kind:obj-weapon-melee-sword` | — | long | 0.4 | 1.0 | error |
| `G27` | `kind:obj-weapon-melee-dagger` | — | long | 0.1 | 0.5 | error |
| `G28` | `kind:obj-weapon-melee-axe` | — | long | 0.2 | 0.8 | error |
| `G29` | `kind:obj-weapon-melee-hammer` | — | long | 0.2 | 0.8 | error |
| `G30` | `kind:obj-weapon-ranged-bow` | — | long | 0.4 | 1.0 | error |
| `G31` | `kind:obj-weapon-ranged-crossbow` | — | long | 0.4 | 1.0 | error |
| `G32` | `kind:obj-weapon-magic-staff` | — | long | 0.2 | 1.2 | error |
| `G33` | `kind:obj-equipment-shield` | — | high | 0.2 | 0.6 | error |
| `G34` | `kind:obj-tool-long` | — | long | 0.3 | 1.2 | error |
| `G35` | `kind:obj-lighting-lantern` | — | high | 0.1 | 1.0 | error |
| `G36` | `kind:obj-lighting-torch` | — | high | 0.1 | 1.0 | error |
| `G37` | `kind:obj-lighting-candle` | — | high | 0.1 | 0.7 | error |
| `G38` | `kind:obj-pocketitem-coin` | `see G51` | longest | — | 0.2 | error |
| `G39` | `kind:obj-pocketitem-key` | — | longest | — | 0.2 | error |
| `G40` | `kind:obj-pocketitem-book` & closed | `see G50` | longest | 0.1 | 0.3 | manual |
| `G41` | `kind:obj-pocketitem-scroll` | — | longest | 0.1 | 0.3 | error |
| `G42` | `kind:env-flora-tree` | — | high | 0.6 | 2.4 | error |
| `G43` | `tag:char` humanoid, skeleton included | — | high | 0.4 | 0.8 | manual |

### 2.4 Size exemptions, boxes and part counts

| id | when | subject | assert | value | sev |
|---|---|---|---|---|---|
| `G44` | `kind:env-terrain-mountain` | — | exempt | `G13` | error |
| `G45` | hooped containers (`D06`) | `part:hoop` | range | 5–15% of longest, high | manual |
| `G46.1` | `kind:obj-container-barrel` | `dim:w` | max | 0.75 | error |
| `G46.2` | `kind:obj-container-barrel` | `part:side plank` | count-range | 8–14 | manual |
| `G46.3` | `kind:obj-container-barrel` | `tris` | range | 100–1500 | error |
| `G46.4` | `kind:obj-container-barrel` | `part:hoop` | count-max | 3 | manual |
| `G47` | `kind:obj-container-bucket` | `part:hoop` | count-max | 3 | manual |
| `G48` | `kind:obj-container-crate` & near-cube | `part:plank` | count-range | 3–7 side by side per face | manual |
| `G49.1` | `kind:obj-furniture`, except `G49.2` | model | fits | 1.2 × 1.2 × 1.2 | error |
| `G49.2` | `kind:obj-furniture-table` | model | fits | 2 × 2 × 0.5 | error |
| `G50` | `kind:obj-pocketitem-book` & open | `dim:longest` | see | `G40`, on the longest cover edge | manual |
| `G51` | `kind:obj-pocketitem-coin` & `tag:plural` | — | exempt | `G38` | error |
| `G52` | `kind:str-marker-flag` + `kind:str-stands` + `kind:obj-transport-accessory` | `part:sail, canopy, canvas` | max | 0.1 thick | manual |

---

## 3. Taxonomy

What a model *is*, before any material or colour question.

| id | when | subject | assert | value | sev |
|---|---|---|---|---|---|
| `T01` | `*` | `kind` | allow | a leaf may carry its material's name (`env-remains-bones`) | none |
| `T02` | `*` | `kind` | is | its parents implied, never tagged on top | error |
| `T03` | `kind=assy` | `kind` | is | distinct things in one top-level | manual |
| `T04` | `*` | `kind` | is | the deepest leaf that fits; the parent is "other" | manual |
| `T05` | `*` | `kind` | is | the one kind the appendix glossary resolves the noun to | manual |
| `T06.1` | `kind:env-terrain` | `kind` | is | ground mesh and cobbled path `env-terrain`, not `env-rock` | manual |
| `T06.2` | `kind:env-rock` | `kind` | is | placed body `env-rock`, cliff prop `env-rock-formation` | manual |
| `T07` | `*` | `kind` | not | decided by kit of origin | manual |
| `T08` | `*` | artist tag | is | from the kit, only for artists with several kits adopted | error |
| `T09` | `*` | `size` | is | measured, never hand-set | error |
| `T10` | `*` | `animation` | is | measured (Q03) | error |
| `T11` | `tag:ngons` | model | is | round cross-section, what `G01` counts on | manual |
| `T12` | `tag:plural` | model | is | several instances of one thing in one model | manual |
| `T13` | `mat:special` | one band | exempt | every rule that band trips | error |
| `T14` | `mat:special` | `special` | is | recorded with the band it covers and why (Q04) | error |
| `T15` | `tag:pickup` | model | is | sized to be seen and collected, not to stand in the world | manual |

---

## 4. Kind → material

What a kind is made of. Colour follows from section 5. Subject `model` = the
whole model; `mat:<id>` = the model's use of that material, refined to a
subtype; `part:<name>` = that piece of the mesh.

| id | when | subject | assert | material | sev |
|---|---|---|---|---|---|
| `M01` | hooped containers (`D06`) | `part:hoop` | is | `metal-iron` | manual |
| `M02` | `kind:obj-container-bottle` | model | one-of | `glass`, `ceramic` | error |
| `M03` | `kind:obj-container-bag` | `part:fastener, closure` | one-of | `rope`, `leather` | manual |
| `M04` | `kind:obj-kitchenware-tableware-plate` | model | one-of | `ceramic`, `metal-iron`, `wood` | error |
| `M05` | `kind:obj-kitchenware-tableware` mug, cup, tankard | `part:hoop, handle` | is | `metal-iron` | manual |
| `M06` | `kind:obj-kitchenware-tableware` | `mat:metal-iron` | is | `metal-iron-steel` | error |
| `M07` | `kind:obj-furniture` | model | is | `wood` | error |
| `M08` | `kind:obj-furniture` rug, carpet | model | is | `textile` | manual |
| `M09` | `kind:obj-furniture-seating` upholstered | model | is | `textile` | manual |
| `M10` | `kind:obj-weapon` + `kind:obj-tool` | `mat:metal-iron` | is | `metal-iron-steel` | error |
| `M11` | `kind:obj-weapon` + `kind:obj-tool` | `part:handle` | one-of | `wood`, `textile`, both | manual |
| `M12` | `kind:obj-weapon` | `part:strap` | one-of | `textile`, `leather` | manual |
| `M13` | `kind:obj-weapon-cannon` | `mat:metal-iron` | is | `metal-iron-cast` | error |
| `M14` | `kind:obj-equipment` | `mat:metal-iron` | is | `metal-iron-steel` | error |
| `M15` | `kind:obj-equipment-clothing` belt, shoe, strap | model | is | `leather` | manual |
| `M16` | `kind:obj-tool-hand` | `part:wood handle` | is | `wood-planks` | manual |
| `M17` | `kind:obj-tool-long` | `part:pole` | is | `wood-beam` | manual |
| `M18` | `kind:obj-tool-supplies` | `mat:metal-iron` | is | `metal-iron-wrought` | error |
| `M19` | `kind:obj-transport-accessory` | `part:sail` | is | `textile` | manual |
| `M20` | `kind:obj-pocketitem-coin` | model | is | `metal-gold` | error |
| `M21` | `kind:obj-pocketitem-key` | model | one-of | `metal-iron`, `metal-gold` | error |
| `M22` | `kind:obj-pocketitem-book` | `part:strap, band, binder, corner` | one-of | `leather`, `metal-iron` | manual |
| `M23` | `kind:obj-pocketitem-jewellery` | model | is | `metal-gold` with `gemstone` | error |
| `M24` | `kind:obj-resource-wood-log` + `kind:env-flora-deadwood-branch` + cut-face trunks | `part:cut face` | is | `wood-log` | manual |
| `M25` | `kind:obj-resource-wood-log` + `kind:env-flora-deadwood-branch` + cut-face trunks | `part:round side` | is | `wood-bark` | manual |
| `M26` | `kind:obj` bells | model | one-of | `metal-copper`, `metal-gold` | manual |
| `M27` | `kind:str` | `mat:metal-iron` | is | `metal-iron-cast` | error |
| `M28` | `kind:str-part-roof` | model | is | `ceramic` (colour half in `B65`) | error |
| `M29` | `kind:str-marker-flag` | model | is | `textile` | error |
| `M30` | `tag:char` | `mat:metal-iron` | is | `metal-iron-steel` | error |
| `M31` | `mat=metal-iron` | `mat:metal-iron` | is | `metal-iron-wrought`, where no row above sets a subtype | error |
| `M32` | hooped containers (`D06`) | model | expect | mainly `wood`, often `metal-iron` accents | warn |
| `M33` | `kind:obj-kitchenware-tableware` mug, cup, tankard | model | expect | `wood` | manual |
| `M34` | `kind:obj-kitchenware-cookware` & `mat:metal` | model | is | paired variants, one `metal-iron-steel` one `metal-iron-cast` | manual |
| `M35` | `kind:obj-tool` + `kind:obj-weapon` | `mat:metal` | is | `metal-iron` or deeper | error |
| `M36` | `kind:obj-weapon` + `kind:obj-tool` + `kind:obj-equipment-shield` | `part:grip, fastener, join` | expect | `textile`, `rope`, `leather` | manual |
| `M37` | `kind:obj-weapon` simple + `kind:obj-weapon-ranged-bow` | model | allow | `wood`, wholly or partly — widens `M35` | none |
| `M38` | `kind:obj-weapon` special | model | allow | `metal-gold`, `gemstone`, partly — widens `M35` | none |
| `M39` | `*` sticks, unworked poles | model | is | `wood-bark` | manual |
| `M40` | `*` fastener joining `stone`, `bone`, `metal-iron-steel` to `wood` | `part:fastener` | expect | `leather` | manual |
| `M41` | `kind:obj-transport-boat` + `kind:obj-transport-ship` | `mat:wood` | count-min | 2 | error |
| `M42` | `kind:str` | model | expect | mainly `wood`, then `stone`; `metal` sparingly | warn |
| `M43` | `kind:str-marker-sign` + `kind:str-barrier-post` + `kind:str-marker-flag` | `part:pole` | expect | `wood` | manual |
| `M44` | `*` | — | see | `M24`, `M25`; never the other way round | none |
| `M45` | `kind:obj` bells | model | not | `metal-iron` | manual |

---

## 5. Subject → colour

Subject `model` = the whole subject; `part:<name>` = that piece of the mesh.
Material rows first (material-tree order), then kind rows (kind-tree order); a
kind row overrides a material row.

| id | when | subject | assert | band | sev |
|---|---|---|---|---|---|
| `B01` | `mat=metal-iron-steel` | model | is | `nickel` | error |
| `B02` | `mat=metal-iron-wrought` | model | is | `basalt` | error |
| `B03` | `mat=metal-iron-cast` | model | is | `slate` | error |
| `B04` | `mat=metal-gold` | model | is | `amber` | error |
| `B05` | `mat=metal-copper` | model | is | `terracotta` | error |
| `B06` | `mat=wood-planks` | model | is | `tan` | error |
| `B07` | `mat=wood-worked` | model | is | `camel` | error |
| `B08` | `mat=wood-beam` | model | is | `chestnut` | error |
| `B09` | `mat=wood-bark` | model | is | `umber` | error |
| `B10` | `mat=stone-masonry` | model | one-of | `taupe`, `slate`, `nickel` | error |
| `B11` | `mat=stone-rock` | model | one-of | `nickel`, `taupe` | error |
| `B12` | `mat=stone-soil` | model | is | `taupe` | error |
| `B13` | `mat=paper` | model | is | `ivory` | error |
| `B14` | `mat=textile` | model | one-of | `ivory`, `hunter` | error |
| `B15` | `mat=leather` | model | is | `umber` | error |
| `B16` | `mat=ceramic` | model | one-of | `terracotta`, `ivory`, `taupe`, `sienna` | error |
| `B17` | `mat=bone` | model | is | `ivory` | error |
| `B18` | `mat=wax` | model | is | `ivory` | error |
| `B19` | `mat=wick` | model | is | `basalt` | error |
| `B20` | `mat=glass` & `size:m\|l` | model | is | `transparent` (Q05) | error |
| `B21` | `mat=glass` & `size:s` | model | one-of | `transparent`, `sienna`, `hunter` | error |
| `B22` | `mat=liquid` | model | one-of | `sienna`, `hunter`, `azure` | error |
| `B23` | `mat=rope` | model | is | `taupe` | error |
| `B24` | `mat=cork` | model | is | `taupe` | error |
| `B25` | `mat=gemstone` | model | one-of | `sienna`, `hunter`, `azure` | error |
| `B26` | `mat=skin` | model | one-of | `tan`, `taupe`, `umber` | error |
| `B27` | `kind:obj-kitchenware-tableware-plate` | `mat:ceramic` | one-of | `ivory`, `terracotta` | error |
| `B28` | `kind:obj-kitchenware-tableware` mug, cup, tankard | `mat:wood` | one-of | `camel`, `chestnut` | manual |
| `B29` | `kind:obj-kitchenware-cookware-pot` | `mat:ceramic` | is | `terracotta` | error |
| `B30` | `kind:obj-food` cheese | model | is | `amber` | manual |
| `B31` | `kind:obj-food-meat` | model | is | `sienna` | error |
| `B32` | `kind:obj-food-vegetable` carrot, pumpkin | model | is | `terracotta` | manual |
| `B33` | `kind:obj-food-grain` | model | one-of | `tan`, `camel`, `chestnut` | error |
| `B34` | `kind:obj-food-grain` wheat, straw | model | is | `tan` | manual |
| `B35` | `*` chocolate | model | is | `chestnut` | manual |
| `B36` | `kind:obj-weapon` + `kind:obj-tool` | `part:wrapped grip, binding` | is | `taupe` | manual |
| `B37` | `kind:obj-weapon-magic` & `mat:paper` | `part:cover` | one-of | `umber`, `sienna`, `hunter`, `slate` | manual |
| `B38` | `kind:obj-transport` | `mat:wood` | one-of | `camel`, `chestnut` | error |
| `B39` | `kind:obj-transport-accessory` sails + `kind:str-stands` canvas | model | one-of | `ivory`, striped `sienna` and `ivory` | manual |
| `B40` | `kind:obj-pocketitem-book` | `part:cover` | one-of | `umber`, `sienna`, `hunter`, `slate` | manual |
| `B41` | `kind:obj-pocketitem-scroll` | model | is | `ivory` | error |
| `B42` | `kind:obj-pocketitem-scroll` | `part:text` | is | `slate` | manual |
| `B43` | `kind:obj-pocketitem-scroll` | `part:accent` | one-of | `sienna`, `hunter`, `azure` | manual |
| `B44` | `kind:str` | `mat:glass` | is | `transparent` | error |
| `B45` | `kind:env-flora` | `part:stem, leaf` | is | `moss` | manual |
| `B46` | `kind:env-flora-tree` | model | is | `hunter` | error |
| `B47` | `kind:env-fungi` | `part:stem` | is | `ivory` | manual |
| `B48` | `kind:env-fungi` | `part:cap` | one-of | `sienna`, `camel` | manual |
| `B49` | `*` | `part:dried stalk` | is | `taupe` | manual |
| `B50` | `*` | `part:flame, glow, light` | is | `amber` | manual |
| `B51` | `mat=wood-log` | model | one-of | any brown band (Q09) | manual |
| `B52` | `mat:metal-iron` | `bands` | not | two `metal-iron` bands merged into one | error |
| `B53.1` | `kind:str-part-wall` + `kind:str-part-floor` + `kind:obj-resource-stone` bricks | `mat:stone` | is | `stone-masonry` | manual |
| `B53.2` | `kind:env-terrain-ground` sand, dirt | `mat:stone` | is | `stone-soil` | manual |
| `B54` | `tag:char` & `kind:obj-equipment-clothing`, + sail/canvas striping | `mat:textile` | allow | `sienna` — widens `B14` | none |
| `B55` | `kind:obj-transport-ship` + `kind:obj-transport-boat` + `kind:obj-transport-accessory` | `mat:textile` | allow | `slate` — widens `B14` | none |
| `B56` | `kind:obj-weapon` + `kind:obj-tool` | `part:wrapped grip, binding` | range | UV 0.02–0.40 of the `taupe` band | manual |
| `B57` | `mat=wax` | model | see | `B18` is `obj-lighting-candle` wax | none |
| `B58` | `kind:obj-food` | model | allow | any band; its material decides nothing | none |
| `B59` | `kind:obj-food` fish | model | expect | `nickel`, `basalt`, `slate`, `azure` | manual |
| `B60` | `kind:obj-food-vegetable` | model | expect | `moss` | warn |
| `B61` | `kind:env-flora-tree-palm` | model | exempt | `B46` | error |
| `B62` | `kind:env-flora-plant-flower` + `kind:env-flora-plant-cactus` | `part:flower` | allow | any band | none |
| `B63` | `kind:env-fauna` | model | allow | any band | none |
| `B64` | `*` | `part:flame, glow, light` | is | UVs spread wide across the `amber` band (Q10) | manual |
| `B65` | `kind:str-part-roof` | model | is | `sienna` | error |

---

## 6. Governance & process

Who decides, and what happens around the asset. Every row is `sev process`.

| id | when | subject | rule |
|---|---|---|---|
| `P01` | `mat:special`, `tag:hero` | PO | only the PO assigns them |
| `P02` | adding to the catalogue | Claude | proposes `hero` |
| `P03` | `mat:special` | Claude | asks only after recolour and a kind or material change failed |
| `P04` | outline on an asset | Claude | tells the PO |
| `P05` | creating an asset | Claude | renders and looks at the reference assets first |
| `P06` | validating | Claude | renders 2+ references of the group beside it, same scale |
| `P07` | `kind=assy` | — | not validated directly |
| `P08` | importing a pack | — | one scale factor for the whole pack for now |
| `P09` | importing, 2 colours | — | keeps 2 |
| `P09.1` | importing, 3–4 colours | — | may drop 1 |
| `P09.2` | importing, 5 colours | — | may drop 2 |
| `P09.3` | importing, 6+ colours | — | keeps ≥ 3 (Q11) |
| `P10` | a leaf below 6 models | — | not retired for that |
| `P11` | `tag:stacks` | — | removed; `plural` replaces it |

---

## 7. Variants

Which models sit together as one entry and which stand apart. Groups live in
`catalog/asset_variants.json`; `build-catalog.mjs` attaches them to the
catalogue. A group exists for one of these reasons.

| id | reason | shared | differs |
|---|---|---|---|
| `V01` | material | kind, size, shape | the material it is made of |
| `V02` | recolour | kind, size, shape, material | band |
| `V03` | size | kind, shape, material, band | extents, by redesign |
| `V04` | state | kind, material | a part moved, removed, filled or recoloured |
| `V05` | plural | kind, material, band | how many instances |

| id | when | subject | assert | value | sev |
|---|---|---|---|---|---|
| `V06` | a group | `type` | one-of | `V01`–`V05`; without one, dedupe (Q12) | error |
| `V07` | a group | `kits` | is | one kit; a second only for the same artist, never across artists without the PO | error |
| `V08` | a group | `kind` | is | the same for every member | error |
| `V09` | assets entering | Claude | is | name and tris propose, shape and a render confirm | process |
| `V10` | a kind | grouping | is | the more models of a kind, the more sit inside a group | intent |
| `V11` | a group | reasons | is | reasons stack; the more and wider, the sooner its own row | intent |
| `V12` | a group | difference | is | judged by how it reads, not how far it measures | intent |
| `V13` | `V03` | member | is | redesigned at that size: a longer ladder gains rungs | intent |
| `V14` | `V03` | member | not | scaled, globally or on one axis | intent |
| `V15` | kinds wanting variety | `V01`, `V02` | is | made on purpose (`M34` is one) | intent |
| `V16` | a ship gaining a mast and sails | — | see | `V03` and `V11` both; goes to the PO | process |

A variant is what keeps a kind from ballooning. Filled and empty, open and
closed, lit and unlit, with lid, without lid and the lid alone each double a
group; left apart, ten potions and a shelf of pans crowd out everything else.
The same reasons that justify a variant are what justify the model being in
the catalogue at all, so the judgement runs both ways: too alike and it is a
dedupe, too far apart and it is its own row.

---

## 8. Open questions

Each one blocks a rule from being checkable, or leaves two readings of it. The
`sev` of the rule stays as written until the PO answers.

| id | rule | question |
|---|---|---|
| `Q01` | `D04`, `G03` | D04 clamps w × d at 0.49 and h at 0.7, but its own text says anything under 0.5 × 0.5 × 0.5 is judged as that size; and no rule names tri density, while `G03` counts per grid cell and `catalog.json` carries `budgetPerUnit` 2000 and a measured `dens`. Which of the three is the budget? |
| `Q02` | `G04` | "Only deliberately, for a functional reason" has no token a model can carry, so every ungrounded or off-centre model fails. Which tag marks the deliberate ones? |
| `Q03` | `T10` | There is no `animation` tag and no animation field in `catalog.json`. Where is it measured to? |
| `Q04` | `T14` | A `special` must record its band and reason, but no field holds either. Where? |
| `Q05` | `B20`, `B21`, `B44` | `transparent` is used as a band but is not in the colour-band table and is not on the colormap. Is it a band, or the absence of one? |
| `Q06` | `D02`, `G26`–`G34` | "Long" is the main axis, which is not recorded; only `wdh` is. Record the axis, or read these nine rows as `longest`? |
| `Q07` | 35 `part:` rows | No part of a mesh is recorded per model, so every part rule is unlintable. Close the part list and record it, or leave these as manual review? |
| `Q08` | `F02` | The field said "closed, 36"; `tags.json` holds 37 materials, including `metal-silver`, which is not in the material tree. Also `foliage`, `plastic`, `emissive`, `food`, `vegetation` and `special` have no colour row in §5, so §5 is not total over the materials. |
| `Q09` | `B51` | "Any brown" names no band. `tan`, `camel`, `chestnut` and `umber` are the brown bands — is that the set, and may a log mix them? |
| `Q10` | `I07`, `B64` | "Spread maintained" and "spread wide" have no number, while `catalog.json` records `grad` and `spread` per band. What is the threshold? |
| `Q11` | `P09.3` | 5 colours may drop to 3, and 6+ must keep ≥ 3 — so more source colours allow more dropping. Intended? |
| `Q12` | `V06` | `asset_variants.json` types are `detail-variant`, `color-variant` and `maatvariant`, none of them `V01`–`V05`. The spec is the target, so the data needs migrating: which of V01–V05 does `detail-variant` become? |
| `Q13` | `F02`–`F05` | `tags.json` carries a fifth field, `use` (eight `use:` tags), and a `scene` kind. Neither appears in this document. |
| `Q14` | all | Rule ids quoted in `tags.json` descriptions (M11, M12, M13, M28, M41, M42, M44, T15, M20) point at an older numbering. They need remapping to the ids here. |
| `Q15` | `M28`, `B65` | `M28` set a material and a band in one cell; the band is split out as `B65`. Confirm the split, and the id. |
| `Q16` | `G02`, `G52` | Nothing may be thinner than 0.015, yet flags, sails, canopies and canvas must be under 0.1 thick — the two only agree if cloth is not a solid piece. Which is it? |

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
