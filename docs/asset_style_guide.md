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
| `F04` | `tag` | kit/artist, theme, flags (`hero`, `plural`, `animation`, `comp`, `pickup`, `broken`, `piece`, etc.) | open |
| `F11` | `attribute` | a property read off the model in steps (`storeys`, `scale`) | closed, **at most one per attribute** |

**[F05] Term.** A term is one of:

| term | matches |
|---|---|
| `*` | every model, or every group |
| `kind:<id>` | that kind and its descendants |
| `mat:<id>` | models carrying that material tag or a subtype of it |
| `mat=<id>` | that material tag exactly |
| `tag:<id>` | models carrying that open tag |
| `attr:<id>` | models carrying that attribute value |
| `size:<s\|m\|l>` | models measured at that size |
| `<field><op><number>` | a recorded numeric field compared: `nmat>=5`, `tris<100`; ops `= > >= < <=` |
| `D<nn>` | the models the definition's term matches |
| `!<term>` | models the term does not match |
| `<term> & <term>` | models both terms match |
| `<term> \| <term>` | models either term matches; `&` binds before `\|` |

In a value, a material id ending in `:` (`wood:`) means that material or any subtype. `any` means every band.

**[F06] Subject.** What the assert is about. A closed set: `model`, any recorded field (`kind`, `size`, `tags`, `mat`, `nmat`, `storeys`, `scale`, `bands`, `calls`, `tris`, `tpu`, `grad`, `anim`, `alpha`, `pbr`, `minEdge`, `grounded`, `centered`, `specialWhy`), `dim:w`, `dim:d`, `dim:high`, `dim:longest`, `band`, `mat:<id>`, `part:<name>`, `—`.

**[F07] Assert.** Closed vocabulary:

| assert | value | means |
|---|---|---|
| `min` | number | subject ≥ value; a value may name a recorded numeric field with an optional `× n` (`nmat × 2`) |
| `max` | number | subject ≤ value; same |
| `range` | a–b | a ≤ subject ≤ b |
| `fits` | w × d × h | axis-aligned extents each ≤ the box |
| `is` | token list | every value the subject carries is among the tokens; a single-valued subject equals the one token |
| `not` | token | subject never equals the token |
| `has` | token list | the subject carries at least one of the tokens; other values are allowed |

**[F08] Combining rows.** A row whose `except` matches the model does not apply. Rows that apply and do not disagree all hold. When two rows assert on the same subject and disagree, the more specific row wins:

1. a `part:` subject over a `mat:` subject, and a `mat:` subject over `model`;
2. a §5.2 or §5.3 row over a §5.1 row;
3. a row naming a deeper kind over a row naming a shallower kind;
4. any term over `*`.

§4 and §5.3 rows carry their exclusions as `!` terms in `when`, repeated per branch, and have no `except` column.

**[F09] `special` in the counts.** `nmat` counts materials without `special`; `bands` counts bands without the `special` one.

**[F10] Rules that live in the JSON.** Five checks read their rows from `lint/*.json` rather than from a table here: measures (§2.2) from `lint/measures.json`, and four tree checks from `lint/kinds.json` and `lint/materials.json`: size (§2.3), kind → materials (§4.1), material palettes (§5.1) and kind bands (§5.2). A measures row carries its own `when` and `except` terms. The tree checks read the same way:

- **Inheritance.** A field set on a kind or a material holds for everything under it. Where a chain sets the same field more than once, only the deepest is read (`F08` rule 3) — this is how a palm takes `moss` where the trees above it take `hunter`. Fields naming different materials all apply at once. `has` is one exception: every `has` entry down the chain holds. Size limits are the other: a kind takes limits of one measure only (§2.3).
- **Coverage.** Bands are recorded per model, not per material, so a band row passes when the model shows at least one band from the list. A list admitting `transparent` holds no band and is not checked.
- **Exemptions** live in `lint/variables.json`, per check.
- **Each check reads only its own rows**, so §5.1 and §5.2 never widen or fault each other.
- **In the catalogue.** All five run in the catalogue build as well as from the command line. A finding shows as the ⚠ glyph on the card, as a row under Lint in the model panel, under the Lint and Check filters, and in the lint swipe. A kit size (§2.3) past `kit.warn` shows as a size finding on each model of the kit, and in the overview's Kit size column. The measures rows named under `mark` in `lint/variables.json` show instead as their own value, bold and red, in the model panel.

**Definitions**

| id | term | definition |
|---|---|---|
| `D01` | high | the bounding-box Y extent |
| `D02` | tri budget | `tpu`: tris per unit of footprint × height, each floored so a small model is not read as dense |
| `D03` | hooped container | `kind:obj-container-barrel \| kind:obj-container-bucket \| kind:obj-container-chest \| kind:obj-container-crate` |
| `D04` | variant group | models that read as one thing; `main` is the one shown |
| `D05` | longest | an object's largest extent |
| `D06` | TBD | referenced by `G21`; not yet defined |

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
- **`I05`** — Like its deepest kind in shape, colour and style.
- **`I06`** — No outline, unless the outline is a core feature (`P04`).

The measured global rows, `I08`, `I09`, `I11`, live in `lint/measures.json` (§2.2).

---

## 2. Geometry

Everything measured off the mesh: extents, counts, pivots, band counts.

`tag:plural` and `kind:set` are exempt.

### 2.1 Construction & placement

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G01` | `*` | `tag:hero` | model | range | 8–12 flat pieces per full circle, where the model has a round cross-section |
| `G02` | `*` | `mat:textile` | `minEdge` | min | 0.015 |
| `G03` | `mat:textile` | — | `minEdge` | min | 0.01 |
| `G07` | `*` | — | `part:split node` | is | origin at the joint |

`G04` (tri budget per kind) lives in `lint/kinds.json` as `tpu.max` (§2.3); `G05` and `G06` (grounded, centred) live in `lint/measures.json` (§2.2).

### 2.2 Measures — in `lint/measures.json`

Every rule that asserts on one recorded field of one model lives here as a row: `id`, `when`, `except`, `field`, `assert`, `value`. `when` and `except` are `F05` terms; `field` is a recorded field or `nmat`; `assert` is `min`, `max`, `range`, `is` or `not`; `value` is a number, `true`/`false`, a range `a–b`, or a field with a factor (`nmat × 2`). A row applies when `when` matches and `except` does not.

Rows here: `I08`, `I09`, `I11` (alpha, PBR factors, draw calls), `G05`–`G06` (grounded, centred — warnings, not errors), `G09` and `G11`–`G15` (materials and the band budget), `G19` (barrel triangles).

`G13` caps bands at `bandsmax`: `bands.max` on the model's kind in `lint/kinds.json`, inherited per `F10`, 5 from `defaults`. A kind raises it only where several colours define the thing itself.

Run `node lint/measures.mjs`, or `node lint/measures.mjs G11 G12` for some rows.

### 2.3 Size and budget

`kind:set`, `kind:str-building-commercial-skyscraper`, `kind:str-building-military-castle` and `kind:str-platform-deck` are exempt. Of the rest, `tag:comp`, `tag:plural`, `tag:broken`, `tag:pickup` and `tag:piece` are exempt from the extents and only `tag:plural` from the budget, per measure in `lint/variables.json`.

Limits per kind live in `lint/kinds.json` as `high.min`, `high.max`, `longest.min`, `longest.max` and `tpu.max` (`D02`), inherited per `F10`, falling back to the `defaults` block, which sets `longest` and an 8 `high.max` for everything; `env-terrain-mountain` lifts that ceiling. A kind can also set `defaults` of its own, which replace the global ones for everything under it: `obj-transport` raises `high.max` to 30. The budget is set on 16 kinds and nowhere else, so a kind with no limit above it is unchecked. A kind is held to one measure, `high` or `longest`: the nearest kind in its chain that sets either decides which. Limits of that measure inherit per `F10`; limits of the other come only from `defaults`.

A kit with models in at least `kit.minKinds` kinds that have their own min and max gets a kit size: the median, over those kinds (small and big versions counted apart), of how far its models sit from the middle of their range. Past `kit.warn` either way is a warning, past `kit.error` an error, both in `lint/variables.json`. Each model is then held to its kind's own limits after dividing by its kit size; `defaults` apply to its size as it is. A kit at the wrong scale shows as one kit line on each of its models instead of a size finding against every range, and a size finding names both the model's size and the size it reads at its kit size. A collection gets one kit size over all its kits.

A `scale-small` or `scale-big` model is held to its kind's `scale` in `lint/kinds.json`: a number multiplies the kind's own `high` and `longest` limits, not `tpu.max` or the `defaults`; an object gives the limits for that value. A kind refuses a value its `scale` does not set, and both values when it has no `scale`. `attributeKinds` in `lint/variables.json` names the kinds each other attribute is offered on: `storeys` on `str-building`.

Past a limit by no more than `warnBand` is a warning; further is an error.

Run `node lint/size.mjs`.

### 2.4 Boxes and part counts

`tag:comp`, `tag:plural` and `kind:set` are exempt.

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G16` | `D03` | — | `part:hoop` | range | 5–15% of longest, high |
| `G18` | `kind:obj-container-barrel` | — | `part:side plank` | range | 8–14 |
| `G20` | `kind:obj-container-barrel \| kind:obj-container-bucket` | — | `part:hoop` | max | 3 |
| `G21` | `kind:obj-container-crate & D06` | — | `part:plank` | range | 3–7 side by side per face |
| `G23` | `kind:str-marker-flag \| kind:str-canopy \| kind:obj-transport-watercraft-accessory` | — | `part:sail, canopy, canvas` | range | 0.01–0.05 thick |

---

## 3. Taxonomy

What a model *is*, before any material or colour question.

**The tiers.** Every kind sits at one of these, read off its depth in `lint/kinds.json`.

| tier | role | word form | test |
|---|---|---|---|
| root | domain | abbreviation | `obj` `str` `env` `set` `char` |
| root+1 | category | collective noun | "container", "flora" — you cannot hold one |
| root+2 | sub-category or kind | collective or singular | either |
| kind | is-a | singular noun | "a chest" |
| variant | one axis per parent | adjective or number | siblings differ on one thing only |

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `T01` | `*` | — | `kind` | is | the kind the glossary resolves the noun to; a noun not in the glossary takes the deepest leaf that fits; the parent is "other" |
| `T02` | `*` | — | `kind` | not | decided by kit of origin |
| `T03` | `*` | — | `tags` | is | the artist tag from the kit, only for artists with several kits adopted |
| `T04` | `tag:plural` | — | model | is | several instances of one thing in one model |
| `T05` | `mat:special` | — | `specialWhy` | not | empty |
| `T07` | `kind:str-building` | — | `storeys` | is | the storeys read from the model — door height, wall bands, floor lines — in steps of 0.5; a room in the roof is half a step; a building whose storeys do not read carries none |
| `T08` | `*` | — | `kind` | is | a node holding at least 4 models, unless the split it makes is significant and clear |
| `T09` | a variant split on shape | — | the parent | is | empty: the split is exhaustive. A split on kind may leave the parent holding the rest |
| `T10` | a word two kinds both answer to | — | the specialised `kind` | is | the qualified form (`warhammer`, `cookpot`); the generic one stays plain |
| `T11` | a model reading as two or more kinds from different nodes | — | `kind` | is | `set` |
| `T12` | a kind with `scale` in `lint/kinds.json` | — | `scale` | is | `scale-small` for a clearly smaller version (half, low, short, small), `scale-big` for a clearly bigger one (double, high, long, tall); none for the regular size. A new split on size is an attribute, not a kind |

- **`T06`** — A `tag:pickup` model is deliberately scaled differently when found and when collected, and is exempt from size rules.

---

## 4. Kind → materials

What a kind is made of. Colour follows from §5.

`kind:set` is exempt.

### 4.1 In `lint/kinds.json`

These rows live in `lint/kinds.json`, on the node of the kind they name, and read per `F10`. Two fields:

```
mat.«material»: «subtype»       «material»   a material id
                                «subtype»    «material» or one under it

has: [ «material», [«material», …] ]        a plain entry is required outright,
                                            a nested list is any one of them
```

`mat.` only asks a model that already carries the material to carry the right subtype. `has` asks for the material in the first place. Because the deepest row wins, none of these rows carries a `!` term.

`lint/materials.json` says which tags count as under `«material»`. `special` is held out of the check. The same run flags a model carrying a material together with a subtype of it.

Run `node lint/mat.mjs`.

### 4.2 The rest

Parts, nouns and groups the catalogue does not record. Checked by eye.

| id | when | subject | assert | value |
|---|---|---|---|---|
| `M04` | `kind:obj-kitchenware-cookware & mat:metal` | model | is | paired variants, one `metal-iron-steel` one `metal-iron-cast` |
| `M10` | `kind:obj-container-bag` | `part:fastener, closure` | is | `rope`, `leather` |
| `M12` | `kind:obj-kitchenware-tableware-drinkware` mug, cup, tankard | `part:hoop, handle` | is | `metal-iron:` |
| `M13` | `kind:obj-kitchenware-tableware-drinkware` cup, tankard | model | has | `wood:`, `ceramic` |
| `M15` | `kind:obj-equipment-weapon \| kind:obj-tool` | `part:handle` | is | `wood:`, `textile` |
| `M16` | `kind:obj-equipment-weapon` | `part:strap` | is | `textile`, `leather` |
| `M17` | `kind:obj-equipment-weapon & !fastener joining stone, bone, metal-iron-steel to wood \| kind:obj-tool & !fastener joining stone, bone, metal-iron-steel to wood \| kind:obj-equipment-shield & !fastener joining stone, bone, metal-iron-steel to wood` | `part:grip, fastener, join` | is | `textile`, `rope`, `leather` |
| `M18` | `*` fastener joining `stone`, `bone`, `metal-iron-steel` to `wood` | `part:fastener` | is | `leather` |
| `M21` | `kind:obj-equipment-apparel` belt, shoe, strap | model | has | `leather` |
| `M24` | `kind:obj-transport-watercraft-accessory` | `part:sail` | is | `textile` |
| `M25` | `kind:obj-transport-watercraft` | `mat:wood` | min | 2 |
| `M28` | `kind:obj-equipment-pocketitem-book` | `part:strap, band, binder, corner` | is | `leather`, `metal-iron:` |
| `M32` | `*` sticks, unworked poles | model | is | `wood-bark` |
| `M33` | `kind:obj-art-instrument` bells | model | has | `metal-copper`, `metal-gold` |
| `M35` | `kind:str-part-roof` carrying `sienna` or `terracotta` | model | has | `ceramic` |
| `M38` | `kind:str-part-wall \| kind:str-part-floor \| kind:obj-resource-stone` bricks | `mat:stone` | is | `stone-masonry` |

---

## 5. Subject → colour

Every row names the set of bands its subject may draw from. How rows combine: `F08`.

`kind:set` is exempt.

### 5.1 Material palettes

One row per material: the bands a model carrying it may draw from. They live in `lint/materials.json`, on the node of the material they name, as `bands`, and read per `F10`. The band names come from the lane table at the top of that file. A palette that holds only at one size — glass at `size:s` — lives in `lint/variables.json` under `palette.sizeBands`, and wins over the node's own `bands` for a model of that size.

Run `node lint/palette.mjs`.

### 5.2 In `lint/kinds.json`

The rows the catalogue can answer live in `lint/kinds.json`, on the node of the kind they name, as the bands that kind may draw from, and read per `F10`. Two fields:

```
band.«material»: [ «band», … ]     holds for a model of the kind carrying «material»
band: [ «band», … ]                holds for every model of the kind
```

`band.«material»` says when the list applies, not which bands belong to that material.

Run `node lint/bands.mjs`.

### 5.3 The rest

Checked by eye. Each row names a noun the catalogue does not record, a `part:` the mesh does not label, `any`, or a condition beyond a band list.

| id | when | subject | assert | value |
|---|---|---|---|---|
| `B32` | `kind:obj-food` fish | model | is | `nickel`, `basalt`, `slate`, `azure` |
| `B33` | `kind:obj-food` cheese | model | is | `amber` |
| `B35` | `kind:obj-food-vegetable & !carrot & !pumpkin` | model | is | `moss` |
| `B36` | `kind:obj-food-vegetable` carrot, pumpkin | model | is | `terracotta` |
| `B37` | `kind:obj-food-grain & !wheat & !straw \| kind:obj-food-baked` | model | is | `tan`, `camel`, `chestnut` |
| `B38` | `kind:obj-food-grain` wheat, straw | model | is | `tan` |
| `B39` | `*` chocolate | model | is | `chestnut`, `umber` |
| `B40` | `kind:obj-equipment-weapon \| kind:obj-tool` | `part:wrapped grip, binding` | is | `taupe`, within UV 0.02–0.40 of the band |
| `B42` | `kind:obj-transport-watercraft & !sails` | `mat:textile` | is | `ivory`, `hunter`, `slate` |
| `B43` | `kind:obj-transport-watercraft-accessory` sails \| `kind:str-canopy` canvas | `mat:textile` | is | `ivory`, striped `sienna` and `ivory` |
| `B46` | `kind:obj-equipment-pocketitem-scroll` | `part:text` | is | `slate` |
| `B47` | `kind:obj-equipment-pocketitem-scroll` | `part:accent` | is | `sienna`, `hunter`, `azure` |
| `B51` | `kind:env-flora & !kind:env-flora-tree \| kind:env-flora & kind:env-flora-tree-palm` | `part:stem, leaf` | is | `moss` |
| `B55` | `kind:env-fungi` | `part:cap` | is | `sienna`, `camel` |
| `B57` | `*` | `part:dried stalk` | is | `taupe` |
| `B58` | `*` | `part:flame, glow, light` | is | `amber`, with the lane's UV range not 0 |

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
- **`P08`** — A `kind:set` is not validated directly.
- **`P09`** — Rescaling is done globally for a kit.

Importing a pack:

- **`P10`** — One scale factor for the whole pack, for now. Four kits break this: `styloo-food`, 0.6 with ×0.5 for sushi pieces and sushi boards; `quat-pirate`, whose firearms carry half the kit factor; `styloo-farm`, whose batches carry one factor per group on top of 0.294 — ×0.7 for crops, sword, haystacks, hedges and cart; ×1.1 for fruit and garden; ×1.5 for pond, fish, rocks, fences, soil, windmills, barns and tractor; ×2.4 for smelters, tools, barrel, crate, mailbox, mixer, gas can and water drops; and `styloo-kitchen`, 0.294 with ×3 for cutlery, mug, eggs, egg carton and yoghurt. No other kit takes a per-model factor.
- **`P11`** — 2 source colours: keep 2.
- **`P12`** — 3–4 source colours: may drop 1.
- **`P13`** — 5 source colours: may drop 2.
- **`P14`** — 6 or more source colours: keep at least 3.
- **`P15`** — Kits of one style whose source packs share units form a collection: a `catalog/data/manifest.js` row with `collection` (slug), `name` and `kits`. Its kits share one scale factor and keep their own folders, model ids and manifest rows. The catalogue, swipe, scale and curves pages, the overview and the kit size treat a collection as one kit; TBD and reject do not. Collections: `wizp-eastern` (`wizp-asia`, `wizp-village`), `wizp-grave` (`wizp-grave`, `wizp-arena`), `wizp-western` (`wizp-mediev`, `wizp-fish`), `ken-mini` (`ken-arcade`, `ken-forest-mini`, `ken-market`, `ken-mini-dun`), `ken-transport` (`ken-car`, `ken-train`, `ken-water`), `ken-city` (`ken-commercial`, `ken-industrial`, `ken-suburban`), `isa-tt` (`isa-plants`, `isa-food`, `isa-kitchen`, `isa-bakery`, `isa-picnic`, `isa-park`, `isa-playground`), `kay-chars` (`kay-adventurers`, `kay-skeleton`), `kay-rpg` (`kay-tools`, `kay-weapons`, `kay-resources`), `kay-undead` (`kay-spook`, `kay-skeleton-1`), `fs-modular` (`fs-terrain`, `fs-town`).

---

## 7. Variants

Which models sit together as one entry and which stand apart. Groups live in `catalog/data/asset_variants.json`, attached to the catalogue by `build-catalog.mjs`. A group exists for one of these reasons.

| id | reason | shared | differs |
|---|---|---|---|
| `D08` | material | kind, size, shape | the material it is made of |
| `D09` | recolour | kind, size, shape, material | band |
| `D10` | size | kind, shape, material, band | extents, by redesign |
| `D11` | state | kind, material | a part moved, removed, filled or recoloured |
| `D12` | plural | kind, material, band | how many instances |

What holds of every group:

- **`V01`** — Its `kits` is one kit; a second only for the same artist, never across artists without the PO.
- **`V02`** — Its `kind` is the same for every member.
- **`V03`** — The more models of a kind, the more sit inside a group.
- **`V04`** — Reasons stack; the more and the wider, the sooner a model earns its own row.
- **`V05`** — A group is judged by how it reads, not by how far it measures.
- **`V06`** — A `D10` member is redesigned at that size: a longer ladder gains rungs.
- **`V07`** — For kinds wanting variety, `D08` and `D09` are made on purpose (`M04` is one).
- **`V08`** — The same reasons judge both ways: too alike is a dedupe, too far apart is its own row.

---

## Appendix

The kind tree is `lint/kinds.json`, written as `kind — nouns that resolve here`. Parent lines list nouns that have no leaf yet. Match with the deepest reasonable tier: ground you walk on is `env-terrain`, a rock set on it is `env-rock`.

Main:
`obj` = manufactured/portable thing
`env` = naturally occurring thing
`str` = constructed fixed thing

Other:
`char` = living or acting entity, incl. any obj it may equip, wear or carry
`set` = a mix of different things from different kinds

