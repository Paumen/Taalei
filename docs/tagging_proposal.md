# Tagging — proposal for the style guide

Status: **proposal, nothing merged into `asset_style_guide.md`**. Exact wording for PO
approval; each K-rule is under 140 chars. Second pass, with the PO's decisions applied.

Review board (statuses, options, notes):
<https://claude.ai/code/artifact/0f4f0e02-f14e-4820-849d-bea1d571c9d6>

## 1. Four fields, four jobs

| field | job | set | who sets it |
|---|---|---|---|
| `material` | what the thing is **made of** | closed, 33 tags, parented | Claude, linted |
| `kind` | what the thing **is** | closed, hierarchical, one or more per model | Claude, PO glances |
| `size` | rough bbox: `s` `m` `l` | measured | automated |
| `tag` | kit/artist, theme, flags | open | mixed |

## 2. Rules — proposed Appendix A block K

- **K1.** A model carries at least one kind tag, or the `assembly` flag — never both, never neither. *(open)*
- **K2.** Tag the deepest level that fits. There is no minimum depth.
- **K3.** A kind implies its parents. Never tag a parent beside its own child.
- **K4.** Kind is what a thing is, material is what it is made of. Neither decides the other. *(open)*
- **K5.** A new sub-kind needs more than 5 models, variants included. An existing one is never retired for dropping below.
- **K6.** The set is closed. A model fitting no leaf takes its branch's catch-all, never a new tag.
- **K7.** A model may carry several kinds. An axe is a weapon and a tool.
- **K8.** A ship has a mast, a boat has none.
- **K9.** Terrain is the surface walked on; a plant standing on it is flora.
- **K10.** `special` and `hero` are the PO's alone. Claude proposes `hero` when adding to the catalogue.
- **K11.** Claude asks for `special` only after legal recolouring and a kind or material change have both failed.
- **K12.** `size` is measured, never hand-set: s, m and l from the bounding box.
- **K13.** Only kind and material are closed. Artist, theme and cross-reference tags stay an open field.
- **K14.** `animation` is measured. `ngons`, `stacks`, `assembly` and `hero` are judged. *(open)*
- **K15.** Artist tags are derived from the kit, never stored per model.

K1 and K7 are in tension: K7 allows several kinds, so K1 can no longer say "exactly one".
One of the two has to give — that is the open call.

## 3. The kind set

`≈` marks a keyword estimate that still needs a data pass.

```
object — 10 children, was 16
  object-container    barrel 16 · chest 22 · crate 18 · bag 15 · bottle 26 · jug 5 · bucket 6 · box 6
  object-kitchenware  ≈53   pot, pan, lid, cauldron · plate, bowl, cup, mug, cutlery      merge
  object-food         43    meat · vegetable · baked · grain
  object-tool         47    hand · long · supplies
  object-weapon       melee: sword 15 · axe 12 · dagger 6 · hammer 6
                      range: bow 17 · crossbow 8 · arrow 8 · quiver 6 · staff 9
  object-wearable     ≈18   shield 15 · helmet · armour · cape · ring
  object-lighting     28    candle 15 · lantern 12 · torch 6 · fire 8
  object-transport    36    boat 9 · ship 15 · cart 14 · other
  object-item         ≈89   book 36 · scroll 5 · coin 14 · jewellery ≈15 · key 11
                            mechanism · bone 19 · trinket 4                             merge
  object-resource     metal ≈37 · timber 22 · plank ≈11 · stone ≈15 · textile ≈13

nature — 4 children
  nature-flora-tree      conifer 17 · palm 14 · leafed 38
  nature-flora-deadwood  ≈105  bare 53 · branch 49 · stump 3
  nature-flora-plant     flower 21 · cactus 8 · grass 21 · other
  nature-fauna           23    fish 18 · other
  nature-fungi           8
  nature-terrain         rock 136 · ground 17 · water ≈11 · cave 8

structure — 2 children, was 5
  structure-building  wall 151 · floor 62 · roof 31 · door 27 · window 22 · pillar ≈36 · access 31
  structure-site      144   fence 42 · deck 57 · grave 24 · sign 21                      merge

character  15
```

Three merges carry the width down. `object-gear` over tool, weapon and wearable was
considered and dropped: with melee and range kept, a sword would sit five levels deep,
and "gear" stops telling an axe from a shield.

## 4. Settled

- **Depth** — deepest level that fits, no floor.
- **Several kinds allowed** — an axe is a weapon and a tool, with no cross-list.
- **Raw stock** — `object-resource` splits by material family, each with a `stacks` flag.
- **Trees** — living trees split from `nature-flora-deadwood`; grass moves under
  `nature-flora-plant`, which also settles the terrain/flora grass collision.
- **Cave** — opened despite 8 models, to fill from the cave kits.
- **Weapons** — melee and range levels kept.
- **Artist tags** — derived from `kit`, deleting ~1500 stored tags.
- **Cohort rule dropped** — judging style metrics per kind is a goal, not a tagging rule.

## 5. Two corrections to the first pass

1. **`ngons` is not a measurement.** `tags.json` defines it as "built around a round
   cross-section" — the hook for §2's facet rule, which is a judgement about form, not a
   file property. Only `animation` is measured.
2. **`lamp` is not a distinct kind.** The tag holds 12 models, 10 of them lanterns; the
   two named "lamp" render as the same lantern body on a bracket. Folded into `lantern`.

`stacks` also resists automation: names catch 42 of 54, missing `box-stacked`,
`crates-stacked` and `parts-pile-*` while wrongly catching `rope-bundle-a`, which is one
coiled rope. Those nine are worth a review pass; the tag stays judged.
