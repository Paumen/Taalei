# Catalog review against Appendix A (material and color rules)

> Rule letters in this document refer to the appendix **as it stood when the
> review ran**. The defects under "Defects in Appendix A itself" have since
> been fixed in `docs/asset_style_guide.md` (relettered A–AQ, band ids named,
> placeholder rules Z–AD filled, fauna/copper rules added); the catalog
> findings are unchanged.

Review of `catalog/catalog.json` (1063 models) against the rules in
`docs/asset_style_guide.md`, Appendix A. Every model's `colors` list was mapped
back to a band in `kits/colormap.png`; 17 of the 18 distinct catalog colors are
exactly the mid-tone of a band, so the mapping is unambiguous. Band names used
below:

| Band | Mid color | Reading |
| --- | --- | --- |
| 0,0 | `#cb9d78` | wood light (surfaces/planks/cut faces) |
| 1,0 | `#9a6b4e` | wood middle (frames) |
| 2,0 | `#714c39` | bark / darkest brown |
| 5,0 | `#d07b56` | terracotta |
| 6,0 | `#ffb349` | yellow / gold |
| 8,0 | `#7f3927` | dark red |
| 10,0 | `#3e3e44` | dark grey |
| 13,0 | `#dd9f79` | salmon |
| 14,0 | `#8f785b` | khaki |
| 1,1 | `#23562c` | dark green |
| 3,1 | `#6d8d33` | light green |
| 6,1 | `#474a58` | blue-grey dark |
| 3,2 | `#9da4c4` | blue-grey light |
| 4,2 | `#2473b3` | blue |
| 5,2 | `#f5f2e7` | off-white |
| 14,3 | `#88796d` | taupe |
| 15,3 | `#6d738a` | grey |
| — | `#ffffff` | **not in the colormap** (3 models, see below) |

One caveat up front: the catalog records *which* bands a model uses, not how
much surface each band covers. Rules that allow a color as a "minor detail or
accent" (AG, AH, Al, AN) can therefore only be narrowed down here, not settled;
the flagged models are candidates for a render check, not proven violations.

## What checks out

- **Rule M (ladder anchors).** Verified against the colormap pixels: lane 0,0
  runs `#e6bc94 → #b07f5c`, lane 1,0 `#b07f5c → #845740`, lane 2,0
  `#845740 → #5e4232`. The anchors match the rule exactly and the lanes join
  seamlessly.
- **Rule c/d (bone, paper off-white).** All 17 `bone`-tagged and all 27
  `paper`-tagged models include off-white 5,2.
- **Rule h (textile).** All 43 `textile`-tagged models stay within off-white,
  salmon 13,0, khaki 14,0 and the wood browns.
- **Rule W (grass light green).** Every model with "grass" in the name uses 3,1.
- **Rule i/J (bottles, glass).** Glass-tagged bottles and potions use dark green
  1,1, dark red 8,0, or the transparent material — as prescribed.
- **Rule T/U (containers).** Chests, barrels, kegs, buckets, boxes and crates
  are timber with grey metal bands, with a single exception (`barrel-apples`,
  below).

## Catalog findings, high confidence

### 1. Rule N — bark lane 2,0 used without a `bark` tag: 46 models

> "no bark lane without a bark tag"

dungeon-quaternius/arch-door; food-quaternius/chicken-leg, coconut,
coconut-half, frying-pan; halloween/candle; pirate-quaternius/pirate-henry,
sawmill, skeleton, skeleton-headless; rpg-quaternius/backpack, bag,
book-1/2/3/4 (open and closed), key-1, key-2, potion-1…11 (empty and filled),
scroll; ships-quaternius/boat, boat-sail.

Three sub-groups:

- **Leather-look models** (backpack, bag, book covers): allowed by rule AM
  ("darkest brown is only used for bark **and leather**") but forbidden by
  rule N, since the `bark` tag is by definition ("outside of a trunk or
  branch") not applicable to leather. **Rules N and AM contradict each other**;
  either N needs a leather exemption or AM needs to drop leather.
- **Potion stoppers** (22 potion models, bands = bark + off-white): if the
  brown part is a cork, rule V says cork is "light salmon brown", not the bark
  lane — worth a render check.
- **Genuinely odd**: `key-1`/`key-2` are *only* bark-colored (also breaks
  rule S), `frying-pan` (should be cast iron dark grey per g), `candle`,
  `arch-door`, `chicken-leg`.

### 2. Rule S — keys without any metal color: 5 models

`fantasy-props/key-metal` (taupe — despite the name), `rpg-quaternius/key-1`
(bark), `key-2` (bark), `key-3` (taupe), `key-4` (wood light). Taupe is a stone
color, not a metal or precious-metal color.

### 3. Rule c — skeletons that aren't off-white

`pirate-quaternius/skeleton` and `skeleton-headless` use khaki/taupe/bark/dark
grey with no off-white at all, and are missing the `bone` tag (which is why the
tag-based check passes). `rpg-quaternius/coin-skull` is gold, which is fine —
it's a coin (rule R).

### 4. Rule L — roof pieces without dark red: 9 models

`village-kit/roof-accent-*` (6 models, all wood light 0,0 — the roofs they
accent are dark red, so these read as a mismatch),
`graveyard-kit/crypt-large-roof` (grey/blue-grey light), `pirate-kit/structure-roof`
and `survival-kit/structure-roof` (wood light). "Usually" leaves room, but the
village-kit accent set sits on dark-red roofs and stands out as a group.

### 5. `#ffffff` — a color that is not in the colormap: 3 models

`rpgtools/compass-base`, `rpgtools/lantern`, `rpgtools/magnifying-glass` (all
`mat: 2`, glass-tagged). This is presumably the transparent glass material's
white base color (rule J allows a special transparent material), but it is the
only color in the whole catalog that doesn't point at a colormap band — worth
confirming these three really use the clear-glass material and not an untracked
white.

### 6. Rule U — one container with no timber at all

`fantasy-props/barrel-apples` (salmon, khaki, terracotta, light green,
blue-grey light, dark red — no wood band, no grey band). It also trips the
terracotta, light-green and dark-red checks; it looks like an import that was
never recolored to the house rules.

### 7. Rule AG — blue 4,2 usage: 13 models

Flowers (`hilly-prop-flower-lily-blue`, `flower-balloon-1/2/3`) are fine — rule
a allows any flower color. Jewelry (`necklace-1`, `ring-5`) and the maps/compass
(`map-empty`, `map-rolled`, `compass-base`) read as accents. The remaining ones
carry blue as a *body* color, which is more than "minor details or accents":
`fish-quaternius/fish-2`, `pirate-quaternius/fish-mackerel`, `fish-tuna`,
`pirate-captain`. (Appendix A has no rule for fauna at all — see gaps.)

## Catalog findings, needs a render to settle (accent vs. dominant)

Counts of models using a restricted band while carrying no tag that justifies
it. Flowers were not excluded automatically, but rule a exempts any flower.

- **AJ (yellow only coins/jewelry/light/fire): 31 flagged.** Mostly flowers
  (sunflower, daisy, tulip — exempt via rule a). Genuinely odd:
  `resources/stone-bricks-stack-*` (yellow on stone bricks),
  `rpgtools/pencil-a/b-long`, `platformer-kit/star` and `lock`,
  `taalei-kit/balloon` + baskets, `pirate-quaternius/tentacle`,
  `dungeon/box-small-decorated`, `table-small-decorated-b`,
  `forest/tree-bare-2-c`.
- **AI (terracotta not for timber) / e-K (terracotta = ceramic): 56 models use
  5,0 without a `ceramic` tag.** Big legitimate-looking cluster: all the
  `resources/copper-*` models (9) plus `silver-bars` — copper *is*
  terracotta-colored, but Appendix A has no copper rule (see gaps). Flowers and
  mushrooms are exempt-ish (rule a). Worth a look: `castle-kit/tower-square-mid-open(-simple)`,
  `mini-forest/patch-dirt`, `stones`, `pirate-kit/rocks-sand-a/b/c` (terracotta
  on rocks conflicts with AP once Z/AA/AB are defined), the dungeon
  `*-decorated` assemblies, `platformer-kit/lock`, `prototype-kit/lever-*`.
- **AK (dark grey only cast iron and stone): 38 flagged.** Many are missing a
  `metal` tag rather than miscolored: `cooking-pot`, `cooking-pot-2`,
  `frying-pan`, `cannonball`, `cannon` are cast iron by nature. Pencils
  (graphite) and wicks (rule Q) are legitimate but uncovered by AK's wording.
  Ships/pirates/cliffs/dead birches carry 10,0 with no obvious cast-iron or
  stone part — render check.
- **AN (dark green only foliage/glass/accents): 19 flagged** — mostly book
  covers and jewelry (plausible accents), plus `crate-bottles` (bottle glass,
  fine) and `ship-ghost`.
- **Al (dark red only ceramics/glass/accents): 33 flagged** — book covers,
  pirates, `steak`/`ham` food models, `textiles-stack-large` (dark red is not in
  the rule-h textile palette), `ships-quaternius/ship-sail`, `platformer-kit/heart`.
- **AP (light grey only metal/stone/rock): 27 (15,3) + 33 (3,2) + 19 (6,1)
  flagged** — largely the dungeon `*-decorated` assemblies (metal hinges/bands
  without a `metal` tag on the assembly), ships (cannon/anchor parts), books,
  and fish/whales (fauna again uncovered). Which of the three grey-blue bands
  counts as "light grey" for f/T vs. "dark grey" for g/AK is itself undefined —
  see gaps.

## Defects in Appendix A itself

1. **Rule h references band "brown 12,0" — that band does not exist.** The
   colormap's row 0 has bands 0,0 1,0 2,0 5,0 6,0 8,0 10,0 13,0 14,0. In
   practice textiles use the wood lanes for brown; the reference should
   probably be 1,0 (or 12,0 was removed from the map at some point).
2. **Placeholder rules Z, AA, AB, AC, AD are literally "xxx"** (stones, rocks,
   sand/dirt, light, rope). What the catalog actually does, as a starting point
   for filling them in:
   - stone-tagged: taupe 14,3 (66), blue-grey dark 6,1 (52), grey 15,3 (42),
     dark grey 10,0 (17)
   - rock-tagged: grey 15,3 (79), taupe 14,3 (22), salmon 13,0 (13)
   - sand/dirt (by name): taupe 14,3, khaki 14,0, salmon 13,0
   - light/candle-tagged: off-white 5,2, khaki 14,0, yellow 6,0
   - rope-tagged: wood light 0,0 (11), wood mid 1,0 (7), khaki 14,0 (4)
3. **Lettering is broken**: two rules labeled "L" (roofs; color variants),
   "N" appears before "M", and the tail runs AK, **Al**, **AN**, **AM** — out
   of order, inconsistent case, and no proper "AL".
4. **Rules N and AM contradict each other on leather** (see finding 1).
5. **Rules e and K disagree on ceramic colors**: e says off-white, terracotta,
   taupe; K adds dark red — and dark red is in fact the most-used ceramic band
   (41 of 54 ceramic-tagged models). K matches reality; e should match K.
6. **Rule AH says light green is "only used for fauna"** — almost certainly a
   typo for *flora*: 3,1 is used by flora (45) and foliage (23) models and by
   no fauna-dominant band pattern; rule W (grass) is flora too.
7. **No rule covers fauna at all** (21 tagged models: fish, sharks, whales,
   starfish…), which is why the blue/grey findings above can't be settled.
8. **No rule covers copper** (10 `resources/copper-*` models, all terracotta
   5,0) — as written, AI/e make the copper resources violations.
9. **"Light grey" and "dark grey" are ambiguous**: the map has four grey-ish
   bands (10,0 `#3e3e44`, 6,1 `#474a58`, 15,3 `#6d738a`, 3,2 `#9da4c4`) and no
   rule says which id "light grey (metal)" or "dark grey (cast iron)" means.
   Naming band ids in f, g, AK, AP the way h and N do would make them checkable.
10. **Rule O ("465 checked, 419 restored")** is a provenance note, not a rule —
    it can't be verified from the catalog and probably belongs in a changelog.

## Suggested next steps

- Fix the appendix mechanics first (letters, 12,0, e/K, AH typo, N-vs-AM,
  grey band ids), then fill Z–AD from the observed usage above.
- Recolor or justify: the 5 keys, the 2 skeletons (+ add `bone` tags),
  `barrel-apples`, `frying-pan`, and the village-kit roof accents.
- Add missing `metal` tags to the cast-iron cookware/cannon models and `bone`
  tags to the skeletons so the tag-based rules bite.
- Render-check the accent-level flags (AJ/AI/AK/AN/Al/AP lists above) per the
  section-6 workflow before changing any of them.
