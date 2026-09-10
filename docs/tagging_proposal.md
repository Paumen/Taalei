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

`*` waits at its parent: below the T5 gate until a kit brings more.

```
object
  object-container          barrel · chest · crate · bag · bottle · jug · bucket · box
                            pot · pan*
  object-kitchenware
    kitchenware-tableware   plates · cutlery · bowls*
    kitchenware-cookware    what is left once the vessels move out: lids, campfire stands
  object-food               meat · vegetable · baked · grain
  object-furniture          tables · seating (stools, benches, chairs)
                            other (shelves, cabinets, beds*, rugs*)
  object-tool               hand · long · supplies
  object-weapon
    weapon-melee            sword · axe · dagger · hammer · fist*
    weapon-range            bow · crossbow · arrow · quiver · staff
  object-wearable           shield · helmet* · armour* · clothing* (capes, robes, shoes)
  object-lighting           candle · lantern (mounted ones too) · torch · fire
  object-transport          boat · ship · cart · other (anchors, paddles, wheels)
  object-pocketitem         book · scroll · coin · jewellery · key · lock
  object-resource           metal · timber · plank · stone · textile
  object                    the catch-all: levers, springs, hearts, stars

nature
  nature-flora
    flora-tree              conifer · palm · leafed
    flora-deadwood          bare · branch · stump*
    flora-plant             flower · grass · cactus · other (cattails)
  nature-fauna              fish · bone · other
  nature-fungi
  nature-terrain            rock (mountains, boulders, cliffs*, pebbles*)
                            ground (dirt and stone paths, sand and grass patches)
                            water · cave

structure
  structure-building        wall · floor · roof · door · window
                            pillar (columns, arches) · access (stairs, ladders)
  structure-site            fence · sign (signboards, banners, flags, targets)
                            deck (scaffolds, platforms, docks, bridges)
                            grave (gravestones, crypts, coffins)

character
```

A model may sit in two of these at once (K3): an axe is `object-weapon-melee-axe` and
`object-tool`, a knife is a tool and `kitchenware-tableware-cutlery`, a mushroom is
`nature-fungi` and `object-food`.
