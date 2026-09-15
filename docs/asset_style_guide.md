# Bible

Scope: items in the catalogue.

## 0. How to read a rule

**[F01] Rule format.** Every rule is one table row. No rule lives in prose. A
rule table's columns are exactly these, in this order:

`id | scope | when | except | subject | assert | value | sev | check | source`

No rule table drops, renames, adds or reorders a column. A table whose first
two columns are not `id` and `scope` is reference data, not rules: the term,
definition, band, tag-field, variant-reason and open-question tables. A rule's
`when`, `subject` and `value` cells together are capped at 200 characters.

Ids are stable. A withdrawn id is never reused and never renumbered; the
withdrawn list at the end of this section says where each one went.

**[F13] Scope.** Which entity the row is about: `model` (an item in the
catalogue), `group` (a variant group in `catalog/asset_variants.json`) or
`process` (people and the build, not an artefact). Scope decides which
subjects F07 allows and what a `when` selector is matched against.

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
tankard`, `upholstered`, `simple`) name a reading a person makes; on a `model`
or `group` row they force the row to `check manual`. A `process` row is prose
by nature and its `when` is free text.

**[F07] Subject.** What the assert is about. Closed per scope:

| scope | subjects |
|---|---|
| `model` | `model`, any recorded field of F11 (`kind`, `size`, `tags`, `mat`, `bands`, `calls`, `tris`, `dens`, `grad`, `anim`, `minEdge`, `grounded`, `centered`, `specialBand`, `specialWhy`), `dim:w`, `dim:d`, `dim:high`, `dim:longest`, `band`, `mat:<id>`, `part:<name> (<presence>)`, `—` |
| `group` | `type`, `kits`, `kind`, `member`, `grouping` |
| `process` | `PO`, `Claude`, `build`, `—` |

`mat` is the model's material-tag count; `mat:<id>` is the model's use of that
material, refined to a subtype; `bands` is its band count, `band` each band it
carries. A `part:` subject names a piece of the mesh. Parts are not recorded
per model, so every `part:` row is `source —` and `check manual`, but its
presence makes two model-level checks fall out of it — see F12. Presence is
`always`, `usual` or `sometimes`: whether a model of that kind has the part at
all (Q07).

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
| `note` | prose | a reading the linter never evaluates: `check none` on a `model` or `group` row, `check process` on a `process` row |

A value naming a material or a kind may take the same `:` / `=` distinction as
a selector: a trailing `:` means that id or any descendant (`metal-iron:`), a
bare id means exactly that id (`metal-iron`). In a band list, the token `any`
means every band of the band table.

**[F09] Severity, check and source.** Three columns, three questions.

| column | values | means |
|---|---|---|
| `sev` | `error` | fails the build, or, where `check` is `manual`, is treated as a failure by the reviewer |
| | `warn` | reported, does not fail; every `expect` row is `warn` |
| | `—` | the row asserts nothing to fail: `check` is `intent`, `process` or `none` |
| `check` | `auto` | the linter evaluates it |
| | `manual` | true but not evaluable; the linter skips it and lists it |
| | `intent` | how a model should look; human judgement |
| | `process` | about people or the build, not an artefact |
| | `none` | a `see` or `note` row; nothing to check |
| `source` | `catalog` | read from `catalog/catalog.json` |
| | `glb` | read from the glb itself |
| | `variants` | read from `catalog/asset_variants.json` |
| | `—` | nothing records it |

Two invariants, both checkable over this document: `source —` forces `check`
to be anything but `auto`, and `sev —` forces `check` to be `intent`, `process`
or `none`. A `check manual` row with a `source` names the rule that would run
if its selector or value were made into terms; a `check manual` row with
`source —` names the rule that would run if the data were recorded.

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
`spread`, `colors`, `size`, `kind`, `tags`, `specialBand`, `specialWhy`.

**[F12] What a part rule still checks.** Five checks are derived from the
rows, with no rule-specific logic:

| id | derived from | what it checks | sev |
|---|---|---|---|
| `F12.1` | a `part:… (always)` row | the model carries that rule's material | error |
| `F12.2` | a `part:… (usual)` row | the model carries that rule's material | warn |
| `F12.3` | every row for the kind | the model's materials are among those the kind's rows name, where the kind is `closed` (Q17) | error |
| `F12.4` | §5 and the model's materials | the model's bands are among those §5 allows for its materials and kind | error |
| `F12.5` | the material tree | no model carries a material tag and an ancestor of it | error |

`F12.4` needs no part data at all: §5 gives every material a band, so the union
over a model's materials bounds its bands whether or not the parts are known.
It is also why §5 uses `one-of` throughout: a §5 row names the set a subject
may draw from, never an equality. A material with no §5 row (Q08) is skipped,
not failed. `sometimes` derives nothing.

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
| `F02` | `material` | what it is **made of** | closed, parented (Q08) |
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

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `I01` | model | `*` | — | model | is | chunky, caricatured; not thin, not primitive | — | intent | — |
| `I02` | model | `*` | — | model | is | clean facets, chamfered edges, rounded-soft | — | intent | — |
| `I03` | model | `!kind:env` | — | model | is | few details | — | intent | — |
| `I04` | model | `*` | — | model | is | invented before 1850 | — | intent | — |
| `I05` | model | `*` | — | model | is | like its deepest kind in shape, colour, style | — | intent | — |
| `I06` | model | `*` | — | `band` | one-of | `any` | error | auto | catalog |
| `I07` | model | `*` | — | `grad` | not | 0 | error | auto | catalog |
| `I08.1` | model | `!mat:glass` | — | model | is | `alphaMode` `OPAQUE` | error | auto | glb |
| `I08.2` | model | `*` | — | model | is | `roughnessFactor` 1, `metallicFactor` 0 | error | auto | glb |
| `I09.1` | model | `mat:glass` | — | `calls` | min | 2 | error | auto | catalog |
| `I09.2` | model | `*` | — | model | is | 2+ calls only for moving features or glass | error | manual | catalog |
| `I10` | model | `*` | — | model | not | outline, unless the outline is a core feature | error | manual | — |
| `I11` | model | `*` | — | model | is | no shadow casting | error | auto | glb |

---

## 2. Geometry & budget

Everything measured off the mesh: extents, counts, pivots, band counts.

### 2.1 Construction & placement

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `G01` | model | `tag:ngons` | `tag:hero` | model | count-range | 8–12 flat pieces per full circle | warn | manual | — |
| `G02` | model | `*` | `mat:textile` | `minEdge` | min | 0.015 | error | auto | catalog |
| `G02.1` | model | `mat:textile` | — | `minEdge` | min | 0.01 | error | auto | catalog |
| `G03` | model | `*` | `kind:char` + `tag:plural` | `dens` | max | 5000 | warn | auto | catalog |
| `G04.1` | model | `*` | `tag:floating` | `grounded` | is | true | error | auto | catalog |
| `G04.2` | model | `*` | `tag:offcenter` | `centered` | is | true | error | auto | catalog |
| `G05` | model | `*` | — | `part:split node` (sometimes) | is | origin at the joint | error | manual | — |

### 2.2 Band counts

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `G06` | model | `*` | — | `mat` | min | 1 | error | auto | catalog |
| `G07` | model | `*` | — | `bands` | min | `mat` | error | auto | catalog |
| `G08.1` | model | `*` | — | `bands` | max | `mat` × 2 | error | auto | catalog |
| `G08.2` | model | `mat:food` + `mat:vegetation` + `kind:env-fauna` | — | `bands` | max | `mat` × 3 | error | auto | catalog |
| `G08.3` | model | `mat:food` & `tag:decorated` | — | `bands` | max | `mat` × 5 | error | auto | catalog |
| `G09.1` | model | `!kind:char` | `size:l` & `mat>=5` | `bands` | max | 5 | error | auto | catalog |
| `G09.2` | model | `kind:char` | `size:l` & `mat>=5` | `bands` | max | 6 | error | auto | catalog |
| `G10.1` | model | `!kind:char` & `size:l` & `mat>=5` | — | `bands` | max | 6 | error | auto | catalog |
| `G10.2` | model | `kind:char` & `size:l` & `mat>=5` | — | `bands` | max | 7 | error | auto | catalog |

### 2.3 Size

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `G13` | model | `*` | `kind:env-terrain-mountain` | `dim:high` | max | 6 | error | auto | catalog |
| `G14` | model | `kind:obj-container-chest` & with lid | — | `dim:high` | range | 0.2–0.5 | error | manual | catalog |
| `G15` | model | `kind:obj-container-barrel` | — | `dim:high` | range | 0.2–0.8 | error | auto | catalog |
| `G16` | model | `kind:obj-container-bucket` | — | `dim:high` | range | 0.1–0.4 | error | auto | catalog |
| `G17` | model | `kind:obj-container-crate` & `D10` | — | `dim:high` | range | 0.2–0.8 | error | auto | catalog |
| `G18` | model | `kind:obj-container-bottle` | — | `dim:high` | range | 0.1–0.4 | error | auto | catalog |
| `G19` | model | `kind:obj-container-pot` | — | `dim:high` | range | 0.2–0.4 | error | auto | catalog |
| `G20` | model | `kind:obj-kitchenware-tableware-cutlery` | — | `dim:longest` | range | 0.1–0.4 | error | auto | catalog |
| `G21` | model | `kind:obj-kitchenware-tableware-plate` | — | `dim:longest` | range | 0.1–0.4 | error | auto | catalog |
| `G22` | model | `kind:obj-kitchenware-cookware-pan` & with lid | — | `dim:high` | max | 0.4 | error | manual | catalog |
| `G23` | model | `kind:obj-kitchenware-cookware-pot` & with lid | — | `dim:high` | max | 0.4 | error | manual | catalog |
| `G24` | model | `kind:obj-furniture-seating` | — | `dim:high` | range | 0.2–0.7 | error | auto | catalog |
| `G25` | model | `kind:obj-furniture-table` | — | `dim:high` | min | 0.2 | error | auto | catalog |
| `G26` | model | `kind:obj-weapon-melee-sword` | — | `dim:longest` | range | 0.4–1.0 | error | auto | catalog |
| `G27` | model | `kind:obj-weapon-melee-dagger` | — | `dim:longest` | range | 0.1–0.5 | error | auto | catalog |
| `G28` | model | `kind:obj-weapon-melee-axe` | — | `dim:longest` | range | 0.2–0.8 | error | auto | catalog |
| `G29` | model | `kind:obj-weapon-melee-hammer` | — | `dim:longest` | range | 0.2–0.8 | error | auto | catalog |
| `G30` | model | `kind:obj-weapon-ranged-bow` | — | `dim:longest` | range | 0.4–1.0 | error | auto | catalog |
| `G31` | model | `kind:obj-weapon-ranged-crossbow` | — | `dim:longest` | range | 0.4–1.0 | error | auto | catalog |
| `G32` | model | `kind:obj-weapon-magic-staff` | — | `dim:longest` | range | 0.2–1.2 | error | auto | catalog |
| `G33` | model | `kind:obj-equipment-shield` | — | `dim:high` | range | 0.2–0.6 | error | auto | catalog |
| `G34` | model | `kind:obj-tool-long` | — | `dim:longest` | range | 0.3–1.2 | error | auto | catalog |
| `G35` | model | `kind:obj-lighting-lantern` | — | `dim:high` | range | 0.1–1.0 | error | auto | catalog |
| `G36` | model | `kind:obj-lighting-torch` | — | `dim:high` | range | 0.1–1.0 | error | auto | catalog |
| `G37` | model | `kind:obj-lighting-candle` | — | `dim:high` | range | 0.1–0.7 | error | auto | catalog |
| `G38` | model | `kind:obj-pocketitem-coin` | `tag:plural` | `dim:longest` | max | 0.2 | error | auto | catalog |
| `G39` | model | `kind:obj-pocketitem-key` | — | `dim:longest` | max | 0.2 | error | auto | catalog |
| `G40` | model | `kind:obj-pocketitem-book` & closed | — | `dim:longest` | range | 0.1–0.3 | error | manual | catalog |
| `G41` | model | `kind:obj-pocketitem-scroll` | — | `dim:longest` | range | 0.1–0.3 | error | auto | catalog |
| `G42` | model | `kind:env-flora-tree` | — | `dim:high` | range | 0.6–2.4 | error | auto | catalog |
| `G43` | model | `kind:char` humanoid, skeleton included | — | `dim:high` | range | 0.4–0.8 | error | manual | catalog |

### 2.4 Boxes and part counts

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `G45` | model | `D06` | — | `part:hoop` (usual) | range | 5–15% of longest, high | error | manual | — |
| `G46.1` | model | `kind:obj-container-barrel` | — | `dim:w` | max | 0.75 | error | auto | catalog |
| `G46.2` | model | `kind:obj-container-barrel` | — | `part:side plank` (always) | count-range | 8–14 | error | manual | — |
| `G46.3` | model | `kind:obj-container-barrel` | — | `tris` | range | 100–1500 | error | auto | catalog |
| `G46.4` | model | `kind:obj-container-barrel` | — | `part:hoop` (always) | count-max | 3 | error | manual | — |
| `G47` | model | `kind:obj-container-bucket` | — | `part:hoop` (always) | count-max | 3 | error | manual | — |
| `G48` | model | `kind:obj-container-crate` & `D10` | — | `part:plank` (always) | count-range | 3–7 side by side per face | error | manual | — |
| `G49.1` | model | `kind:obj-furniture` | `kind:obj-furniture-table` | model | fits | 1.2 × 1.2 × 1.2 | error | auto | catalog |
| `G49.2` | model | `kind:obj-furniture-table` | — | model | fits | 2 × 2 × 0.5 | error | auto | catalog |
| `G50` | model | `kind:obj-pocketitem-book` & open | — | `dim:longest` | see | `G40`, on the longest cover edge | — | none | — |
| `G52` | model | `kind:str-marker-flag` + `kind:str-stands` + `kind:obj-transport-accessory` | — | `part:sail, canopy, canvas` (sometimes) | range | 0.01–0.05 thick | error | manual | — |

---

## 3. Taxonomy

What a model *is*, before any material or colour question.

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `T01` | model | `*` | — | `kind` | note | a leaf may carry its material's name (`env-remains-bones`) | — | none | — |
| `T03` | model | `kind=assy` | — | `kind` | is | distinct things in one top-level | error | manual | — |
| `T04` | model | `*` | — | `kind` | is | the deepest leaf that fits; the parent is "other" | error | manual | — |
| `T05` | model | `*` | — | `kind` | is | the one kind the appendix glossary resolves the noun to | error | manual | — |
| `T06.1` | model | `kind:env-terrain` | — | `kind` | is | ground mesh and cobbled path `env-terrain`, not `env-rock` | error | manual | — |
| `T06.2` | model | `kind:env-rock` | — | `kind` | is | placed body `env-rock`, cliff prop `env-rock-formation` | error | manual | — |
| `T07` | model | `*` | — | `kind` | not | decided by kit of origin | error | manual | — |
| `T08` | model | `*` | — | `tags` | is | the artist tag from the kit, only for artists with several kits adopted | error | manual | catalog |
| `T09` | process | building the catalogue | — | build | note | `size` is measured, never hand-set | — | process | — |
| `T10` | process | building the catalogue | — | build | note | `anim` is read off the glb, never hand-set | — | process | — |
| `T11` | model | `tag:ngons` | — | model | is | round cross-section, what `G01` counts on | error | manual | — |
| `T12` | model | `tag:plural` | — | model | is | several instances of one thing in one model | error | manual | — |
| `T14.1` | model | `mat:special` | — | `specialBand` | one-of | `any` | error | auto | catalog |
| `T14.2` | model | `mat:special` | — | `specialWhy` | not | empty | error | auto | catalog |
| `T15` | model | `tag:pickup` | — | model | is | sized to be seen and collected, not to stand in the world | error | manual | — |

---

## 4. Kind → material

What a kind is made of. Colour follows from section 5.

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `M01.1` | model | `kind:obj-container-barrel` | — | `part:hoop` (always) | is | `metal-iron` | error | manual | — |
| `M01.2` | model | `kind:obj-container-bucket` | — | `part:hoop` (always) | is | `metal-iron` | error | manual | — |
| `M01.3` | model | `kind:obj-container-chest` | — | `part:hoop` (usual) | is | `metal-iron` | error | manual | — |
| `M01.4` | model | `kind:obj-container-crate` | — | `part:hoop` (sometimes) | is | `metal-iron` | error | manual | — |
| `M02` | model | `kind:obj-container-bottle` | — | model | any-of | `glass`, `ceramic` | error | auto | catalog |
| `M03` | model | `kind:obj-container-bag` | — | `part:fastener, closure` (sometimes) | any-of | `rope`, `leather` | error | manual | — |
| `M04` | model | `kind:obj-kitchenware-tableware-plate` | — | model | any-of | `ceramic`, `metal-iron:`, `wood:` | error | auto | catalog |
| `M05` | model | `kind:obj-kitchenware-tableware` mug, cup, tankard | — | `part:hoop, handle` (sometimes) | is | `metal-iron:` | error | manual | — |
| `M06` | model | `kind:obj-kitchenware-tableware` | — | `mat:metal-iron` | is | `metal-iron-steel` | error | auto | catalog |
| `M07` | model | `kind:obj-furniture` | rug, carpet + upholstered | model | any-of | `wood:` | error | manual | catalog |
| `M08` | model | `kind:obj-furniture` rug, carpet | — | model | any-of | `textile` | error | manual | catalog |
| `M09` | model | `kind:obj-furniture-seating` upholstered | — | model | any-of | `textile` | error | manual | catalog |
| `M10` | model | `kind:obj-weapon` + `kind:obj-tool` | — | `mat:metal-iron` | is | `metal-iron-steel` | error | auto | catalog |
| `M11` | model | `kind:obj-weapon` + `kind:obj-tool` | — | `part:handle` (usual) | any-of | `wood:`, `textile` | error | manual | — |
| `M12` | model | `kind:obj-weapon` | — | `part:strap` (sometimes) | any-of | `textile`, `leather` | error | manual | — |
| `M13` | model | `kind:obj-weapon-cannon` | — | `mat:metal-iron` | is | `metal-iron-cast` | error | auto | catalog |
| `M14` | model | `kind:obj-equipment` | — | `mat:metal-iron` | is | `metal-iron-steel` | error | auto | catalog |
| `M15` | model | `kind:obj-equipment-clothing` belt, shoe, strap | — | model | any-of | `leather` | error | manual | catalog |
| `M16` | model | `kind:obj-tool-hand` | — | `part:wood handle` (usual) | is | `wood-planks` | error | manual | — |
| `M17` | model | `kind:obj-tool-long` | — | `part:pole` (always) | is | `wood-beam` | error | manual | — |
| `M18` | model | `kind:obj-tool-supplies` | — | `mat:metal-iron` | is | `metal-iron-wrought` | error | auto | catalog |
| `M19` | model | `kind:obj-transport-accessory` | — | `part:sail` (sometimes) | is | `textile` | error | manual | — |
| `M20` | model | `kind:obj-pocketitem-coin` | — | model | any-of | `metal-gold` | error | auto | catalog |
| `M21` | model | `kind:obj-pocketitem-key` | — | model | any-of | `metal-iron:`, `metal-gold` | error | auto | catalog |
| `M22` | model | `kind:obj-pocketitem-book` | — | `part:strap, band, binder, corner` (usual) | any-of | `leather`, `metal-iron:` | error | manual | — |
| `M23` | model | `kind:obj-pocketitem-jewellery` | — | model | all-of | `metal-gold`, `gemstone` | error | auto | catalog |
| `M24` | model | `kind:obj-resource-wood-log` + `kind:env-flora-deadwood-branch` + cut-face trunks | — | `part:cut face` (always) | is | `wood-log` | error | manual | — |
| `M25` | model | `kind:obj-resource-wood-log` + `kind:env-flora-deadwood-branch` + cut-face trunks | — | `part:round side` (always) | is | `wood-bark` | error | manual | — |
| `M26` | model | `kind:obj` bells | — | model | any-of | `metal-copper`, `metal-gold` | error | manual | catalog |
| `M27` | model | `kind:str` | — | `mat:metal-iron` | is | `metal-iron-cast` | error | auto | catalog |
| `M28` | model | `kind:str-part-roof` | — | model | any-of | `ceramic` | error | auto | catalog |
| `M29` | model | `kind:str-marker-flag` | — | model | any-of | `textile` | error | auto | catalog |
| `M30` | model | `kind:char` | — | `mat:metal-iron` | is | `metal-iron-steel` | error | auto | catalog |
| `M31` | model | `mat=metal-iron` | — | `mat:metal-iron` | default | `metal-iron-wrought` | error | auto | catalog |
| `M32` | model | `D06` | — | model | expect | mainly `wood`, often `metal-iron` accents | warn | manual | catalog |
| `M33` | model | `kind:obj-kitchenware-tableware` mug, cup, tankard | — | model | expect | `wood:` | warn | manual | catalog |
| `M34` | model | `kind:obj-kitchenware-cookware` & `mat:metal` | — | model | is | paired variants, one `metal-iron-steel` one `metal-iron-cast` | error | manual | catalog |
| `M35` | model | `kind:obj-tool` + `kind:obj-weapon` | — | `mat:metal` | is | `metal-iron:` | error | auto | catalog |
| `M36` | model | `kind:obj-weapon` + `kind:obj-tool` + `kind:obj-equipment-shield` | — | `part:grip, fastener, join` (usual) | expect | `textile`, `rope`, `leather` | warn | manual | — |
| `M37` | model | `kind:obj-weapon` simple + `kind:obj-weapon-ranged-bow` | — | model | note | `wood:` wholly or partly is fine; `M35` constrains only the metal | — | none | — |
| `M38` | model | `kind:obj-weapon` special | — | `mat:metal` | one-of | `metal-iron:`, `metal-gold` | error | manual | catalog |
| `M39` | model | `*` sticks, unworked poles | — | model | any-of | `wood-bark` | error | manual | catalog |
| `M40` | model | `*` fastener joining `stone`, `bone`, `metal-iron-steel` to `wood` | — | `part:fastener` (sometimes) | expect | `leather` | warn | manual | — |
| `M41` | model | `kind:obj-transport-boat` + `kind:obj-transport-ship` | — | `mat:wood` | count-min | 2 | error | auto | catalog |
| `M42` | model | `kind:str` | — | model | expect | mainly `wood`, then `stone`; `metal` sparingly | warn | manual | catalog |
| `M43` | model | `kind:str-marker-sign` + `kind:str-barrier-post` + `kind:str-marker-flag` | — | `part:pole` (usual) | expect | `wood:` | warn | manual | — |
| `M44` | model | `*` | — | — | see | `M24`, `M25`; never the other way round | — | none | — |
| `M45` | model | `kind:obj` bells | — | model | not | `metal-iron:` | error | manual | catalog |
| `M46` | model | `kind:str-part-wall` + `kind:str-part-floor` + `kind:obj-resource-stone` bricks | — | `mat:stone` | is | `stone-masonry` | error | manual | catalog |
| `M47` | model | `kind:env-terrain-ground` sand, dirt | — | `mat:stone` | is | `stone-soil` | error | manual | catalog |

---

## 5. Subject → colour

Every row names the set of bands its subject may draw from; F12.4 bounds a
model's bands by the union over the rows that match it.

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `B01` | model | `mat=metal-iron-steel` | — | model | one-of | `nickel` | error | auto | catalog |
| `B02` | model | `mat=metal-iron-wrought` | — | model | one-of | `basalt` | error | auto | catalog |
| `B03` | model | `mat=metal-iron-cast` | — | model | one-of | `slate` | error | auto | catalog |
| `B04` | model | `mat=metal-gold` | — | model | one-of | `amber` | error | auto | catalog |
| `B05` | model | `mat=metal-copper` | — | model | one-of | `terracotta` | error | auto | catalog |
| `B06` | model | `mat=wood-planks` | — | model | one-of | `tan` | error | auto | catalog |
| `B07` | model | `mat=wood-worked` | — | model | one-of | `camel` | error | auto | catalog |
| `B08` | model | `mat=wood-beam` | — | model | one-of | `chestnut` | error | auto | catalog |
| `B09` | model | `mat=wood-bark` | — | model | one-of | `umber` | error | auto | catalog |
| `B51` | model | `mat=wood-log` | — | model | one-of | `tan`, `camel`, `chestnut` | error | auto | catalog |
| `B10` | model | `mat=stone-masonry` | — | model | one-of | `taupe`, `slate`, `nickel` | error | auto | catalog |
| `B11` | model | `mat=stone-rock` | — | model | one-of | `nickel`, `taupe` | error | auto | catalog |
| `B12` | model | `mat=stone-soil` | — | model | one-of | `taupe` | error | auto | catalog |
| `B13` | model | `mat=paper` | — | model | one-of | `ivory` | error | auto | catalog |
| `B14` | model | `mat=textile` | — | model | one-of | `ivory`, `hunter` | error | auto | catalog |
| `B15` | model | `mat=leather` | — | model | one-of | `umber` | error | auto | catalog |
| `B16` | model | `mat=ceramic` | — | model | one-of | `terracotta`, `ivory`, `taupe`, `sienna` | error | auto | catalog |
| `B17` | model | `mat=bone` | — | model | one-of | `ivory` | error | auto | catalog |
| `B18` | model | `mat=wax` | — | model | one-of | `ivory` | error | auto | catalog |
| `B19` | model | `mat=wick` | — | model | one-of | `basalt` | error | auto | catalog |
| `B20` | model | `mat=glass` & `size:m\|l` | — | model | one-of | `transparent` | error | auto | catalog |
| `B21` | model | `mat=glass` & `size:s` | — | model | one-of | `transparent`, `sienna`, `hunter` | error | auto | catalog |
| `B22` | model | `mat=liquid` | — | model | one-of | `sienna`, `hunter`, `azure` | error | auto | catalog |
| `B23` | model | `mat=rope` | — | model | one-of | `taupe` | error | auto | catalog |
| `B24` | model | `mat=cork` | — | model | one-of | `taupe` | error | auto | catalog |
| `B25` | model | `mat=gemstone` | — | model | one-of | `sienna`, `hunter`, `azure` | error | auto | catalog |
| `B26` | model | `mat=skin` | — | model | one-of | `tan`, `taupe`, `umber` | error | auto | catalog |
| `B52` | model | `mat:metal-iron` | — | `bands` | not | two `metal-iron` bands merged into one | error | manual | — |
| `B57` | model | `mat=wax` | — | model | see | `B18` is `obj-lighting-candle` wax | — | none | — |
| `B27` | model | `kind:obj-kitchenware-tableware-plate` | — | `mat:ceramic` | one-of | `ivory`, `terracotta` | error | auto | catalog |
| `B28` | model | `kind:obj-kitchenware-tableware` mug, cup, tankard | — | `mat:wood` | one-of | `camel`, `chestnut` | error | manual | catalog |
| `B29` | model | `kind:obj-kitchenware-cookware-pot` | — | `mat:ceramic` | one-of | `terracotta` | error | auto | catalog |
| `B58` | model | `kind:obj-food` | — | model | one-of | `any` | error | auto | catalog |
| `B59` | model | `kind:obj-food` fish | — | model | expect | `nickel`, `basalt`, `slate`, `azure` | warn | manual | catalog |
| `B30` | model | `kind:obj-food` cheese | — | model | one-of | `amber` | error | manual | catalog |
| `B31` | model | `kind:obj-food-meat` | — | model | one-of | `sienna` | error | auto | catalog |
| `B60` | model | `kind:obj-food-vegetable` | — | model | expect | `moss` | warn | auto | catalog |
| `B32` | model | `kind:obj-food-vegetable` carrot, pumpkin | — | model | one-of | `terracotta` | error | manual | catalog |
| `B33` | model | `kind:obj-food-grain` | — | model | one-of | `tan`, `camel`, `chestnut` | error | auto | catalog |
| `B34` | model | `kind:obj-food-grain` wheat, straw | — | model | one-of | `tan` | error | manual | catalog |
| `B35` | model | `*` chocolate | — | model | one-of | `chestnut` | error | manual | catalog |
| `B36` | model | `kind:obj-weapon` + `kind:obj-tool` | — | `part:wrapped grip, binding` (sometimes) | one-of | `taupe` | error | manual | — |
| `B56` | model | `kind:obj-weapon` + `kind:obj-tool` | — | `part:wrapped grip, binding` (sometimes) | range | UV 0.02–0.40 of the `taupe` band | error | manual | — |
| `B37` | model | `kind:obj-weapon-magic` & `mat:paper` | — | `part:cover` (sometimes) | one-of | `umber`, `sienna`, `hunter`, `slate` | error | manual | — |
| `B38` | model | `kind:obj-transport` | — | `mat:wood` | one-of | `camel`, `chestnut` | error | auto | catalog |
| `B55` | model | `kind:obj-transport-ship` + `kind:obj-transport-boat` + `kind:obj-transport-accessory` | — | `mat:textile` | one-of | `ivory`, `hunter`, `slate` | error | auto | catalog |
| `B39` | model | `kind:obj-transport-accessory` sails + `kind:str-stands` canvas | — | model | one-of | `ivory`, striped `sienna` and `ivory` | error | manual | catalog |
| `B40` | model | `kind:obj-pocketitem-book` | — | `part:cover` (usual) | one-of | `umber`, `sienna`, `hunter`, `slate` | error | manual | — |
| `B41` | model | `kind:obj-pocketitem-scroll` | — | model | one-of | `ivory` | error | auto | catalog |
| `B42` | model | `kind:obj-pocketitem-scroll` | — | `part:text` (sometimes) | one-of | `slate` | error | manual | — |
| `B43` | model | `kind:obj-pocketitem-scroll` | — | `part:accent` (sometimes) | one-of | `sienna`, `hunter`, `azure` | error | manual | — |
| `B54` | model | `kind:char` + `kind:obj-equipment-clothing` | — | `mat:textile` | one-of | `ivory`, `hunter`, `sienna` | error | auto | catalog |
| `B44` | model | `kind:str` | — | `mat:glass` | one-of | `transparent` | error | auto | catalog |
| `B65` | model | `kind:str-part-roof` | — | model | one-of | `sienna` | error | auto | catalog |
| `B45` | model | `kind:env-flora` | — | `part:stem, leaf` (usual) | one-of | `moss` | error | manual | — |
| `B46` | model | `kind:env-flora-tree` | `kind:env-flora-tree-palm` | model | one-of | `hunter` | error | auto | catalog |
| `B62` | model | `kind:env-flora-plant-flower` + `kind:env-flora-plant-cactus` | — | `part:flower` (usual) | one-of | `any` | error | manual | — |
| `B47` | model | `kind:env-fungi` | — | `part:stem` (always) | one-of | `ivory` | error | manual | — |
| `B48` | model | `kind:env-fungi` | — | `part:cap` (always) | one-of | `sienna`, `camel` | error | manual | — |
| `B63` | model | `kind:env-fauna` | — | model | one-of | `any` | error | auto | catalog |
| `B49` | model | `*` | — | `part:dried stalk` (sometimes) | one-of | `taupe` | error | manual | — |
| `B50` | model | `*` | — | `part:flame, glow, light` (sometimes) | one-of | `amber` | error | manual | — |
| `B64` | model | `*` | — | `part:flame, glow, light` (sometimes) | is | the `amber` lane's UV range not 0 | error | manual | — |

---

## 6. Governance & process

Who decides, and what happens around the asset.

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `P01` | process | `mat:special`, `tag:hero` | — | PO | note | only the PO assigns them | — | process | — |
| `P02` | process | adding to the catalogue | — | Claude | note | proposes `hero` | — | process | — |
| `P03` | process | `mat:special` | — | Claude | note | asks only after recolour and a kind or material change failed | — | process | — |
| `P04` | process | outline on an asset | — | Claude | note | tells the PO | — | process | — |
| `P05` | process | creating an asset | — | Claude | note | renders and looks at the reference assets first | — | process | — |
| `P06` | process | validating | — | Claude | note | renders 2+ references of the group beside it, same scale | — | process | — |
| `P07` | process | `kind=assy` | — | build | note | not validated directly | — | process | — |
| `P08` | process | importing a pack | — | Claude | note | one scale factor for the whole pack for now | — | process | — |
| `P09` | process | importing, 2 colours | — | Claude | note | keeps 2 | — | process | — |
| `P09.1` | process | importing, 3–4 colours | — | Claude | note | may drop 1 | — | process | — |
| `P09.2` | process | importing, 5 colours | — | Claude | note | may drop 2 | — | process | — |
| `P09.3` | process | importing, 6+ colours | — | Claude | note | keeps ≥ 3 | — | process | — |
| `P10` | process | a leaf below 6 models | — | PO | note | not retired for that | — | process | — |

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

| id | scope | when | except | subject | assert | value | sev | check | source |
|---|---|---|---|---|---|---|---|---|---|
| `V06` | group | `*` | — | `type` | one-of | `D11`, `D12`, `D13`, `D14`, `D15` | error | auto | variants |
| `V07` | group | `*` | — | `kits` | is | one kit; a second only for the same artist, never across artists without the PO | error | manual | variants |
| `V08` | group | `*` | — | `kind` | is | the same for every member | error | auto | variants |
| `V09` | process | assets entering | — | Claude | note | name and tris propose, shape and a render confirm | — | process | — |
| `V10` | group | `*` | — | grouping | is | the more models of a kind, the more sit inside a group | — | intent | — |
| `V11` | group | `*` | — | grouping | is | reasons stack; the more and wider, the sooner its own row | — | intent | — |
| `V12` | group | `*` | — | grouping | is | judged by how it reads, not how far it measures | — | intent | — |
| `V13` | group | `D13` | — | member | is | redesigned at that size: a longer ladder gains rungs | — | intent | — |
| `V14` | group | `D13` | — | member | not | scaled, globally or on one axis | — | intent | — |
| `V15` | group | kinds wanting variety | — | grouping | is | `D11` and `D12` are made on purpose (`M34` is one) | — | intent | — |
| `V16` | process | a ship gaining a mast and sails | — | PO | note | `D13` and `V11` both apply; it goes to the PO | — | process | — |

A group without one of `D11`–`D15` is a dedupe, not a group (Q12).

A variant is what keeps a kind from ballooning. Filled and empty, open and
closed, lit and unlit, with lid, without lid and the lid alone each double a
group; left apart, ten potions and a shelf of pans crowd out everything else.
The same reasons that justify a variant are what justify the model being in
the catalogue at all, so the judgement runs both ways: too alike and it is a
dedupe, too far apart and it is its own row.

---

## 8. Open questions

Each one blocks a rule from being checkable, or leaves two readings of it. The
`sev`, `check` and `source` of the rule stay as written until the PO answers.

| id | rule | question |
|---|---|---|
| `Q07` | every `part:` row | The presence values were read off the catalogue, not decided: barrel and bucket hoops 100% of models, `obj-tool-long` poles 19/19, cut faces 38/38, chest hoops 22/25, tool handles 39/45, book straps 20/25, crate hoops 3/21, sails 2/8. Confirm each, or record parts per model and check them directly. |
| `Q08` | `F02` | The field said "closed, 36"; `tags.json` holds 37 materials, including `metal-silver`, which is not in the material tree. Also `foliage`, `plastic`, `emissive`, `food`, `vegetation` and `special` have no colour row in §5, so §5 is not total over the materials. |
| `Q12` | `V06` | `asset_variants.json` types are `detail-variant`, `color-variant` and `maatvariant`. `color-variant` is `D12` and `maatvariant` is `D13`; `detail-variant` covers more than one reason and is sorted group by group by the PO. Until it is, `V06` fails every group carrying it. |
| `Q15` | `M28`, `B65` | `M28` set a material and a band in one cell; the band is split out as `B65`. Confirm the split, and the id. |
| `Q17` | `F12.3` | Material closure only runs where a kind's rows are known to be complete. Which kinds are closed? None is marked, so `F12.3` runs nowhere yet. |
| `Q20` | `M07` | Rugs and upholstered seating leave `M07` through a prose `except`, which makes `M07` `check manual`. Which tag marks them, so `M07` can run? |

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
