# Asset size review

Cross-kit review of asset dimensions: are kits over- or undersized relative to
each other, and which pieces should serve as size references? Based on the
bounding boxes in `kits/catalog.json` (`wdh`, all 1138 models) plus
side-by-side renders of ~110 comparable assets. The renders are in
`docs/asset_size_review/*.png` and can be regenerated with
`NODE_PATH=$(npm root -g) node tools/vergelijk-groottes/render.mjs`
(groups defined in `tools/vergelijk-groottes/groups.json`).

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
| village-kit `stone-wall-a` | 0.06 × 1.00 × 1.00 |
| survival-kit `fence` (palisade) | 1.00 × 0.09 × 1.03 |

Floors are 1 × 1 or clean fractions/multiples everywhere (dungeon halves at
0.5, village-kit cobblestones at 2 × 2). No action needed.

## 2. But "1 unit" means two different things

The props standing *next to* those identical walls disagree about how big a
person is. The kits fall into two scale families:

**Family A — "toy interior"** (person ≈ 0.6–0.9 units): dungeon,
mini-dungeon, mini-forest, fantasy-town-kit, platformer-kit, pirate-kit,
tropical. A doorway fits inside a 1-unit wall, furniture is chibi
(dungeon table 0.25 high), field fences are 0.38–0.40.
`tools/importeer-dungeon.mjs` documents this deliberately: one factor (0.25)
for the whole KayKit pack, wall = 1, and the furniture lands where it lands.

**Family B — "near-realistic"** (person ≈ 1.1–1.3 units): village-kit,
survival-kit, modulair-terrein, rpgtools, resources, forest, rocks, props.
Doors are 1.35 high and doorways 2.0 (village-kit), workbenches 0.57,
hand tools 0.4–0.6, palisades 1.03.

Concrete collisions this causes (all visible in the renders):

| object | family A | family B | ratio |
|---|---|---|---|
| door | dungeon doorway fits in h=1.00 wall; mini-dungeon gate 0.75 | village-kit `door-simple` 1.35, `stone-doorway-*-tall` 2.00 | ~2× |
| crate | dungeon `box-large` 0.375, pirate-kit `crate` 0.31 | village-kit `crate-a` 1.00, props `box-a` 0.74 | 2–2.7× |
| cart | fantasy-town-kit `cart` 1.34 long | village-kit `cart-a` 3.37 long | 2.5× |
| rowboat | pirate-kit `boat-row-small` 1.10 long | village-kit `boat-a` 2.31 long | 2.1× |
| windmill rotor | fantasy-town-kit `windmill` 3.11 | village-kit `windmill-blades` 7.00 | 2.3× |
| palm | pirate-kit `palm-straight` 1.69 | modulair-terrein `beach-prop-tree-palm-a` 3.26 | 1.9× |
| torch | dungeon `torch` 0.26 | rpgtools `torch` 0.47 | 1.8× |
| campfire | survival-kit `campfire-pit` 0.56 wide | modulair-terrein `hilly-prop-camp-campfire` 1.43 wide | 2.6× |
| ladder | platformer-kit/mini-forest `ladder` 1.00 | village-kit `ladder-a` 3.93 | 4× |

Family B carries most of the content volume (village-kit 138,
modulair-terrein 305, survival-kit 50, forest 57, rocks 39, resources 56,
rpgtools 35) and matches the terrain kits. Family A owns the interiors
(dungeon 140, cave 40, fantasy-town 70) — but its *walls* are shared with
everyone, so the split only shows in props, never in architecture. Mixing
props across the families (a village crate in a dungeon room, a pirate palm
on a modulair-terrein beach) is where it breaks.

## 3. What agrees remarkably well

- **Barrels** (`barrels.png`): dungeon 0.50, dungeon keg 0.51, mini-dungeon
  0.48, village-kit 0.50, tropical 0.43. Four sources, one barrel. This is
  the best cross-kit consensus object in the collection.
- **Chests** (`chests.png`): mini-dungeon 0.45, pirate-kit 0.46,
  survival-kit 0.51 — tight cluster (exceptions in §4).
- **Bottles, plates, candles** (`small-props.png`): dungeon, props,
  survival-kit and pirate-kit all put bottles at 0.21–0.36, plates at
  0.24, candles at 0.16–0.26. Hand props are effectively one scale
  across *both* families.
- **Hand tools** (`tools.png`): rpgtools 0.42–0.63 vs survival-kit
  0.48–0.58 — interchangeable.
- **Field fences** (`fences.png`): fantasy-town 0.38, mini-forest 0.40,
  platformer-kit 0.40, modulair-terrein boards 0.44 — consistent
  (survival-kit's 1.03 `fence` is a palisade wall, not a field fence).
- **Trees** (`trees.png`): mini-forest 1.68 → fantasy-town 2.41 →
  survival-kit 2.82 → forest 2.9–7.6 → modulair-terrein oaks to 5.0 reads
  as a plausible small-to-large range rather than a scale clash.
- **Rocks** (`rocks.png`, `rockforms.png`): boulders 0.4–3.9 across seven
  kits blend fine. The `rocks` kit `rockform-*` pieces (7.4–9.3 high, up to
  21 wide) are cliff-scale terrain; they pair with forest's tallest tree
  (7.6) and are a category of their own, not an error.

## 4. Per-asset outliers

Ordered by how much they'd improve the collection if fixed.

1. **props `barrel-a` — 0.81 × 0.81 × 0.99.** Twice the consensus barrel
   (0.5) that four other kits agree on, for the same object. Worst single
   offender; a barrel is exactly the kind of prop that travels between
   scenes. (`barrels.png`)
2. **village-kit `crate-a` — a 1.00 cube.** Double its *own kit's* barrel
   and 2.7× the dungeon crate. Even inside family B a 1-unit shipping cube
   reads as a container, not a crate. (`crates.png`)
3. **props big furniture — `table-a` 1.83 × 0.78 × 0.80, `bench-a` 1.51,
   `stool-a` 0.43, `box-a` 0.74, `stairs-a` h=2.00.** The props kit is
   internally split: its tableware (bottles 0.21, plates 0.24, candles,
   jugs) matches everyone, while its furniture implies a person of ~1.8
   units — the largest in the repo, oversized even for family B
   (survival-kit workbench 0.57 vs props table 0.80). (`furniture.png`)
4. **tropical `chest-a`/`chest-b` — h 0.17–0.20.** Less than half the
   0.45–0.51 chest cluster; reads as a jewelry box. (`chests.png`)
5. **modulair-terrein `beach-prop-treasure-chest` — 0.97 × 0.75 × 0.73.**
   1.6× the chest cluster. Defensible as a "reward landmark", but it will
   dwarf any pirate chest placed nearby. (`chests.png`)
6. **modulair-terrein `hilly-prop-camp-campfire` — 1.43 wide.** 2.6× the
   other campfires; the logs are as thick as survival-kit's whole fire.
   (`campfires.png`)
7. **village-kit `lamp-street` — h 1.25.** Shorter than the kit's own door
   (1.35): a street lantern you'd bump your head on. Undersized for
   family B; oddly it's a fine height for family A streets.
   (`small-props.png`)
8. **pirate-kit palms — 1.69–1.70.** Smallest palms by far (tropical 2.06,
   modulair-terrein 3.3–4.1); at the beach they read as shrubs next to
   modulair-terrein sand tiles. (`palms.png`)
9. **village-kit `ladder-a` — h 3.93.** Four storeys of ladder; every other
   kit's ladder is 0.7–1.0. Usable as a leaning long ladder only.
   (`stairs.png`)

Documented non-issues: the onderwater-kit keeps its pack's own proportions
by design (style guide §4 — hammerhead 3.4 long, whale 1.1); the resources
kit oversizes pickups (gold bar 0.8 long) the way resource-game icons
always do, and is internally consistent about it; pirate ships (3.5–5.2
long) are deliberate caricatures — a "large ship" the size of two village
carts — which works *because* the whole pirate kit is family A.

## 5. Reference pieces

For "how big should X be?", measure against these five. They were chosen
because each is the most-agreed-upon object of its size class, and together
they ladder from hand prop to landmark:

| reference | size | anchors |
|---|---|---|
| dungeon `bottle-a-brown` | h = 0.22 | hand props: tableware, tools ≈ 1–3 bottles |
| village-kit `barrel-a` | h = 0.50 | furniture & containers: crate ≈ 1 barrel high, chest ≈ 0.9, table ≈ 1.1–1.6, workbench ≈ 1.1 |
| dungeon `wall` | 1.00 × 0.25 × 1.00 | everything architectural; the grid itself |
| village-kit `door-simple` | h = 1.35 | the person: a family-B human is ~1.2 units, door = person + headroom; family-A doorways are ~0.75–1.0 |
| survival-kit `tree` | h = 2.82 | vegetation & landmarks: mid tree = 2 doors; landmark pieces (lighthouse 4.3, balloon 5.7, rockforms 7.6) = 1.5–3 trees |

Practical ratios that the healthy majority already obeys:
bottle : barrel : wall : door : tree ≈ 0.2 : 0.5 : 1 : 1.35 : 2.8.

When creating or importing an asset, render it next to the `wall`, the
`barrel-a` and the `door-simple` (the style guide §6 rule "at least two
reference assets at the same scale" — these three are the size half of that
check; the existing §6 list covers style).

## 6. Recommendations

1. **Declare family B the canonical scale** (person ≈ 1.2 units,
   door = 1.35): it has the most content, all the terrain, and it is where
   new original assets (taalei-kit) live. Family A kits stay as they are —
   their walls are grid-true and their chibi interiors are a deliberate,
   internally consistent look — but treat them as *closed sets*: don't
   scatter family-A props into family-B scenes or vice versa.
2. **Fix the worst travellers**, per style guide §4 this means one factor
   per imported pack, so realistically:
   - props: the pack is the outlier as a whole (its internal proportions
     are honest — it's simply ~1.5× family B). A pack factor of ~0.7 would
     land its furniture on family B (table 0.56, barrel 0.69→ still big,
     box 0.52) at the cost of slightly small tableware. Alternative: keep
     the pack, avoid `barrel-a`/`box-a` where other kits' barrels appear.
   - village-kit `crate-a` and tropical `chest-a/b`: if a per-model
     exception is ever made, these two are the candidates; otherwise
     prefer other kits' crates/chests in mixed scenes.
3. **Add the five reference pieces of §5 to the style guide** as the
   scale companion to its §6 style-reference list.
4. **Re-run this review** after importing a new pack:
   `node tools/vergelijk-groottes/render.mjs` and eyeball the pack's
   barrels/doors/trees against the reference pieces before committing to a
   scale factor.
