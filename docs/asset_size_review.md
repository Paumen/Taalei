# Asset size review

Cross-kit review of asset dimensions: are kits over- or undersized relative to
each other, and which pieces should serve as size references? Based on the
bounding boxes in `kits/catalog.json` (`wdh`, all 1138 models) plus
side-by-side renders of ~110 comparable assets. The renders are in
`docs/asset_size_review/*.png` and can be regenerated with
`NODE_PATH=$(npm root -g) node tools/vergelijk-groottes/render.mjs`
(groups defined in `tools/vergelijk-groottes/groups.json`).

## 0. What was fixed on this branch

Seven scale corrections came out of the review; the collection below is
described *after* them.

| kit | correction | evidence |
|---|---|---|
| village-kit | pack ×0.5 | rowboat 1.16 next to pirate-kit 1.10; windmill blades 3.50 next to fantasy-town 3.11; crate 0.50 = platformer's; tall doorways exactly 1 wall |
| forest | pack ×0.5 | grass 0.27–0.47 into the 0.13–0.46 cluster of five kits (the original import compared grass height against grass *width*) |
| modulair-terrein | pack ×0.5 | palms 1.63 next to 1.69/2.06; chest 0.37, campfire 0.71 into their clusters; terrain tiles become raster-true 0.5 halves |
| props | pack ×0.5 | barrel exactly 0.50 (the consensus barrel), box 0.37 = dungeon's box-large, table 0.40 beside survival's workbench 0.57 |
| resources | pack ×0.5 | stone chunks 0.56 next to survival's resource-stones; piles remain readable pickup icons |
| tropical | 0.5 → 0.6 | barrel 0.43 → 0.52, mid-cluster; pier and plank stay ≈ one module |
| dungeon | furniture subset 0.25 → 0.35 | chest 0.46 (cluster 0.45–0.51), chair 0.43, bed 1.05 long = one doorway; walls, floors, barrels, bottles keep 0.25 |

The dungeon change is a deliberate deviation from style guide §4 (one
factor per pack): the walls are the grid anchor and cannot move, while the
KayKit furniture at the wall factor was dollhouse-small next to every other
kit. The subset (24 models: tables, chair, stool, beds, chests, boxes,
trunks, crate stacks) is listed in `tools/importeer-dungeon.mjs`
(`MEUBELS`/`MEUBELSCHAAL`). Known seam: the bottles baked onto the
decorated tables grew with the furniture (≈0.31) and now sit above the
kit's loose bottles (0.22).

Each pack-wide factor keeps the pack's own proportions, so the kits whose
props were split (half correct, half oversized) traded one error for a
smaller one: modulair-terrein's fences/cedar/minecart and props' tableware
(bottles ≈0.11, plates ≈0.12) now read small. Documented in §4.

## 1. The grid is healthy

Every kit that supplies walls or floors agrees with style guide §4
(1 × 1 unit footprint, wall height 1). See `walls.png`, `doors.png`,
`stairs.png`: dungeon `wall` 1.00 × 0.25 × 1.00, mini-dungeon 1.10 high,
cave `template-wall` 1.01, fantasy-town `wall-wood` 1.00, survival palisade
1.03. Village-kit and modulair-terrein sit on half-unit modules (tiles
0.50 × 0.50, four per raster cell) — grid-true, one subdivision finer.

## 2. One scale plateau

Each comparable object expressed as a ratio to the cross-kit median for its
class (23 classes: barrels, crates, chests, doorways, bottles, torches,
axes, picks, shovels, fences, trees, grass, palms, ladders, carts,
rowboats, windmill rotors, campfires, tables, stools, tents, lanterns,
largest boulders), aggregated per kit (geometric mean):

| kit | index | n | notable internal outliers |
|---|---|---|---|
| props | 0.72 | 6 | bottles 0.40, campfire 0.41 (small side of the pack factor); barrel/table/stool now 1.0 |
| modulair-terrein | 0.78 | 10 | cart 0.46, fence 0.55, cedar 0.67 (small side of the pack factor) |
| mini-dungeon | 0.89 | 3 | — |
| modular-cave-kit | 0.89 | 2 | ladder 0.72 (tight rungs) |
| mini-forest | 0.93 | 5 | — |
| tropical | 0.93 | 3 | chests 0.53 |
| dungeon | 0.93 | 9 | torch 0.72 |
| village-kit | 0.99 | 7 | barrel 0.50 (half-class), ladder 1.96 (long by intent) |
| pirate-kit | 0.99 | 8 | crate 0.62, palisade 2.20 |
| nature | 1.00 | 1 | — |
| fantasy-town-kit | 1.05 | 5 | — |
| forest | 1.06 | 3 | — |
| platformer-kit | 1.08 | 5 | — |
| rpgtools | 1.08 | 5 | — |
| survival-kit | 1.14 | 12 | palisade 2.59 (a wall, not a field fence) |
| rocks | 2.03 | 1 | biggest boulders 2× the other kits' biggest; rockforms are cliff terrain |

Twelve kits sit within 0.89–1.14. The two below the plateau (props 0.72,
modulair-terrein 0.78) are not misconverted kits but the documented small
side of their pack-wide factors — their person-anchored pieces (barrel,
table, palms, chest) are on the plateau; their formerly-correct smalls
dropped under it.

Implied person height: a doorway is 0.68–1.10 across six kits, so a person
is roughly **0.8–0.9 units**.

## 3. What agrees remarkably well

- **Barrels** (`barrels.png`): medium cluster 0.48–0.52 across six kits
  (dungeon, mini-dungeon, props, tropical, dungeon kegs); half-class
  0.25–0.30 (dungeon barrel-small, village-kit). The former 2× outlier
  (props) is gone.
- **Crates** (`crates.png`): 0.25–0.54 covers everything — dungeon
  0.35–0.53, pirate 0.31, platformer 0.50/0.60, village 0.50, props 0.37.
- **Chests** (`chests.png`): 0.37–0.51 across five kits, now including
  dungeon (0.46); trunks (0.17/0.35) read as luggage below it.
- **Doorways** (`doors.png`): 0.68–1.10 continuum across six kits; beds
  (1.05 long) pass through them.
- **Furniture**: dungeon table 0.35 / props table 0.40 / survival workbench
  0.57; chair 0.43 with stool seats at 0.18–0.22.
- **Palms** (`palms.png`): 1.63–2.47 (modulair, pirate, tropical).
- **Hand tools** (`tools.png`): rpgtools 0.42–0.63 vs survival-kit
  0.48–0.58 — interchangeable.
- **Grass** (`grass.png`): 0.13–0.47 across six kits.
- **Trees** (`trees.png`): 1.40 (small pine) to 3.81 (forest's dead
  landmark trees) as a plausible species range.
- **Rocks**: boulders 0.1–1.9 across seven kits; the rocks kit sits above
  (to 3.0) and its `rockform-*` cliff modules (7.4–9.3) are a category of
  their own.
- **Vehicles and mills**: rowboats 1.10–1.25, carts 1.34–1.69, windmill
  rotors 3.11/3.50.

## 4. Remaining per-asset outliers

Much shorter than before the fixes; these are the leftovers.

1. **The small sides of the pack factors** (accepted trade-offs, one
   factor per pack): props tableware — bottles 0.11, plates 0.12, bucket
   0.16 — against clusters of 0.20–0.36; modulair-terrein fence boards
   0.22 (cluster 0.38–0.46), cedar 1.15, minecart 0.62. In mixed scenes,
   prefer other kits' versions of these.
2. **tropical `chest-a`/`chest-b` — 0.21–0.25.** Closer after the 0.6
   bump but still half the 0.37–0.51 cluster; reads as a jewelry box.
3. **dungeon `torch` 0.26 vs rpgtools `torch` 0.47.** The one dungeon prop
   still clearly under its cross-kit peer.
4. **Decorated-table seam (dungeon)**: baked-on bottles ≈0.31 vs the kit's
   loose bottles 0.22, a consequence of the furniture bump.

Documented non-issues: onderwater-kit keeps its pack proportions by design
(style guide §4); resources' pickup icons are stylized-large on purpose and
internally consistent; pirate ships are deliberate caricatures; survival's
1.03 "fence" is a palisade wall.

## 5. Proposed reference pieces — not yet approved

**Status: proposal.** None of these have been approved as official
references; treat them as the review's candidates until the PO signs off
(and then add them to the style guide, see §6).

| candidate | size | would anchor |
|---|---|---|
| dungeon `bottle-a-brown` | h = 0.22 | hand props: tableware, tools ≈ 1–3 bottles |
| dungeon `barrel-large` | h = 0.50 | furniture & containers: crate ≈ 0.6–1 barrel, chest ≈ 0.9, workbench ≈ 1.1 |
| dungeon `wall` | 1.00 × 0.25 × 1.00 | everything architectural; the grid itself |
| survival-kit `fence-doorway` | h = 1.03 | the person: doorway ≈ 1 wall unit, person ≈ 0.8–0.9 units |
| survival-kit `tree` | h = 2.82 | vegetation & landmarks: mid tree ≈ 2.8 walls; landmarks (lighthouse 4.3, balloon 5.7, rockforms 7.6) = 1.5–3 trees |

Working ratios the collection now obeys:
bottle : barrel : wall/doorway : tree ≈ 0.2 : 0.5 : 1 : 2.8.

## 6. Recommendations

1. **Approve (or amend) the §5 reference set** and add it to the style
   guide as the scale companion to its §6 style-reference list. Until
   then, nothing is an approved reference.
2. **Decide the two open small-fry cases**: tropical's chests and
   dungeon's torch — single assets, fixable only by deviating from the
   one-factor rule the way the dungeon furniture did, or by simply
   preferring the cross-kit alternative when placing.
3. **Re-run this review after importing a new pack**:
   `node tools/vergelijk-groottes/render.mjs` and eyeball the pack's
   barrels/doorways/trees against §5 before committing to a scale factor —
   six packs showed that "the numbers land on the grid" is not evidence
   that the factor is right, and that like must be compared with like.
