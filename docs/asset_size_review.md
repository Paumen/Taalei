# Asset size review

Cross-kit review of asset dimensions: are kits over- or undersized relative to
each other, and which pieces should serve as size references? Based on the
bounding boxes in `kits/catalog.json` (`wdh`, all 1138 models) plus
side-by-side renders of ~110 comparable assets. The renders are in
`docs/asset_size_review/*.png` and can be regenerated with
`NODE_PATH=$(npm root -g) node tools/vergelijk-groottes/render.mjs`
(groups defined in `tools/vergelijk-groottes/groups.json`).

The review's biggest catch has already been fixed in this branch: two kits
had been imported at factor 1 while their packs put everything at double
the collection's scale. Both now load at 0.5:

- **village-kit** (`tools/importeer-village.mjs`): its rowboat (1.16) now
  sits next to pirate-kit's (1.10), its windmill blades (3.50) next to
  fantasy-town-kit's windmill (3.11), its crate (0.50) equals
  platformer-kit's, and its tall stone doorways are exactly one wall
  height.
- **forest** (`tools/importeer-forest.mjs`): its grass (0.27–0.47) now
  sits in the 0.13–0.46 grass cluster of five other kits instead of
  towering over it at 0.54–0.94, its boulders top out at 1.9 next to
  pirate-kit's 1.5 and modulair-terrein's 2.1, and its bare trees
  (1.4–3.8) land between nature's dead tree (1.7) and modulair-terrein's
  oaks. The original import compared its grass *height* against another
  kit's grass *width* and concluded no scaling was needed.

All numbers and renders below are from after these fixes.

## 1. The grid is healthy

Every kit that supplies walls or floors agrees with style guide §4
(1 × 1 unit footprint, wall height 1). See `walls.png`, `doors.png`,
`stairs.png`.

| piece | w × d × h |
|---|---|
| dungeon `wall` | 1.00 × 0.25 × 1.00 |
| mini-dungeon `wall` | 1.00 × 1.00 × 1.10 |
| modular-cave-kit `template-wall` | 1.00 × 0.54 × 1.01 |
| fantasy-town-kit `wall-wood` | 0.10 × 1.00 × 1.00 |
| survival-kit `fence` (palisade) | 1.00 × 0.09 × 1.03 |

Floors are 1 × 1 or clean fractions/multiples everywhere. The village-kit's
building set now sits on half-unit modules (floor tiles 0.50 × 0.50, like the
dungeon kit's small floor tiles; tall doorways exactly 1.00) — still
grid-true, one subdivision finer.

## 2. One scale plateau, with a low end and a high end

To compare kits quantitatively, each comparable object was expressed as a
ratio to the cross-kit median for its class (barrels, crates, chests,
doorways, bottles, torches, axes, picks, shovels, fences, trees, grass,
palms, ladders, carts, rowboats, windmill rotors, campfires, tables,
stools, tents, lanterns, largest boulders), then aggregated per kit
(geometric mean):

| kit | index | n | notable internal outliers |
|---|---|---|---|
| tropical | 0.73 | 3 | chest 0.44 |
| dungeon | 0.75 | 9 | stool 0.45, table 0.48 vs barrel 1.0 |
| nature | 0.85 | 1 | — |
| mini-forest | 0.87 | 5 | — |
| forest | 0.89 | 3 | — |
| modular-cave-kit | 0.89 | 2 | — |
| mini-dungeon | 0.90 | 3 | — |
| pirate-kit | 0.91 | 8 | crate 0.62, palisade-fence 2.10 |
| rpgtools | 0.97 | 5 | — |
| village-kit | 0.99 | 7 | barrel 0.51, ladder 1.96 |
| fantasy-town-kit | 1.01 | 5 | — |
| platformer-kit | 1.02 | 5 | — |
| survival-kit | 1.07 | 12 | palisade-fence 2.47 (a wall, not a field fence) |
| props | 1.29 | 6 | crate 1.48, table 1.52, stool 1.55, barrel 2.04 |
| modulair-terrein | 1.36 | 10 | palm 1.58, chest 1.61, grass 1.65, campfire 2.57 |
| rocks | 1.54 | 1 | biggest boulders 1.5× the other kits' biggest |

The collection is a single plateau (0.85–1.07 covers eleven kits), not two
camps. What hangs off it:

- **Low end — deliberate caricature.** Dungeon's *furniture* is chibi
  (table 0.25, stool 0.125) while its barrels, doorway and bottles are dead
  on the shared scale; `tools/importeer-dungeon.mjs` documents that
  trade-off (one factor for the whole KayKit pack). Tropical's chests are
  tiny; mini-kits are slightly small by design.
- **High end — the real outliers.** The props kit runs ~1.3× overall and
  its furniture/containers ~1.5–2×, and modulair-terrein's decorated props
  (palms 3.3–4.1, treasure chest 0.73, campfire 1.43 wide) run 1.6–2.6×.
  These are now the only kits whose props visibly clash on a shared floor.

Implied person height on the plateau: a doorway is 0.75–1.10 across six
kits, so a person is roughly **0.8–0.9 units**.

## 3. What agrees remarkably well

- **Barrels** (`barrels.png`): dungeon 0.50, keg 0.51, mini-dungeon 0.48,
  tropical 0.43 — one barrel across sources (village-kit's is now a small
  0.25 barrel, matching dungeon `barrel-small`; props' is the outlier, §4).
- **Crates** (`crates.png`): village-kit 0.50 = platformer-kit 0.50,
  dungeon 0.375/0.25, pirate 0.31 — a plausible small-to-large range with
  only props `box-a` (0.74) outside it.
- **Chests** (`chests.png`): mini-dungeon 0.45, pirate-kit 0.46,
  survival-kit 0.51 — tight cluster (exceptions in §4).
- **Doorways** (`doors.png`): village door 0.68, mini-dungeon gate 0.75,
  dungeon/fantasy-town 1.00, survival 1.03, cave 1.10 — a continuum, no gap.
- **Bottles, plates, candles** (`small-props.png`): 0.21–0.36 everywhere.
- **Hand tools** (`tools.png`): rpgtools 0.42–0.63 vs survival-kit
  0.48–0.58 — interchangeable.
- **Field fences** (`fences.png`): 0.38–0.44 across four kits.
- **Grass** (`grass.png`): 0.13–0.47 across six kits after the forest fix.
- **Trees** (`trees.png`): mini-forest 1.68 → fantasy-town 2.41 →
  survival-kit 2.82 → forest's bare trees 1.4–3.8 reads as a plausible
  range.
- **Rocks** (`rocks.png`, `rockforms.png`): boulders 0.1–2.1 across seven
  kits blend fine. The `rocks` kit sits at the top (rock-natural family to
  3.0), and its `rockform-*` pieces (7.4–9.3 high, up to 21 wide) are
  cliff-scale terrain — a category of their own, not an error, but by far
  the largest things in the collection.
- **Vehicles and mills** (`boats.png`, `carts.png`, `landmarks.png`):
  after the village fix — rowboats 1.10/1.16, carts 1.23/1.34/1.69,
  windmill rotors 3.11/3.50.

## 4. Per-asset outliers

Ordered by how much they'd improve the collection if fixed.

1. **props `barrel-a` — 0.81 × 0.81 × 0.99.** Twice the consensus barrel
   (0.5). Worst single offender; a barrel is exactly the kind of prop that
   travels between scenes. (`barrels.png`)
2. **props big furniture — `table-a` 1.83 × 0.78 × 0.80, `bench-a` 1.51,
   `stool-a` 0.43, `box-a` 0.74, `stairs-a` h=2.00.** The props kit is
   internally split: its tableware (bottles 0.21, plates 0.24, candles,
   jugs) matches everyone, while its furniture implies a person of ~1.5
   units — oversized against the whole plateau (survival-kit workbench
   0.57 vs props table 0.80). (`furniture.png`)
3. **modulair-terrein's decorated props.** Palms 3.3–4.1 (1.6–2× the other
   palms), `beach-prop-treasure-chest` 0.73 (1.6× the chest cluster),
   `hilly-prop-camp-campfire` 1.43 wide (2.6× the other campfires — its
   logs are as thick as survival-kit's whole fire). Defensible as
   landmarks, but they dwarf same-class props placed nearby.
   (`palms.png`, `chests.png`, `campfires.png`)
4. **tropical `chest-a`/`chest-b` — h 0.17–0.20.** Less than half the
   0.45–0.51 chest cluster; reads as a jewelry box. (`chests.png`)
5. **pirate-kit palms — 1.69–1.70.** Smallest palms (tropical 2.06); at
   the beach they read as shrubs next to modulair-terrein's 3.3–4.1.
   (`palms.png`)
6. **dungeon furniture — table 0.25, chair 0.31, stool 0.125.** Deliberate
   KayKit caricature (its plate is as wide as its table is high) and
   internally consistent, but new assets should not copy this scale;
   measure against §5 instead. (`furniture.png`)

Documented non-issues: the onderwater-kit keeps its pack's own proportions
by design (style guide §4 — hammerhead 3.4 long, whale 1.1); the resources
kit oversizes pickups (gold bar 0.8 long) the way resource-game icons
always do, and is internally consistent about it; pirate ships (3.5–5.2
long) are deliberate caricatures — a "large ship" the size of three
rowboats — which works because everything around them is honest about it.

## 5. Reference pieces

For "how big should X be?", measure against these five. Each is the
most-agreed-upon object of its size class, and together they ladder from
hand prop to landmark:

| reference | size | anchors |
|---|---|---|
| dungeon `bottle-a-brown` | h = 0.22 | hand props: tableware, tools ≈ 1–3 bottles |
| dungeon `barrel-large` | h = 0.50 | furniture & containers: crate ≈ 0.6–1 barrel, chest ≈ 0.9, workbench ≈ 1.1 |
| dungeon `wall` | 1.00 × 0.25 × 1.00 | everything architectural; the grid itself |
| survival-kit `fence-doorway` | h = 1.03 | the person: a doorway is ~1 wall unit, a person ~0.8–0.9 units |
| survival-kit `tree` | h = 2.82 | vegetation & landmarks: mid tree ≈ 2.8 walls; landmark pieces (lighthouse 4.3, balloon 5.7, rockforms 7.6) = 1.5–3 trees |

Practical ratios the healthy majority already obeys:
bottle : barrel : wall/doorway : tree ≈ 0.2 : 0.5 : 1 : 2.8.

When creating or importing an asset, render it next to the `wall`, the
`barrel-large` and the `fence-doorway` (the style guide §6 rule "at least
two reference assets at the same scale" — these three are the size half of
that check; the existing §6 list covers style).

## 6. Recommendations

1. **The plateau is the canonical scale**: doorway ≈ 1 wall unit, person
   ≈ 0.8–0.9 units, barrel 0.5. Ten kits already sit on it, and the
   village-kit joined them with the 0.5 re-import.
2. **Remaining rescale candidate: the props kit.** It is the one kit that
   is high across the board, but it is internally split — at a pack factor
   of ~0.65 its furniture lands on the plateau while its already-correct
   tableware goes too small. Options: accept the split and avoid
   `barrel-a`/`box-a`/`table-a` next to other kits' props, or rescale the
   pack and accept small tableware. The modulair-terrein and tropical
   outliers are single assets in otherwise consistent kits; per style
   guide §4 (one factor per pack) they stay, and mixed scenes should
   simply prefer the consensus-sized alternatives.
3. **Add the five reference pieces of §5 to the style guide** as the
   scale companion to its §6 style-reference list.
4. **Re-run this review** after importing a new pack:
   `node tools/vergelijk-groottes/render.mjs` and eyeball the pack's
   barrels/doorways/trees against the reference pieces before committing
   to a scale factor — the village-kit and forest showed that "the numbers
   land on the grid" is not enough evidence that the factor is right, and
   that like must be compared with like (the original forest import
   compared grass height against grass width).
