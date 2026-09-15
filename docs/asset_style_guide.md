# Bible

Scope: items in the catalogue.

## 0. How to read a rule

**[F01] Rule format.** Every rule about a model is one table row. A rule table's
columns are exactly these, in this order:

`id | when | except | subject | assert | value | sev | check`

No rule table drops, renames, adds or reorders a column. A table whose first two
columns are not `id` and `when` is reference data, not rules: the term,
definition, band, tag-field and variant-reason tables. A rule's `when`, `subject`
and `value` cells together are capped at 200 characters.

Ids are stable. A withdrawn id is never reused and never renumbered; the
withdrawn list at the end of this section says where each one went.

**[F13] What is a row and what is not.** A table row is about one model, and a
`when` selector is matched against models. Everything that is about something
else is a list, not a row: what holds of a variant group (§7), and what people
and the build do (§3, §6, §7). A list item keeps its id and says what it asks
for; where one is checked against `catalog/asset_variants.json`, the item names
its `sev` and `check`.

**[F06] Selector (`when`, `except`).** A selector is terms joined by `+` (any
of them matches) or `&` (all of them must). `&` binds tighter than `+`; there
are no brackets. A term is one of:

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

A term's value may list alternatives with `\|`: `size:m\|l`. The pipe is
escaped in this document because the tables are markdown; the escape is not
part of the term.

An empty `except` cell (`—`) means no exemption; `except` holds a selector and
nothing else. Words in a `when` or `except` cell that are not terms (`mug, cup,
tankard`, `upholstered`, `simple`) narrow the row further than the terms do. The
linter selects on the terms, which is a superset, and Claude judges the words
against that set; the row is `check review`.

**[F07] Subject.** What the assert is about. A closed set: `model`, any recorded
field of F11 (`kind`, `size`, `tags`, `mat`, `bands`, `calls`, `tris`, `dens`,
`grad`, `anim`, `minEdge`, `grounded`, `centered`, `specialBand`, `specialWhy`),
`dim:w`, `dim:d`, `dim:high`, `dim:longest`, `band`, `mat:<id>`,
`part:<name> (<presence>)`, `—`.

`mat` is the model's material-tag count; `mat:<id>` is the model's use of that
material, refined to a subtype; `bands` is its band count, `band` each band it
carries. A `part:` subject names a piece of the mesh. No field names parts yet,
so a `part:` row is `check review`: the linter selects the models of its `when`
and hands them to Claude with the part to look for. Two model-level checks also
fall out of the row on their own — see F12. Presence is `always`, `usual` or
`sometimes`: whether a model of that kind has the part at all.

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
| `expect` | token list | subject is normally one of the tokens; always `sev warn` |
| `default` | token | applies only where no more specific row constrains the same subject |
| `see` | rule id | the row defers to that rule; it checks nothing |
| `note` | prose | a reading the linter never evaluates; always `check none` |

A value naming a material or a kind may take the same `:` / `=` distinction as
a selector: a trailing `:` means that id or any descendant (`metal-iron:`), a
bare id means exactly that id (`metal-iron`). In a band list, the token `any`
means every band of the band table.

**[F09] Severity and check.** Two columns, two questions.

| column | values | means |
|---|---|---|
| `sev` | `error` | fails the build; on a `review` row, what Claude reports as broken fails it |
| | `warn` | reported, does not fail; every `expect` row is `warn` |
| | `—` | the row asserts nothing to fail: `check` is `intent` or `none` |
| `check` | `auto` | the linter evaluates it |
| | `review` | the linter selects the models the row covers and hands that list to Claude, which decides each one |
| | `intent` | how a model should look; Claude judges it off a render, and it is reported rather than failed |
| | `none` | a `see` or `note` row; nothing to check |

One invariant, checkable over this document: `sev —` forces `check` to be
`intent` or `none`. `review` is never a dead end. A `review` row becomes `auto`
the day its selector and value are written in terms and the field it reads is
recorded; meanwhile its `when` already narrows the work. F11 says where each
field is read from.

**[F10] Exemption.** A model leaves a rule only through that rule's `except`
cell, or through material tag `special`, whose band is exempt from every rule
that band trips. There is no other escape: no row exempts another row.

**[F14] Precedence.** Document order carries no meaning. Where two rows
constrain the same subject of the same model, specificity decides: a kind row
beats a material row; among kind rows the deeper kind wins; among material
rows the deeper material wins. The winning row's value replaces the loser's,
so every row states its complete set. Rows constraining different subjects all
hold together. Two rows of equal specificity on one subject are a defect in
this document, not a judgement for the linter.

**[F15] `special` in the counts.** `mat` is counted without `special`. Band
maxima ignore the `special` band; band minima keep it.

**[F11] Units and sources.** Lengths are catalogue units, measured off the
mesh as recorded in `catalog/catalog.json`: `wdh` (w, d, h), `tris`, `dens`,
`grad`, `anim`, `mat`, `bands`, `calls`, `grounded`, `centered`, `minEdge`,
`spread`, `colors`, `size`, `kind`, `tags`, `specialBand`, `specialWhy`. Three
things are read off the glb itself and held in no field: `alphaMode`,
`roughnessFactor` with `metallicFactor`, and shadow casting. Group facts are
read from `catalog/asset_variants.json`.

**[F12] What a part rule still checks.** Five checks are derived from the
rows, with no rule-specific logic:

| id | derived from | what it checks | sev |
|---|---|---|---|
| `F12.1` | a `part:… (always)` row | the model carries that rule's material | error |
| `F12.2` | a `part:… (usual)` row | the model carries that rule's material | warn |
| `F12.3` | every row for the kind | the model's materials are among those the kind's rows name, where the kind is `closed` | error |
| `F12.4` | §5 and the model's materials | the model's bands are among those §5 allows for its materials and kind | error |
| `F12.5` | the material tree | no model carries a material tag and an ancestor of it | error |

`F12.4` needs no part data at all: §5 gives every material a band, so the union
over a model's materials bounds its bands whether or not the parts are known.
It is also why §5 uses `one-of` throughout: a §5 row names the set a subject
may draw from, never an equality. A material with no §5 row is skipped,
not failed. A `sometimes` row derives no material check — the part may be
absent — so it stays `review`, and the linter hands Claude the models its `when`
selects.

Definitions:

| id | term | definition |
|---|---|---|
| `D01` | high | the bounding-box Y extent |
| `D03` | kind | a kind names the leaf and its children |
| `D04` | tri density | `dens`: tris ÷ (w × d × h), triangles per 1 × 1 × 1 cell |
| `D05` | vegetation | a plant's non-green matter; fungi are not vegetation |
| `D06` | hooped containers | `obj-container-` `barrel`, `chest`, `bucket`, `crate` |
| `D07` | variant group | models that read as one thing; `main` is the one shown |
| `D08` | reads as | what a player notices at a glance, not what numbers differ by |
| `D09` | longest | an object's largest extent |
| `D10` | near-cube | extents within 15% of each other |

Colour bands. The band name is the token used in `value`. The lane is its
`column,row` cell of the 16 × 4 grid of `kits/colormap.png`, the same key
`catalog.json` uses in `spread`; the linter matches on the lane. A band is
named by its name or its lane, and by nothing else. `transparent` is a band
with no lane: it names a surface the colormap does not paint. Lane 3,2
(#979ebd) is painted but unused; no band names it, so `I06` forbids it.

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
| `F05` | `tag` | kit/artist, theme, flags | open |

Withdrawn ids:

| id | went to |
|---|---|
| `D02` | `D09` — `long` and `longest` are the same extent |
| `T02` | `F12.5` — a tree invariant, not a per-model rule |
| `T14` | `T14.1`, `T14.2` — one recorded field per row |
| `T13` | `F10` — the `special` escape is the exemption rule |
| `G11`, `G12` | `F15` — how `special` counts, not a rule |
| `G04` | `G04.1`, `G04.2` — one predicate per row |
| `G10` | `G10.1`, `G10.2` — the cap is a number, not `G09` + 1 |
| `G02` | `G02`, `G02.1` — cloth has its own floor |
| `G44` | `G13`'s `except` cell |
| `G51` | `G38`'s `except` cell |
| `B61` | `B46`'s `except` cell |
| `B53.1`, `B53.2` | `M46`, `M47` — they assert a material, not a band |
| `V01`–`V05` | `D11`–`D15` — they are definitions, not rules |
| `P11` | dropped; `tag:stacks` is gone and `plural` replaces it, as `tags.json` records |

---

## 1. Intent

How a model should look and draw.

| id | when | except | subject | assert | value | sev | check |
|---|---|---|---|---|---|---|---|
| `I01` | `*` | — | model | is | chunky, caricatured; not thin, not primitive | — | intent |
| `I02` | `*` | — | model | is | clean facets, chamfered edges, rounded-soft | — | intent |
| `I03` | `!kind:env` | — | model | is | few details | — | intent |
| `I04` | `*` | — | model | is | invented before 1850 | — | intent |
| `I05` | `*` | — | model | is | like its deepest kind in shape, colour, style | — | intent |
| `I06` | `*` | — | `band` | one-of | `any` | error | auto |
| `I07` | `*` | — | `grad` | not | 0 | error | auto |
| `I08.1` | `!mat:glass` | — | model | is | `alphaMode` `OPAQUE` | error | auto |
| `I08.2` | `*` | — | model | is | `roughnessFactor` 1, `metallicFactor` 0 | error | auto |
| `I09.1` | `mat:glass` | — | `calls` | min | 2 | error | auto |
| `I09.2` | `*` | — | model | is | 2+ calls only for moving features or glass | error | review |
| `I10` | `*` | — | model | not | outline, unless the outline is a core feature | error | review |
| `I11` | `*` | — | model | is | no shadow casting | error | auto |

---

## 2. Geometry & budget

Everything measured off the mesh: extents, counts, pivots, band counts.

### 2.1 Construction & placement

| id | when | except | subject | assert | value | sev | check |
|---|---|---|---|---|---|---|---|
| `G01` | `tag:ngons` | `tag:hero` | model | count-range | 8–12 flat pieces per full circle | warn | review |
| `G02` | `*` | `mat:textile` | `minEdge` | min | 0.015 | error | auto |
| `G02.1` | `mat:textile` | — | `minEdge` | min | 0.01 | error | auto |
| `G03` | `*` | `kind:char` + `tag:plural` | `dens` | max | 5000 | warn | auto |
| `G04.1` | `*` | `tag:floating` | `grounded` | is | true | error | auto |
| `G04.2` | `*` | `tag:offcenter` | `centered` | is | true | error | auto |
| `G05` | `*` | — | `part:split node` (sometimes) | is | origin at the joint | error | review |

### 2.2 Band counts

| id | when | except | subject | assert | value | sev | check |
|---|---|---|---|---|---|---|---|
| `G06` | `*` | — | `mat` | min | 1 | error | auto |
| `G07` | `*` | — | `bands` | min | `mat` | error | auto |
| `G08.1` | `*` | — | `bands` | max | `mat` × 2 | error | auto |
| `G08.2` | `mat:food` + `mat:vegetation` + `kind:env-fauna` | — | `bands` | max | `mat` × 3 | error | auto |
| `G08.3` | `mat:food` & `tag:decorated` | — | `bands` | max | `mat` × 5 | error | auto |
| `G09.1` | `!kind:char` | `size:l` & `mat>=5` | `bands` | max | 5 | error | auto |
| `G09.2` | `kind:char` | `size:l` & `mat>=5` | `bands` | max | 6 | error | auto |
| `G10.1` | `!kind:char` & `size:l` & `mat>=5` | — | `bands` | max | 6 | error | auto |
| `G10.2` | `kind:char` & `size:l` & `mat>=5` | — | `bands` | max | 7 | error | auto |

### 2.3 Size

| id | when | except | subject | assert | value | sev | check |
|---|---|---|---|---|---|---|---|
| `G13` | `*` | `kind:env-terrain-mountain` | `dim:high` | max | 6 | error | auto |
| `G14` | `kind:obj-container-chest` & with lid | — | `dim:high` | range | 0.2–0.5 | error | review |
| `G15` | `kind:obj-container-barrel` | — | `dim:high` | range | 0.2–0.8 | error | auto |
| `G16` | `kind:obj-container-bucket` | — | `dim:high` | range | 0.1–0.4 | error | auto |
| `G17` | `kind:obj-container-crate` & `D10` | — | `dim:high` | range | 0.2–0.8 | error | auto |
| `G18` | `kind:obj-container-bottle` | — | `dim:high` | range | 0.1–0.4 | error | auto |
| `G19` | `kind:obj-container-pot` | — | `dim:high` | range | 0.2–0.4 | error | auto |
| `G20` | `kind:obj-kitchenware-tableware-cutlery` | — | `dim:longest` | range | 0.1–0.4 | error | auto |
| `G21` | `kind:obj-kitchenware-tableware-plate` | — | `dim:longest` | range | 0.1–0.4 | error | auto |
| `G22` | `kind:obj-kitchenware-cookware-pan` & with lid | — | `dim:high` | max | 0.4 | error | review |
| `G23` | `kind:obj-kitchenware-cookware-pot` & with lid | — | `dim:high` | max | 0.4 | error | review |
| `G24` | `kind:obj-furniture-seating` | — | `dim:high` | range | 0.2–0.7 | error | auto |
| `G25` | `kind:obj-furniture-table` | — | `dim:high` | min | 0.2 | error | auto |
| `G26` | `kind:obj-weapon-melee-sword` | — | `dim:longest` | range | 0.4–1.0 | error | auto |
| `G27` | `kind:obj-weapon-melee-dagger` | — | `dim:longest` | range | 0.1–0.5 | error | auto |
| `G28` | `kind:obj-weapon-melee-axe` | — | `dim:longest` | range | 0.2–0.8 | error | auto |
| `G29` | `kind:obj-weapon-melee-hammer` | — | `dim:longest` | range | 0.2–0.8 | error | auto |
| `G30` | `kind:obj-weapon-ranged-bow` | — | `dim:longest` | range | 0.4–1.0 | error | auto |
| `G31` | `kind:obj-weapon-ranged-crossbow` | — | `dim:longest` | range | 0.4–1.0 | error | auto |
| `G32` | `kind:obj-weapon-magic-staff` | — | `dim:longest` | range | 0.2–1.2 | error | auto |
| `G33` | `kind:obj-equipment-shield` | — | `dim:high` | range | 0.2–0.6 | error | auto |
| `G34` | `kind:obj-tool-long` | — | `dim:longest` | range | 0.3–1.2 | error | auto |
| `G35` | `kind:obj-lighting-lantern` | — | `dim:high` | range | 0.1–1.0 | error | auto |
| `G36` | `kind:obj-lighting-torch` | — | `dim:high` | range | 0.1–1.0 | error | auto |
| `G37` | `kind:obj-lighting-candle` | — | `dim:high` | range | 0.1–0.7 | error | auto |
| `G38` | `kind:obj-pocketitem-coin` | `tag:plural` | `dim:longest` | max | 0.2 | error | auto |
| `G39` | `kind:obj-pocketitem-key` | — | `dim:longest` | max | 0.2 | error | auto |
| `G40` | `kind:obj-pocketitem-book` & closed | — | `dim:longest` | range | 0.1–0.3 | error | review |
| `G41` | `kind:obj-pocketitem-scroll` | — | `dim:longest` | range | 0.1–0.3 | error | auto |
| `G42` | `kind:env-flora-tree` | — | `dim:high` | range | 0.6–2.4 | error | auto |
| `G43` | `kind:char` humanoid, skeleton included | — | `dim:high` | range | 0.4–0.8 | error | review |

### 2.4 Boxes and part counts

| id | when | except | subject | assert | value | sev | check |
|---|---|---|---|---|---|---|---|
| `G45` | `D06` | — | `part:hoop` (usual) | range | 5–15% of longest, high | error | review |
| `G46.1` | `kind:obj-container-barrel` | — | `dim:w` | max | 0.75 | error | auto |
| `G46.2` | `kind:obj-container-barrel` | — | `part:side plank` (always) | count-range | 8–14 | error | review |
| `G46.3` | `kind:obj-container-barrel` | — | `tris` | range | 100–1500 | error | auto |
| `G46.4` | `kind:obj-container-barrel` | — | `part:hoop` (always) | count-max | 3 | error | review |
| `G47` | `kind:obj-container-bucket` | — | `part:hoop` (always) | count-max | 3 | error | review |
| `G48` | `kind:obj-container-crate` & `D10` | — | `part:plank` (always) | count-range | 3–7 side by side per face | error | review |
| `G49.1` | `kind:obj-furniture` | `kind:obj-furniture-table` | model | fits | 1.2 × 1.2 × 1.2 | error | auto |
| `G49.2` | `kind:obj-furniture-table` | — | model | fits | 2 × 2 × 0.5 | error | auto |
| `G50` | `kind:obj-pocketitem-book` & open | — | `dim:longest` | see | `G40`, on the longest cover edge | — | none |
| `G52` | `kind:str-marker-flag` + `kind:str-stands` + `kind:obj-transport-accessory` | — | `part:sail, canopy, canvas` (sometimes) | range | 0.01–0.05 thick | error | review |

---

## 3. Taxonomy

What a model *is*, before any material or colour question.

| id | when | except | subject | assert | value | sev | check |
|---|---|---|---|---|---|---|---|
| `T01` | `*` | — | `kind` | note | a leaf may carry its material's name (`env-remains-bones`) | — | none |
| `T03` | `kind=assy` | — | `kind` | is | distinct things in one top-level | error | review |
| `T04` | `*` | — | `kind` | is | the deepest leaf that fits; the parent is "other" | error | review |
| `T05` | `*` | — | `kind` | is | the one kind the appendix glossary resolves the noun to | error | review |
| `T06.1` | `kind:env-terrain` | — | `kind` | is | ground mesh and cobbled path `env-terrain`, not `env-rock` | error | review |
| `T06.2` | `kind:env-rock` | — | `kind` | is | placed body `env-rock`, cliff prop `env-rock-formation` | error | review |
| `T07` | `*` | — | `kind` | not | decided by kit of origin | error | review |
| `T08` | `*` | — | `tags` | is | the artist tag from the kit, only for artists with several kits adopted | error | review |
| `T11` | `tag:ngons` | — | model | is | round cross-section, what `G01` counts on | error | review |
| `T12` | `tag:plural` | — | model | is | several instances of one thing in one model | error | review |
| `T14.1` | `mat:special` | — | `specialBand` | one-of | `any` | error | auto |
| `T14.2` | `mat:special` | — | `specialWhy` | not | empty | error | auto |
| `T15` | `tag:pickup` | — | model | is | sized to be seen and collected, not to stand in the world | error | review |

Building the catalogue:

- **`T09`** — `size` is measured, never hand-set.
- **`T10`** — `anim` is read off the glb, never hand-set.

---

## 4. Kind → material

What a kind is made of. Colour follows from section 5.

| id | when | except | subject | assert | value | sev | check |
|---|---|---|---|---|---|---|---|
| `M01.1` | `kind:obj-container-barrel` | — | `part:hoop` (always) | is | `metal-iron` | error | review |
| `M01.2` | `kind:obj-container-bucket` | — | `part:hoop` (always) | is | `metal-iron` | error | review |
| `M01.3` | `kind:obj-container-chest` | — | `part:hoop` (usual) | is | `metal-iron` | error | review |
| `M01.4` | `kind:obj-container-crate` | — | `part:hoop` (sometimes) | is | `metal-iron` | error | review |
| `M02` | `kind:obj-container-bottle` | — | model | any-of | `glass`, `ceramic` | error | auto |
| `M03` | `kind:obj-container-bag` | — | `part:fastener, closure` (sometimes) | any-of | `rope`, `leather` | error | review |
| `M04` | `kind:obj-kitchenware-tableware-plate` | — | model | any-of | `ceramic`, `metal-iron:`, `wood:` | error | auto |
| `M05` | `kind:obj-kitchenware-tableware` mug, cup, tankard | — | `part:hoop, handle` (sometimes) | is | `metal-iron:` | error | review |
| `M06` | `kind:obj-kitchenware-tableware` | — | `mat:metal-iron` | is | `metal-iron-steel` | error | auto |
| `M07` | `kind:obj-furniture` | rug, carpet + upholstered | model | any-of | `wood:` | error | review |
| `M08` | `kind:obj-furniture` rug, carpet | — | model | any-of | `textile` | error | review |
| `M09` | `kind:obj-furniture-seating` upholstered | — | model | any-of | `textile` | error | review |
| `M10` | `kind:obj-weapon` + `kind:obj-tool` | — | `mat:metal-iron` | is | `metal-iron-steel` | error | auto |
| `M11` | `kind:obj-weapon` + `kind:obj-tool` | — | `part:handle` (usual) | any-of | `wood:`, `textile` | error | review |
| `M12` | `kind:obj-weapon` | — | `part:strap` (sometimes) | any-of | `textile`, `leather` | error | review |
| `M13` | `kind:obj-weapon-cannon` | — | `mat:metal-iron` | is | `metal-iron-cast` | error | auto |
| `M14` | `kind:obj-equipment` | — | `mat:metal-iron` | is | `metal-iron-steel` | error | auto |
| `M15` | `kind:obj-equipment-clothing` belt, shoe, strap | — | model | any-of | `leather` | error | review |
| `M16` | `kind:obj-tool-hand` | — | `part:wood handle` (usual) | is | `wood-planks` | error | review |
| `M17` | `kind:obj-tool-long` | — | `part:pole` (always) | is | `wood-beam` | error | review |
| `M18` | `kind:obj-tool-supplies` | — | `mat:metal-iron` | is | `metal-iron-wrought` | error | auto |
| `M19` | `kind:obj-transport-accessory` | — | `part:sail` (sometimes) | is | `textile` | error | review |
| `M20` | `kind:obj-pocketitem-coin` | — | model | any-of | `metal-gold` | error | auto |
| `M21` | `kind:obj-pocketitem-key` | — | model | any-of | `metal-iron:`, `metal-gold` | error | auto |
| `M22` | `kind:obj-pocketitem-book` | — | `part:strap, band, binder, corner` (usual) | any-of | `leather`, `metal-iron:` | error | review |
| `M23` | `kind:obj-pocketitem-jewellery` | — | model | all-of | `metal-gold`, `gemstone` | error | auto |
| `M24` | `kind:obj-resource-wood-log` + `kind:env-flora-deadwood-branch` + cut-face trunks | — | `part:cut face` (always) | is | `wood-log` | error | review |
| `M25` | `kind:obj-resource-wood-log` + `kind:env-flora-deadwood-branch` + cut-face trunks | — | `part:round side` (always) | is | `wood-bark` | error | review |
| `M26` | `kind:obj` bells | — | model | any-of | `metal-copper`, `metal-gold` | error | review |
| `M27` | `kind:str` | — | `mat:metal-iron` | is | `metal-iron-cast` | error | auto |
| `M28` | `kind:str-part-roof` | — | model | any-of | `ceramic` | error | auto |
| `M29` | `kind:str-marker-flag` | — | model | any-of | `textile` | error | auto |
| `M30` | `kind:char` | — | `mat:metal-iron` | is | `metal-iron-steel` | error | auto |
| `M31` | `mat=metal-iron` | — | `mat:metal-iron` | default | `metal-iron-wrought` | error | auto |
| `M32` | `D06` | — | model | expect | mainly `wood`, often `metal-iron` accents | warn | review |
| `M33` | `kind:obj-kitchenware-tableware` mug, cup, tankard | — | model | expect | `wood:` | warn | review |
| `M34` | `kind:obj-kitchenware-cookware` & `mat:metal` | — | model | is | paired variants, one `metal-iron-steel` one `metal-iron-cast` | error | review |
| `M35` | `kind:obj-tool` + `kind:obj-weapon` | — | `mat:metal` | is | `metal-iron:` | error | auto |
| `M36` | `kind:obj-weapon` + `kind:obj-tool` + `kind:obj-equipment-shield` | — | `part:grip, fastener, join` (usual) | expect | `textile`, `rope`, `leather` | warn | review |
| `M37` | `kind:obj-weapon` simple + `kind:obj-weapon-ranged-bow` | — | model | note | `wood:` wholly or partly is fine; `M35` constrains only the metal | — | none |
| `M38` | `kind:obj-weapon` special | — | `mat:metal` | one-of | `metal-iron:`, `metal-gold` | error | review |
| `M39` | `*` sticks, unworked poles | — | model | any-of | `wood-bark` | error | review |
| `M40` | `*` fastener joining `stone`, `bone`, `metal-iron-steel` to `wood` | — | `part:fastener` (sometimes) | expect | `leather` | warn | review |
| `M41` | `kind:obj-transport-boat` + `kind:obj-transport-ship` | — | `mat:wood` | count-min | 2 | error | auto |
| `M42` | `kind:str` | — | model | expect | mainly `wood`, then `stone`; `metal` sparingly | warn | review |
| `M43` | `kind:str-marker-sign` + `kind:str-barrier-post` + `kind:str-marker-flag` | — | `part:pole` (usual) | expect | `wood:` | warn | review |
| `M44` | `*` | — | — | see | `M24`, `M25`; never the other way round | — | none |
| `M45` | `kind:obj` bells | — | model | not | `metal-iron:` | error | review |
| `M46` | `kind:str-part-wall` + `kind:str-part-floor` + `kind:obj-resource-stone` bricks | — | `mat:stone` | is | `stone-masonry` | error | review |
| `M47` | `kind:env-terrain-ground` sand, dirt | — | `mat:stone` | is | `stone-soil` | error | review |

---

## 5. Subject → colour

Every row names the set of bands its subject may draw from; F12.4 bounds a
model's bands by the union over the rows that match it.

| id | when | except | subject | assert | value | sev | check |
|---|---|---|---|---|---|---|---|
| `B01` | `mat=metal-iron-steel` | — | model | one-of | `nickel` | error | auto |
| `B02` | `mat=metal-iron-wrought` | — | model | one-of | `basalt` | error | auto |
| `B03` | `mat=metal-iron-cast` | — | model | one-of | `slate` | error | auto |
| `B04` | `mat=metal-gold` | — | model | one-of | `amber` | error | auto |
| `B05` | `mat=metal-copper` | — | model | one-of | `terracotta` | error | auto |
| `B06` | `mat=wood-planks` | — | model | one-of | `tan` | error | auto |
| `B07` | `mat=wood-worked` | — | model | one-of | `camel` | error | auto |
| `B08` | `mat=wood-beam` | — | model | one-of | `chestnut` | error | auto |
| `B09` | `mat=wood-bark` | — | model | one-of | `umber` | error | auto |
| `B51` | `mat=wood-log` | — | model | one-of | `tan`, `camel`, `chestnut` | error | auto |
| `B10` | `mat=stone-masonry` | — | model | one-of | `taupe`, `slate`, `nickel` | error | auto |
| `B11` | `mat=stone-rock` | — | model | one-of | `nickel`, `taupe` | error | auto |
| `B12` | `mat=stone-soil` | — | model | one-of | `taupe` | error | auto |
| `B13` | `mat=paper` | — | model | one-of | `ivory` | error | auto |
| `B14` | `mat=textile` | — | model | one-of | `ivory`, `hunter` | error | auto |
| `B15` | `mat=leather` | — | model | one-of | `umber` | error | auto |
| `B16` | `mat=ceramic` | — | model | one-of | `terracotta`, `ivory`, `taupe`, `sienna` | error | auto |
| `B17` | `mat=bone` | — | model | one-of | `ivory` | error | auto |
| `B18` | `mat=wax` | — | model | one-of | `ivory` | error | auto |
| `B19` | `mat=wick` | — | model | one-of | `basalt` | error | auto |
| `B20` | `mat=glass` & `size:m\|l` | — | model | one-of | `transparent` | error | auto |
| `B21` | `mat=glass` & `size:s` | — | model | one-of | `transparent`, `sienna`, `hunter` | error | auto |
| `B22` | `mat=liquid` | — | model | one-of | `sienna`, `hunter`, `azure` | error | auto |
| `B23` | `mat=rope` | — | model | one-of | `taupe` | error | auto |
| `B24` | `mat=cork` | — | model | one-of | `taupe` | error | auto |
| `B25` | `mat=gemstone` | — | model | one-of | `sienna`, `hunter`, `azure` | error | auto |
| `B26` | `mat=skin` | — | model | one-of | `tan`, `taupe`, `umber` | error | auto |
| `B52` | `mat:metal-iron` | — | `bands` | not | two `metal-iron` bands merged into one | error | review |
| `B57` | `mat=wax` | — | model | see | `B18` is `obj-lighting-candle` wax | — | none |
| `B27` | `kind:obj-kitchenware-tableware-plate` | — | `mat:ceramic` | one-of | `ivory`, `terracotta` | error | auto |
| `B28` | `kind:obj-kitchenware-tableware` mug, cup, tankard | — | `mat:wood` | one-of | `camel`, `chestnut` | error | review |
| `B29` | `kind:obj-kitchenware-cookware-pot` | — | `mat:ceramic` | one-of | `terracotta` | error | auto |
| `B58` | `kind:obj-food` | — | model | one-of | `any` | error | auto |
| `B59` | `kind:obj-food` fish | — | model | expect | `nickel`, `basalt`, `slate`, `azure` | warn | review |
| `B30` | `kind:obj-food` cheese | — | model | one-of | `amber` | error | review |
| `B31` | `kind:obj-food-meat` | — | model | one-of | `sienna` | error | auto |
| `B60` | `kind:obj-food-vegetable` | — | model | expect | `moss` | warn | auto |
| `B32` | `kind:obj-food-vegetable` carrot, pumpkin | — | model | one-of | `terracotta` | error | review |
| `B33` | `kind:obj-food-grain` | — | model | one-of | `tan`, `camel`, `chestnut` | error | auto |
| `B34` | `kind:obj-food-grain` wheat, straw | — | model | one-of | `tan` | error | review |
| `B35` | `*` chocolate | — | model | one-of | `chestnut` | error | review |
| `B36` | `kind:obj-weapon` + `kind:obj-tool` | — | `part:wrapped grip, binding` (sometimes) | one-of | `taupe` | error | review |
| `B56` | `kind:obj-weapon` + `kind:obj-tool` | — | `part:wrapped grip, binding` (sometimes) | range | UV 0.02–0.40 of the `taupe` band | error | review |
| `B37` | `kind:obj-weapon-magic` & `mat:paper` | — | `part:cover` (sometimes) | one-of | `umber`, `sienna`, `hunter`, `slate` | error | review |
| `B38` | `kind:obj-transport` | — | `mat:wood` | one-of | `camel`, `chestnut` | error | auto |
| `B55` | `kind:obj-transport-ship` + `kind:obj-transport-boat` + `kind:obj-transport-accessory` | — | `mat:textile` | one-of | `ivory`, `hunter`, `slate` | error | auto |
| `B39` | `kind:obj-transport-accessory` sails + `kind:str-stands` canvas | — | model | one-of | `ivory`, striped `sienna` and `ivory` | error | review |
| `B40` | `kind:obj-pocketitem-book` | — | `part:cover` (usual) | one-of | `umber`, `sienna`, `hunter`, `slate` | error | review |
| `B41` | `kind:obj-pocketitem-scroll` | — | model | one-of | `ivory` | error | auto |
| `B42` | `kind:obj-pocketitem-scroll` | — | `part:text` (sometimes) | one-of | `slate` | error | review |
| `B43` | `kind:obj-pocketitem-scroll` | — | `part:accent` (sometimes) | one-of | `sienna`, `hunter`, `azure` | error | review |
| `B54` | `kind:char` + `kind:obj-equipment-clothing` | — | `mat:textile` | one-of | `ivory`, `hunter`, `sienna` | error | auto |
| `B44` | `kind:str` | — | `mat:glass` | one-of | `transparent` | error | auto |
| `B65` | `kind:str-part-roof` | — | model | one-of | `sienna` | error | auto |
| `B45` | `kind:env-flora` | — | `part:stem, leaf` (usual) | one-of | `moss` | error | review |
| `B46` | `kind:env-flora-tree` | `kind:env-flora-tree-palm` | model | one-of | `hunter` | error | auto |
| `B62` | `kind:env-flora-plant-flower` + `kind:env-flora-plant-cactus` | — | `part:flower` (usual) | one-of | `any` | error | review |
| `B47` | `kind:env-fungi` | — | `part:stem` (always) | one-of | `ivory` | error | review |
| `B48` | `kind:env-fungi` | — | `part:cap` (always) | one-of | `sienna`, `camel` | error | review |
| `B63` | `kind:env-fauna` | — | model | one-of | `any` | error | auto |
| `B49` | `*` | — | `part:dried stalk` (sometimes) | one-of | `taupe` | error | review |
| `B50` | `*` | — | `part:flame, glow, light` (sometimes) | one-of | `amber` | error | review |
| `B64` | `*` | — | `part:flame, glow, light` (sometimes) | is | the `amber` lane's UV range not 0 | error | review |

---

## 6. Governance & process

Who decides, and what happens around the asset.

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

- **`V06`** — its `type` is one of `D11`, `D12`, `D13`, `D14`, `D15`. A group
  without one of them is a dedupe, not a group. *error · auto*
- **`V07`** — its `kits` is one kit; a second only for the same artist, never
  across artists without the PO. *error · review*
- **`V08`** — its `kind` is the same for every member. *error · auto*

How groups are drawn, none of it failed by the build:

- **`V10`** — the more models of a kind, the more sit inside a group.
- **`V11`** — reasons stack; the more and the wider, the sooner a model earns
  its own row.
- **`V12`** — a group is judged by how it reads, not by how far it measures.
- **`V13`** — a `D13` member is redesigned at that size: a longer ladder gains
  rungs.
- **`V14`** — a `D13` member is never scaled, globally or on one axis.
- **`V15`** — for kinds wanting variety, `D11` and `D12` are made on purpose
  (`M34` is one).

Who decides:

- **`V09`** — for assets entering, name and tris propose; shape and a render
  confirm.
- **`V16`** — a ship gaining a mast and sails: `D13` and `V11` both apply, so it
  goes to the PO.

A variant is what keeps a kind from ballooning. Filled and empty, open and
closed, lit and unlit, with lid, without lid and the lid alone each double a
group; left apart, ten potions and a shelf of pans crowd out everything else.
The same reasons that justify a variant are what justify the model being in
the catalogue at all, so the judgement runs both ways: too alike and it is a
dedupe, too far apart and it is its own row.

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
