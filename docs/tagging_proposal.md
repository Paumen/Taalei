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

`≈` marks a keyword estimate that still needs a data pass. `*` waits at its parent,
below the T5 gate until a kit brings more.

```
object
  object-container    barrel 16 · chest 22 · crate 18 · bag 15 · bottle 26 · jug 5 · bucket 6
                      box 6 · pot 51 · pan 4*
  object-kitchenware  tableware: plates 17 · cutlery 8 · bowls 4*
                      cookware:  lids 4 · stands 2
  object-food         43    meat · vegetable · baked · grain
  object-tool         47    hand · long · supplies
  object-weapon       melee: sword 15 · axe 12 · dagger 6 · hammer 6
                      range: bow 17 · crossbow 8 · arrow 8 · quiver 6 · staff 9
  object-wearable     ≈18   shield 15 · helmet · armour · cape · ring
  object-lighting     28    candle 15 · lantern 12 · torch 6 · fire 8
  object-transport    36    boat 9 · ship 15 · cart 14 · other
  object-pocketitem   ≈70   book 36 · scroll 5 · coin 14 · jewellery ≈15 · key 9 · lock 2
  object-resource     metal ≈37 · timber 22 · plank ≈11 · stone ≈15 · textile ≈13

nature
  nature-flora-tree      conifer 17 · palm 14 · leafed 38
  nature-flora-deadwood  ≈105  bare 53 · branch 49 · stump 3
  nature-flora-plant     flower 21 · cactus 8 · grass 21 · other
  nature-fauna           42    fish 18 · bone 19 · other
  nature-fungi           8
  nature-terrain         rock 136 · ground 17 · water ≈11 · cave 8

structure
  structure-building  wall 151 · floor 62 · roof 31 · door 27 · window 22 · pillar ≈36 · access 31
  structure-site      144   fence 42 · deck 57 · grave 24 · sign 21

character  15
```
