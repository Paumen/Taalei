# Asset size review

> **Later change:** the modulair-terrein terrain tiles have since been removed
> from the collection — only that kit's props (and the four `mountain-*`) are
> left. The pack factor of ×0.5 and everything said below about its props still
> holds; the statements about its terrain tiles (§0, §1) describe pieces that
> are no longer there.

Cross-kit review of asset dimensions: are kits over- or undersized relative to
each other, and which pieces should serve as size references? Based on the
bounding boxes in `kits/catalog.json` (`wdh`, all 1102 models) plus
side-by-side renders of ~110 comparable assets. The renders are in
`docs/asset_size_review/*.png` and can be regenerated with
`NODE_PATH=$(npm root -g) node tools/vergelijk-groottes/render.mjs`
(groups defined in `tools/vergelijk-groottes/groups.json`).

## 0. What was fixed on this branch

Nine scale corrections came out of the review; the collection below is
described *after* them.

| kit | correction | result |
|---|---|---|
| village-kit | pack ×0.6 (first 0.5, softened by PO decision) | rowboat 1.39, cart 2.02, crate 0.60, barrel 0.30, windmill blades 4.20; building set tiles its own 0.6-module (doorways 1.20) |
| forest | pack ×0.5 | grass 0.27–0.47 into the 0.13–0.46 cluster of five kits (the original import compared grass height against grass *width*) |
| modulair-terrein | pack ×0.5 | palms 1.63 next to 1.69/2.06; chest 0.37, campfire 0.71 into their clusters; terrain tiles become raster-true 0.5 halves |
| props | pack ×0.6 (first tried 0.5, softened by PO decision) | barrel 0.60, table 0.48, stool 0.26 (seat height), box 0.44; bottles 0.13 as the small side |
| resources | pack ×0.5 | stone chunks 0.56 next to survival's resource-stones; piles remain readable pickup icons |
| tropical | 0.5 → 0.6 | barrel 0.43 → 0.52, mid-cluster; pier and plank stay ≈ one module |
| dungeon | pack 0.25 → 0.35, grid anchor deliberately released (PO decision) | chest 0.46, chair 0.43, bed 1.05, barrel 0.70, bottle 0.31, torch 0.37; walls/floors/doorways now 1.40 |
| survival-kit | ×0.9 (PO decision; direct kit, no importer — factor recorded in each GLB's extras) | chest 0.46, tree 2.54, doorway 0.93, workbench 0.52, bottle 0.28; index 1.12 → 1.06 |

The dungeon correction went in two steps — first only the furniture subset,
then (PO decision) the whole pack, restoring one factor per pack (style
guide §4) and healing the decorated-table seam. The cost is architectural:
dungeon walls, floors and stairs now measure 1.40 and tile their own
1.4-unit module. They no longer mate 1:1 with the 1.0 walls of
fantasy-town, cave or mini-dungeon; the dungeon is a self-consistent
enclave.

Pack-wide factors keep each pack's own proportions, so kits whose props
were split (half correct, half oversized) traded one error for a smaller
one: modulair-terrein's fences/cedar/minecart and props' tableware
(bottles 0.13, plates ≈0.14) now read small. Documented in §4.

## 1. The grid

Wall/floor kits on the 1-unit raster: fantasy-town `wall-wood` 1.00,
modular-cave `template-wall` 1.01, mini-dungeon `wall` 1.10, survival
palisade 0.93. Modulair-terrein sits on half-unit modules (tiles
0.50 × 0.50, four per raster cell) — grid-true, one subdivision finer.
Two kits deliberately left the raster by PO decision (§0): the dungeon
architecture is a 1.4-module enclave, and the village building set a
0.6-module one (floor tiles 0.60, tall doorways 1.20).

## 2. One scale plateau

Each comparable object expressed as a ratio to the cross-kit median for
its class (23 classes), aggregated per kit (geometric mean):

| kit | index | n | notable internal outliers |
|---|---|---|---|
| modulair-terrein | 0.79 | 10 | cart 0.46, fence 0.55, cedar 0.67 (small side of the pack factor) |
| props | 0.82 | 6 | bottles 0.44, campfire 0.54 (small side); barrel/table/stool on the plateau |
| mini-dungeon | 0.87 | 3 | — |
| tropical | 0.90 | 3 | chests 0.53 — measured on the box alone, before the lid was merged back on (§4.2) |
| modular-cave-kit | 0.91 | 2 | ladder 0.72 (tight rungs) |
| mini-forest | 0.94 | 5 | — |
| pirate-kit | 0.97 | 8 | crate 0.62, palisade 2.20 |
| nature | 1.00 | 1 | — |
| fantasy-town-kit | 1.03 | 5 | — |
| dungeon | 1.05 | 9 | doorway 1.45 (the 1.4-module enclave) |
| survival-kit | 1.06 | 12 | palisade 2.33 (a wall, not a field fence) |
| forest | 1.07 | 3 | — |
| platformer-kit | 1.09 | 5 | — |
| rpgtools | 1.10 | 5 | — |
| village-kit | 1.14 | 7 | cart 1.51, ladder 2.36; barrel 0.54 (half-class) |
| rocks | 2.03 | 1 | biggest boulders 2× the other kits' biggest; rockforms are cliff terrain |

Everything sits within 0.79–1.14. The two lowest (modulair-terrein,
props) are the documented small sides of their pack factors, not
misconversions — their person-anchored pieces are on the plateau.

Implied person height: doorways run 0.81–1.10 on the shared raster
(person ≈ 0.8–0.9 units); the dungeon enclave at 1.40 implies taller
rooms, not bigger people.

## 3. What agrees remarkably well

- **Barrels** (`barrels.png`): medium class 0.48–0.60 (mini-dungeon,
  tropical, props) with dungeon's kegs as the big end at 0.70; half-class
  0.25–0.30 (dungeon barrel-small, village-kit). The former 2× outlier is
  gone.
- **Crates** (`crates.png`): 0.31–0.60 covers everything — pirate 0.31,
  props 0.44, platformer 0.50/0.60, village 0.50, dungeon 0.53.
- **Chests** (`chests.png`): 0.37–0.51 across six kits — dungeon 0.46
  and survival 0.46 now identical, tropical 0.38 at the small end since
  its lid was put back on; trunks (0.17/0.35) read as luggage below it.
- **Doorways** (`doors.png`): 0.81–1.10 continuum on the shared raster
  (village door 0.81, survival 0.93, others ≈1.0–1.1); beds (1.05 long)
  pass through them; dungeon's 1.40 and village's 1.20 tall openings
  belong to their own modules.
- **Bottles**: loose bottles 0.28–0.36 (survival 0.28, dungeon 0.31,
  pirate 0.36); props' 0.13 is the documented small side.
- **Furniture**: dungeon table 0.35 / props table 0.48 / survival
  workbench 0.52; chair 0.43, stool seats 0.18–0.26.
- **Torches**: dungeon 0.37 vs rpgtools 0.47 — close since the bump.
- **Palms**: 1.63–2.47. **Hand tools**: 0.42–0.63 vs 0.48–0.58.
  **Grass**: 0.13–0.47 across six kits. **Trees**: 1.40–3.81 as a species
  range. **Vehicles**: rowboats 1.10–1.25, carts 1.34–1.69, rotors
  3.11/3.50.
- **Rocks**: boulders 0.1–1.9 across seven kits; the rocks kit above that
  (to 3.0), its `rockform-*` cliff modules (7.4–9.3) a category of their
  own.

## 4. Remaining per-asset outliers

1. **The small sides of the pack factors** (accepted §4 trade-offs):
   props tableware — bottles 0.13, plates 0.14 — against
   clusters of 0.29–0.36; modulair-terrein fence boards 0.22 (cluster
   0.38–0.46), cedar 1.15, minecart 0.62. In mixed scenes, prefer other
   kits' versions.
2. ~~**tropical `chest-a`/`chest-b` — 0.21–0.25.**~~ Resolved, and not by
   rescaling: the two were the box and the lid of one chest, imported as
   separate models and each dropped to its own origin. Merged into one
   `chest-a` (`tools/voeg-samen.mjs`) it stands 0.38 — inside the
   cluster. The same held for props `bucket-a`/`bucket-b`, pail and
   handle: 0.19 → 0.28 with the handle in place.
3. **The off-raster enclaves** — not errors but standing constraints:
   dungeon architecture tiles a 1.4-module and the village building set a
   0.6-module; neither mates panel-for-panel with the 1.00 walls of
   cave/fantasy-town or with each other.

Documented non-issues: onderwater-kit keeps its pack proportions by
design; resources' pickup icons are stylized-large on purpose; pirate
ships are deliberate caricatures; survival's 1.03 "fence" is a palisade.

## 5. Proposed reference pieces — not yet approved

**Status: proposal.** None of these have been approved as official
references; treat them as the review's candidates until the PO signs off
(then add them to the style guide, §6). The dungeon pieces that were
candidates earlier dropped out when that kit left the shared raster.

| candidate | size | would anchor |
|---|---|---|
| survival-kit `bottle` | h = 0.28 | hand props: tableware, tools ≈ 1–2 bottles |
| tropical `barrel-a` | h = 0.52 | furniture & containers: crate ≈ 0.6–1 barrel, chest ≈ 0.9, workbench ≈ 1.0 |
| fantasy-town-kit `wall-wood` | 0.10 × 1.00 × 1.00 | everything architectural on the shared raster |
| survival-kit `fence-doorway` | h = 0.93 | the person: doorway ≈ 1 wall unit, person ≈ 0.8–0.9 units |
| survival-kit `tree` | h = 2.54 | vegetation & landmarks: mid tree ≈ 2.5 walls; landmarks (lighthouse 4.3, balloon 5.7, rockforms 7.6) = 1.7–3.7 trees |

Working ratios: bottle : barrel : wall/doorway : tree ≈ 0.3 : 0.5 : 1 : 2.5.

## 6. Recommendations

1. **Approve (or amend) the §5 reference set** and add it to the style
   guide as the scale companion to its §6 style-reference list. Until
   then, nothing is an approved reference.
2. ~~**Decide the last small-fry case**: tropical's chests.~~ Done — they
   were an assembly problem, not a scale problem (§4.2). Worth carrying
   forward as a check: when a pack ships an object as two files, measure
   the pair before deciding a factor.
3. **Treat the enclaves as a rule**: dungeon (1.4-module) and the
   village building set (0.6-module) should not be mixed panel-for-panel
   with 1.0-raster walls.
4. **Re-run this review after importing a new pack**:
   `node tools/vergelijk-groottes/render.mjs` and eyeball the pack's
   barrels/doorways/trees against §5 before committing to a scale factor —
   six packs showed that "the numbers land on the grid" is not evidence
   that the factor is right, and that like must be compared with like.
