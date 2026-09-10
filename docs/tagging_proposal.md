# Tagging — proposal for the style guide

Status: **proposal, nothing merged into `asset_style_guide.md`**. Exact wording for PO
approval; every rule is under 140 chars.

Review board: <https://claude.ai/code/artifact/efc0dcc1-879b-4f58-aaf4-db8efe8909fa>

## 1. Four fields, four jobs

| field | job | set | who sets it |
|---|---|---|---|
| `material` | what the thing is **made of** | closed, 33 tags, parented | Claude, linted |
| `kind` | what the thing **is** | closed, hierarchical, one or more per model | Claude, PO glances |
| `size` | rough bbox: `s` `m` `l` | measured | automated |
| `tag` | kit/artist, theme, flags | open | mixed |

## 2. Rules

### T. Tag fields — what is closed, and how the axes meet

- **T1.** Only kind and material are closed sets. Artist, theme and flags stay an open field.
- **T2.** Kind is what a thing is, material is what it is made of. Neither decides the other.
- **T3.** A kind leaf may carry its material's name: `object-resource-plank` beside material `wood-planks`.
- **T4.** A tag implies its parents. Never tag a parent beside its own child.
- **T5.** A new sub-tag needs more than 5 models, variants included. An existing one is never retired for dropping below.
- **T6.** A closed set stays closed. A model fitting no leaf takes its branch's catch-all, never a new tag.
- **T7.** Artist tags are derived from the kit, never stored per model.

### K. Kind — what the model represents

- **K1.** A model carries at least one kind tag, or the `assembly` flag — never both, never neither.
- **K2.** Tag the deepest level that fits. There is no minimum depth.
- **K3.** A model may carry several kinds. An axe is a weapon and a tool.
- **K4.** A ship has a mast, a boat has none.
- **K5.** Terrain is the surface walked on; a plant standing on it is flora.

### F. Flags — measured or judged

- **F1.** `size` is measured, never hand-set: s, m and l from the bounding box.
- **F2.** `animation` is measured. `ngons`, `plural`, `assembly` and `hero` are judged.
- **F3.** `ngons` marks a round cross-section — the form §2 counts facets on.
- **F4.** `plural` is several of one kind in one model; `assembly` is several kinds. Piled loose or built in, both count.
- **F5.** Geometry may propose `plural`; it never decides it. Repeated parts are not repeated kinds.

### P. The PO's own

- **P1.** `special` and `hero` are the PO's alone. Claude proposes `hero` when adding to the catalogue.
- **P2.** Claude asks for `special` only after legal recolouring and a kind or material change have both failed.

## 3. The kind set

The PO's tree, with only this session's decisions applied. Changes are marked in the
right-hand column; everything unmarked is the original wording, typos fixed.

```
object-container-jug
object-container-chest
object-container-barrel
object-container-bucket
object-container-crate
object-container-bottle
object-container-bag
object-container-box                          added
object-container-pot                          added
object-container-pan
object-container

object-kitchenware-tableware-plates           was object-tablewear
object-kitchenware-tableware-cutlery
object-kitchenware-tableware-bowls
object-kitchenware-tableware
object-kitchenware-cookware
object-kitchenware

object-furniture-table
object-furniture-seating (eg stools, banks)
object-furniture (eg rugs, beds, cabinet, shelves)

object-food-meat
object-food-vegetable
object-food-baked
object-food-grain                             added
object-food

object-weapon-melee-sword
object-weapon-melee-dagger
object-weapon-melee-axe
object-weapon-melee-fist
object-weapon-melee-hammer
object-weapon-melee
object-weapon-range-bow
object-weapon-range-crossbow
object-weapon-range-arrow
object-weapon-range-quiver
object-weapon-range-staff
object-weapon-range
object-weapon

object-wearables (eg shield, helmet, cape, ring, necklace)   flattened

object-tool-hand
object-tool-long
object-tool-supplies
object-tool

object-transport-boat
object-transport-ship
object-transport-cart
object-transport (eg anchor, paddle, wheel)

object-lighting-lantern                       lamp folded in
object-lighting-torch
object-lighting-candles
object-lighting

object-pocketitem-book                        answers coins, scroll,
object-pocketitem-scroll                      books and key
object-pocketitem-coin
object-pocketitem-jewellery
object-pocketitem-key
object-pocketitem

object-resource-metal                         answers gold, planks, logs
object-resource-timber
object-resource-plank
object-resource-stone
object-resource-textile
object-resource

object (eg levers, springs)                   answers levers, springs

nature-flora-plant-cacti
nature-flora-plant-flower
nature-flora-plant-grass                      was nature-flora-grass
nature-flora-plant (eg cattail)
nature-flora-tree-conifer
nature-flora-tree-palm
nature-flora-tree
nature-flora-deadwood-bare                    new parent, holds branch
nature-flora-deadwood-branch
nature-flora-deadwood-stump
nature-flora-deadwood
nature-flora (eg cobweb, shelves)

nature-fungi                                  answers mushroom

nature-fauna-fish                             was nature-fauna-ocean
nature-fauna-bone                             answers bones
nature-fauna

nature-terrain-rocks-mountain
nature-terrain-rocks-formation
nature-terrain-rocks-cliff
nature-terrain-rocks-boulder
nature-terrain-rocks-pebble
nature-terrain-rocks
nature-terrain-ground                         was path-dirt, path-stone,
nature-terrain-water                          path, grass and beach
nature-terrain-cave
nature-terrain

structure-building-access (stairs, ladders)   answers ladder
structure-building-door
structure-building-floor
structure-building-roof
structure-building-window
structure-building-wall
structure-building-pillar                     added
structure-building

structure-site-fence                          answers signs, flags, fences
structure-site-sign
structure-site-deck                           was structure-bridge and
structure-site-grave                          structure-platforms
structure-site

character
```

A model may sit in two of these at once (K3): an axe is `object-weapon-melee-axe` and
`object-tool`, a knife is a tool and `object-kitchenware-tableware-cutlery`, a mushroom
is `nature-fungi` and `object-food`.

## 4. Proposed, not agreed

Observations from the catalogue that the PO has not ruled on. Nothing here is in the
set above.

- **Below the T5 gate today**, so they would open empty or near-empty: `melee-fist` (4),
  `tableware-bowls` (4), `container-pan` (4), `deadwood-stump` (3), `rocks-cliff` (4),
  `rocks-pebble` (4). `rocks-formation` matches no model at all.
- **`nature-flora-tree` has no leaf for a leafed tree**, though 38 models are one.
  Conifer and palm are named; the rest sit at the parent.
- **`nature-flora (eg cobweb, shelves)`** — "shelves" is unread; shells? And a cobweb is
  animal-made, not flora.
- **`coconut`** was in the notes under palm; 4 models, so below the gate.
- **A `fire` leaf under lighting** would take 8 models — campfires and braziers, which
  are not candles, lanterns or torches.
