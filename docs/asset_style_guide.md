# Asset style guide

Scope: items in the catalogue.

## 0. Reading the rules

For a model of a given kind, every rule on its ancestor kinds also applies.

**Tag fields**

| id | field | job | set |
|---|---|---|---|
| `F01` | `material` | what it is **made of** | closed, parented |
| `F02` | `kind` | what it **is** — form cohort | closed, hierarchical, **exactly one** |
| `F03` | `size` | rough bbox: `s` `m` `l` | closed, measured |
| `F04` | `tag` | kit/artist, theme, flags (`hero`, `plural`, `animation`, `comp`, `pickup`, `broken`, `piece`, `mounted`, etc.) | open |
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

**[F06] Subject.** What the assert is about. A closed set: `model`, any recorded field (`kind`, `size`, `tags`, `mat`, `nmat`, `storeys`, `scale`, `bands`, `calls`, `tris`, `tpu`, `pieces`, `anim`, `alpha`, `pbr`, `minEdge`, `minTube`, `minWall`, `thickRel`, `badNormals`, `leaf`, `grounded`, `centered`, `specialWhy`), `dim:w`, `dim:d`, `dim:high`, `dim:longest`, `band`, `mat:<id>`, `part:<name>`, `—`.

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

**[F09] `special` in the counts.** `nmat` counts materials without `special`; `bands` counts bands without the `special` one. A `special` model is exempt from `G09`. The band a `special` reason names (`col,row`) passes every material palette (§5.1) of that model.

**[F10] Rules that live in the JSON.** Six checks read their rows from `lint/*.json` rather than from a table here: measures (§2.2) from `lint/measures.json`, and five tree checks from `lint/kinds.json` and `lint/materials.json`: size and tri budget (§2.3), kind → materials (§4.1), material palettes (§5.1) and kind bands (§5.2). A measures row carries its own `when` and `except` terms. The tree checks read the same way:

- **Inheritance.** A field set on a kind or a material holds for everything under it. Where a chain sets the same field more than once, only the deepest is read (`F08` rule 3) — this is how a palm takes `moss` where the trees above it take `hunter`. Fields naming different materials all apply at once. `has` is one exception: every `has` entry down the chain holds. Size limits are the other: a kind takes limits of one measure only (§2.3).
- **Coverage.** Bands are recorded per model, not per material, so a band row passes when the model shows at least one band from the list. A list admitting `transparent` holds no band and is not checked.
- **Exemptions** live in `lint/variables.json`, per check.
- **Each check reads only its own rows**, so §5.1 and §5.2 never widen or fault each other.

**Definitions**

| id | term | definition |
|---|---|---|
| `D01` | high | the bounding-box Y extent |
| `D02` | tri budget | `tpu`: tris per unit of footprint × height, each floored so a small model is not read as dense |
| `D03` | hooped container | `kind:obj-container-barrel \| kind:obj-container-bucket \| kind:obj-container-chest \| kind:obj-container-crate` |
| `D04` | variant group | models that read as one thing; `main` is the one shown |
| `D05` | longest | an object's largest extent |

**Colour bands.** `column,row` cell of the 16 × 4 grid of `kits/colormap.png`. Each band is a vertical gradient: UV 0 of the band is its lightest end, 1 its darkest. `twine` is the exception: a tile of 45° two-tone stripes for rope, with u running around the strand and v along it. `glass` carries lighter diagonal streaks: each glass piece gets one soft stripe that runs on across its folds, set with `node tools/import/glass-uv.mjs <file.glb>` after it is moved into the band. Cut log and stump ends carry soft round growth rings around a darker pith at the log's heart, so a split piece shows arcs, built with `node tools/import/end-grain.mjs <file.glb>`; a stump top (`--up`) keeps its cracks and carries the rings across its bevel or broken corner.

| band | lane |
|---|---|
| `transparent` | — |
| `tan` | 0,0 |
| `camel` | 1,0 |
| `chestnut` | 2,0 |
| `bark` | 3,0 |
| `terracotta` | 5,0 |
| `amber` | 6,0 |
| `sienna` | 8,0 |
| `magenta` | 9,0 |
| `teal` | 10,0 |
| `lime` | 11,0 |
| `hunter` | 1,1 |
| `moss` | 3,1 |
| `slate` | 6,1 |
| `glass` | 3,2 |
| `azure` | 4,2 |
| `ivory` | 5,2 |
| `twine` | 14,2 |
| `taupe-dark` | 12,3 |
| `basalt` | 13,3 |
| `taupe` | 14,3 |
| `nickel` | 15,3 |

---

## 1. Global

**Golden rules** — the hardest rules, checked on every PR by `node lint/golden.mjs` straight from the workfiles. A broken rule fails the PR check. Values in `golden` in `lint/variables.json`.

- **`R01`** — No catalogue model's longest side is under 0.05. A smaller model is scaled up to 0.05 or rejected for `size`.
- **`R02`** — Every vertex normal is unit length, as the glTF validator reads it.
- **`R03`** — No triangle with corners in different colormap cells.
- **`R04`** — No scale on a root node: the size belongs in the geometry.
- **`R05`** — Every model has triangles.
- **`R06`** — The only texture is `Textures/colormap.png`.
- **`R07`** — No transparency: every material is opaque. `glass` and models with an animation clip (`animation`) are exempt.
- **`R08`** — No PBR factors: every material is metallic 0, roughness 1. `glass` is exempt.
- **`R09`** — One draw call per model. `glass`, `animation` and `tba` are exempt.
- **`R10`** — Every workfile has exactly one kind, a node of `lint/kinds.json`, and every tagged model has a workfile.
- **`R11`** — Every material tag is a node of `lint/materials.json`, and no model carries a material together with a subtype of it.

- **`I01`** — Chunky, caricatured; not thin, not primitive.
- **`I02`** — Few details, chamfered edges, rounded-soft.
- **`I05`** — Like its deepest kind in shape, colour and style.
- **`I06`** — No outline, unless the outline is a core feature (`P04`).

The measured global row `I01` lives in `lint/measures.json` (§2.2).

---

## 2. Geometry

Everything measured off the mesh: extents, counts, pivots, band counts.

`tag:plural` and `kind:set` are exempt, except from `G27` and `G28`.

### 2.1 Construction & placement

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G01` | `*` | `tag:hero` | model | range | 8–12 flat pieces per full circle, where the model has a round cross-section |
| `G07` | `*` | — | `part:split node` | is | origin at the joint |
| `G28` | `*` | — | `backface` | max | above: 0.2% warning, 0.5% error; below: 0.5% warning, 5% error |

`node lint/sides.mjs [ids]` warns on a model with a round loop of more than `sides.max` (32) sides, from `lint/variables.json`; `tag:hero` is left out, as in `G01`.

`G28` is the largest share of a model's silhouette that shows back faces, over 16 views above the horizon and one from straight below; single-sided surfaces count. A changed model may not grow any view's share by more than `backface.worse`. Limits in `backface` in `lint/variables.json`. Run `node lint/backface.mjs` (`--help` for how it measures).

`G04` (tri budget per kind) lives in `lint/kinds.json` as `tpu.max` (§2.3); a `tag:hero` model gets twice its kind's budget, set by `tpu.tagFactors` in `lint/variables.json`; `G05` and `G06` (grounded, centred) live in `lint/measures.json` (§2.2).

### 2.2 Measures — in `lint/measures.json`

Every rule that asserts on one recorded field of one model lives here as a row: `id`, `when`, `except`, `field`, `assert`, `value`. `when` and `except` are `F05` terms; `field` is a recorded field, `nmat`, or `band:«band»` (whether the model shows that band); `assert` is `min`, `max`, `range`, `is` or `not`; `value` is a number, `true`/`false`, a range `a–b`, or a field with a factor (`nmat × 2`). A row applies when `when` matches and `except` does not.

Rows here: `I01` (chunky, a warning), `G05`–`G06` (grounded, centred, warnings), `G09`, `G11`–`G15`, `G17` and `G30` (materials and the band budget), `G19` and `G32` (barrel triangles), `G27` (thin parts), `G31` (no `taupe-dark` at `size:s`). Their values and exceptions are in the file.

- **`G27`** — 0.006 is a hard floor: no part gets thinner and no fix aims below it. `thinneed` is `thin.min` on the kind in `lint/kinds.json` (per `F10`, 0.026 by default). `minTube` under `thinneed` is an error, `minWall` under it a warning, and `minWall` under 0.006 always an error.
- **`G13`** — Bands are capped at `bands.max` on the kind in `lint/kinds.json` (per `F10`, 5 by default). A kind raises it only where several colours define the thing itself.
- **`I01`** — `thickRel`, the model's thickness against the median of its kind, warns below 0.5, on leaf kinds only.

`node lint/measures.mjs --help` says how `minTube`, `minWall`, `thick` and `leaf` are measured. Run `node lint/measures.mjs`, or `node lint/measures.mjs G11 G12` for some rows.

### 2.3 Size and budget

`kind:set`, `kind:str-building-tower-skyscraper`, `kind:str-building-military-castle` and `kind:str-access-platform-deck` are exempt. Of the rest, `tag:comp`, `tag:plural`, `tag:broken`, `tag:pickup` and `tag:piece` are exempt from the extents and only `tag:plural` from the budget, per measure in `lint/variables.json`.

Limits per kind live in `lint/kinds.json` as `high.min`, `high.max`, `longest.min`, `longest.max` and `tpu.max` (`D02`), inherited per `F10`, falling back to the `defaults` block, which sets `longest` and an 8 `high.max` for everything; `env-terrain-mountain` lifts that ceiling. A kind can also set `defaults` of its own, which replace the global ones for everything under it: `obj-transport` raises `high.max` to 30. The budget is set on 16 kinds and nowhere else, so a kind with no limit above it is unchecked. A kind is held to one measure, `high` or `longest`: the nearest kind in its chain that sets either decides which. Limits of that measure inherit per `F10`; limits of the other come only from `defaults`.

A kit with models in at least `kit.minKinds` kinds that have their own min and max gets a kit size: the median, over those kinds (small and big versions counted apart), of how far its models sit from the middle of their range. Past `kit.warn` either way is a warning, past `kit.error` an error, both in `lint/variables.json`. The kit size is reported only: each model is held to its kind's limits at its own measured size, to the millimetre. A collection gets one kit size over all its kits.

A `scale-small` or `scale-big` model is held to its kind's `scale` in `lint/kinds.json`: a number multiplies the kind's own `high` and `longest` limits, not `tpu.max` or the `defaults`; an object gives the limits for that value. A kind refuses a value its `scale` does not set, and both values when it has no `scale`. `attributeKinds` in `lint/variables.json` names the kinds each other attribute is offered on: `storeys` on `str-building`.

Past a limit by no more than `warnBand` is a warning; further is an error.

Run `node lint/size.mjs` for extents and kit sizes, `node lint/tpu.mjs` for the tri budget.

### 2.4 Boxes and part counts

`tag:comp`, `tag:plural` and `kind:set` are exempt.

| id | when | except | subject | assert | value |
|---|---|---|---|---|---|
| `G16` | `D03` | — | `part:hoop` | range | 5–15% of longest, high |
| `G18` | `kind:obj-container-barrel` | — | `part:side plank` | range | 8–14 |
| `G20` | `kind:obj-container-barrel \| kind:obj-container-bucket` | — | `part:hoop` | max | 3 |
| `G23` | `kind:str-fixture-marker-flag \| kind:str-canopy \| kind:obj-transport-part` | — | `part:sail, canopy, canvas` | range | 0.01–0.05 thick |
| `G24` | `mat:textile-rope` | — | `part:cord` | min | 0.006 thick |
| `G25` | `mat:textile-rope` | — | `part:rope` | min | 0.025 thick |
| `G26` | `mat:textile-rope` | — | `part:cord, rope` | is | a closed strand; no flat strip or single-sided shell |

A cord is a thin line that ties, strings or hangs something light: a bowstring, necklace, fishing line. A rope carries load or binds: a guy line, rigging, railing, well rope, bell hanger, lashing, sack tie. Thick is face to face across the strand, in catalogue units.

---

## 3. Taxonomy

What a model *is*, before any material or colour question.

**The tiers.** Every kind sits at one of these, read off its depth in `lint/kinds.json`.

| tier | role | word form | test |
|---|---|---|---|
| root | domain | abbreviation | `obj` `str` `env` `set` `char` `sym` |
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
| `T07` | `kind:str-building` | — | `storeys` | is | the storeys read from the model — door height, wall bands, floor lines — in steps of 0.5; a room in the roof is half a step; where they do not read, its height against the kit's own storeyed buildings; mandatory on every building except `comp`, `plural`, `pickup`, `broken` and `piece`, and the only size a building is held to |
| `T08` | `*` | — | `kind` | is | a node holding at least 3 models, preferably from 2 artists and 3 kits; fewer only where folding them into the parent would make them outliers or a poor fit there |
| `T09` | a variant split on shape | — | the parent | is | empty: the split is exhaustive. A split on kind may leave the parent holding the rest |
| `T10` | a word two kinds both answer to | — | the specialised `kind` | is | the qualified form (`warhammer`, `cookpot`); the generic one stays plain |
| `T11` | a model reading as two or more kinds from different nodes | — | `kind` | is | `set` |
| `T12` | a kind with `scale` in `lint/kinds.json` | — | `scale` | is | `scale-small` for a clearly smaller version (half, low, short, small), `scale-big` for a clearly bigger one (double, high, long, tall); none for the regular size. A new split on size is an attribute, not a kind |
| `T13` | `kind:str-part-floor-unit \| kind:str-part-wall-unit \| kind:str-part-roof-unit \| kind:str-part-frame \| kind:str-part-gate-gateway \| kind:str-part-door-doorway \| kind:str-part-corridor \| kind:str-part-floor \| kind:str-part-pillar \| kind:str-access-stairs \| kind:str-access-platform-deck \| kind:str-access-platform \| kind:str-access-ramp` in a kit of `lint/grid.json` | — | `grid` | is | its size on the building grid in steps of 0.5: width × height for a wall, frame, gateway or doorway, width × depth for a floor, roof or corridor, longest side first, only the height for a pillar (`grid-h1`), width × depth × height for stairs, platforms and ramps (`grid-1x1x1`); as `grid-1x1`, `grid-2x1`, `grid-0-5x1`; a model of these kinds within 20% of the steps is stretched onto them, and only trims, eaves and log ends stick out past its cell, by at most 15%; none on corners, end caps, eaves and `kay-dun-1` scaffolds; the floor, wall and roof units carry no `scale` |

- **`T06`** — A `tag:pickup` model is deliberately scaled differently when found and when collected, and is exempt from size rules.

---

## 4. Kind → materials

What a kind is made of. Colour follows from §5.

`kind:set` is exempt.

### 4.1 In `lint/kinds.json`

These rows live in `lint/kinds.json`, on the node of the kind they name, and read per `F10`. Two fields:

```
mat.«material»: «subtype»       «material»   a material id
                                «subtype»    «material» or one under it,
                                             or a list of them, any one of which

has: [ «material», [«material», …] ]        a plain entry is required outright,
                                            a nested list is any one of them
```

`mat.` only asks a model that already carries the material to carry the right subtype. `has` asks for the material in the first place. Because the deepest row wins, none of these rows carries a `!` term.

`lint/materials.json` says which tags count as under `«material»`, by its tree, not by the id. The top nodes `mineral`, `plant`, `animal` and `polymer` group materials and are never carried. `special` is held out of the check; `special-liquid`, `special-emissive`, `special-food` and `special-organic` are plain materials, not under `special`. The same run flags a model carrying a material together with a subtype of it.

Run `node lint/mat.mjs`.

### 4.2 The rest

Parts, nouns and groups the catalogue does not record. Checked by eye.

| id | when | subject | assert | value |
|---|---|---|---|---|
| `M04` | `kind:obj-kitchenware-cookware & mat:metal` | model | is | paired variants, one `metal-steel` one `metal-iron-dark` |
| `M10` | `kind:obj-container-bag` | `part:fastener, closure` | is | `textile-rope`, `leather` |
| `M12` | `kind:obj-kitchenware-tableware-drinkware` mug, cup, tankard | `part:hoop, handle` | is | `metal-iron-mid`, `metal-iron-dark`, `metal-steel` |
| `M13` | `kind:obj-kitchenware-tableware-drinkware` cup, tankard | model | has | `wood:`, `ceramic` |
| `M15` | `kind:obj-equipment-weapon \| kind:obj-equipment-tool` | `part:handle` | is | `wood:`, `textile-cloth:` |
| `M16` | `kind:obj-equipment-weapon` | `part:strap` | is | `textile-cloth:`, `leather` |
| `M17` | `kind:obj-equipment-weapon & !fastener joining stone, bone, metal-steel to wood \| kind:obj-equipment-tool & !fastener joining stone, bone, metal-steel to wood \| kind:obj-equipment-armor-shield & !fastener joining stone, bone, metal-steel to wood` | `part:grip, fastener, join` | is | `textile-cloth:`, `textile-rope`, `leather` |
| `M18` | `*` fastener joining `stone`, `bone`, `metal-steel` to `wood` | `part:fastener` | is | `leather` |
| `M21` | `kind:obj-equipment-apparel` belt, shoe, strap | model | has | `leather` |
| `M24` | `kind:obj-transport-part` | `part:sail` | is | `textile-cloth:` |
| `M25` | `kind:obj-transport-watercraft` | `mat:wood` | min | 2 |
| `M28` | `kind:obj-equipment-pocketitem-book` | `part:strap, band, binder, corner` | is | `leather`, `metal-iron-mid`, `metal-iron-dark`, `metal-steel` |
| `M32` | `*` sticks, unworked poles | model | is | `bark` |
| `M35` | `kind:str-part-roof` carrying `sienna` or `terracotta` | model | has | `ceramic:` |
| `M38` | `kind:str-part-wall \| kind:str-part-floor \| kind:obj-resource-stone` bricks | `mat:stone` | is | `stone-masonry-light`, `stone-masonry-mid`, `stone-masonry-dark` |

---

## 5. Subject → colour

Every row names the set of bands its subject may draw from. How rows combine: `F08`.

`kind:set` is exempt.

### 5.1 Material palettes

One row per material: the bands a model carrying it may draw from. They live in `lint/materials.json`, on the node of the material they name, as `bands`, and read per `F10`. The band names come from the lane table at the top of that file. Glass carries a subtype — `glass-clear`, `glass-tinted`, `glass-screen`, `glass-mirror` — except vessels, which carry `glass`. Lit lantern and lamp panes are `special-emissive`, not glass. A palette that holds only at one size — glass at `size:s` — sits on the same node as `bands.«size»`, and wins over the node's own `bands` for a model of that size. Bands a material may also draw from under one kind sit on that kind's node in `lint/kinds.json` as `palette.«material»`, and add to that material's own palette — not its subtypes' — for models of that kind and its descendants.

Run `node lint/palette.mjs`.

### 5.2 In `lint/kinds.json`

The rows the catalogue can answer live in `lint/kinds.json`, on the node of the kind they name, as the bands that kind may draw from, and read per `F10`. Two fields:

```
band.«material»: [ «band», … ]     holds for a model of the kind carrying «material»
band: [ «band», … ]                holds for every model of the kind
```

`band.«material»` says when the list applies, not which bands belong to that material. A list of lists, `[ [ «band», … ], … ]`, holds when every inner list holds.

Run `node lint/bands.mjs`.

### 5.3 The rest

Checked by eye. Each row names a noun the catalogue does not record, a `part:` the mesh does not label, `any`, or a condition beyond a band list. `B63`–`B79` are set with `v-profile.mjs`, `flora-shade.mjs`, `roof-tone.mjs` and `ceramic-shade.mjs` in `tools/import`; their `--help` gives the options per row and the models left out.

| id | when | subject | assert | value |
|---|---|---|---|---|
| `B32` | `kind:obj-food` fish | model | is | `nickel`, `basalt`, `slate`, `azure`, `amber` |
| `B35` | `kind:obj-food-vegetable & !carrot & !pumpkin` | model | is | `moss` |
| `B37` | `kind:obj-food-grain & !wheat & !straw \| kind:obj-food-baked` | model | is | `tan`, `camel`, `chestnut` |
| `B38` | `kind:obj-food-grain` wheat, straw | model | is | `tan` |
| `B39` | `*` chocolate | model | is | `chestnut`, `bark` |
| `B40` | `kind:obj-equipment-weapon \| kind:obj-equipment-tool` | `part:wrapped grip, binding` | is | `taupe`, within UV 0.02–0.40 of the band |
| `B42` | `kind:obj-transport-watercraft & !sails` | `mat:textile` | is | `ivory`, `hunter`, `slate` |
| `B43` | `kind:obj-transport-part` sails \| `kind:str-canopy` canvas | `mat:textile` | is | `ivory`, striped `sienna` and `ivory` |
| `B46` | `kind:obj-equipment-pocketitem-scroll` | `part:text` | is | `slate` |
| `B47` | `kind:obj-equipment-pocketitem-scroll` | `part:accent` | is | `sienna`, `hunter`, `azure` |
| `B51` | `kind:env-flora & !kind:env-flora-tree \| kind:env-flora & kind:env-flora-tree-palm` | `part:stem, leaf` | is | `moss` |
| `B55` | `kind:env-fungi` | `part:cap` | is | `sienna`, `camel`, `ivory`, `taupe` |
| `B57` | `*` | `part:dried stalk` | is | `taupe` |
| `B58` | `*` | `part:flame, glow, light` | is | `amber`, with the lane's UV range not 0 |
| `B59` | `kind:env-flora-tree-conifer & !tag:plural` | `part:foliage` | is | per tier, UV 0.08 of the band at the tier top to 0.85 at its rim; undersides 0.92. A tier is foliage bounded by undersides |
| `B60` | `kind:env-flora-tree-conifer & !tag:plural` | `part:trunk` | is | UV 0.80 of the band where the foliage starts to 0.20 at the base |
| `B61` | `kind:env-flora-tree & !kind:env-flora-tree-conifer & !kind:env-flora-tree-palm & !tag:plural`, except `wizp-tree/banana-tree`, `wizp-asia/tree-garden`, `quat-shoot/tree-b` | `part:foliage` | is | per canopy blob, UV 0.08 of the band at the blob top to 0.85 at its bottom; undersides 0.92. A blob is foliage bounded by undersides |
| `B62` | as `B61` | `part:trunk, branch` | is | as `B60` |
| `B63` | `kind:env-terrain-rock & !tag:plural` | `part:rock` | is | per rock piece, lighter at its top and darker at its bottom: UV 0.08 of the band at the top to 0.85 at the bottom, less its mean, added to the light and dark the rock already has; a rock past the band is squeezed back in whole |
| `B64` | `kind:str-building* & !tag:plural` | all parts | is | as `B63`, within 0.15 of the piece's own lightest and darkest; a piece that would pass that gets less gradient instead; a spot that faces down or has the model's own geometry right above it stays as it was |
| `B65` | `kind:str-part-wall* \| kind:str-barrier-wall`, `!tag:plural` | all parts | is | as `B64` |
| `B66` | `kind:obj-transport* & !kind:obj-transport-part* & !tag:plural` | all parts | is | as `B64` |
| `B67` | `kind:str-part-roof* & !tag:plural` | all parts | is | as `B64`, except a piece whose darkest point is in its upper half, which stays as it was |
| `B68` | `kind:str-barrier-fence* & !tag:plural` | all parts | is | as `B67` |
| `B69` | `kind:str-part-door* \| kind:str-part-frame* \| kind:str-part-pillar* \| kind:str-access-stairs*`, `!tag:plural` | all parts | is | as `B67` |
| `B70` | `kind:env-flora & !kind:env-flora-tree* & !kind:env-flora-coral & !tag:plural` | `part:foliage, stem` in `moss`, `hunter` | is | per piece, UV 0.08 of the band at its top to 0.85 at its bottom; undersides 0.92. A model with its own light and dark detail (ribs, veins, stripes, spots, rims) keeps it, with the gradient added on top as `B63` |
| `B71` | `kind:env-fungi & !tag:plural`, except cut halves and slices | `part:cap` | is | UV 0.08 of the band at the cap top to 0.85 at its rim; undersides 0.92; detailed models as in `B70` |
| `B72` | as `B71` | `part:stem` | is | as `B60`: UV 0.80 under the cap to 0.20 at the base |
| `B73` | `kind:env-remains-deadwood* & !tag:plural` | `part:bark` | is | over the whole model, UV 0.08 of the band at the top to 0.85 at the base; detailed models as in `B70` |
| `B74` | `kind:env-flora-tree-palm & !tag:plural` | `part:frond` in `moss` | is | as `B70`, with each model's own detail kept |
| `B75` | as `B74` | `part:trunk` in `tan` | is | as `B60`, with each model's own detail kept |
| `B76` | sea animals: `kind:env-fauna-fish* \| kind:env-fauna-starfish`, and `env-fauna*` of `quat-ocean` and `quat-fish`; `!tag:plural` | all parts | is | per piece, darker at its top and lighter at its bottom, added on top of the light and dark the model already has, so painted bellies, stripes and spots stay |
| `B77` | roofs: `kind:str-part-roof*`, and the roof of `kind:str-building*` and `kind:str-canopy*`, `!tag:plural`, except sci-fi metal roofs | roof surface: the band seen most from above, on the pieces that carry it | is | one band by roof type: ceramic `sienna`, wood `chestnut`, thatch `tan`, stone `taupe`, metal `nickel`, cloth its own. Pitched, cone and dome pieces UV 0.15 at the top to 0.80 at the eave (thatch 0.25 to 0.70, metal 0.20 to 0.70, cloth 0.30 to 0.60); flat pieces 0.40; faces under the roof 0.90; each piece keeps its own light and dark. Overrides `B64` and `B67` on the roof |
| `B78` | `kind:obj-container-pot*` carrying `ceramic:`, `!tag:plural` | the bands its ceramic tags name: `ceramic-light` `ivory`, `ceramic-mid` `terracotta`, `ceramic-dark` `sienna` | is | shaded by facing: a face pointing up takes the top of the band's range, a side the middle, a face pointing down the bottom; ranges in `ceramic.ranges` in `lint/variables.json`. Body colour by kind in `lint/kinds.json` (`band.ceramic`). `ivory` is free as a rim, band or stripe. A pot's other colours are files of their own, named after the pot and its colours (`jug-sienna`, `pot-a-decorated-sienna-ivory`), in one `D09` group. Checked by `node lint/ceramic.mjs [ids]` |
| `B79` | `*` | model | is | smooth over curves: where faces meet under 50° normals are shared and painted light and dark changes per vertex, never per face; harder edges, tone steps between faces in one plane (stones, planks) and steps over 0.15 of the band (stripes, painted patterns) stay sharp. Rope (`twine`) stays flat shaded with its own tones. Set with `autosmooth.mjs 50`, then `tone-smooth.mjs 50`, then `ceramic-shade.mjs` on `B78` pots |

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
- **`P09`** — Rescaling is done globally for a kit, with `tools/import/scale.mjs`. A model's size lives in its geometry: no root node carries a scale, and `taaleiland.schaal` records the factor.

Importing a pack:

- **`P10`** — One scale factor for the whole pack. A model the source draws in other units or far off its real size may take its own factor; the factor each model got is in its `taaleiland.schaal`. Building parts — `str-part` walls, floors, roofs, doors, windows, pillars, frames, corridors and gates, `str-access` stairs, platforms and ramps — share one size system: a storey is 1.0 high and a wall tile 0.5, 1, 2 or 3 wide. Each kit with walls or floors takes one width and one height factor for its building parts, on top of the kit factor: the height factor makes its doorway and window walls 1.0 high, the width factor makes its plain wall width the nearest of those tiles. A kit without walls takes its floor tile and one factor. `kay-dun-1` takes the factor of `kay-dun-2`, and `lpa-west` a 2.0 tile. The factors are in `lint/grid.json`, set with `tools/import/scale.mjs --by <width>` and then `tools/import/stretch.mjs --y <height / width>`; the kit's ladders, catwalks, decks, docks, railings and chimneys take them too, ladders the height factor alone. A building part within 20% of the 0.5 steps is then stretched onto them with `stretch.mjs --x --y --z`. A door opening in such a kit is at least 0.4 wide and 0.8 high, widened and raised inside its wall with `tools/import/door-open.mjs`, and a loose door that fits it is stretched to match. A floor tile in such a kit has a slab 0.05 thick, set with `tools/import/floor-slab.mjs`; what stands on it keeps its own height, and a pit or block below or above the slab keeps the tile as it is. A model the kit factor puts under 0.05 takes its own factor that lifts it to 0.05 (`R01`).
- **`P11`** — 2 source colours: keep 2.
- **`P12`** — 3–4 source colours: may drop 1.
- **`P13`** — 5 source colours: may drop 2.
- **`P14`** — 6 or more source colours: keep at least 3.
- **`P15`** — Kits of one style whose source packs share units form a collection: a `catalog/data/manifest.js` row with `collection` (slug) and `kits`, plus `name` when it differs from the slug. Its kits share one scale factor where their source units allow, and keep their own folders, model ids and manifest rows. The catalogue, swipe, scale and curves pages, the overview and the kit size treat a collection as one kit; TBD and reject do not. The collections are listed there; each model's factor is in its `taaleiland.schaal`.
- **`P16`** — A catalogue model shows a thing at least 1.6 cm long in real life, the size of a die (`taalei-kit/dice`), the smallest allowed; a smaller thing, such as a piercing or a round pill, goes to reject with reason `size`.

---

## 7. Variants

Which models sit together as one entry and which stand apart. Groups live in `catalog/data/asset_variants.json`, attached to the catalogue by `build-catalog.mjs`. A group exists for one of these reasons.

A model whose shape is exactly that of another in its kit is a colour version of it. The build finds these from the geometry, so they are not listed in the file: each joins the group of the model it copies, or forms one with it. The model panel lists a group's shapes under Variants and the colour versions of the shown shape under Colours; a card counts its shapes, and its colour versions after ◑. The colour-versions button on the catalogue page leaves them out.

| id | reason | shared | differs |
|---|---|---|---|
| `D08` | material | kind, size, shape | the material it is made of |
| `D09` | recolour | kind, size, shape, material | band |
| `D10` | size | kind, shape, material, band | extents, by redesign |
| `D11` | state | kind, material | a part moved, removed, filled or recoloured |
| `D12` | plural | kind, material, band | how many instances |
| `D13` | set | kit | a set and the pieces it is made of |

What holds of every group:

- **`V01`** — Its `kits` is one kit; a second only for the same artist, never across artists without the PO.
- **`V03`** — The more models of a kind, the more sit inside a group.
- **`V04`** — Reasons stack; the more and the wider, the sooner a model earns its own row.
- **`V05`** — A group is judged by how it reads, not by how far it measures.
- **`V06`** — A `D10` member is redesigned at that size: a longer ladder gains rungs.
- **`V07`** — For kinds wanting variety, `D08` and `D09` are made on purpose (`M04` is one).
- **`V08`** — The same reasons judge both ways: too alike is a dedupe, too far apart is its own row.

---

## Appendix

The kind tree is `lint/kinds.json`, written as `kind — nouns that resolve here`. Parent lines list nouns that have no leaf yet. Match with the deepest reasonable tier: ground you walk on is `env-terrain-ground`, a rock set on it is `env-terrain-rock`.

Main:
`obj` = manufactured/portable thing
`env` = naturally occurring thing
`str` = constructed fixed thing

Other:
`char` = living or acting entity, incl. any obj it may equip, wear or carry
`set` = a mix of different things from different kinds
`sym` = abstract symbol or icon, not a thing in the world

